# 18 — Remove a spam account's recent content in one step

Surface: a new admin page `/admin/sweeps`, a "Sweep content" action on the
admin user view and on sprint 07 13's batch lookup, and the jobs worker.
Wave 4. Namespace `admin-spam-sweep`.

## User story

As an admin facing an account that posted 300 links in an hour, I want to
preview and remove everything it posted in a time window — posts and replies
— in one audited action that I can undo, so that cleaning up a spam wave
takes a minute instead of 300 clicks, and a mistake is reversible.

## Requirements elicitation

- **What exists (verified):**
  - Every admin takedown goes through `moderateContent`
    (`lib/moderation/content.server.ts`: "so the owner always gets a notice
    with the reason, the audit log always gets a row"), one item at a time,
    with `remove` and `restore` (`RESTORABLE`), strikes and feature timeouts.
  - Posts (`RMHark`) and replies (`RMHarkComment`) are soft-deleted with
    `deletedAt`, `deletedBy` (`author` | `moderator` | `system`) and
    `deletedByAdmin` (`prisma/schema/social.prisma`); AutoMod removes with
    `deletedBy: 'moderator'` (`lib/communities/automod.server.ts`).
  - Report groups can be decided in bulk (`lib/admin/api/admin.reports.groups.decide.server.ts`,
    at most 50 targets), but only for reported items; sprint 06 06's secure
    account revokes sessions and keys, not content; sprint 07 13's batch
    lookup finds many accounts at once (`/admin/lookup`).
  - Sprint 07 15's durable bulk runner (`lib/bulk/bulk.server.ts`: lease,
    progress compare-and-set, reclaim cron) is the pattern for a long run.
- **Decisions:**
  - **A sweep** (`ModerationSweep`): subject member, admin, window (`from`,
    `to`, at most 30 days, default the last 24 hours), kinds (posts, replies;
    both by default), reason (required, 10–500 characters, shown to the
    member once), optional strike, status (`PREVIEW` → `RUNNING` → `DONE` |
    `FAILED` | `UNDONE`), counts, lease fields, `undoneAt`, `undoneById`.
  - **Preview first:** creating a sweep returns counts per kind and the ten
    newest items as text excerpts; nothing changes until the admin confirms
    (`useConfirm` naming the count).
  - **Run:** a work queue job (`moderation.sweep`) with the 15 lease pattern
    walks the window in batches of 100 by `(createdAt, id)`, and for each
    item not already deleted calls `moderateContent({ action: 'remove', …,
    sweep: { id } })` — **one** new option, typed so that the per-item notice
    and audit row can be suppressed only by naming a sweep (there is no bare
    `audit: false` any other caller could pass) — and records it in
    `ModerationSweepItem (sweepId, entityType, entityId, removedAt)`, where
    `removedAt` is the exact `deletedAt` the removal wrote. When the run
    finishes: **one** `SYSTEM` notice (`entityType` `moderation-sweep`) to
    the member with the reason and the
    count, and **one** audit row (`recordAdminActionIn`) for the sweep, plus
    the strike if chosen. A reclaim cron re-queues stalled sweeps.
  - **Undo:** restores exactly the swept items that are still in the state
    this sweep left them: `deletedBy: 'moderator'` **and** `deletedAt`
    equal to the item's `removedAt` (a later removal by another moderator
    writes a new `deletedAt`, so it is never undone by this sweep), through
    `moderateContent({ action: 'restore', …, sweep: { id } })`, in the same
    batched job; one audit row. Undo **withdraws the sweep's strike** when one
    was given (a reversal of a false positive should not leave the strike).
    There is no strike-withdraw function; the one existing way a strike stops
    counting is an overturned appeal, so undo sets the sweep strike's
    `appealStatus = OVERTURNED` and then lifts an auto-ban that no longer
    applies, exactly as `lib/admin/api/admin.appeals.$id.server.ts` does
    (extract that recount-and-lift into a shared helper in
    `lib/moderation/strikes.server.ts` and call it from both). The strike is
    issued with `entityType 'moderation-sweep'` and the sweep's id. Undo sends
    the member **one**
    notice ("{{count}} posts and replies were restored", `entityType`
    `moderation-sweep-undone`, a second label under the anchor) instead of
    a strike notice. Undo is refused when the subject's account
    has since been deleted (restoring would republish under "Deleted user").
  - **Limits:** at most **5 000** items per sweep (the preview says when the
    window holds more and refuses to start); one running sweep per subject
    (`lockKey(tx, 'sweep:<subjectId>')`). The subject's own account is not
    banned by the sweep (that stays the separate ban action, offered as a
    link beside it).
  - **False-positive safety.** An admin account cannot be a subject, nor can
    the acting admin sweep themselves. The preview shows, beside the counts,
    the account's age, its earlier strikes and how many of the items have
    replies or likes from other members; when the account is older than 90
    days the confirmation says so ("This account is 2 years old"). Nothing is
    hard-deleted: every item stays restorable for as long as the existing
    removal keeps it. At most **10 sweeps per admin per hour**
    (`rateLimit: { limit: 10, windowMs: 3_600_000, prefix: 'admin-sweep' }`
    on confirm), so a compromised admin session cannot empty the site in a
    minute.
  - **Rate of notices.** The member gets one notice per sweep run and one per
    undo, never one per item; two sweeps of the same member within an hour
    send the second notice only if the first was read (otherwise the first
    notice's count is updated through its `groupKey`).
  - **Page:** `/admin/sweeps` lists sweeps (rows on rules: subject, admin,
    window, counts, status, Undo), and the start form is a dialog opened from
    the user view and from each batch-lookup row.
  - Admin-only and audited throughout; `ModerationSweep` and its items are
    kept on purpose when either member is deleted (registry `keep`, rule 4,
    audit trail).

## Functional requirements

1. FR-1 Create (preview), confirm (run), undo, list.
2. FR-2 The durable job with lease and reclaim.
3. FR-3 `moderateContent`'s `sweep` option, absent by default (current
   behaviour unchanged).
4. FR-4 One notice and one audit row per sweep; optional strike.
5. FR-5 Entry points from the user view and the batch lookup; the admin hub
   link.

## Non-functional requirements

- **Correctness:** an item deleted by its author before or during the sweep
  is skipped and never restored by Undo; restores never resurrect an item a
  later moderator removed again (it would no longer be in this sweep's
  deleted state).
- **Performance:** batches use the existing `(userId, createdAt)` indexes on
  posts and replies; the feed SSE event is emitted per batch, not per item.
- **Security:** `auth: 'admin'`, `rateLimit: 'write'`; zod on every input.
- **Steel:** rows on rules (D10), the dialog is the overlay, one ink primary
  per view.
- **i18n:** `admin-spam-sweep`; the two notice labels (`moderation-sweep`,
  `moderation-sweep-undone`) in `feed`.

## Data model and API

- `ModerationSweep` and `ModerationSweepItem` in
  `prisma/schema/moderation.prisma` (`@@map("moderation_sweep")`,
  `@@map("moderation_sweep_item")`, `@@index([status, heartbeatAt])`,
  `@@index([subjectId, createdAt])`, item `@@id([sweepId, entityType,
  entityId])`), relations to `User` for subject and admin (back-relations
  under the auth anchor). Migration `20261128040300_s08_admin_spam_sweep`.
- `lib/admin/sweeps.ts` (pure: limits, window checks), `sweeps-schema.ts`,
  `sweeps.contract.ts`, `sweeps.server.ts`, `sweeps-jobs.server.ts`
  (`SWEEP_QUEUE`, `SWEEP_RECLAIM_QUEUE`, registrations); modules
  `lib/admin/api/admin.sweeps.server.ts` (GET, POST preview),
  `admin.sweeps.$id.server.ts` (POST confirm, POST undo).
- Page `app/routes/_site/admin/sweeps.tsx`; `components/admin/sweeps/*`.
- `ModerationSweepItem.removedAt DateTime` (the `deletedAt` the removal
  wrote; undo compares it).
- Edits: `lib/moderation/content.server.ts` (the `sweep` option), the admin user view,
  the batch lookup rows, admin hub and sitemap (anchors), notification
  labels (anchor), jobs (anchor). Registry: `ModerationSweep` → `keep` (rule 4, audit trail). `ModerationSweepItem` has no `User` relation, so it gets **no** entry (the coverage test fails an entry for a model without one).

## Testing requirements

- Main suite `lib/admin/__tests__/sweeps.test.ts`: admin only; preview changes
  nothing; cap and one-running lock; run removes only undeleted items in the
  window; one notice and one audit row; undo restores only this sweep's
  still-deleted items; lease lost stops; reclaim.
- Main suite `lib/moderation/__tests__/moderate-content-options.test.ts`:
  defaults unchanged; with `sweep` the per-item notice and audit row are
  skipped and nothing else changes.
- In `sweeps.test.ts` also: an admin subject is refused; undo skips an item a
  later moderator removed again (different `deletedAt`); undo withdraws the
  strike and sends one notice; undo after the subject's deletion is refused;
  the eleventh confirm in an hour is refused.
- Product suite `lib/admin/__tests__/sweeps.product.test.ts`.
- Existing: `lib/moderation/__tests__/*`, notification labels, erasure
  coverage (one `keep` entry).

## Acceptance criteria

- [ ] An admin previews "312 posts, 40 replies in the last 24 hours", confirms,
      and the account's content disappears from feeds; the member gets one
      notice.
- [ ] Undo brings the 352 items back except a reply the member had deleted
      themselves.
- [ ] Restarting the worker mid-run finishes the sweep without double counts.
- [ ] Every step is in `/admin/audit`.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Sweeping messages, communities, builds or media; automatic sweeps from
AutoMod; banning as part of the sweep.
