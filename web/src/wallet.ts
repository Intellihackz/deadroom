import { useSyncExternalStore } from "react";
import { toHex } from "./util";

type Eth = {
  request: (a: { method: string; params?: unknown[] }) => Promise<any>;
  on?: (e: string, f: (...a: any[]) => void) => void;
  removeListener?: (e: string, f: (...a: any[]) => void) => void;
};
export type Detected = { id: string; name: string; icon: string; provider: Eth };

const CHAIN_ID = 4663;
const KEY = "deadroom:wallet";

// ---- tiny external store so the nav button, the modal and the room page share one wallet ----
const detected = new Map<string, Detected>();
let state = { account: "", providerId: "", token: "", modal: false, tick: 0 };
const subs = new Set<() => void>();
const emit = (patch: Partial<typeof state> = {}) => {
  state = { ...state, ...patch, tick: state.tick + 1 };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

const remembered = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
const remember = (id: string) => {
  try {
    id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY);
  } catch {
    /* storage can be blocked */
  }
};

// A signed-in session is kept per address for a week, so reloading never asks for another signature.
const SESSION_KEY = "deadroom:session";
const readSession = (address: string): string => {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    return s && s.address === address && s.expiresAt > Date.now() + 60_000 ? s.token : "";
  } catch {
    return "";
  }
};
const writeSession = (address: string, token: string, expiresAt: number) => {
  try {
    token ? localStorage.setItem(SESSION_KEY, JSON.stringify({ address, token, expiresAt })) : localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage can be blocked */
  }
};

/** Ask the server for a one-time message, have the wallet sign it, and trade the signature for a session token. */
async function signIn(provider: Eth, account: string): Promise<string> {
  const cached = readSession(account);
  if (cached) return cached;
  const ch = await fetch(`/api/auth/challenge?address=${account}`);
  const chBody = await ch.json().catch(() => ({}));
  if (!ch.ok) throw new Error(chBody.error ?? "Could not start sign in.");
  const signature = await provider.request({ method: "personal_sign", params: [chBody.message, account] });
  const v = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: account, signature }) });
  const vBody = await v.json().catch(() => ({}));
  if (!v.ok) throw new Error(vBody.error ?? "Sign in failed.");
  writeSession(account, vBody.token, vBody.expiresAt);
  return vBody.token as string;
}

const watched = new WeakSet<object>();
function watch(id: string, provider: Eth) {
  if (watched.has(provider)) return;
  watched.add(provider);
  provider.on?.("accountsChanged", (a: string[]) => {
    if (state.providerId !== id) return;
    const next = a[0]?.toLowerCase() ?? "";
    if (next === state.account) return;
    // a different account has not signed in yet, so treat it as signed out
    remember("");
    emit({ account: "", providerId: "", token: "" });
  });
}

function add(d: Detected) {
  if (detected.has(d.id)) return;
  detected.set(d.id, d);
  // quietly restore the last wallet if it already approved this site
  if (d.id === remembered() && !state.account) {
    d.provider
      .request({ method: "eth_accounts" })
      .then((a: string[]) => {
        const acct = a[0]?.toLowerCase();
        const token = acct ? readSession(acct) : "";
        if (acct && token && !state.account) {
          watch(d.id, d.provider);
          emit({ account: acct, providerId: d.id, token });
        }
      })
      .catch(() => {});
  }
  emit();
}

let started = false;
export function initWallets() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("eip6963:announceProvider", ((e: CustomEvent) => {
    const { info, provider } = e.detail ?? {};
    if (info?.rdns && provider) add({ id: info.rdns, name: info.name, icon: info.icon, provider });
  }) as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  // wallets that do not announce themselves
  setTimeout(() => {
    const legacy = (window as unknown as { ethereum?: Eth }).ethereum;
    if (legacy && detected.size === 0) add({ id: "injected", name: "Browser wallet", icon: "", provider: legacy });
  }, 400);
}

export function useWallet() {
  const s = useSyncExternalStore(subscribe, () => state);
  return { account: s.account, token: s.token, modal: s.modal, wallets: Array.from(detected.values()) };
}

export const openWalletModal = () => emit({ modal: true });
export const closeWalletModal = () => emit({ modal: false });

export async function connectWith(id: string) {
  const d = detected.get(id);
  if (!d) throw new Error("That wallet is no longer available.");
  const accounts: string[] = await d.provider.request({ method: "eth_requestAccounts" });
  if (!accounts[0]) throw new Error("No account selected.");
  const account = accounts[0].toLowerCase();
  // Connecting also signs a message: proof the wallet is yours. No gas, no permission to move funds.
  const token = await signIn(d.provider, account);
  watch(id, d.provider);
  remember(id);
  emit({ account, providerId: id, token, modal: false });
  return account;
}

export function disconnect() {
  remember("");
  writeSession("", "", 0);
  emit({ account: "", providerId: "", token: "" });
}

export const currentToken = () => state.token;

const active = () => {
  const p = detected.get(state.providerId)?.provider;
  if (!p) throw new Error("Connect a wallet first.");
  return p;
};

export async function ensureChain(explorer: string) {
  const e = active();
  const current = Number.parseInt(await e.request({ method: "eth_chainId" }), 16);
  if (current === CHAIN_ID) return;
  try {
    await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHex(CHAIN_ID) }] });
  } catch (err: any) {
    if (err?.code !== 4902 && err?.code !== -32603) throw err;
    await e.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: toHex(CHAIN_ID),
          chainName: "Robinhood Chain",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
          blockExplorerUrls: [explorer],
        },
      ],
    });
  }
}

export const sendEth = (from: string, to: string, valueWei: bigint): Promise<string> =>
  active().request({ method: "eth_sendTransaction", params: [{ from, to, value: toHex(valueWei) }] });

export const signMessage = (from: string, message: string): Promise<string> => active().request({ method: "personal_sign", params: [message, from] });

export const leaveMessage = (roomId: string, address: string, timestamp: number) =>
  `Deadroom: leave coffin ${roomId} as ${address.toLowerCase()} at ${timestamp}`;

export function friendly(err: unknown): string {
  const e = err as { code?: number; message?: string; shortMessage?: string };
  if (e?.code === 4001) return "You cancelled it in your wallet.";
  return (e?.shortMessage ?? e?.message ?? "Something went wrong").split("\n")[0];
}
