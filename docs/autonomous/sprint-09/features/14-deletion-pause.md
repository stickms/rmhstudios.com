# 14 — A deletion request stops everything at once

Surface: `POST /api/account/delete` (`lib/account/api/account.delete.server.ts`), `scheduleDeletion` / `cancelDeletion`
(`lib/account/deletion.server.ts`), the deletion dialog, the developer keys and webhooks pages, the scheduled publisher.
Wave 5. Namespace `deletion-pause`.

## User story

As a member who asks for my account to be deleted, I want everything that acts on my behalf to stop the moment I press
the button — my other devices, my API keys, my webhooks, my scheduled posts — and to come back exactly as it was if I
change my mind and sign in again within the 30 days.

## Requirements elicitation

- **What exists (verified):**
  - The deletion is scheduled 30 days out (`scheduleDeletion`, B12) and cancelled by signing back in (`cancelDeletion`,
    called from Better Auth's session-create hook in `lib/auth.ts`). The module's comment says "the caller still tears
    down credentials and hides the account"; the route deletes résumé files and the pronunciation clip and sends a
    notice, and tears down nothing else.
  - Owner follow-up (sprint 02 era, still open): "`scheduleDeletion` doesn't sign out or pause keys/webhooks during the
    30-day window".
  - The tools exist: sprint 06 06's `secureAccount` (`lib/admin/secure-account.server.ts`: sign out everywhere — which
    also drops web-push subscriptions —, revoke API keys and RMHCode tokens, disable webhooks behind fresh secrets,
    rotate the calendar feed); sprint 08 08's key suspension (`DeveloperApiKey.suspendedAt`, `suspendReason`, refused
    with `key_suspended`); `WebhookEndpoint.enabled`.
  - Scheduled posts publish from the job even if the author never returns (`lib/scheduled/publish.server.ts`); recurring
    threads (s08-09) are community templates the member authored.
- **Decisions:**
  - **What stops at the request** (one transaction where the writes allow, then the notice):
    - every session of the account is deleted, the current one included (the response tells the client to sign out
      locally) — with them the push subscriptions, as `secureAccount` does;
    - every active API key not already suspended or revoked is suspended with the reason constant `DELETION_REQUESTED`
      ("Account deletion requested"); the owner of a third-party app sees `key_suspended`, with no reason, as sprint 08
      decided;
    - every enabled webhook endpoint is disabled (secrets unchanged);
    - RMHCode tokens are revoked (they are re-issued by signing in to the CLI; not restored);
    - the calendar feed token is rotated (not restored: the old URL may have been shared);
    - the member's queued bulk operations are cancelled through `cancelBulkOperation`;
    - scheduled posts and recurring templates the member authored are held: `publishScheduledPost` returns early (draft
      kept) while the author's deletion is scheduled, and the recurring cron skips a template whose author's deletion is
      scheduled (the community sees no thread that week).
  - **A record of what was paused.** New `DeletionHold (userId @id, keyIds String[], webhookIds String[], createdAt)`:
    only what **this** request changed, so cancel never lifts an admin's suspension or re-enables a webhook the member
    had turned off.
  - **What cancel restores** (under the `cancelDeletion` anchor, after the conditional update succeeds): keys in
    `keyIds` that are still suspended with `DELETION_REQUESTED` are unsuspended; webhooks in `webhookIds` that are still
    disabled are re-enabled with `failureCount` reset; the hold is deleted; scheduled posts that came due during the
    hold stay drafts and the member gets one `SYSTEM` notice "N scheduled posts were not published while your account
    was set to be deleted" linking to `/drafts` (19 renders its text in the reader's language in wave 7; here it uses
    the label path: `entityType` `deletion-drafts-waited`, label under the `s09-14` anchor in
    `components/feed/notification-labels.ts` and its test). Sessions, tokens and the calendar URL are not restored. The
    keys and webhooks pages need no new state: a restored key or webhook simply reads as active again.
  - **The dialog** lists, before the confirm, what will stop: "You will be signed out everywhere. Your 2 API keys and 1
    webhook will stop until you sign back in. Your 3 scheduled posts will wait." (counts from a preview endpoint). One
    ink primary ("Delete my account") stays the only one.
  - **The visibility of the account during the grace period** is not changed (an open owner decision; README).
  - **Erasure:** `DeletionHold` is erased at anonymisation (`erase`, under the `s09-14` anchor); not exported.

## Functional requirements

1. FR-1 `DeletionHold`, its migration, back-relation (anchor) and registry entry.
2. FR-2 `pauseForDeletion(userId)` called by the delete route before `scheduleDeletion` returns, recording the hold;
   reuse `secureAccount`'s steps for sessions, tokens and the calendar: extract each into an exported function in
   `lib/admin/secure-account.server.ts` (its behaviour, audit and tests unchanged) and call it — never copy it.
3. FR-3 `restoreAfterCancel(userId)` under the `cancelDeletion` anchor.
4. FR-4 The early return in `publishScheduledPost` and the recurring skip.
5. FR-5 `GET /api/account/delete/preview` (counts) and the dialog's list.
6. FR-6 The developer docs' `errors.md` notes that a key is suspended when its owner requests deletion; changelog bullet
   (anchor).

## Non-functional requirements

- **Correctness:** the hold is written in the same transaction as the key and webhook changes; cancel restores only ids
  in the hold whose current state is still the one the hold set; a second deletion request while one is pending does
  nothing new (scheduling is already idempotent).
- **Security:** a failure in any pause step fails the request with 500 before `scheduleDeletion` (a deletion that leaves
  keys live is worse than none); storage deletions already done (résumés, clip) are not undone.
- **Privacy:** nothing new is stored beyond ids.

## Data model and API

- `DeletionHold` in new `prisma/schema/deletion.prisma` (`@@map("deletion_hold")`); migration
  `20261129050200_s09_deletion_pause`.
- New `lib/account/deletion-hold.server.ts`, `lib/account/deletion-hold.ts` (pure: what to restore from current states),
  `lib/account/api/account.delete.preview.server.ts` + contract. Edits: `lib/account/api/account.delete.server.ts`,
  `lib/admin/secure-account.server.ts` (exported steps only), `lib/account/deletion.server.ts` (two anchors),
  `lib/scheduled/publish.server.ts`, `lib/communities/recurring.server.ts` (or its job),
  `components/site/DeleteAccountPanel.tsx` (the deletion dialog), `components/feed/notification-labels.ts` and its test
  (anchor), `lib/account/erasure-registry.ts`, `docs/account-deletion.md`, `docs/developer-api/errors.md`,
  `docs/developer-api/changelog.md`.

## Testing requirements

- Main suite `lib/account/__tests__/deletion-pause.test.ts` (mock Prisma): the request deletes sessions, suspends active
  keys only, disables enabled webhooks only, records exactly those ids, cancels queued bulk operations; a failing step
  stops the schedule.
- Main suite `lib/account/__tests__/deletion-restore.test.ts`: cancel restores the held keys and webhooks, leaves an
  admin-suspended key suspended and a webhook the member disabled earlier disabled, deletes the hold, sends one notice
  when drafts came due.
- Main suite: `publishScheduledPost` keeps a draft while the author's deletion is scheduled; the recurring job skips the
  template.
- `lib/account/__tests__/erasure-coverage.test.ts`, `lib/__tests__/migration-safety.test.ts`.

## Acceptance criteria

- [ ] After a deletion request, the member's phone is signed out, their API key answers `key_suspended`, and their
      webhook receives nothing.
- [ ] A post scheduled for the next day does not go out.
- [ ] Signing back in on day 3 restores the key and the webhook; a key an admin had suspended stays suspended; the
      member is told the scheduled post waited.

## Out of scope

Hiding the account during the grace period (owner decision), cancelling a paid membership (Stripe), changing the 30
days, an e-mail link to cancel.
