import { encodeFunctionData, formatEther, keccak256, parseEventLogs, toHex, zeroAddress, type Address, type Hex } from "viem";
import { publicClient, roomAccount, roomWallet } from "./chain.js";
import {
  BUYBACK_VAULT,
  FACTORY,
  FEE_ESCROW,
  GAS_BUFFER,
  GAS_LAUNCH,
  GAS_TRANSFER,
  MIN_BUYBACK_WEI,
  ROUTER,
  chain,
} from "./config.js";
import { curveAbi, erc20Abi, factoryAbi, feeEscrowAbi, routerAbi, vaultAbi } from "./abi.js";
import { allRooms, getRoom, save } from "./store.js";
import { addCost, runBurns, sweepFee, takeFor } from "./fees.js";
import { errMsg, log, seatPrice, seatsIn, sendEth, short, withLock } from "./rooms.js";
import type { Room } from "./types.js";

const MAX_LAUNCH_ATTEMPTS = 3;
const busy = new Set<string>();

/** ETH to keep back for gas (launch + one transfer per seat), sized from the live gas price. */
export function reserveFor(seats: number, gasPrice: bigint) {
  return (GAS_LAUNCH + GAS_TRANSFER * BigInt(seats)) * gasPrice * BigInt(GAS_BUFFER);
}

export async function chainConfig() {
  const [launchFee, gasPrice] = await Promise.all([
    publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "launchFee" }),
    publicClient.getGasPrice(),
  ]);
  return { launchFee, gasPrice };
}

let cfgCache: { at: number; v: Awaited<ReturnType<typeof chainConfig>> } | undefined;
/** For the browser's estimates only. Launches always read fresh values. */
export async function cachedChainConfig() {
  if (!cfgCache || Date.now() - cfgCache.at > 30_000) cfgCache = { at: Date.now(), v: await chainConfig() };
  return cfgCache.v;
}

// ---------- launch ----------

export function fillRoom(id: string) {
  return withLock(id, async () => {
    const room = getRoom(id);
    if (!room || room.status !== "launching") return;
    room.launch ??= { salt: toHex(crypto.getRandomValues(new Uint8Array(32))), attempts: 0 };
    const launch = room.launch;

    try {
      if (!launch.txHash) await sendLaunch(room);
      await confirmLaunch(room);
    } catch (e) {
      launch.error = errMsg(e);
      log(room, `Launch problem: ${launch.error}`);
      if (launch.txHash) {
        // The tx was broadcast. Keep waiting for it on the next tick instead of retrying with a new one.
        return;
      }
      launch.attempts += 1;
      if (launch.attempts >= MAX_LAUNCH_ATTEMPTS) {
        room.status = "failed";
        log(room, "Launch failed after several tries. Refunding every seat.");
        save();
        await refundAll(room);
      }
    }
    save();
  });
}

async function sendLaunch(room: Room) {
  const launch = room.launch!;
  const wallet = roomWallet(room.index);
  const account = roomAccount(room.index);
  const n = seatsIn(room).length;

  const canLaunch = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "canLaunch", args: [account.address] });
  if (!canLaunch) throw new Error("Pons has closed public launches (canLaunch is false for the room wallet)");

  const count = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "launchConfigCount" });
  let configId: bigint | undefined;
  for (let i = 0n; i < count; i++) {
    const c = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getLaunchConfig", args: [i] });
    if (c.enabled) {
      configId = i;
      break;
    }
  }
  if (configId === undefined) throw new Error("no enabled launch config on the Pons factory");

  const [{ launchFee, gasPrice }, balance, economics] = await Promise.all([
    chainConfig(),
    publicClient.getBalance({ address: account.address }),
    publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "previewLaunchEconomics", args: [configId, zeroAddress] }),
  ]);

  // Only the seats' money goes into the buy. Stray deposits stay in the wallet.
  const pool = (() => {
    const expected = seatPrice(room) * BigInt(n);
    return balance < expected ? balance : expected;
  })();
  // The platform fee, or the launch fee and gas if those are larger, is held back. The fee pays the gas, so the buy is what is left.
  const { fee, take } = takeFor(pool, launchFee + reserveFor(n, gasPrice));
  const quoteIn = pool - take;
  if (quoteIn <= 0n) throw new Error("the pool is too small to cover the launch fee and gas");

  const params = {
    name: room.token.name,
    symbol: room.token.symbol,
    logo: room.token.logo,
    description: room.token.description,
    socials: room.token.socials,
    creatorFeeRecipient: account.address,
    creatorTaxBps: 0,
    buybackEnabled: true,
    expectedEconomics: economics,
    salt: launch.salt,
  } as const;
  const args = [params, configId, zeroAddress, quoteIn, 0n, account.address, []] as const;

  // Dry run first: surfaces reverts as readable errors and tells us what the buy returns.
  const sim = await publicClient.simulateContract({
    address: ROUTER,
    abi: routerAbi,
    functionName: "launchAndBuy",
    args,
    value: launchFee + quoteIn,
    account,
  });
  const [, , tokensOut] = sim.result;
  const minOut = (tokensOut * 90n) / 100n;
  const finalArgs = [params, configId, zeroAddress, quoteIn, minOut, account.address, []] as const;

  // Sign locally and record the hash BEFORE broadcasting, so a crash can never lead to a second launch.
  const request = await wallet.prepareTransactionRequest({
    to: ROUTER,
    data: encodeFunctionData({ abi: routerAbi, functionName: "launchAndBuy", args: finalArgs }),
    value: launchFee + quoteIn,
    chain,
    account,
  });
  const serialized = await account.signTransaction(request as any);
  const hash = keccak256(serialized);
  launch.quoteIn = quoteIn.toString();
  launch.configId = configId.toString();
  launch.fee = { feeWei: fee.toString(), takeWei: take.toString(), launchFeeWei: launchFee.toString(), costWei: "0" };
  launch.txHash = hash;
  launch.error = undefined;
  save();
  try {
    await publicClient.sendRawTransaction({ serializedTransaction: serialized });
  } catch (e) {
    // An ambiguous RPC error may still have broadcast it. Only forget the hash if the chain has never seen it.
    const seen = await publicClient.getTransaction({ hash }).catch(() => null);
    if (!seen) {
      launch.txHash = undefined;
      save();
    }
    throw e;
  }
  log(room, `Launch sent: buying with ${formatEther(quoteIn)} ETH.`);
}

async function confirmLaunch(room: Room) {
  const launch = room.launch!;
  const hash = launch.txHash!;
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 }).catch(async (e) => {
    // Timed out. If the chain never heard of the tx, drop the hash so the next attempt can send a fresh one.
    const seen = await publicClient.getTransaction({ hash }).catch(() => null);
    if (!seen) {
      launch.txHash = undefined;
      launch.attempts += 1;
      save();
    }
    throw e;
  });
  if (receipt.status !== "success") {
    launch.txHash = undefined;
    launch.attempts += 1;
    throw new Error(`launch transaction reverted (${hash})`);
  }
  const events = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, eventName: "TokenLaunched" });
  const ev = events.find((e) => e.address.toLowerCase() === FACTORY.toLowerCase()) ?? events[0];
  if (!ev) throw new Error("launched, but the TokenLaunched event was not found");
  addCost(room, BigInt(launch.fee?.launchFeeWei ?? "0") + receipt.gasUsed * receipt.effectiveGasPrice); // what the launch really cost
  launch.newToken = ev.args.token.toLowerCase() as Address;
  launch.curve = ev.args.curve.toLowerCase() as Address;
  launch.error = undefined;
  room.status = "distributing";
  log(room, `Relaunched as ${short(launch.newToken)}. Sending tokens to the seats.`);
  save();
  await distribute(room);
}

// ---------- payouts ----------

async function distribute(room: Room) {
  const launch = room.launch!;
  const token = launch.newToken!;
  const account = roomAccount(room.index);
  const wallet = roomWallet(room.index);
  const seats = seatsIn(room);

  if (!launch.sharePerSeat) {
    const bal = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
    launch.tokensBought = bal.toString();
    launch.sharePerSeat = (bal / BigInt(seats.length)).toString();
    save();
  }
  const share = BigInt(launch.sharePerSeat);

  for (const seat of seats) {
    if (seat.payoutTx) continue;
    try {
      const hash = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: "transfer", args: [seat.address, share] });
      const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
      if (r.status !== "success") throw new Error("transfer reverted");
      addCost(room, r.gasUsed * r.effectiveGasPrice);
      seat.payoutTx = hash;
      seat.payoutAmount = share.toString();
      save();
    } catch (e) {
      log(room, `Payout to ${short(seat.address)} failed, will retry: ${errMsg(e)}`);
    }
  }
  if (seats.every((s) => s.payoutTx)) {
    room.status = "live";
    log(room, "Everyone has their tokens. Buybacks are on.");
    save();
    await sweepFee(room);
  }
  save();
}

export function resumeDistribution(id: string) {
  return withLock(id, async () => {
    const room = getRoom(id);
    if (!room?.launch?.newToken) return;
    if (room.status === "distributing") await distribute(room);
  });
}

// ---------- refunds / expiry ----------

async function refundAll(room: Room) {
  const price = seatPrice(room);
  for (const seat of seatsIn(room)) {
    if (seat.refundTx) continue;
    try {
      seat.refundTx = await sendEth(room, seat.address, price); // takes the network fee out of the refund only when the wallet is short
      seat.status = "left";
    } catch (e) {
      log(room, `Refund to ${short(seat.address)} failed, will retry: ${errMsg(e)}`);
    }
  }
  save();
}

export function expireRoom(id: string) {
  return withLock(id, async () => {
    const room = getRoom(id);
    if (!room || room.status !== "open") return;
    room.status = "expired";
    log(room, "Deadline passed before the coffin filled. Refunding every seat.");
    await refundAll(room);
  });
}

export function retryRefunds(id: string) {
  return withLock(id, async () => {
    const room = getRoom(id);
    if (!room) return;
    if (room.status === "expired" || room.status === "failed") await refundAll(room);
  });
}

// ---------- buyback ----------

export function runBuyback(id: string) {
  return withLock(id, async () => {
    const room = getRoom(id);
    if (!room || room.status !== "live" || !room.launch?.curve || !room.launch.newToken) return;
    const account = roomAccount(room.index);
    const wallet = roomWallet(room.index);
    const curve = room.launch.curve;
    const token = room.launch.newToken;
    const note = (m: string) => {
      room.buyback.lastNote = m;
      room.buyback.lastRunAt = Date.now();
      save();
    };

    try {
      const graduated = await publicClient.readContract({ address: curve, abi: curveAbi, functionName: "graduated" });

      // 1. sweep the curve's accrued fees (callable by the creator) and pull whatever sits in the fee escrow
      if (!graduated) {
        const pending = await publicClient.readContract({ address: curve, abi: curveAbi, functionName: "quoteFeeBalance" }).catch(() => 0n);
        if (pending > 0n) {
          await wallet
            .writeContract({ address: curve, abi: curveAbi, functionName: "sweepFees", args: [0n] })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }))
            .catch((e) => log(room, `Fee sweep skipped: ${errMsg(e)}`));
        }
      }
      const escrowed = await publicClient.readContract({ address: FEE_ESCROW, abi: feeEscrowAbi, functionName: "balanceOf", args: [account.address] }).catch(() => 0n);
      if (escrowed > 0n) {
        await wallet
          .writeContract({ address: FEE_ESCROW, abi: feeEscrowAbi, functionName: "claim" })
          .then((h) => publicClient.waitForTransactionReceipt({ hash: h }))
          .catch((e) => log(room, `Fee claim skipped: ${errMsg(e)}`));
      }

      // 2. release any vested tokens from Pons's own buyback vault
      const releasable = await publicClient.readContract({ address: BUYBACK_VAULT, abi: vaultAbi, functionName: "releasable", args: [token] }).catch(() => 0n);
      if (releasable > 0n) {
        await wallet
          .writeContract({ address: BUYBACK_VAULT, abi: vaultAbi, functionName: "release", args: [token] })
          .then((h) => publicClient.waitForTransactionReceipt({ hash: h }))
          .catch((e) => log(room, `Vault release skipped: ${errMsg(e)}`));
      }

      // 3. spend the wallet's ETH (minus a gas hold) buying the token on the curve
      if (graduated) return note("Token graduated. Buying from the pool is not wired yet, fees keep accruing.");
      const [balance, gasPrice] = await Promise.all([publicClient.getBalance({ address: account.address }), publicClient.getGasPrice()]);
      const hold = gasPrice * GAS_TRANSFER * 20n * BigInt(GAS_BUFFER);
      const spend = balance - hold;
      if (spend < MIN_BUYBACK_WEI) return note("Nothing to buy back yet.");

      const sim = await publicClient.simulateContract({
        address: curve,
        abi: curveAbi,
        functionName: "buy",
        args: [spend, 0n, account.address],
        value: spend,
        account,
      });
      const minOut = (sim.result * 90n) / 100n;
      const hash = await wallet.writeContract({
        address: curve,
        abi: curveAbi,
        functionName: "buy",
        args: [spend, minOut, account.address],
        value: spend,
      });
      const r = await publicClient.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("buyback tx reverted");
      room.buyback.spentWei = (BigInt(room.buyback.spentWei) + spend).toString();
      room.buyback.tokens = (BigInt(room.buyback.tokens) + sim.result).toString();
      room.buyback.runs += 1;
      log(room, `Buyback: ${formatEther(spend)} ETH bought back.`);
      note(`Bought back with ${formatEther(spend)} ETH.`);
    } catch (e) {
      note(`Buyback failed: ${errMsg(e)}`);
    }
  });
}

// ---------- tick ----------

const lastTried = new Map<string, number>();
let lastBuybackSweep = 0;

function once(id: string, fn: () => Promise<unknown>) {
  if (busy.has(id)) return;
  busy.add(id);
  fn()
    .catch((e) => console.error(id, errMsg(e)))
    .finally(() => busy.delete(id));
}

export function tick(onBuybackDue = true) {
  const now = Date.now();
  const sweepBuybacks = onBuybackDue && now - lastBuybackSweep > 5 * 60_000;
  if (sweepBuybacks) lastBuybackSweep = now;

  if (sweepBuybacks) once("burn", () => runBurns());
  for (const room of allRooms()) {
    const id = room.id;
    if (room.status === "open" && room.deadline && room.deadline < now) once(id, () => expireRoom(id));
    else if (room.status === "open" && room.pending && now - room.createdAt > 3600_000) once(id, () => expireRoom(id));
    else if (room.status === "launching" && now - (lastTried.get(id) ?? 0) > 20_000) {
      lastTried.set(id, now);
      once(id, () => fillRoom(id));
    } else if (room.status === "distributing" && now - (lastTried.get(id) ?? 0) > 20_000) {
      lastTried.set(id, now);
      once(id, () => resumeDistribution(id));
    } else if ((room.status === "expired" || room.status === "failed") && seatsIn(room).some((s) => !s.refundTx) && now - (lastTried.get(id) ?? 0) > 60_000) {
      lastTried.set(id, now);
      once(id, () => retryRefunds(id));
    } else if (room.status === "live" && room.launch?.fee && !room.launch.fee.sweptAt && now - (lastTried.get(id) ?? 0) > 60_000) {
      lastTried.set(id, now);
      once(id, () => withLock(id, () => sweepFee(room)));
    } else if (room.status === "live" && sweepBuybacks) once(id, () => runBuyback(id));
  }
}
