# 18 — A deletion request ends the membership too

Surface: the delete-account panel's preview ("Your Pro membership ends on 14 December; you will not be charged again"),
the deletion pause and restore, the erasure. Wave 2. Namespace `deletion-billing`. Site tier (Steel). Hardening
(follow-up).

## User story

As a member who asks for my account to be deleted, I want my paid membership to stop renewing at the same moment, and
to start renewing again only if I come back, so that I am never charged for an account I asked to delete.

## Requirements elicitation

- **What exists (verified):**
  - Memberships are Stripe subscriptions through Better Auth's plugin (`lib/auth.ts`: `stripe({ stripeClient, …,
    subscription: { plans: starter, pro } })`, the client `new Stripe(process.env.STRIPE_SECRET_KEY ||
    'sk_unconfigured')`, not exported). Their rows are `Subscription` (`prisma/schema/economy.prisma`: `referenceId` the
    member's id, `stripeSubscriptionId`, `status`, `periodEnd`, `cancelAtPeriodEnd`, `cancelAt`, `canceledAt`), written
    by the plugin's webhooks.
  - A deletion request pauses the account (`pauseForDeletion` in `lib/account/deletion-hold.server.ts`: sessions, API
    keys, webhooks, RMHCode tokens, the calendar URL) and records what it changed in `DeletionHold`
    (`prisma/schema/deletion.prisma`: `keyIds`, `webhookIds`); signing back in restores exactly that
    (`restoreAfterCancel`, `planRestore` in `lib/account/deletion-hold.ts`). The preview the panel shows is
    `previewDeletionPause` (`DeletionPausePreview`: `apiKeys`, `webhooks`, `scheduledPosts`) through
    `lib/account/api/account.delete.preview.server.ts` and `components/site/DeleteAccountPanel.tsx`.
  - **Nothing touches Stripe.** The erasure keeps billing rows for accounting (`lib/account/deletion.server.ts`: "Stripe
    billing rows stay for accounting"), and no step cancels a subscription, so a member who requests deletion keeps
    being charged through the grace period and after the erasure (the follow-up list: "Stripe subscription not
    cancelled at erasure").
- **Decisions:**
  - **At the request:** every subscription of the member with `status` in `active | trialing | past_due` and
    `cancelAtPeriodEnd` not already true is set to cancel at the period's end in Stripe
    (`subscriptions.update(id, { cancel_at_period_end: true })`). The member keeps what they paid for until then (no
    refund, no proration: the decision taken by default, recorded in the README). Only ids **this request changed**
    are recorded on the hold (`subscriptionIds`): the job reads each subscription from Stripe (never trusting the
    webhook-written row, which can lag) and records it only after its own `update` call flipped
    `cancel_at_period_end` from false to true, so a subscription the member had already set to cancel is never resumed.
  - **On restore (signing back in):** each recorded subscription that Stripe still shows `cancel_at_period_end: true`
    and not ended is resumed (`cancel_at_period_end: false`); one the member cancelled themselves since (Stripe shows
    `canceled`, or `cancel_at` set by the portal) is left alone.
  - **At the erasure:** any subscription still active is cancelled immediately (`subscriptions.cancel(id,
    { prorate: false, invoice_now: false })`: no refund, no final invoice), listed from Stripe by the member's
    `stripeCustomerId` as well as from `Subscription.referenceId` rows, so a
    subscription created during the grace period, or one Stripe could not update earlier, does not survive the account.
  - **One reconciling job, never two opposite commands.** A withdrawn request is the dangerous case: with a separate
    "stop" and "resume" job, a stop still retrying after the member signed back in (or a resume that runs before the
    stop) would leave a returning member's membership set to end, or resume one for an account being deleted. So there
    is one job, `account.billing-sync`, payload `{ userId }` only, sent with `singletonKey: userId` (one queued per
    member), retried with backoff (5 attempts). It decides from the database **when it runs**, not from what queued it:
    if `User.deletionScheduledAt` is set, it stops (above) and appends the ids it changed to the hold under
    `lockKey(tx, 'deletion-hold:<userId>')`; if not, it resumes the hold's `subscriptionIds` and only then deletes the
    hold. After its Stripe calls it re-reads `deletionScheduledAt`; if the state flipped while it was calling, it
    queues itself again, so the last word is always the member's latest choice. `pauseForDeletion` and
    `restoreAfterCancel` only queue the job after their own transactions commit.
  - **The hold outlives the restore while billing is pending:** `restoreAfterCancel` today deletes the
    `DeletionHold` row in its transaction; it now deletes it only when `subscriptionIds` is empty, and otherwise clears
    `keyIds` and `webhookIds` (already restored) and leaves the row for the sync job, which deletes it after resuming.
    A second deletion request before that finds the row and merges into it (`mergeIds`, as for keys).
  - **Calls leave the transaction:** Stripe is called outside every database transaction (from the sync job and the
    erasure pre-step only); the erasure's immediate cancel is a pre-step before `anonymizeAccount`'s transaction (the Wave 0 pre-step
    anchor), and a failure there fails the attempt (the next run, or 14's "Try again now", retries) rather than erasing
    an account that is still billed.
  - **Unconfigured Stripe** (`sk_unconfigured`, local and test): the job logs and does nothing.
  - **Tests never reach Stripe.** Every test injects a fake client through `lib/billing/stripe-client.server.ts`'s
    getter (`vi.mock`), and the getter throws when `process.env.VITEST` is set and the key is not `sk_unconfigured` or
    `sk_test_…`, so a test run with production secrets in its environment fails instead of calling live Stripe.
  - **The preview** gains `subscriptions: { plan, periodEnd }[]` and the panel's line in the member's locale.
  - **The webhooks keep the rows right:** Stripe's events update `Subscription` through the plugin as for any cancel.

## Functional requirements

1. FR-1 `lib/billing/stripe-client.server.ts`: the client construction moved out of `lib/auth.ts` (which imports it), so
   server code can call Stripe without importing auth.
2. FR-2 `lib/account/deletion-billing.server.ts`: `syncBilling(userId)` (the reconcile above, built on
   `stopBilling(userId)` and `resumeBilling(userId, ids)`, each idempotent because Stripe's state is read first) and
   `cancelRemainingBilling(userId)`; the Stripe client is a parameter (or the module getter) so tests pass a fake.
3. FR-3 `DeletionHold.subscriptionIds String[] @default([])` (migration `20261202020200_s12_deletion_billing`);
   `pauseForDeletion` and `restoreAfterCancel` queue the sync job after their transactions commit; `restoreAfterCancel`
   keeps the hold while `subscriptionIds` is non-empty; `planRestore` gains the subscription rule.
4. FR-4 Job `account.billing-sync` (`singletonKey` per member, 5 retries with backoff) registered under the Wave 0 jobs
   anchor (`lib/account/deletion-billing-jobs.server.ts`); the web tier sends it through `getBoss()`.
5. FR-5 `anonymizeAccount`'s pre-step under the anchor `// s12-18 deletion-billing (billing stop before the
   transaction)`: `cancelRemainingBilling`, throwing on a Stripe error so the account stays scheduled.
6. FR-6 Preview and panel: `DeletionPausePreview.subscriptions`, the panel's line through `deletion-billing` keys.

## Non-functional requirements

- **Money:** no path charges a member after their erasure; a restore resumes only what the request paused.
- **Reliability:** Stripe outages delay, never drop, a stop (retries) and block the erasure until it succeeds.
- **Secrets:** no Stripe key or id in logs or responses beyond the plan name and date.

## Data model and API

`DeletionHold.subscriptionIds String[] @default([])`. `GET /api/account/delete/preview` gains `subscriptions`.

## Testing requirements

- Main suite `lib/account/__tests__/deletion-billing.test.ts` (Stripe faked): the request stops only active,
  not-already-cancelling subscriptions (as Stripe reports them, with a stale DB row in the fixture) and records only
  those it changed; restore resumes only recorded ones still cancelling; **a request withdrawn before the job runs
  changes nothing in Stripe; one withdrawn while the job's stop call is in flight ends resumed; a stop retry after the
  withdrawal does nothing; a second request before the resume ran keeps the subscription cancelling**; erasure cancels
  what remains with `prorate: false` and throws on a Stripe error; unconfigured Stripe is a no-op; the fake's call log
  shows no call when nothing needs changing; the client getter throws on a live key under vitest.
- Existing tests that must stay green: `lib/account/__tests__/` deletion-hold and erasure tests (the pre-step is a
  read-then-call, guarded for the recording Proxy: `Array.isArray(rows) ? rows : []`).
- Gates: migration safety, jobs registrations, erasure coverage.

## Acceptance criteria

- [ ] A Pro member requests deletion; Stripe shows the subscription set to cancel at the period's end; the panel said
      so.
- [ ] Signing back in resumes it; a subscription the member had already cancelled stays cancelled.
- [ ] At erasure, a subscription started during the grace period is cancelled; with Stripe failing, the account stays
      scheduled and is retried.

## Out of scope

Refunds, coin balances and scheduled coin gifts (the economy's own rules), creator memberships paid in coins.
