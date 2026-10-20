# Deadroom

Pay to resurrect. A crowd fills a room for a dead token. When the last seat is taken, the token relaunches on Pons (Robinhood Chain) and every seat buys in the same transaction at one price. Spec and decisions: [SPEC.md](SPEC.md).

- `server/` Hono + viem. One HD wallet per room (deposit, launcher, fee recipient, buyback). No contracts of our own: it calls the Pons v2 router `launchAndBuy`.
- `web/` Vite + React. The server serves `web/dist`, so it deploys as one service.

## Run locally

```bash
cd server && npm i && npm run keygen   # writes MASTER_MNEMONIC + ADMIN_KEY to server/.env
cd ../web && npm i && npm run build
cd ../server && npm start              # http://localhost:8787
```

Frontend dev: `cd web && npm run dev` (proxies `/api` to :8787).

## Useful scripts (server)

- `npm run check` read-only: launch fee, configs, canLaunch
- `npx tsx --env-file-if-exists=.env scripts/simulate.ts 0.5` dry-runs `launchAndBuy` with a faked balance
- Test the whole flow without spending anything: `anvil --fork-url https://rpc.mainnet.chain.robinhood.com`, then start the server with `RPC_URL=http://127.0.0.1:8545 DATA_DIR=/tmp/dr PORT=8788`

## Env (server)

| Var | Meaning |
|---|---|
| `MASTER_MNEMONIC` | Required. Controls EVERY room wallet. Back it up, never commit it. |
| `ADMIN_KEY` | Header `x-admin-key` for `/api/admin/rooms/:id/{fill,expire,refunds,buyback}` |
| `RPC_URL`, `CHAIN_ID` | Default Robinhood Chain mainnet (4663) |
| `DATA_DIR` | Where `deadroom.json` lives. On Railway attach a Volume (it is picked up via `RAILWAY_VOLUME_MOUNT_PATH`) or rooms vanish on redeploy |
| `PORT`, `CORS_ORIGIN` | Defaults 8787, `*` |

## Deploy (Railway)

Root directory = repo root. Build: `npm --prefix web ci && npm --prefix web run build && npm --prefix server ci`. Start: `npm --prefix server start`. Attach a Volume, set `MASTER_MNEMONIC` and `ADMIN_KEY`.

## Known gaps

- Custodial escrow: whoever holds the mnemonic holds the money.
- Buybacks only buy on the bonding curve. After graduation it logs a note and fees keep accruing (no pool swap yet).
- Deposits are claimed by the browser reporting the tx hash (or pasting it). ETH sent without reporting just sits in the wallet.
- Pons v2 contracts are unaudited.

## Brand

`brand/` holds the guidelines (`BRAND.md`), a one page sheet (`brand-sheet.html` and `.png`) and every generated asset. Rebuild them with `cd web && npx tsx scripts/brand.ts` (text is outlined from JetBrains Mono, so nothing depends on an installed font). The site font is self-hosted JetBrains Mono.

## Going public: set the address

- Build the web app with `VITE_SITE_URL=https://your.domain npm run build` so the preview image tags are absolute.
- Run the server with `SITE_URL=https://your.domain`. It then serves `/sitemap.xml`, adds a canonical link to each page and points `robots.txt` at the sitemap. Until you set it, the audit shows two warnings (canonical and sitemap) and link previews may not show the image.

## Deploying

See [DEPLOY.md](DEPLOY.md): secrets, GitHub, Railway with a Volume, variables, checks, and a first real room.
