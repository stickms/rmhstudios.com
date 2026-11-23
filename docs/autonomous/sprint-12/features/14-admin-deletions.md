# 14 — Account deletions, for admins

Surface: `/admin/deletions` (new): accounts waiting out their grace period, deletions that are overdue or failing, the
last 30 days' finished erasures, and an audited "Try again now". Wave 5. Namespace `admin-deletions`. Site tier
(Steel).

## User story

As an admin, I want to see which accounts are scheduled for deletion and when, and to notice when an erasure keeps
failing, so that a member's request to be deleted is honoured on time and a broken erasure is fixed before anyone has
to ask.

## Requirements elicitation

- **What exists (verified):**
  - A deletion request sets `User.deletionScheduledAt` (`scheduleDeletion` in `lib/account/deletion.server.ts`) and
    pauses the account (`pauseForDeletion` in `lib/account/deletion-hold.server.ts`: sessions, API keys, webhooks,
    RMHCode tokens, the calendar URL; the `DeletionHold` row records what it changed; 18 adds subscriptions). Signing
    back in cancels it (`cancelDeletion`, `restoreAfterCancel`).
  - `finalizeDueDeletions` (same file) runs from the jobs worker, anonymises each due account with `anonymizeAccount`,
    and on failure only `console.error`s and leaves `deletionScheduledAt` set for the next run. **Nobody can see a
    failure**: there is no record of attempts, and no admin page lists pending or overdue deletions.
  - Admin pages are `_site/admin/*` routes with a hub card in `app/routes/_site/admin/index.tsx` (sprint 10 cards under
    `{/* Sprint 10 admin tools */}`), admin endpoints use `auth: 'admin'`, and actions are audited with
    `recordAdminActionIn(tx, …)` (`lib/admin-audit.server.ts`).
- **Decisions:**
  - **Attempts are recorded:** a new table `AccountErasureAttempt` (no relation to `User`: the row outlives the person
    as a tombstone id, the way audit rows do) with `userId`, `startedAt`, `finishedAt`, `ok`, `errorName`
    `@db.VarChar(120)` (the error's class or Prisma code, never its message, which can carry data), `trigger`
    (`schedule | admin`). `finalizeDueDeletions` writes one per account per run. Rows older than 90 days are deleted by
    the same job.
  - **The page** (rows on rules, `t-meta` figures, Steel D10 default): **Waiting** — scheduled deletions, oldest due
    first: the member's id and handle (never e-mail), requested and due dates, what the hold paused (counts of keys,
    webhooks, subscriptions); **Overdue** — due more than 24 hours ago and not finished, with the last attempt's error
    name and the attempt count; **Finished** — the last 30 days' count per day.
  - **"Try again now":** on an overdue row only; runs `anonymizeAccount` for that one account with `trigger: 'admin'`,
    audited (`account.erasure.retry`) in the attempt's own transaction, behind a confirmation. A claim
    (`lockKey(tx, 'erasure:<userId>')`) keeps the job and the button from running the same erasure at once. Nothing on
    the page erases an account whose grace period has not ended; there is no "delete now".
  - **Who:** admins only (`auth: 'admin'`); the page is `admin` in `EXCLUDED_ROUTES`.

## Functional requirements

1. FR-1 Model `AccountErasureAttempt` in `prisma/schema/deletion.prisma` (migration
   `20261202050200_s12_admin_deletions`), `@@index([userId, startedAt])`, `@@index([startedAt])`.
2. FR-2 `lib/account/deletion.server.ts`: `finalizeDueDeletions` records attempts (start row, then `ok` or the error
   name) and takes the claim; the retention delete. The change stays outside `anonymizeAccount`'s transaction.
3. FR-3 `lib/admin/deletions.ts` (pure: row shapes, overdue rule), `deletions-schema.ts`, `deletions.contract.ts`,
   `deletions.server.ts` (`listDeletions`, `retryErasure`).
4. FR-4 Registered endpoints `lib/admin/api/admin.deletions.server.ts` (GET) and
   `admin.deletions.$userId.retry.server.ts` (POST), `auth: 'admin'`.
5. FR-5 UI: `components/admin/DeletionsAdmin.tsx` on `app/routes/_site/admin/deletions.tsx`; the hub card under the
   Wave 0 admin-hub anchor; the sitemap entry under its anchor.
6. FR-6 Refusal: `ERASURE_NOT_OVERDUE` ("This account is not overdue for deletion") for a retry on a row that is not.

## Non-functional requirements

- **Privacy:** no e-mail address, error message or stack on the page or in the response; the handle shown only while the
  account still has one.
- **Integrity:** one erasure at a time per account (the claim); an attempt row is written whether it succeeds or fails.
- **Accessibility:** tables with headers; names in `<bdi>`.

## Data model and API

`AccountErasureAttempt` (`@@map("account_erasure_attempt")`): `id BigInt @id @default(autoincrement())`, `userId
String`, `trigger String @db.VarChar(8)`, `startedAt DateTime @default(now())`, `finishedAt DateTime?`, `ok Boolean?`,
`errorName String? @db.VarChar(120)`. It has no `User` relation, so `lib/account/__tests__/erasure-coverage.test.ts`
(which classifies every model with a relation to `User`) does not list it; its 90-day retention is its erasure rule,
stated in the model's comment.

## Testing requirements

- Main suite `lib/account/__tests__/erasure-attempts.test.ts`: a failing `anonymizeAccount` records `ok: false` with the
  error's name and leaves the account scheduled; a success records `ok: true`; the claim stops a concurrent run; the
  90-day delete.
- Main suite `lib/admin/__tests__/admin-deletions.test.ts`: non-admins are refused; overdue rule; retry refused on a
  not-overdue account; retry audited; no e-mail in the response.
- Gates: route table, sitemap coverage, migration safety, design consistency, Steel flat, user-text direction.

## Acceptance criteria

- [ ] An account whose erasure throws shows on "Overdue" the next day with the error's name and two attempts.
- [ ] "Try again now" on it, after the cause is fixed, finishes the erasure and records the admin in the audit log.
- [ ] An account still in its grace period cannot be erased from the page.

## Out of scope

Deleting an account early, changing the grace period (an open owner decision), e-mailing the member.
