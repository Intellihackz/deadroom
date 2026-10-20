import { formatEther, zeroAddress } from "viem";
import { publicClient } from "../src/chain.js";
import { FACTORY, ROUTER } from "../src/config.js";
import { factoryAbi } from "../src/abi.js";

// Read-only. Sends nothing.
const probe = (process.argv[2] ?? "0x000000000000000000000000000000000000dEaD") as `0x${string}`;
const read = <T extends keyof any>(fn: string, args: any[] = []) =>
  publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: fn as any, args: args as any }) as Promise<any>;

const [fee, count, maxTax, can, gasPrice, block] = await Promise.all([
  read("launchFee"),
  read("launchConfigCount"),
  read("maxCreatorTaxBps"),
  read("canLaunch", [probe]),
  publicClient.getGasPrice(),
  publicClient.getBlockNumber(),
]);
console.log({ block, factory: FACTORY, router: ROUTER });
console.log("launch fee:", formatEther(fee), "ETH");
console.log("max creator tax:", Number(maxTax) / 100, "%");
console.log("canLaunch(" + probe + "):", can);
console.log("gas price:", Number(gasPrice) / 1e9, "gwei");

for (let i = 0n; i < count; i++) {
  const c = await read("getLaunchConfig", [i]);
  console.log(`config ${i}:`, {
    enabled: c.enabled,
    supply: formatEther(c.supply),
    curveFeeBps: Number(c.curveFeeBps),
    phantomQuoteEth: formatEther(c.phantomQuote),
    graduationEth: formatEther(c.graduationThreshold),
  });
  if (c.enabled) console.log("  economics pin:", await read("previewLaunchEconomics", [i, zeroAddress]));
}
