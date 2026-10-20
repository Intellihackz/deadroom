import { formatEther, parseEther, type Address, type Hex } from "viem";
import { z } from "zod";
import { publicClient, roomAccount, roomWallet, isAddr, lower } from "./chain.js";
import { MAX_SEATS, MIN_SEATS, MIN_SEAT_WEI } from "./config.js";
import { allRooms, getRoom, putRoom, save, takeIndex } from "./store.js";
import type { Room, Seat } from "./types.js";

// ---------- helpers ----------

const locks = new Map<string, Promise<unknown>>();
export function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(id, next);
  next.then(
    () => locks.get(id) === next && locks.delete(id),
    () => locks.get(id) === next && locks.delete(id),
  );
  return next;
}

export function log(room: Room, msg: string) {
  room.log.push({ t: Date.now(), msg });
  if (room.log.length > 200) room.log.splice(0, room.log.length - 200);
  save();
}

export const seatsIn = (room: Room) => room.seats.filter((s) => s.status === "in");
export const seatPrice = (room: Room) => BigInt(room.seatPriceWei);

/**
 * Send ETH out of a coffin wallet. Normally the full amount. If the wallet holds nothing beyond what it owes, the
 * network fee comes out of the amount, because a wallet cannot send its entire balance and also pay gas for it.
 */
export async function sendEth(room: Room, to: Address, value: bigint): Promise<Hex> {
  const wallet = roomWallet(room.index);
  const from = roomAccount(room.index).address;
  const [balance, gasPrice, gas] = await Promise.all([
    publicClient.getBalance({ address: from }),
    publicClient.getGasPrice(),
    publicClient.estimateGas({ account: from, to, value: 1n }),
  ]);
  const fee = (gas * gasPrice * 3n) / 2n; // with a margin, the leftover stays in the wallet
  const amount = balance < value + fee ? balance - fee : value;
  if (amount <= 0n) throw new Error("the coffin wallet cannot cover the network fee for this refund");
  const hash = await wallet.sendTransaction({ to, value: amount });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`refund tx reverted: ${hash}`);
  return hash;
}

/** Strip server-only fields before sending a room to the browser. */
export function toPublic(room: Room) {
  const { processedTxs: _p, ...rest } = room;
  return { ...rest, seatsIn: seatsIn(room).length };
}

// ---------- token info ----------

const erc20 = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export async function tokenInfo(address: Address) {
  const out: { address: Address; name: string; symbol: string; logo: string; description: string; website: string; twitter: string } = {
    address: lower(address),
    name: "",
    symbol: "",
    logo: "",
    description: "",
    website: "",
    twitter: "",
  };
  try {
    const [name, symbol] = await Promise.all([
      publicClient.readContract({ address, abi: erc20, functionName: "name" }),
      publicClient.readContract({ address, abi: erc20, functionName: "symbol" }),
    ]);
    out.name = String(name).slice(0, 48);
    out.symbol = String(symbol).replace(/^\$/, "").slice(0, 16);
  } catch {
    /* not a readable ERC20 */
  }
  try {
    const r = await fetch(`https://ponsfamily.com/api/launches/${address}`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = (await r.json()) as Record<string, any>;
      if (typeof j.name === "string" && !out.name) out.name = j.name.slice(0, 48);
      if (typeof j.symbol === "string" && !out.symbol) out.symbol = j.symbol.replace(/^\$/, "").slice(0, 16);
      if (typeof j.artwork === "string") out.logo = j.artwork.slice(0, 300);
      if (typeof j.description === "string") out.description = j.description.slice(0, 500);
      if (typeof j.socials?.website === "string") out.website = j.socials.website.slice(0, 200);
      if (typeof j.socials?.twitter === "string") out.twitter = j.socials.twitter.slice(0, 200);
    }
  } catch {
    /* pons api is best effort */
  }
  return out;
}

// ---------- create ----------

const urlish = z
  .string()
  .max(300)
  .refine((s) => s === "" || /^(https:\/\/|ipfs:\/\/)/i.test(s), "must start with https:// or ipfs://");

export const createSchema = z.object({
  tokenAddress: z.string().refine(isAddr, "bad token address").optional(),
  name: z.string().trim().min(1).max(48),
  symbol: z
    .string()
    .trim()
    .transform((s) => s.replace(/^\$/, ""))
    .pipe(z.string().min(1).max(16)),
  logo: urlish.default(""),
  description: z.string().trim().max(500).default(""),
  twitter: urlish.default(""),
  website: urlish.default(""),
  telegram: urlish.default(""),
  seats: z.number().int().min(MIN_SEATS).max(MAX_SEATS),
  seatPriceEth: z.string().regex(/^\d+(\.\d{1,6})?$/, "ETH amount, up to 6 decimals"),
  deadlineHours: z.number().min(1).max(24 * 60).optional(),
});

export function createRoom(input: z.infer<typeof createSchema>, creator: Address): Room {
  const priceWei = parseEther(input.seatPriceEth);
  if (priceWei < MIN_SEAT_WEI) throw new Error(`seat price must be at least ${formatEther(MIN_SEAT_WEI)} ETH`);

  const index = takeIndex();
  const wallet = roomAccount(index).address;
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const room: Room = {
    id,
    index,
    wallet: lower(wallet),
    createdAt: Date.now(),
    creator: lower(creator),
    pending: true,
    token: {
      address: input.tokenAddress ? lower(input.tokenAddress) : undefined,
      name: input.name,
      symbol: input.symbol,
      logo: input.logo,
      description: input.description,
      socials: { twitter: input.twitter, telegram: input.telegram, discord: "", website: input.website, farcaster: "" },
    },
    target: input.seats,
    seatPriceWei: priceWei.toString(),
    deadline: input.deadlineHours ? Date.now() + input.deadlineHours * 3600_000 : undefined,
    status: "open",
    seats: [],
    processedTxs: [],
    buyback: { spentWei: "0", tokens: "0", runs: 0 },
    log: [],
  };
  log(room, `Coffin dug up by ${short(creator)}. Waiting for the creator to take the first seat.`);
  putRoom(room);
  return room;
}

export function duplicateOf(tokenAddress?: string) {
  if (!tokenAddress) return [];
  const a = tokenAddress.toLowerCase();
  return allRooms()
    .filter((r) => !r.pending && r.token.address === a && (r.status === "open" || r.status === "launching" || r.status === "distributing"))
    .map((r) => r.id);
}

// ---------- join / leave ----------

export type JoinResult = { accepted: boolean; reason?: string; refundTx?: Hex; room: ReturnType<typeof toPublic> };

/** Called by the browser (or by hand) with the hash of an ETH transfer to the room wallet. */
export function joinRoom(id: string, txHash: Hex, onFull: (id: string) => void): Promise<JoinResult> {
  return withLock(id, async () => {
    const room = getRoom(id);
    if (!room) throw new HttpError(404, "coffin not found");
    if (room.processedTxs.includes(txHash)) {
      const seat = room.seats.find((s) => s.depositTx === txHash);
      return { accepted: Boolean(seat), reason: seat ? undefined : "already processed", room: toPublic(room) };
    }

    const tx = await publicClient.getTransaction({ hash: txHash }).catch(() => null);
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash }).catch(() => null);
    if (!tx || !receipt) throw new HttpError(409, "transaction not found yet, try again in a few seconds");
    if (receipt.status !== "success") throw new HttpError(400, "transaction failed on chain");
    if (!tx.to || tx.to.toLowerCase() !== room.wallet) throw new HttpError(400, "transaction was not sent to this coffin's wallet");
    if (tx.value <= 0n) throw new HttpError(400, "transaction carries no ETH");

    room.processedTxs.push(txHash);
    const sender = lower(tx.from);

    let reason: string | undefined;
    if (room.status !== "open") reason = "this coffin is closed";
    else if (room.pending && room.creator && sender !== room.creator) reason = "the creator takes the first seat. This coffin opens to others once they have";
    else if (tx.value !== seatPrice(room)) reason = `seat price is exactly ${formatEther(seatPrice(room))} ETH`;
    else if (seatsIn(room).some((s) => s.address === sender)) reason = "this wallet already has a seat";
    else if (seatsIn(room).length >= room.target) reason = "every seat is taken";

    if (reason) {
      let refundTx: Hex | undefined;
      try {
        refundTx = await sendEth(room, sender, tx.value);
        log(room, `Refunded ${formatEther(tx.value)} ETH to ${short(sender)}: ${reason}.`);
      } catch (e) {
        log(room, `Could not refund ${short(sender)} (${reason}): ${errMsg(e)}`);
      }
      save();
      return { accepted: false, reason, refundTx, room: toPublic(room) };
    }

    const seat: Seat = { address: sender, depositTx: txHash, joinedAt: Date.now(), status: "in" };
    room.seats.push(seat);
    if (room.pending) {
      room.pending = false;
      log(room, "The creator took the first seat. The coffin is open to everyone.");
    }
    log(room, `${short(sender)} took a seat (${seatsIn(room).length}/${room.target}).`);

    if (seatsIn(room).length >= room.target) {
      room.status = "launching";
      log(room, "Every seat is taken. The coffin is opening.");
      save();
      queueMicrotask(() => onFull(id));
    }
    save();
    return { accepted: true, room: toPublic(room) };
  });
}

export const leaveSchema = z.object({
  address: z.string().refine(isAddr),
  timestamp: z.number().int(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

export const leaveMessage = (roomId: string, address: string, timestamp: number) =>
  `Deadroom: leave coffin ${roomId} as ${address.toLowerCase()} at ${timestamp}`;

export function leaveRoom(id: string, input: z.infer<typeof leaveSchema>, signedIn = false) {
  return withLock(id, async () => {
    const room = getRoom(id);
    if (!room) throw new HttpError(404, "coffin not found");
    const address = lower(input.address);
    if (!signedIn) {
      if (Math.abs(Date.now() - input.timestamp) > 5 * 60_000) throw new HttpError(400, "signature expired, sign again");
      const ok = await publicClient.verifyMessage({
        address,
        message: leaveMessage(id, address, input.timestamp),
        signature: input.signature as Hex,
      });
      if (!ok) throw new HttpError(401, "bad signature");
    }
    if (room.status !== "open") throw new HttpError(409, "this coffin is closed, seats can no longer be given up");
    const seat = seatsIn(room).find((s) => s.address === address);
    if (!seat) throw new HttpError(404, "this wallet has no seat in this coffin");

    seat.status = "left";
    try {
      seat.refundTx = await sendEth(room, address, seatPrice(room));
    } catch (e) {
      seat.status = "in";
      throw new HttpError(502, `refund failed, your seat is kept: ${errMsg(e)}`);
    }
    log(room, `${short(address)} left and was refunded.`);
    if (seatsIn(room).length === 0 && room.creator) {
      room.pending = true;
      log(room, "No seats left. The coffin is unlisted until the creator takes a seat again.");
    }
    save();
    return toPublic(room);
  });
}

// ---------- misc ----------

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const errMsg = (e: unknown) => {
  const m = e instanceof Error ? ((e as any).shortMessage ?? e.message) : String(e);
  return m.split("\n")[0].slice(0, 300);
};
