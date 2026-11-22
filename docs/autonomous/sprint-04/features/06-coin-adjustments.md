# 06 — Ledgered coin adjustments for admins

Surface: `/admin/users` (`app/routes/_site/admin/users.tsx`): a coin panel per
member replacing the "Set coins" prompt; the member's wallet statement and
notifications. Wave 1. Namespace `coin-adjustments`.

## User story

As a site admin fixing a member's coins (a bug that cost them a purchase, a
goodwill credit, clawing back an exploit), I want to add or remove an amount
with a reason, see every earlier adjustment and undo a mistaken one — and as
the member, I want the adjustment to show in my statement with its reason —
so that every coin on the site is explained by the ledger.

## Requirements elicitation

- **What exists (verified):** `POST /api/admin/users/$id/set-coins`
  (`lib/admin/api/admin.users.$id.set-coins.server.ts`, contract
  `setAdminUserCoinsApi` in `lib/admin/admin-ops.contract.ts`) **overwrites**
  `UserProfile.coins` with an exact number through `prisma.userProfile.upsert`.
  It writes no `CoinTransaction`, so it breaks the invariant the ledger is
  built on (`balance(u) == Σ in − Σ out`, asserted by `reconcileUser` in
  `lib/economy/ledger.server.ts`; the schema comment on `CoinTransaction`
  says "Write rows ONLY through `lib/economy/ledger.server.ts`"), it races any
  concurrent earning or spend (the overwrite loses it), and the member's
  statement (`lib/economy/statement.ts`) cannot show it. The admin UI asks for
  the number with `window.prompt`. `CoinTxnType.ADMIN` exists and is unused by
  this path. `reconcileUser` has no UI.
- **Decisions:** replace "set to N" with **signed adjustments**: a credit is
  `creditCoins` and a debit `debitCoins`, both `type: 'ADMIN'`, with an
  `entityType: 'coin_adjustment'` link to a new `CoinAdjustment` row that
  holds who, why and the reversal link. A debit cannot take a balance below
  zero (the ledger refuses; the panel shows the balance). Reasons are a fixed
  list: correction, goodwill, compensation, exploit clawback, reversal. A
  reversal is an opposite adjustment, once per adjustment. Adjustments above
  100,000 coins require typing the amount again. The set-coins endpoint, its
  contract entry and its prompt are removed (no dead code; nothing else calls
  it). `reconcileUser` is shown read-only ("Ledger matches balance" or "Ledger
  differs by N — balance predates the ledger"); this feature does not offer
  an automatic fix, which would be an accounting decision.

## Functional requirements

1. FR-1 Each member row in `/admin/users` has "Coins" opening a dialog:
   current balance, the reconciliation line, an adjustment form (Add /
   Remove, amount, reason select, note up to 280 characters, required for
   "correction"), and the member's last 20 adjustments (when, admin, signed
   amount, reason, note, Reverse).
2. FR-2 Submitting writes the ledger row and the adjustment in one
   transaction, logs `coins.adjust` to the admin audit log (`logAdminAction`)
   and notifies the member: "RMH Studios added 500 coins: goodwill" (or
   removed), linking to `/wallet`.
3. FR-3 Reverse creates the opposite adjustment with reason "reversal" and the
   link; a reversed adjustment shows "Reversed" and cannot be reversed again;
   reversing a debit of a member who has since spent the coins is refused
   with the balance.
4. FR-4 The member's statement shows adjustments as their own rows
   ("Adjustment · goodwill") in the earned or spent column by sign.
5. FR-5 A retried submit (double click, network retry) applies once: the
   client sends an idempotency key, used as the ledger `idempotencyKey`
   (`coin-adjustment:<key>`).

## Non-functional requirements

- **Security:** `auth: 'admin'` on every endpoint; rate limit `write` per
  admin; amount an integer 1..1,000,000; the target must exist and not be the
  tombstone `DELETED_USER_ID`. Never echo errors; map
  `InsufficientFundsError` to 409 with the balance.
- **Correctness:** the ledger row and the adjustment are one transaction
  (`tx` passed to `creditCoins`/`debitCoins`); the reversal claims the
  original with a conditional `updateMany` (`reversedById: null` → id) so two
  reversals cannot both apply.
- **Privacy:** adjustments are financial records and stay after erasure (like
  the ledger rows they explain); the erasure step (anchor `s04-06`) clears the
  free-text `note` on adjustments about the member. They are not added to the
  account export beyond the ledger rows the export already contains.
- **Accessibility:** the dialog is `components/ui/dialog.tsx` with labelled
  fields; the sign is written ("Add", "Remove", "+500", "−500"), not only
  coloured.
- **i18n:** admin strings and the reason labels in `coin-adjustments`; the
  member's notification and statement row label are keys there too;
  numbers via `Intl.NumberFormat`.
- **Steel:** the history is rows on rules with `t-meta` amounts; Apply is the
  dialog's one ink primary.

## Data model and API

- New model in `prisma/schema/economy.prisma`: `CoinAdjustment { id String @id
  @default(cuid()), userId String, adminId String?, delta Int, reason String
  @db.VarChar(24), note String? @db.VarChar(280), transactionId String
  @unique, reversesId String? @unique, reversedById String? @unique,
  createdAt DateTime @default(now()) }`, relations to the member (Cascade)
  and the admin (SetNull), `@@index([userId, createdAt(sort: Desc)])`,
  `@@map("coin_adjustment")`. Back-relations on `User` under `s04-06`.
  Migration `20261124010000_s04_coin_adjustments`.
- `lib/economy/adjustments.ts` (pure: reasons, limits, sign, confirmation
  threshold), `lib/economy/adjustments-schema.ts`,
  `lib/economy/adjustments.contract.ts`,
  `lib/economy/adjustments.server.ts` (`adjustCoins`, `reverseAdjustment`,
  `listAdjustments`, `adjustmentErasureOps`).
- Modules `lib/admin/api/admin.users.$id.coins.server.ts` (`GET` balance,
  reconciliation and history; `POST` adjust) and
  `admin.users.$id.coins.$adjustmentId.reverse.server.ts` (`POST`).
- Remove `admin.users.$id.set-coins.server.ts`, `setAdminUserCoinsApi` and
  its tests; regenerate the route table.
- `lib/economy/statement.ts`: label `coin_adjustment` rows (no new category).
- `components/admin/CoinAdjustDialog.tsx`; `admin/users.tsx` uses it.

## Testing requirements

- Main suite `lib/economy/__tests__/coin-adjustments.test.ts` (fake db from
  `lib/economy/__tests__/fake-db.ts`): a credit and a debit each write one
  ADMIN ledger row and keep `reconcileUser` balanced; a debit below zero is
  refused and moves nothing; the same idempotency key applies once; a
  reversal applies once and a second is refused; a non-admin gets 403.
- Main suite `lib/account/__tests__/coin-adjustment-erasure.test.ts`.
- Product suite `lib/economy/__tests__/adjustments.product.test.ts`: limits,
  sign handling, confirmation threshold.

## Acceptance criteria

- [ ] Adding 500 coins with "goodwill" shows in the member's statement and
      notification, and the reconciliation line stays "matches".
- [ ] Reversing it removes the 500 once.
- [ ] The old set-coins endpoint is gone and nothing references it.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Bulk adjustments, automatic drift correction, adjusting gems or cards.
