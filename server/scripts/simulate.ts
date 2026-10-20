import { formatEther, parseEther, toHex, zeroAddress } from "viem";
import { publicClient, roomAccount } from "../src/chain.js";
import { FACTORY, ROUTER } from "../src/config.js";
import { factoryAbi, routerAbi } from "../src/abi.js";

// Read-only dry run of launchAndBuy using an eth_call with a faked balance. Sends nothing.
const quote = parseEther(process.argv[2] ?? "0.5");
const account = roomAccount(0);
const [fee, economics] = await Promise.all([
  publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "launchFee" }),
  publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "previewLaunchEconomics", args: [0n, zeroAddress] }),
]);

const params = {
  name: "Dead Test",
  symbol: "DEAD",
  logo: "",
  description: "simulation only",
  socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
  creatorFeeRecipient: account.address,
  creatorTaxBps: 0,
  buybackEnabled: true,
  expectedEconomics: economics,
  salt: toHex(crypto.getRandomValues(new Uint8Array(32))),
} as const;

try {
  const sim = await publicClient.simulateContract({
    address: ROUTER,
    abi: routerAbi,
    functionName: "launchAndBuy",
    args: [params, 0n, zeroAddress, quote, 0n, account.address, []],
    value: fee + quote,
    account,
    stateOverride: [{ address: account.address, balance: parseEther("100") }],
  });
  const [token, curve, out] = sim.result;
  const gas = await publicClient.estimateContractGas({
    address: ROUTER,
    abi: routerAbi,
    functionName: "launchAndBuy",
    args: [params, 0n, zeroAddress, quote, 0n, account.address, []],
    value: fee + quote,
    account,
    stateOverride: [{ address: account.address, balance: parseEther("100") }],
  });
  console.log("OK", { buy: formatEther(quote) + " ETH", token, curve, tokensOut: formatEther(out), pctOfSupply: (Number(formatEther(out)) / 1e9) * 100, gas });
} catch (e: any) {
  console.log("REVERT:", e.shortMessage ?? e.message);
}
