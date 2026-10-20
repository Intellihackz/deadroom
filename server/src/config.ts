import { defineChain, isAddress, type Address } from "viem";

const env = process.env;

export const CHAIN_ID = Number(env.CHAIN_ID ?? 4663);
export const RPC_URL = env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER = env.EXPLORER_URL ?? "https://robin.etherscan.io";

export const chain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

// Pons v2 on Robinhood Chain (docs.ponsfamily.com/v2)
export const FACTORY = (env.PONS_FACTORY ?? "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e") as Address;
export const ROUTER = (env.PONS_ROUTER ?? "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948") as Address;
export const FEE_ESCROW = (env.PONS_FEE_ESCROW ?? "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e") as Address;
export const BUYBACK_VAULT = (env.PONS_BUYBACK_VAULT ?? "0x42df2a798f82289E177311362e8f5ccC45c1219c") as Address;

export const PORT = Number(env.PORT ?? 8787);
export const ADMIN_KEY = env.ADMIN_KEY ?? "";
export const CORS_ORIGIN = env.CORS_ORIGIN ?? "*";
export const MASTER_MNEMONIC = env.MASTER_MNEMONIC ?? "";

export const DATA_DIR = env.DATA_DIR ?? env.RAILWAY_VOLUME_MOUNT_PATH ?? "data";
export const ON_RAILWAY = Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_SERVICE_ID);

// Gas assumptions used to size the reserve held back from the pool at fill time.
export const GAS_LAUNCH = BigInt(env.GAS_LAUNCH ?? 8_000_000);
export const GAS_TRANSFER = BigInt(env.GAS_TRANSFER ?? 90_000);
export const GAS_BUFFER = Number(env.GAS_BUFFER ?? 3); // multiplier on estimated gas cost

export const MIN_SEATS = 2;
export const MAX_SEATS = 500;
export const MIN_SEAT_WEI = 1_000_000_000_000_000n; // 0.001 ETH
export const MIN_BUYBACK_WEI = BigInt(env.MIN_BUYBACK_WEI ?? 500_000_000_000_000); // 0.0005 ETH

// ---- platform fee ----
// Taken once, when a coffin fills and relaunches, from the pool before the buy. Never on a refund, a leave or an expiry.
// It pays the launch fee and gas first. What is left goes to the treasury address, and part of that can fund a buy-and-burn.
export const TREASURY_ADDRESS = (isAddress(env.TREASURY_ADDRESS ?? "") ? env.TREASURY_ADDRESS : "") as Address | "";
export const FEE_BPS = Math.min(500, Math.max(0, Number(env.FEE_BPS ?? 200))); // basis points, 200 = 2%, capped at 5%
export const FEE_ENABLED = FEE_BPS > 0 && Boolean(TREASURY_ADDRESS); // no treasury address, no fee
export const BURN_SHARE_BPS = Math.min(10_000, Math.max(0, Number(env.BURN_SHARE_BPS ?? 5000))); // share of the net fee that buys and burns
export const PLATFORM_TOKEN = (isAddress(env.PLATFORM_TOKEN ?? "") ? env.PLATFORM_TOKEN : "") as Address | ""; // set once the token exists
export const BURN_INDEX = 1_000_000; // the burn wallet is this derivation index of the master mnemonic
export const DEAD = "0x000000000000000000000000000000000000dEaD" as Address;
export const MIN_BURN_WEI = BigInt(env.MIN_BURN_WEI ?? 500_000_000_000_000); // 0.0005 ETH
