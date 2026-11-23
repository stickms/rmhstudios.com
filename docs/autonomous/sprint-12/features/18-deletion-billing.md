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
    refund, no proration: the decision taken by default, recorded in the README). The ids changed are recorded on the
    hold (`subscriptionIds`), so a subscription the member had already set to cancel is never resumed on restore.
  - **On restore (signing back in):** each recorded subscription that is still `cancelAtPeriodEnd` and not ended is
    resumed (`cancel_at_period_end: false`).
  - **At the erasure:** any subscription still active is cancelled immediately (`subscriptions.cancel`), so a
    subscription created during the grace period, or one Stripe could not update earlier, does not survive the account.
  - **Calls leave the transaction:** Stripe is called outside every database transaction, by a pg-boss job
    `account.billing-stop` (and `account.billing-resume`) queued after the pause commits, retried with backoff (5
    attempts); the erasure's immediate cancel is a pre-step before `anonymizeAccount`'s transaction (the Wave 0 pre-step
    anchor), and a failure there fails the attempt (the next run, or 14's "Try again now", retries) rather than erasing
    an account that is still billed.
  - **Unconfigured Stripe** (`sk_unconfigured`, local and test): the job logs and does nothing.
  - **The preview** gains `subscriptions: { plan, periodEnd }[]` and the panel's line in the member's locale.
  - **The webhooks keep the rows right:** Stripe's events update `Subscription` through the plugin as for any cancel.

## Functional requirements

1. FR-1 `lib/billing/stripe-client.server.ts`: the client construction moved out of `lib/auth.ts` (which imports it), so
   server code can call Stripe without importing auth.
2. FR-2 `lib/account/deletion-billing.server.ts`: `subscriptionsToStop(userId)`, `stopBilling(userId, ids)`,
   `resumeBilling(userId, ids)`, `cancelRemainingBilling(userId)` (each idempotent: Stripe's state is read first).
3. FR-3 `DeletionHold.subscriptionIds String[] @default([])` (migration `20261202020200_s12_deletion_billing`);
   `pauseForDeletion` records the ids and queues the stop job; `restoreAfterCancel` queues the resume job for the
   recorded ids; `planRestore` gains the subscription rule.
4. FR-4 Jobs `account.billing-stop` and `account.billing-resume` registered under the Wave 0 jobs anchor
   (`lib/account/deletion-billing-jobs.server.ts`).
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
  not-already-cancelling subscriptions and records them; restore resumes only recorded ones still cancelling; erasure
  cancels what remains and throws on a Stripe error; unconfigured Stripe is a no-op; the jobs are idempotent.
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
