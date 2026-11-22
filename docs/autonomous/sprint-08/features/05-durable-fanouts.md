# 05 — Fan-outs that finish after a restart

Surface: the jobs worker (`server/jobs/`), community post alerts and event
updates. Wave 3. No namespace (no UI strings).

## User story

As a member who turned on post alerts for a community, or who is going to an
event, I want the alert or the host's update to reach me even when a deploy
restarts the worker halfway through sending it, so that being the 3 001st
member of a community does not mean missing the post.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 05's owner follow-up: "Post alerts. Delivery is at-most-once if the
    worker is hard-killed mid-send". `lib/communities/post-alerts.server.ts`
    claims a post with an insert-if-absent `CommunityPostAlertRun` row, sends
    in batches of 500 by id cursor (at most 5 000), and on a thrown error gives
    the claim back — but a killed process leaves the claim in place and the
    rest of the members are never told.
  - Sprint 06's owner follow-up: "Event updates (11): the fan-out is
    at-most-once if the worker is killed mid-send".
    `runEventUpdateFanout` (`lib/events/updates.server.ts`) claims with
    `notifiedAt` null → now and then loops; a kill after the claim loses
    every remaining recipient.
  - Sprint 07 15 solved the same problem for bulk clean-ups with a lease and a
    progress write (`lib/bulk/bulk.server.ts`, `reclaimStalledOperations`,
    `lib/bulk/queue.server.ts`) — the pattern to copy, not the code to share.
  - Game update fan-outs (`lib/arcade/updates-jobs.server.ts`) already dedupe
    per recipient and let pg-boss retry; they are out of scope.
- **Decisions:**
  - **One table, two kinds.** New `FanoutRun (id, kind 'post-alert' |
    'event-update', subjectId, cursor String?, sent Int, collapsed Int,
    status RUNNING | DONE | FAILED, heartbeatAt, reclaims Int, startedAt,
    finishedAt)`, `@@unique([kind, subjectId])`. It replaces the role of the
    claim (the old `CommunityPostAlertRun` row and `EventUpdate.notifiedAt`
    keep being written for compatibility, the run is the authority).
  - **Lease and cursor.** A runner claims the run with a compare-and-set on
    `heartbeatAt` (as 15 does), processes one batch of recipients ordered by
    user id after `cursor`, and writes `cursor = last id of the batch`, the
    counters and a new `heartbeatAt` with a compare-and-set on the lease it
    holds. A runner that lost the lease stops at its next batch.
  - **Exactly once per recipient, best effort across a crash.** Notifications
    for a batch are created before its progress write; a crash between them
    re-sends at most one batch, so before sending a resumed batch the runner
    drops recipients who already have a notification with the same
    `entityType` + `entityId` created at or after the run's `startedAt` (one
    query per batch, `userId in batch AND type = … AND createdAt >=
    startedAt`, served by the existing `@@index([userId, type, createdAt])`
    on `Notification`, then filtered on `entityId` in memory; no new index on
    the hot table). Rows that share a `groupKey` are still one row per
    notification (they collapse only when read), so the `createdAt` check is
    exact for them too.
  - **Reclaim.** A cron every minute (`fanouts.reclaim`) re-queues runs whose
    `heartbeatAt` is older than 2 minutes; after the fifth reclaim a run is
    `FAILED` and logged with its kind and subject (no member data in the
    log).
  - **Admin visibility.** The admin jobs console (sprint 05 02,
    `lib/admin/jobs.server.ts`) gains a "Fan-outs" line: running, failed in
    the last 7 days — read-only, numbers only, rows on rules.
  - Behaviour seen by members is unchanged: same audience rules, same
    collapse of bursts, same caps (5 000 post-alert recipients).

## Functional requirements

1. FR-1 `FanoutRun` with lease, cursor and counters; both fan-outs rewritten
   on top of it in `lib/fanout/run.server.ts` (`runFanout(kind, subjectId,
   step)`), each fan-out providing its own `step(cursor) → { recipients,
   nextCursor }` and send function.
2. FR-2 The reclaim cron and queue registration under the jobs anchor.
3. FR-3 Resumed batches skip already-notified recipients.
4. FR-4 The jobs console line.

## Non-functional requirements

- **Correctness:** every progress write is a compare-and-set on the lease; a
  duplicated job for a `DONE` run does nothing; the audience is still read in
  batches (no "load all 5 000 ids then loop" regression).
- **Performance:** one extra indexed write per batch.
- **Operations:** a run's failure is visible in the jobs console; nothing is
  retried forever.
- **Privacy:** `FanoutRun` has no member column; it is not in the erasure
  registry (no `User` relation).

## Data model and API

- `FanoutRun` in a new `prisma/schema/fanout.prisma`, `@@map("fanout_run")`,
  `@@index([status, heartbeatAt])`. Migration
  `20261128030300_s08_durable_fanouts`.
- `lib/fanout/run.ts` (pure: `LEASE_MS = 120_000`, `MAX_RECLAIMS = 5`,
  `shouldReclaim`), `lib/fanout/run.server.ts`, `lib/fanout/queue.server.ts`
  (`FANOUT_RECLAIM_QUEUE`, `registerFanoutReclaimCron`).
- Edits: `lib/communities/post-alerts.server.ts` (`runPostAlertFanout`),
  `lib/events/updates.server.ts` (`runEventUpdateFanout`),
  `lib/admin/jobs.server.ts` and its console component.

## Testing requirements

- Main suite `lib/fanout/__tests__/run.test.ts`: claim, batch, progress CAS,
  lost lease stops, resume from cursor, resumed batch skips notified members,
  reclaim after 2 minutes, `FAILED` after five reclaims, `DONE` is idempotent.
- Existing tests that must stay green and be adapted only where the claim
  moved: `lib/communities/__tests__/post-alerts*.test.ts`,
  `lib/events/__tests__/updates*.test.ts`.
- Product suite `lib/fanout/__tests__/run.product.test.ts`.
- Integration smoke (plan §Integration): two sessions racing for one lease.

## Acceptance criteria

- [ ] Killing the worker after the first batch of a 1 200-member post alert and
      restarting it delivers exactly one alert to each of the 1 200.
- [ ] The same holds for an event update to 300 attendees.
- [ ] A run that keeps failing stops after five reclaims and shows in the jobs
      console.

## Out of scope

Game update fan-outs, the digest e-mail pipeline, a generic outbox for every
notification, changing who receives what.
