# Deadroom

Category line: **Raising dead tokens.**

A room for a dead token. A crowd pays in, and when enough wallets have joined, the token is relaunched as a new token on Pons. Everyone buys at the same price in one transaction.

## Stack decisions

- **Chain:** Robinhood Chain (mainnet 4663, testnet 46630).
- **Launch venue:** Pons v2 (docs.ponsfamily.com/v2). Factory `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e`, router `0xe33E9E479dF8802cb0866d5d05258bEc4cF62948`. Launching creates a token and a bonding curve, which graduates into a locked Uniswap v4 pool when it sells out. (The older v1 factory with no curve is superseded.)
- **Launch access:** the docs say launching is whitelist only, but on 2026-10-20 `launchEnabled()` on the factory returned `true` on chain, and `canLaunch(address)` is true for everyone while the public gate is open. So no whitelist is needed right now. Still call `canLaunch(serverWallet)` before every launch, since Pons can close the gate. Contracts are not audited yet.
- **No contracts written by us.** Escrow is custodial: the server holds a deposit wallet per room (derived from one master key). We only call the existing Pons factory.
- **Entry currency:** ETH (Pons pools pair with WETH).
- **Web only.**

## One wallet per room

Every room generates its own wallet (derived from the master key, one per room id). That single wallet is:
- the **deposit address** people send ETH to,
- the **launcher** that calls `launchAndBuy` and the `recipient` of the buy,
- the **`creatorFeeRecipient`**, so trading fees land in it,
- the **buyback wallet** that spends those fees buying the relaunched token.

Why this is simple: one address to watch, one balance to account for, and Pons exempts the launcher, the fee recipient and the buy recipient from the snipe tax automatically. Gas for the launch is paid from the pool, so refunds before the fill are always the full amount.

## Room lifecycle

1. **Create.** Creator picks a dead token (we trust the user, no dead check) and sets:
   - `walletTarget` (e.g. 100)
   - `seatPrice` in ETH (fixed, same for everyone)
   - `deadline` (optional)
   - `mode` = `new_token` (v1). `existing_token` is a later add-on.
2. **Join.** Any wallet sends exactly `seatPrice` to the room's deposit address. One seat per wallet, the sender is the seat. No overpaying. Wrong amounts or a second seat from the same wallet are refunded.
3. **Leave.** Anyone can leave before the fill and get their ETH back.
4. **Fill.** When distinct joined wallets reach `walletTarget`, the room closes.
5. **Relaunch.** The server wallet calls the router's `launchAndBuy(params, launchConfigId, pairToken=0x0, quoteIn, minTokensOut, recipient, snipeTaxExemptions)` with the dead token's name, symbol and logo, and `quoteIn` equal to `walletTarget × seatPrice` minus `launchFee()` and a gas reserve. That buy amount is fixed and shown on the room page before anyone joins ("buy amount ≈ X ETH"). It is one transaction, so nobody trades before the crowd and everyone gets one price. Call `previewLaunchEconomics` right before and pass the result as `expectedEconomics`. The buy recipient is exempt from the snipe tax.
6. **Distribute.** Every wallet gets an equal share: `tokensOut ÷ walletTarget`. Rounding dust and any refunded curve excess are split equally the same way. Wallet to wallet transfers are not restricted on Pons.
7. **Expire.** If a deadline is set and passes first, everyone is refunded.

## Launch procedure (from docs.ponsfamily.com/v2#launching)

1. `canLaunch(serverWallet)` must be true (open gate today, whitelist only if Pons closes it).
2. Read `launchConfigCount()` then `getLaunchConfig(id)` and keep configs with `enabled`. Never cache ids, a disabled config reverts with `LaunchConfigDisabled`.
3. `pairToken` = zero address (native ETH). ERC-20 pairs need Pons approval, so ETH only.
4. Right before sending: `previewLaunchEconomics(configId, pairToken)` goes in `expectedEconomics`, and read `launchFee()`.
5. Fresh random 32-byte `salt`. Reusing one with identical terms reverts.
6. Call the router `launchAndBuy(...)` with `value = launchFee + quoteIn` (native pair). `creatorFeeRecipient` must be explicit and nonzero.
7. Read back `(token, curve, tokensOut)`, then transfer the tokens out to the room's wallets.

`TokenParams`: name, symbol, logo, description, socials (twitter, telegram, discord, website, farcaster), creatorFeeRecipient, creatorTaxBps (0), buybackEnabled (true), expectedEconomics, salt. A wrong fee reverts with `LaunchFeeNotPaid`.

## Fees and buyback

- No creator fee and no cut from escrow.
- `TokenParams.buybackEnabled = true` makes Pons itself use a slice of trading fees to buy back the token. This is the buyback, with no code from us.
- `creatorFeeRecipient` is the room wallet, which also does the buybacks. `creatorTaxBps` stays 0 to keep it clean.
- Pons takes its protocol share first. The split percentages are not in the docs.
- Open: whether the creator's remaining fee share also buys back, or is kept.

## Decisions (final)

- Fixed seat price, one seat per wallet, equal shares (decided 2026-10-20, replaces the earlier pay-more and pro rata rule).
- Old holders get nothing special. No lock. No sybil defence.
- Duplicate rooms for the same token are allowed, with a "already being dug up" warning.
- Existing-token mode comes later, so `mode` is a field on every room from day one.

## To verify before building

- **Curve clamp.** Buys fill only up to the reserved curve allocation and the excess is refunded. A big pool could sell the curve out in one buy and graduate the token immediately. Decided: not our problem, no cap on room size. The room wallet just receives any refunded excess.
- No quote function on the curve. Compute quotes from `getReserves()` and the fee rates.
- Numeric values: `launchFee()`, `feeBps`, `maxCreatorTaxBps()`, launch config ids. Read them on chain.
- Whether v2 has any max wallet cap (the v2 docs do not mention one).
- Snipe tax is not an issue for the one pooled buy, but tokens sent on from the server are plain transfers.
- Graduation happens in the same buy if the curve sells out. If it stalls, anyone can call `createGraduatedPool(token)`.

## Risks to state plainly

- Custodial escrow means users trust the server with their ETH. State it on the page.
- Distributing tokens is a loop of transfers, so gas grows with wallet count.

## Vocabulary (UI only, code and API still say `room`)

Deadroom is the viewing room. Each dead token lies in a **coffin**. Creating one is **digging it up**. Money words stay literal: seat, seat price, refund, buy, leave.

| Status | Shown as |
|---|---|
| open | sealed |
| launching | opening |
| distributing | rising |
| live | risen |
| expired | buried |
| failed | rotted |

Create is a modal (also reachable at `/new`). Coffin pages live at `/c/:id` (`/r/:id` still works). Each page has a death notice line: "dug up 3h ago. survived by 41 of 100 seats."
