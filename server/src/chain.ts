import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { BURN_INDEX, MASTER_MNEMONIC, RPC_URL, chain } from "./config.js";

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL, { retryCount: 3 }) });

export function roomAccount(index: number) {
  if (!MASTER_MNEMONIC) throw new Error("MASTER_MNEMONIC is not set. Run `npm run keygen`.");
  return mnemonicToAccount(MASTER_MNEMONIC, { addressIndex: index });
}

export function roomWallet(index: number) {
  const account = roomAccount(index);
  return createWalletClient({ account, chain, transport: http(RPC_URL, { retryCount: 3 }) });
}

export const isAddr = (s: unknown): s is Address => typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
export const lower = (a: string) => a.toLowerCase() as Address;

/** The wallet that spends the burn share of the fee. It holds a small balance only until the next buy and burn. */
export const burnAccount = () => roomAccount(BURN_INDEX);
export const burnWallet = () => createWalletClient({ account: burnAccount(), chain, transport: http(RPC_URL, { retryCount: 3 }) });
