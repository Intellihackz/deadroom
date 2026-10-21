# Deploy to Railway

One service runs both the API and the website. It needs a **Volume** (the database lives on it) and **one replica only** (it keeps state in memory and in one file).

## Before you start

- A GitHub account and a Railway account.
- Two wallets with a little ETH on Robinhood Chain, for the first test room.
- A domain is optional. Railway gives you one for free.

## 1. Make the production secrets, in your own terminal

```bash
cd server && npm run keygen -- --print
```

It prints `MASTER_MNEMONIC` and `ADMIN_KEY` once and saves nothing. Put both in a password manager now, and make an offline copy of the mnemonic. **Whoever has the mnemonic controls the money in every coffin.** Never paste it into chat, a commit or a screenshot.

The `.env` on your laptop has a different, local-only mnemonic. Do not reuse it in production.

## 2. Put the code on a private GitHub repo

```bash
cd /Users/zed/dev/deadroom
git init && git add -A
git status --short | grep -E "\.env$|data/" && echo "STOP: a secret is staged" || echo "ok, no secrets staged"
git commit -m "deadroom"
gh repo create deadroom --private --source=. --push
```

`.gitignore` already excludes `.env`, `data/`, `node_modules/` and `dist/`.

## 3. Create the Railway service

1. New Project, then Deploy from GitHub repo, then pick `deadroom`.
2. It reads `railway.json` for the build command, the start command and the health check on `/health`.
3. In the service, go to Volumes and add one with mount path `/data`. **Do this before the first real coffin.** Without it, every redeploy wipes who paid.

## 4. Variables

| Variable | Value |
|---|---|
| `MASTER_MNEMONIC` | from step 1 |
| `ADMIN_KEY` | from step 1 |
| `DATA_DIR` | `/data` |
| `TREASURY_ADDRESS` | an address YOU control (a hardware wallet or multisig is best). The platform fee is paid here. **If this is not set, no fee is charged.** |
| `FEE_BPS` | optional, default `200` (2%), capped at 5% |
| `SITE_URL` | `https://your-address` (no trailing slash) |
| `VITE_SITE_URL` | the same address. It is read at build time, so redeploy after changing it |

Then Settings, Networking: generate a domain or add your own, put that address into `SITE_URL` and `VITE_SITE_URL`, and redeploy.

### Later: switching on the buy and burn

Until the platform token exists, the whole net fee goes to the treasury. When you have launched the token, set `PLATFORM_TOKEN` to its address and redeploy. From then on `BURN_SHARE_BPS` (default `5000`, half) of each net fee goes to a small burn wallet, which every 10 minutes buys the token on its Pons curve and sends it to the dead address. Every burn appears on `/ledger`. Run one on demand with `POST /api/admin/burn` and the `x-admin-key` header. Once the token **graduates** to its pool, burns pause (the pool buy is not built yet) and the ledger says so.

### Later: showing the token address and the buy button

The site has a contract-address bar above the nav and a large card on the home page, both saying "coming soon" with the buy button switched off. When the token exists, set these where the site is built (Railway Variables) and redeploy, since they are read at build time:

```
VITE_TOKEN_CA=0x...your token address...
VITE_TOKEN_SYMBOL=TICKER
```

Only an exact `0x` plus 40 hex characters is accepted. The buy button then opens `ponsfamily.com/launchpad/<address>`.

## 5. Check it

- `https://your-address/health` shows `"persistent": true` and a file under `/data`.
- View source on the home page: there is a `canonical` link, and the preview image tags are absolute.
- `https://your-address/sitemap.xml` and `/robots.txt` respond.
- `https://your-address/ledger` loads and shows your treasury address and the fee.
- Paste the address into a link preview checker: the image shows.

## 6. First real room (use real but tiny money)

1. Dig up a coffin: 2 seats at **0.002 ETH**. (The buy is the pool minus the 0.0005 ETH launch fee and a gas hold, so about 0.0027 ETH.)
2. Connect wallet A and sign in. Digging it up takes seat 1 from wallet A in the same step (you confirm one transfer).
3. Connect wallet B: take seat 2. The coffin fills and relaunches by itself.
4. Check: the new token exists on Pons, both wallets got equal tokens, the coffin page says "risen".
5. Separately: dig up a second coffin, take a seat, then **leave** and confirm the ETH comes back.

## Safety

- **One replica.** Do not scale the service up.
- **Backups:** the server keeps `deadroom.json.bak` beside the database. Also download `deadroom.json` from the volume now and then, and keep the mnemonic copy offline.
- **Admin routes** need the `x-admin-key` header: `POST /api/admin/rooms/:id/{fill,expire,refunds,buyback}`.
- If a launch ever fails, the server retries three times and then refunds every seat automatically.
- Pons v2 contracts are unaudited. Say so on the page (it already does) and keep seat prices small at first.
