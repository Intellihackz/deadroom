import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Address, Hex } from "viem";
import { publicClient, lower } from "./chain.js";
import { ADMIN_KEY, MASTER_MNEMONIC } from "./config.js";

// Sign in with a wallet: the server hands out a one-time message, the wallet signs it,
// and the server answers with a stateless session token (address + expiry, HMAC signed).
// Nothing is stored for sessions, and the signing key is derived, never written anywhere.

const SECRET = process.env.SESSION_SECRET || createHmac("sha256", MASTER_MNEMONIC + ADMIN_KEY).update("deadroom:session:v1").digest("hex");
const NONCE_TTL = 5 * 60_000;
const SESSION_TTL = 7 * 24 * 3600_000;

const nonces = new Map<string, { message: string; exp: number }>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of nonces) if (v.exp < now) nonces.delete(k);
  if (nonces.size > 5000) nonces.clear(); // hard cap against floods
}

export function signinMessage(address: Address, nonce: string, issuedAt: string) {
  return [
    "Deadroom wants you to sign in with your wallet.",
    "",
    "This proves the wallet is yours. It costs no gas and gives no permission to move funds.",
    "",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

export function createChallenge(address: Address) {
  sweep();
  const a = lower(address);
  const message = signinMessage(a, randomBytes(16).toString("hex"), new Date().toISOString());
  nonces.set(a, { message, exp: Date.now() + NONCE_TTL });
  return message;
}

const mac = (payload: string) => createHmac("sha256", SECRET).update(payload).digest("hex");

export async function verifyChallenge(address: Address, signature: Hex) {
  const a = lower(address);
  const ch = nonces.get(a);
  if (!ch || ch.exp < Date.now()) return null;
  const ok = await publicClient.verifyMessage({ address: a, message: ch.message, signature }).catch(() => false);
  if (!ok) return null;
  nonces.delete(a); // one use
  const exp = Date.now() + SESSION_TTL;
  const payload = `${a}.${exp}`;
  return { token: `${payload}.${mac(payload)}`, expiresAt: exp };
}

/** Returns the signed-in address for an `Authorization: Bearer <token>` header, or null. */
export function sessionAddress(header: string | undefined): Address | null {
  const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const [addr, exp, sig] = token.split(".");
  if (!addr || !exp || !sig || !/^0x[0-9a-f]{40}$/.test(addr) || Number(exp) < Date.now()) return null;
  const want = Buffer.from(mac(`${addr}.${exp}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return addr as Address;
}
