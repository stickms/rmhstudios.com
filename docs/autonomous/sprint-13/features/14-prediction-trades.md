# 14 — See the price first, and sell your shares, in Predictions

Surface: `/predictions` (each market card: a live quote under the amount, "Sell" on a position), the wallet statement
(the sale's line), the data export. Wave 6. Namespace `prediction-trades`. Site tier (Steel).

## User story

As a member trading in Predictions, I want to see how many shares my coins would buy and how far the odds would move
before I commit, and to sell some or all of my shares back before the market resolves when I change my mind, so that a
trade is a decision I understand and not a one-way door.

## Requirements elicitation

- **What exists (verified):**
  - Markets are an LMSR (`lib/predictions/lmsr.ts`: `cost`, `priceYes`, `costToBuyShares`, `sharesForBudget`,
    `pricePercent`). `placeTrade` in `lib/predictions/predictions.server.ts` guards on `status: 'OPEN'` with a conditional
    write that row-locks the market, debits with `debitCoins` (type `WAGER`, entity `prediction`), and upserts the
    member's `PredictionPosition` (`prisma/schema/economy.prisma`: `yesShares`, `noShares`, `spent` "net coins spent
    (cost basis)", `settled`, `lastP`). The trade route is `lib/predictions/api/predictions.$id.trade.server.ts`
    (`tradePredictionApi`, 300 a minute per user); the card is `components/predictions/PredictionCard.tsx`.
  - `quoteTrade` ("Estimate (without trading) how a coin amount would land on a market") exists and is **never
    called**: the card shows "Bought {{shares}} {{side}} shares" only after the coins have gone.
  - **There is no sell:** a position can only grow until the market resolves (`resolvePrediction` pays winning shares).
  - Every coin movement is classified in `lib/economy/flows.ts` (`prediction-stake` sink, `prediction-payout` faucet,
    held by `lib/__tests__/economy-flows.test.ts`).
- **Decisions:**
  - **Quote:** a pure client computation from the market state (`quoteTrade` moves into a client-safe module beside
    `lmsr.ts`): "{{shares}} shares, average {{price}} each; YES would move to {{percent}}%". **The card does not hold
    that state today**: `SerializedMarket` (`predictions.server.ts`) and `components/predictions/types.ts` carry only
    `yesPercent`, so both gain `qYes`, `qNo` and `b` (public market state, already implied by the price), and the
    position gains `received`. The server stays the authority: the buy request carries an optional `minShares` (the
    quote less 2%), and a trade that would buy fewer is refused with `PREDICTION_PRICE_MOVED` before any write (the
    bot market-makers in `predictions-ai.server.ts` call `placeTrade` without it and are unchanged).
  - **Sell:** `sellShares(userId, predictionId, side, shares, minProceeds, key)` in one `$transaction`, in this order,
    and nothing else moves coins:
    1. **Replay check first:** if a `CoinTransaction` with idempotency key `prediction-sale:<predictionId>:<userId>:<key>`
       exists, return the original outcome (the position's current state, `replayed: true`) and write nothing. The key
       is scoped to the member, so another member's key can never collide with theirs.
    2. The same OPEN and `closesAt` checks and the same row lock as `placeTrade` (a conditional `updateMany` on
       `status: 'OPEN'`, here `data: { volume: { increment: 0 } }`), so a sale serialises with every trade and with
       resolution on that market.
    3. Read the market's `q` and the member's position **after** the lock (never from the request or an earlier read).
       `shares` greater than the side's holding by more than `1e-9` is refused (`PREDICTION_NOT_ENOUGH_SHARES`); within
       `1e-9` it is clamped to the holding (so "sell all" of a fractional holding works).
    4. Proceeds: `proceedsForShares(qYes, qNo, b, side, shares) = floor(cost(q) − cost(q with that side − shares))`,
       a whole number of coins rounded **down**; refused below 1 coin (the existing `TRADE_TOO_SMALL`) and below
       `minProceeds` (`PREDICTION_PRICE_MOVED`). Because LMSR's cost is path-independent, selling what was just bought
       returns at most what it cost, and the floor only ever keeps the remainder in the market.
    5. Writes, all inside the transaction: the position's side decremented by a **conditional** `updateMany`
       (`where: { id, yesShares: { gte: shares } }` or `noShares`; count 0 → `PREDICTION_NOT_ENOUGH_SHARES`), its
       `received` incremented by the proceeds and `lastP` set to the post-sale price; the market's `qYes` or `qNo`
       **decremented by the shares sold**; then `creditCoins` (`lib/economy/ledger.server.ts`, with `tx`; `WAGER` type,
       entity `prediction`, note "{{side}} shares sold", the key above). A unique-key race on the credit rethrows inside
       the caller's transaction (the ledger's own rule), so the whole sale rolls back.
    Refused for a closed or resolved market with the existing `NOT_OPEN` / `CLOSED` and for no position with
    `PREDICTION_NOT_ENOUGH_SHARES`.
  - **The position:** shares fall by the amount sold; a new `received Int @default(0)` column records coins taken out,
    so the position shows "spent {{spent}}, received {{received}}"; `spent` stays the cost basis it always was.
    `lastP` is updated as on a buy (the forecast for calibration scoring).
  - **Responsible play:** selling is not gated (it returns coins), buying keeps its existing gates.
  - **Flows:** a new `prediction-sale` faucet in `lib/economy/flows.ts`, `pairsWith: 'prediction-stake'`.
  - **Export:** the member's positions (market title, shares, spent, received, settled), as `predictionPositions` under
    the sprint 13 anchor (they are not in the export today).

## Functional requirements

1. FR-1 Migration `20261220060100_s13_prediction_trades`: `ALTER TABLE "prediction_position" ADD COLUMN "received"
   INTEGER NOT NULL DEFAULT 0`.
2. FR-2 `lib/predictions/lmsr.ts` gains `proceedsForShares` (pure, with the rounding; it returns 0 for `shares <= 0`
   and never more than `floor` of the exact cost difference); `lib/predictions/quote.ts` (new, client-safe) holds
   `quoteTrade` and `quoteSale`; `predictions.server.ts` imports them (its own `quoteTrade` is removed).
3. FR-3 `predictions.server.ts`: `placeTrade` takes an optional `minShares`; `sellShares` as decided;
   `serializeMarket` adds `qYes`, `qNo`, `b` and the position's `received`; `exportPredictionPositions`.
4. FR-4 Endpoint `POST /api/predictions/$id/sell` (registered module `lib/predictions/api/predictions.$id.sell.server.ts`,
   contract in `predictions.contract.ts`, the trade route's rate limit bucket); the trade body gains `minShares`.
5. FR-5 UI: `PredictionCard.tsx` shows the quote as the amount changes (no request) and a "Sell" action on a held
   position opening `components/predictions/SellDialog.tsx` (new: amount of shares, the live proceeds, one primary
   "Sell"); refusals through `useRefusalText`.
6. FR-6 `lib/economy/flows.ts` `prediction-sale`; the refusal codes under the Wave 0 anchors.

## Non-functional requirements

- **Money:** no sale can create coins the market did not take in. Property tests over random states and random
  sequences of buys and partial sells by several members: (a) buying then selling everything at once returns no more
  than was spent; (b) splitting a sale into n parts never returns more than one sale of the whole; (c) for any
  sequence, the coins the market took in (buys minus sale proceeds) are at least `cost(q_now) − cost(q_start)` (within
  `1e-6`), so the market maker's worst case at resolution stays the existing `b · ln 2` bound. Concurrent sells of one position cannot oversell
  (the row lock and the conditional decrement; a test with two sales of the whole position, one wins), and a replayed
  key moves nothing (the check runs before any write).
- **Consistency:** the quote and the server agree for the same state (the same pure functions).
- **Design (Steel):** the sell dialog is an overlay with one ink primary; figures are `t-meta`.

## Data model and API

`PredictionPosition.received Int @default(0)`. `POST /api/predictions/$id/sell { side, shares, minProceeds, key }`
(zod: `side` enum, `shares` a positive finite number, `minProceeds` a non-negative integer, `key` 8–64 characters of
`[A-Za-z0-9_-]`) → `{ market, sharesSold, proceeds, newBalance, replayed }`. `SerializedMarket` gains `qYes`, `qNo`,
`b`; its `position` gains `received`.

## Testing requirements

- Main suite `lib/predictions/__tests__/lmsr.test.ts` (extended) and product suite
  `lib/predictions/__tests__/quote.product.test.ts`: proceeds, rounding
  down, buy-then-sell never profits, quote equals the server's numbers.
- Main suite `lib/predictions/__tests__/sell.test.ts`: refusals (too many shares, closed, resolved, price moved, too
  small, no position); a replayed key returns `replayed: true` with no position, market or ledger write; the key is
  scoped per member; two concurrent full sales (one wins, mocked lock order and the conditional decrement); the market's
  `q` falls by the shares sold; the ledger entry's type, entity and key; `received` and `lastP` updated.
- Main suite `lib/predictions/__tests__/trade-min-shares.test.ts`: a buy below `minShares` moves nothing.
- `lib/__tests__/economy-flows.test.ts`, the export test (key `predictionPositions`), the error-code catalogue.

## Acceptance criteria

- [ ] Typing 50 coins on a market shows the shares and the new odds before buying.
- [ ] A member sells half their YES shares and their balance rises by the quoted proceeds.
- [ ] If the price moved past the quote, the sale is refused with a sentence and nothing changes.
- [ ] A resolved market offers no "Sell".
- [ ] Buying 50 coins of YES and selling every share at once returns at most 50 coins.

## Out of scope

Limit orders, short selling, selling another member's shares, fees.
