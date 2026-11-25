# 18 — A billing stop that cannot lose a subscription

Surface: none new for members (the deletion request, its withdrawal and the erasure behave as sprint 12 18 described);
`/admin/deletions` (each pending row's billing state). Wave 7. Namespace: none (admin strings in `admin-deletions`).
Hardening (site tier for the admin column).

## User story

As a member who asked to delete their account and then changed my mind, I want my membership to resume exactly as it
was, and as a member who went through with it, I want no subscription left billing — even if the server crashed in the
middle of stopping it, I have more than a hundred subscription records, or the job queue was down when I asked.

## Requirements elicitation

- **What exists (verified):** sprint 12 18's reconcile, `lib/account/deletion-billing.server.ts`: `syncBilling`,
  `stopBilling` (sets `cancel_at_period_end` on each live subscription and records on `DeletionHold.subscriptionIds`
  only the ids its own call flipped), `resumeBilling`, `cancelRemainingBilling` (the erasure's pre-step);
  `candidateSubscriptions` lists Stripe's subscriptions for the customer and retrieves the `Subscription` rows' ids;
  the queue `lib/account/deletion-billing-queue.server.ts` (`enqueueBillingSync`), the worker
  `lib/account/deletion-billing-jobs.server.ts` registered under sprint 12's anchor in `server/jobs/index.ts`;
  `DeletionHold` in `prisma/schema/deletion.prisma`; the admin page `components/admin/DeletionsAdmin.tsx` over
  `lib/admin/deletions.server.ts`. Sprint 12's summary recorded three follow-ups, each confirmed in the code:
  - **(a) A crash between Stripe's `update` and the hold write leaves a subscription unrecorded**: `stopBilling` flips
    every subscription, then records them in one transaction afterwards; if the process dies between, a later resume
    does not know it changed them, and the membership ends at the period's end though the member withdrew.
  - **(b) `subscriptions.list` is not paginated past 100**: `candidateSubscriptions` calls
    `list({ customer, status: 'all', limit: 100 })` once and never reads `has_more`.
  - **(c) `enqueueBillingSync` swallows queue errors**: it logs and returns `false` ("the next deletion request or
    sign-in queues it again"); a member who asks once and never signs in again is never stopped, and a withdrawn
    request may never resume.
  - **(a′) Found in validation: the crash case never reaches a resume today.** When `stopBilling` dies before its
    hold write, `DeletionHold.subscriptionIds` stays empty, so `restoreAfterCancel`
    (`lib/account/deletion-hold.server.ts`) deletes the hold (`subscriptionIds: { isEmpty: true }`) and queues nothing
    (`plan.keepHold` is false), and `syncBilling`'s unscheduled branch returns `'skipped'` for an empty id list. A
    marker alone would therefore never be read. The fix below changes both.
- **Decisions:**
  - **(a) A marker on Stripe, written in the same call that flips:** the stop's one `update` call is
    `{ cancel_at_period_end: true, metadata: { rmh_deletion_stop: '<hold createdAt ms>' } }`, so Stripe holds the flip
    and the marker together or neither. The resume's one `update` call is
    `{ cancel_at_period_end: false, metadata: { rmh_deletion_stop: '' } }` (an empty value deletes a Stripe metadata
    key), so the flip back and the marker's removal are also one call. A resume acts on the union of the hold's
    recorded ids and every candidate subscription (`candidateSubscriptions`) that carries the marker, is live and is
    still set to cancel at the period's end; a subscription the member set to cancel themselves carries no marker and
    is never resumed. The stop never `cancel`s anything (only the erasure pre-step does, unchanged).
  - **(a′) Restore always reconciles:** `restoreAfterCancel` no longer deletes the hold; it clears `keyIds` and
    `webhookIds`, sets `billingSyncedAt` to null and always queues `syncBilling`. `syncBilling`'s unscheduled branch
    no longer skips on an empty id list: it lists candidates (only when the member has a `stripeCustomerId` or a
    `Subscription` row; otherwise there is nothing to resume and no Stripe call), resumes marked and recorded ones, and
    then deletes the hold (the hold's only remaining purpose was billing).
  - **(b) Pagination:** `candidateSubscriptions` pages with `starting_after` (the last id of the page) until
    `has_more` is false, at most 10 pages (1,000); past that it throws, so the job retries and the erasure refuses to
    finish (the safe side), and logs the count only.
  - **(c) A done-stamp and a sweep.** `DeletionHold.billingSyncedAt` is a **done-stamp only**: set to null in the same
    transaction that writes the hold for a deletion request (`pauseForDeletion`'s upsert, both `create` and `update`)
    and for a withdrawal (`restoreAfterCancel`), and set to `now()` by `syncBilling` only when it finishes with
    nothing left to do for the member's **current** choice (not on `'requeued'`, not when a Stripe call failed;
    `'unconfigured'` and "no Stripe customer and no `Subscription` row" stamp, because nothing will ever be left to do).
    A new hourly job `account.billing-reconcile` (minute 23) queues `syncBilling` for at most 500 holds with
    `billingSyncedAt` null, oldest `createdAt` first, skipping erased accounts. It writes nothing itself: duplicates are prevented by the queue, whose `short` policy and
    `singletonKey: billing-sync:<userId>` (`billingSyncSendOptions`) keep one waiting job per member, so two sweeps
    racing queue each member once (a duplicate that meets a job already running is harmless: `syncBilling` is
    idempotent). A member whose Stripe keeps failing is retried each hour (five attempts each, as
    today) until it succeeds; the sweep's log carries the count queued only. The sweep never decides stop or resume:
    `syncBilling` reads the member's state when it runs, as today.
  - **Admin column:** `/admin/deletions` shows "Billing: stopped / not stopped yet / nothing to stop" from the hold
    (`billingSyncedAt` set and ids recorded / `billingSyncedAt` null / set and no ids; no subscription ids shown, no
    Stripe call).
  - Stripe stays outside every transaction and is faked in every test; with Stripe unconfigured every step remains a
    no-op.

## Functional requirements

1. FR-1 Migration `20261220070100_s13_billing_hardening`: `ALTER TABLE "deletion_hold" ADD COLUMN "billingSyncedAt"
   TIMESTAMP(3)`.
2. FR-2 `deletion-billing.server.ts`: the `BillingStripe` interface gains `metadata` on `update` and on
   `BillingSubscription`, and `has_more` / `starting_after` on `list`; `stopBilling` sets the marker in its one update;
   `resumeBilling` acts on recorded and marked candidates and clears the marker in its one update; `candidateSubscriptions`
   pages; `syncBilling`'s unscheduled branch no longer skips on an empty id list and deletes the hold when done;
   `syncBilling` stamps `billingSyncedAt` as decided.
3. FR-3 `lib/account/deletion-hold.server.ts`: `pauseForDeletion`'s hold upsert sets `billingSyncedAt: null`;
   `restoreAfterCancel` keeps the hold (clearing keys and webhooks), sets `billingSyncedAt: null` and always queues the
   sync.
4. FR-4 `lib/account/deletion-billing-reconcile.server.ts` (new): the sweep's query (no writes); registered under
   `// s13-18 billing-hardening` in `server/jobs/index.ts` (hourly at minute 23).
5. FR-5 `lib/admin/deletions.server.ts` and `DeletionsAdmin.tsx`: the billing column.

## Non-functional requirements

- **Money:** a test crashes `stopBilling` after the Stripe updates and before the hold write, then withdraws the
  request through `restoreAfterCancel` and runs the queued sync: the resume restores every flipped subscription and
  clears its marker. No path resumes a subscription the member cancelled (no marker), and no path in this feature calls
  `subscriptions.cancel` (only the unchanged erasure pre-step does). The sweep, run for a member with no pending
  deletion, can only lead to a resume; run for a member with one, only to a cancel-at-period-end.
- **Load:** the sweep reads `deletion_hold` (one row per member with a request or a resume in flight; a small table)
  and queues at most 500 jobs an hour; no index is added.
- **Logs:** counts and step names only; never an id or a key.

## Data model and API

`DeletionHold.billingSyncedAt DateTime?`. Stripe subscription metadata key `rmh_deletion_stop`. No endpoint.

## Testing requirements

- Main suite `lib/account/__tests__/deletion-billing.test.ts` (extended, Stripe faked): the stop's single update carries
  the flip and the marker; a resume restores a marked but unrecorded subscription and clears its marker in the same
  call; a self-cancelled one is left alone; an empty hold still resumes marked subscriptions; 250 subscriptions page
  through three lists with `starting_after`; more than 1,000 throws; `billingSyncedAt` is stamped on success and not
  on a failure or a requeue; no call to `cancel` from stop, resume or sync.
- Main suite `lib/account/__tests__/deletion-restore.test.ts` (extended; it uses `deletion-hold-fake-db.ts`): `restoreAfterCancel`
  keeps the hold, nulls `billingSyncedAt` and queues the sync even with no recorded ids; a request nulls it.
- Main suite `lib/account/__tests__/deletion-billing-reconcile.test.ts`: the sweep picks holds with a null stamp, oldest first,
  skips a stamped one and an erased member; caps at 500; passes `billingSyncSendOptions(userId)` (the singleton key) so two sweeps cannot queue one member twice; writes nothing.
- `lib/admin/__tests__/admin-deletions.test.ts` (the column), the jobs index test.

## Acceptance criteria

- [ ] A withdrawn request resumes a membership even when the stop crashed before recording it.
- [ ] A member with more than 100 subscription records has all of them stopped.
- [ ] A request made while the queue was down is stopped within the hour, and a withdrawal made while it was down is
      resumed within the hour.
- [ ] `/admin/deletions` says whether each pending account's billing has stopped.

## Out of scope

Refunds and proration (the open owner decision; sprint 12's default stands), Stripe webhooks for subscription state.
