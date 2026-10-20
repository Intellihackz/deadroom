import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generateMnemonic, english } from "viem/accounts";

// Local: writes a fresh MASTER_MNEMONIC and ADMIN_KEY into .env and never prints the mnemonic.
// Production: `npm run keygen -- --print` prints both ONCE to your own terminal and writes nothing. Copy them into a
// password manager and into the host's secret variables. Do not run it in a shared or logged place.
if (process.argv.includes("--print")) {
  const key = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
  console.log("\nMASTER_MNEMONIC=" + generateMnemonic(english));
  console.log("ADMIN_KEY=" + key);
  console.log("\nCopy both now. Whoever holds the mnemonic controls every coffin wallet. Nothing was saved to disk.\n");
  process.exit(0);
}
const path = new URL("../.env", import.meta.url);
const current = existsSync(path) ? readFileSync(path, "utf8") : "";

if (/^MASTER_MNEMONIC=.+/m.test(current)) {
  console.log(".env already has a MASTER_MNEMONIC. Not touching it.");
  process.exit(0);
}

const adminKey = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
const lines = [current.trimEnd(), `MASTER_MNEMONIC=${generateMnemonic(english)}`, `ADMIN_KEY=${adminKey}`, ""]
  .filter((l, i) => l !== "" || i === 0)
  .join("\n");
writeFileSync(path, lines + "\n", { mode: 0o600 });
console.log("Wrote MASTER_MNEMONIC and ADMIN_KEY to server/.env (not printed). Back the mnemonic up: it controls every room wallet.");
