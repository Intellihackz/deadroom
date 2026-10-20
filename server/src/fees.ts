import { formatEther, type Address } from "viem";
import { burnAccount, burnWallet, publicClient, roomAccount, roomWallet } from "./chain.js";
import { BURN_SHARE_BPS, DEAD, FEE_BPS, FEE_ENABLED, GAS_BUFFER, GAS_TRANSFER, MIN_BURN_WEI, PLATFORM_TOKEN, TREASURY_ADDRESS } from "./config.js";
import { curveAbi, erc20Abi } from "./abi.js";
import { allRooms, addBurn, getBurns, save } from "./store.js";
import { errMsg, log, sendEth, short } from "./rooms.js";
import type { Room } from "./types.js";

const DUST = 100_000_000_000n; // 0.0000001 ETH, not worth a transaction

/** What is held back from the pool: the platform fee, or the launch costs if those are larger. */
export function takeFor(pool: bigint, costsEstimate: bigint) {
  const fee = FEE_ENABLED ? (pool * BigInt(FEE_BPS)) / 10_000n : 0n;
  return { fee, take: fee > costsEstimate ? fee : costsEstimate };
}

export function addCost(room: Room, wei: bigint) {
  const f = room.launch?.fee;
  if (f) f.costWei = (BigInt(f.costWei) + wei).toString();
}

/**
 * After the coffin has launched and paid out: the fee has already covered the launch fee and gas. Whatever is left of it
 * (the net) goes to the treasury, and part of that to the burn wallet when a platform token is set.
 * Anything held back beyond the stated fee (a larger gas reserve) stays in the coffin wallet for its own buybacks.
 */
export async function sweepFee(room: Room) {
  const f = room.launch?.fee;
  if (!f || f.sweptAt) return;
  const net = BigInt(f.feeWei) > BigInt(f.costWei) ? BigInt(f.feeWei) - BigInt(f.costWei) : 0n;
  f.netWei = net.toString();
  if (!FEE_ENABLED || net < DUST) {
    f.sweptAt = Date.now();
    save();
    return;
  }
  const burnPart = PLATFORM_TOKEN ? (net * BigInt(BURN_SHARE_BPS)) / 10_000n : 0n;
  const treasuryPart = net - burnPart;
  try {
    if (treasuryPart > DUST && !f.treasuryTx) {
      f.treasuryTx = await sendEth(room, TREASURY_ADDRESS as Address, treasuryPart);
      f.treasuryWei = treasuryPart.toString();
    }
    if (burnPart > DUST && !f.burnTx) {
      f.burnTx = await sendEth(room, burnAccount().address, burnPart);
      f.burnWei = burnPart.toString();
    }
    f.sweptAt = Date.now();
    log(room, `Platform fee paid out: ${formatEther(treasuryPart)} ETH to the treasury${burnPart > DUST ? `, ${formatEther(burnPart)} ETH to the burn wallet` : ""}.`);
  } catch (e) {
    log(room, `Fee payout will retry: ${errMsg(e)}`);
  }
  save();
}

// ---------- buy and burn ----------
let curveCache: { token: string; at: number; curve?: Address; graduated: boolean } | undefined;
async function platformCurve() {
  if (curveCache && curveCache.token === PLATFORM_TOKEN && Date.now() - curveCache.at < 600_000) return curveCache;
  const r = await fetch(`https://ponsfamily.com/api/launches/${PLATFORM_TOKEN}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const j = r?.ok ? ((await r.json().catch(() => null)) as Record<string, any> | null) : null;
  curveCache = { token: PLATFORM_TOKEN, at: Date.now(), curve: j?.curve ? (String(j.curve).toLowerCase() as Address) : undefined, graduated: j?.stage === "graduated" };
  return curveCache;
}

export const burnNote = { text: "", at: 0 };
const note = (text: string) => {
  burnNote.text = text;
  burnNote.at = Date.now();
};

/** Spend the burn wallet's ETH on the platform token and send all of it to the dead address. */
export async function runBurns() {
  if (!PLATFORM_TOKEN || !FEE_ENABLED) return;
  try {
    const account = burnAccount();
    const wallet = burnWallet();
    const [balance, gasPrice] = await Promise.all([publicClient.getBalance({ address: account.address }), publicClient.getGasPrice()]);
    const spend = balance - gasPrice * GAS_TRANSFER * 30n * BigInt(GAS_BUFFER);
    if (spend < MIN_BURN_WEI) return note("Waiting for more fees before the next burn.");

    const pc = await platformCurve();
    if (!pc.curve) return note("Could not find the platform token's curve.");
    if (pc.graduated) return note("The platform token has graduated. Buying from its pool is not wired yet, so burns are paused.");

    const sim = await publicClient.simulateContract({ address: pc.curve, abi: curveAbi, functionName: "buy", args: [spend, 0n, account.address], value: spend, account });
    const buyTx = await wallet.writeContract({ address: pc.curve, abi: curveAbi, functionName: "buy", args: [spend, (sim.result * 90n) / 100n, account.address], value: spend });
    const r1 = await publicClient.waitForTransactionReceipt({ hash: buyTx });
    if (r1.status !== "success") throw new Error("buy reverted");

    const tokens = await publicClient.readContract({ address: PLATFORM_TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
    const burnTx = await wallet.writeContract({ address: PLATFORM_TOKEN, abi: erc20Abi, functionName: "transfer", args: [DEAD, tokens] });
    const r2 = await publicClient.waitForTransactionReceipt({ hash: burnTx });
    if (r2.status !== "success") throw new Error("burn transfer reverted");
    addBurn({ t: Date.now(), ethWei: spend.toString(), tokens: tokens.toString(), buyTx, burnTx });
    note(`Burned ${formatEther(tokens)} tokens bought with ${formatEther(spend)} ETH.`);
  } catch (e) {
    note(`Burn failed: ${errMsg(e)}`);
  }
}

// ---------- public ledger ----------
export function ledger() {
  const coffins = allRooms()
    .filter((r) => r.launch?.fee)
    .map((r) => {
      const f = r.launch!.fee!;
      return { id: r.id, name: r.token.name, symbol: r.token.symbol, at: r.createdAt, feeWei: f.feeWei, costWei: f.costWei, netWei: f.netWei ?? "0", treasuryWei: f.treasuryWei ?? "0", burnWei: f.burnWei ?? "0", treasuryTx: f.treasuryTx, burnTx: f.burnTx, swept: Boolean(f.sweptAt) };
    })
    .sort((a, b) => b.at - a.at);
  const sum = (k: "feeWei" | "costWei" | "netWei" | "treasuryWei" | "burnWei") => coffins.reduce((s, c) => s + BigInt(c[k]), 0n).toString();
  const burns = getBurns();
  return {
    enabled: FEE_ENABLED,
    feeBps: FEE_ENABLED ? FEE_BPS : 0,
    burnShareBps: PLATFORM_TOKEN ? BURN_SHARE_BPS : 0,
    treasury: TREASURY_ADDRESS || null,
    burnWallet: PLATFORM_TOKEN ? burnAccount().address : null,
    platformToken: PLATFORM_TOKEN || null,
    totals: {
      gross: sum("feeWei"),
      costs: sum("costWei"),
      net: sum("netWei"),
      toTreasury: sum("treasuryWei"),
      toBurnWallet: sum("burnWei"),
      burnedEth: burns.reduce((s, b) => s + BigInt(b.ethWei), 0n).toString(),
      burnedTokens: burns.reduce((s, b) => s + BigInt(b.tokens), 0n).toString(),
    },
    coffins,
    burns: [...burns].reverse(),
    note: PLATFORM_TOKEN ? burnNote : null,
  };
}
void roomAccount;
void roomWallet;
void short;
