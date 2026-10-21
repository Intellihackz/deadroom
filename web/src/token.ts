/**
 * Our own token. Until it exists the strip says "coming soon" and the buy button is off.
 * To switch it on, set VITE_TOKEN_CA (and optionally VITE_TOKEN_SYMBOL) where the site is built, then redeploy.
 * Only an exact 0x plus 40 hex characters is accepted, so a typo can never show up as a "contract address".
 */
const ca = (import.meta.env.VITE_TOKEN_CA ?? "").trim();

export const TOKEN_CA = /^0x[0-9a-fA-F]{40}$/.test(ca) ? ca : "";
export const TOKEN_SYMBOL = (import.meta.env.VITE_TOKEN_SYMBOL ?? "").replace(/^\$/, "").trim().slice(0, 16);
export const HAS_TOKEN = Boolean(TOKEN_CA);
export const PONS_URL = HAS_TOKEN ? `https://ponsfamily.com/launchpad/${TOKEN_CA}` : "";
export const EXPLORER_URL = HAS_TOKEN ? `https://robin.etherscan.io/token/${TOKEN_CA}` : "";
export const TOKEN_LABEL = TOKEN_SYMBOL ? `$${TOKEN_SYMBOL}` : "our token";
