# 15 — Bulk clean-ups that finish, and two more of them

Surface: the bulk clean-up panel on `/trash`
(`components/trash/BulkCleanupPanel.tsx`), the `jobs` worker. Wave 6.
Namespace `bulk-durable`.

## User story

As a member clearing out five thousand old posts, I want the clean-up to finish
even if the site restarts halfway, and to see honestly how far it got, so that
I am not left with an operation stuck at "Running 41 %" forever.

As a member tidying my history, I also want to remove my old likes and my old
reposts in bulk, so that what I endorsed years ago does not follow me.

## Requirements elicitation

- **What exists (verified):**
  - Bulk operations (plan I2): `BulkOperation` (`prisma/schema/developer.prisma`:
    `kind`, `filter`, `status` PENDING/RUNNING/DONE/CANCELLED/FAILED, `total`,
    `processed`), `lib/bulk/bulk.server.ts` (`previewBulk`,
    `createBulkOperation`, `startBulkOperation`, `runBulkOperation`,
    `cancelBulkOperation`), kinds in `lib/bulk/types.ts` (`delete-posts`,
    `delete-comments`, `unfollow`, `clear-history`, `clear-bookmarks`), the
    endpoints `lib/bulk/api/bulk.server.ts`, `bulk.$id.server.ts`,
    `bulk.preview.server.ts`, and the panel `BulkCleanupPanel.tsx`.
  - **The run is not durable.** `startBulkOperation` "detaches the run from the
    request … It is not a durable queue: a deploy mid-run leaves the row
    `RUNNING`, and `reclaimStalledOperations` is the seam a pg-boss job in
    `lib/jobs/` should call"; `reclaimStalledOperations` says "Nothing calls
    this yet". Blue/green deploys (`deploy.sh`) restart the web tier on every
    push to `main`.
  - `runBulkOperation` claims rows with status PENDING **or RUNNING**, so two
    runners (a reclaim and a still-alive original) could process one operation
    at once; its keyset cursor (`afterId`) lives only in memory.
  - Deletes route through `softDeletePostAsAuthor` /
    `softDeleteCommentAsAuthor` (undoable from the bin). There is no bulk
    unlike or repost removal.
  - The jobs worker (`server/jobs/index.ts`, `REGISTRATIONS`) and
    `getBoss()` (`lib/jobs/boss.server.ts`) are the durable backbone; the web
    tier is send-only, and when the queue is unavailable work runs inline
    ("this process is an optimisation, never a correctness dependency").
  - `reclaimStalledOperations` (`bulk.server.ts:458`) selects RUNNING rows by
    **`createdAt`** older than `STALLED_AFTER_MS` (10 min), so a healthy run
    that has been going for eleven minutes looks stalled; the lease below
    replaces that test with `heartbeatAt`.
  - The single unlike (`lib/social/engagement.server.ts` ~l.136-160) deletes
    the like and decrements `likeCount` in one `$transaction`, publishes
    `rmhark.unliked` on the in-process `feedEventBus` and removes the LIKE
    notification.
  - `BulkOperation` rows are not erased on account deletion.
- **Decisions:**
  - **Runs go through a pg-boss queue** `bulk.run` (singleton per operation id),
    worked in the `jobs` worker; when `getBoss()` returns null the web tier
    falls back to today's detached run.
  - **A lease, not a status, decides who runs.** New columns `heartbeatAt` and
    `cursorId`. A runner claims with a conditional update: status PENDING, or
    RUNNING with `heartbeatAt` older than 2 minutes; it writes `heartbeatAt =
    now` with every chunk's progress update and persists `cursorId` (the last
    processed id), and stops if its update finds the lease taken (a
    compare-and-set on `heartbeatAt`). Resuming continues after `cursorId`.
  - **Reclaim** runs every minute in the `jobs` worker:
    `reclaimStalledOperations` finds RUNNING rows whose lease expired and
    enqueues them again; an operation reclaimed 5 times is marked FAILED with
    "Stopped after repeated restarts" so it never loops forever.
  - **Two new kinds** with the same preview → confirm → run → cancel flow:
    `unlike-posts` (remove the member's likes on posts, filtered by
    `olderThanDays` / `before`; the like counter on each post is decremented
    in the same statement as the unlike, as the single unlike path does — reuse
    it) and `delete-reposts` (remove the member's reposts, same filters). Both
    are **not** undoable (there is no bin for likes and reposts); the panel
    says so in the confirm.
  - **Each chunk is one transaction and idempotent:** it deletes the chunk's
    like (or repost) rows by id **and the member's `userId`**, and decrements
    each post's counter by the number of that post's rows the delete actually
    removed (grouped from the rows read at the chunk's start, re-checked in
    the transaction), then advances `cursorId` in the same transaction. A
    chunk re-run after a crash finds its rows gone and changes nothing. The
    LIKE notifications those likes created are removed with one `deleteMany`
    per chunk (actor = the member, type LIKE, entity in the chunk's posts),
    matching the single path. No per-post `feedEventBus` event is published
    from the worker (it is a different process; counts refresh on next read).
  - The panel shows each operation's progress as "{{processed}} of {{total}}",
    a "Resuming after a restart" line when a reclaim picked it up
    (`reclaims > 0`), and refreshes through React Query polling every 3 s
    **only while an operation of the viewer's is RUNNING** (no polling at
    rest, R5/B3).
  - Account deletion erases the member's `BulkOperation` rows.

## Functional requirements

1. FR-1 The `bulk.run` queue and worker registration under the jobs anchor; the
   POST route enqueues instead of detaching (fallback inline).
2. FR-2 Lease-based claim, heartbeat, persisted cursor and resume in
   `runBulkOperation`.
3. FR-3 The reclaim cron with the 5-reclaim ceiling.
4. FR-4 The `unlike-posts` and `delete-reposts` kinds in `BULK_KINDS`, the
   filter mapping in `lib/bulk/types.ts`, preview sample rows, and the panel's
   options.
5. FR-5 Panel progress, resume line, and polling only while running.
6. FR-6 Erasure of the member's operations.

## Non-functional requirements

- **Deploy safety:** the queue payload is only the operation id; everything
  else (kind, filter, cursor) is read from the row, so a job enqueued by the
  old build is run correctly by the new one, and a run started before this
  feature ships (a RUNNING row with `heartbeatAt` null; the model has no
  `updatedAt`) is reclaimable by today's rule, `createdAt` older than
  `STALLED_AFTER_MS`, and resumes from its `processed` position by the
  existing idempotent resume (highest id already processed).
- **Correctness:** at most one runner advances an operation (test with two
  concurrent runners: the second stops at its first heartbeat); a resumed run
  processes no row twice and skips none (keyset after `cursorId`); cancel is
  still observed within one chunk.
- **Counters:** unlike keeps `likeCount` consistent with `RMHarkLike` rows;
  repost removal keeps `repostCount` consistent (reuse the single-item paths'
  statements, in the chunk's transaction).
- **Jobs:** the worker registration has a retry policy matching other queues
  (`withQueuePolicy`); a failure marks FAILED with a truncated message as today.
- **Performance:** chunk size unchanged (`BULK_CHUNK_SIZE`); the reclaim query
  uses the existing `bulk_operation(status, createdAt)` index.
- **Security:** unchanged auth and rate limits; the new kinds are behind the
  same `bulk-content` feature flag.
- **i18n:** `bulk-durable` for new strings.

## Data model and API

- `BulkOperation.heartbeatAt DateTime?`, `cursorId String? @db.VarChar(40)`,
  `reclaims Int @default(0)`. Migration `20261127060100_s07_bulk_durable`.
- `lib/bulk/queue.server.ts` (`BULK_RUN_QUEUE`, `enqueueBulkRun`,
  `registerBulkWorker`, `registerBulkReclaimCron`), changes in
  `bulk.server.ts` (`runBulkOperation` lease and resume,
  `reclaimStalledOperations` ceiling, `bulkErasureOps`), `types.ts` (two
  kinds and their predicates), `schema.ts` (filters valid per kind).
- `server/jobs/index.ts`: one import and the registrations under the anchor.
- UI: `BulkCleanupPanel.tsx`.

## Testing requirements

- Main suite `lib/bulk/__tests__/bulk-durable.test.ts`: lease claim (PENDING,
  expired RUNNING, live RUNNING refused); two runners → one advances; resume
  after `cursorId`; a chunk re-run after a crash changes nothing; a pre-feature
  RUNNING row (`heartbeatAt` null) is reclaimed; reclaim enqueues expired leases; 5-reclaim ceiling → FAILED;
  enqueue fallback when the boss is null; cancel during a resumed run.
- Main suite `lib/bulk/__tests__/bulk-kinds.test.ts`: `unlike-posts` and
  `delete-reposts` predicates, preview counts equal run counts, counters
  decremented.
- Main suite `lib/account/__tests__/bulk-erasure.test.ts`.
- Existing bulk tests stay green.

## Acceptance criteria

- [ ] Start deleting 3,000 posts, restart the web and jobs processes mid-run:
      the operation resumes and finishes with exactly the previewed count.
- [ ] Removing likes older than a year leaves every post's like count right.
- [ ] The panel stops polling once nothing is running.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Scheduled or recurring clean-ups, bulk actions on messages, undo for likes and
reposts.
