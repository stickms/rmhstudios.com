# 07 — Monthly spending budget

Surface: the play-limits panel on `/settings/privacy`
(`components/settings/PlayLimitsPanel.tsx`), the wallet (`/wallet`), and every
coin spend on the site through the ledger chokepoint. Wave 2. Namespace
`spending-budget`.

## User story

As a member who spends coins in the shop, on unlocks, tips and gifts, I want
to set a monthly budget that the site enforces, with raising it taking a day
to apply — so that I spend what I decided to spend, not what I felt like at
midnight.

## Requirements elicitation

- **What exists (verified):** responsible-play limits (`UserPlayLimits` in
  `prisma/schema/auth.prisma`; `lib/economy/play-limits*.ts`) cap **wagers**
  only: `debitCoinsOn` (`lib/economy/ledger-core.ts`) calls
  `assertPlayAllowedOn` when `type === 'WAGER'`. Loosening a limit is parked
  for 24 hours (`pendingCap`, `pendingCapAt`, folded in by `effectiveCap`);
  tightening applies at once. Non-wager spending — `PURCHASE` (shop, themes,
  unlocks, battle pass), `TIP`, `GIFT`, `MEMBERSHIP` paid in coins and
  `MARKET` buys — has no limit of any kind. Every such debit goes through
  `debitCoinsOn` or `transferCoinsOn` (the only two `coins: { decrement }`
  writes besides wager escrow, which is `WAGER`). The coin statement counts
  months in UTC (`lib/economy/statement.ts`).
- **Decisions:** one optional monthly cap (UTC calendar month, like the
  statement) on the sum of the member's outgoing `PURCHASE`, `TIP`, `GIFT`,
  `MEMBERSHIP` and `MARKET` transactions (`senderId = member`). Wagers keep
  their own daily cap; `ADMIN` debits (feature 06), fees and refunds are not
  spending. The same asymmetry as the wager cap: lowering or setting applies
  at once, raising or removing waits 24 hours and can be cancelled. Payouts
  and incoming coins are never blocked. One notice per month when 80% is
  reached.

## Functional requirements

1. FR-1 The play-limits panel gains "Monthly spending budget": Off, or an
   amount (100..10,000,000); the line under it reads "1,240 of 2,000 coins
   spent in November" with a flat meter; a pending raise reads "Rises to
   5,000 on 22 Nov at 14:05 · Cancel".
2. FR-2 A spend that would cross the budget is refused before any coins move,
   with the error code `SPEND_BUDGET_REACHED` and the remaining amount; every
   client that shows ledger errors (shop, unlocks, tips, gifts, battle pass,
   market) shows "This would go over your monthly budget (380 coins left)".
3. FR-3 The wallet shows "380 of 2,000 left this month" beside the balance
   when a budget is set.
4. FR-4 The first spend that takes the month past 80% notifies the member once
   that month ("You have used 80% of your spending budget").
5. FR-5 The budget appears in the account export with the other play limits.

## Non-functional requirements

- **Correctness:** the check runs inside the ledger transaction before the
  balance update and takes `pg_advisory_xact_lock(hashtext('spend:' ||
  userId))` first, so two concurrent spends cannot both pass on the same
  remaining amount (check-then-insert under a lock — the sprint 02/03 lesson).
  The month's spend is one `SUM` over `coin_transaction` by `"senderId"`,
  `"type"` and `"createdAt"` (index `[senderId, createdAt desc]` exists);
  raw SQL uses the real names and is asserted in a test.
- **Scope of enforcement:** both `debitCoinsOn` and `transferCoinsOn` (sender
  side) in `ledger-core.ts`, so the socket tier, which binds its own client,
  is covered by construction. No call site changes.
- **Security:** the settings endpoint is session-only and changes only the
  caller's row; zod bounds; rate limit `write`.
- **Performance:** one indexed `SUM` per spend only when a budget is set
  (read the limits row first; no row or null cap means no extra query).
- **Privacy:** the row is erased under `s04-07` (the whole `UserPlayLimits`
  row, which today survives erasure).
- **Accessibility:** the meter has `role="meter"` with `aria-valuenow`,
  `aria-valuemax` and a text equivalent; the refusal toast is also the
  inline error of the action that failed.
- **i18n:** strings in `spending-budget`; month names via
  `Intl.DateTimeFormat`; the error code maps to a key, never to English from
  the server.
- **Steel:** the meter is a 4 px bar of `--site-text` on `--site-bg-subtle`
  with `rounded-site-sm` — flat, no gradient; the panel keeps its rows.

## Data model and API

- `UserPlayLimits` gains `monthlySpendCap Int?`, `pendingSpendCap Int?`,
  `pendingSpendCapAt DateTime?`, `spendNoticeMonth String? @db.VarChar(7)`
  (the `YYYY-MM` already notified). Migration
  `20261124020000_s04_spending_budget`.
- `lib/economy/spend-budget.ts` (pure: month bounds, effective cap with a
  matured pending change — share `effectiveCap`'s rule, which types count,
  80% crossing), `lib/economy/spend-budget-core.ts`
  (`assertSpendAllowedOn(db, userId, amount, type)` bound to a caller's
  client, like `play-limits-core.ts`), `lib/economy/spend-budget.server.ts`
  (read for the panel and wallet, set, cancel).
- `ledger-core.ts`: one call in `debitCoinsOn` and one in `transferCoinsOn`.
- `lib/errors/codes.ts`: `SPEND_BUDGET_REACHED`.
- Extend the existing play-limits contract and module
  (`lib/economy/play-limits.contract.ts`, its `api/` module) with the budget
  fields rather than adding a second settings endpoint.

## Testing requirements

- Main suite `lib/economy/__tests__/spending-budget.test.ts` (fake db): a
  spend over the cap is refused and moves nothing; wagers, admin debits and
  credits are not counted; a raise waits 24 hours, a cut is immediate; the
  lock is taken before the sum; the 80% notice fires once per month.
- Main suite `lib/account/__tests__/play-limits-erasure.test.ts`.
- Product suite `lib/economy/__tests__/spend-budget.product.test.ts`: month
  bounds at year ends, effective cap, 80% crossing.
- The existing play-limits tests stay green.

## Acceptance criteria

- [ ] With a 1,000 budget and 900 spent, a 200-coin theme purchase is refused
      with "100 coins left" and the balance is unchanged.
- [ ] Raising the budget shows as pending for 24 hours; lowering applies now.
- [ ] Tips and gifts count; a won bet does not.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Per-category budgets, weekly budgets, budgets set by another member (a
parent or guardian), real-money limits.
