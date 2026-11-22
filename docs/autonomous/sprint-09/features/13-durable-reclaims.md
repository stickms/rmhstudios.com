# 13 — Reclaims that wait for the worker

Surface: the three leased job kinds — bulk clean-ups (`lib/bulk`), fan-outs (`lib/fanout`) and spam sweeps
(`lib/admin/sweeps*.ts`) — and the admin jobs console. Wave 4. Namespace `durable-reclaims`.

## User story

As the site owner, I want a deploy or a few minutes of jobs-worker downtime to delay a member's bulk clean-up, a
community's post alert or an admin's spam sweep — never to fail it — and I want an undo of a spam sweep to know about
every item it removed, even after a crash.

## Requirements elicitation

- **What exists (verified):**
  - Three copies of one lease pattern: `BulkOperation` (`reclaimStalledOperations`, `lib/bulk/bulk.server.ts`,
    `LEASE_MS = 2 min`, `MAX_RECLAIMS = 5`), `FanoutRun` (`reclaimStalledFanouts`, `lib/fanout/run.server.ts`,
    `lib/fanout/run.ts`), `ModerationSweep` (`lib/admin/sweeps-jobs.server.ts`, `heartbeatAt`, `reclaims`). Each reclaim
    cron runs every minute, finds `RUNNING` rows whose `heartbeatAt` is older than the lease, increments `reclaims` with
    a compare-and-set and re-queues, and marks the row `FAILED` at the fifth.
  - The owner follow-ups (sprint 07 15, sprint 08 05): "the reclaim sweep can fail a running operation after about five
    minutes of jobs-worker outage even with a job queued" — the cron keeps counting each minute while the re-queued job
    waits in the backlog, so five minutes without a runner spends all five reclaims on attempts that never started.
  - Sprint 08 18's follow-ups: "a worker crash between removing an item and writing its item row leaves that removal
    unrecorded, so undo misses it. The 10-confirms-per-hour cap is checked per subject lock, so it is slightly soft
    across subjects."
  - The jobs console (`lib/admin/jobs.server.ts`, sprint 05 02) shows fan-outs (sprint 08 05).
- **Decisions:**
  - **Count attempts, not minutes.** Each leased table gains `claimedAt DateTime?` (set by the runner in the same
    compare-and-set that takes the lease) and `reclaimedAt DateTime?` (set by the reclaim). A reclaim counts
    (`reclaims + 1`) only when `claimedAt` is later than the previous `reclaimedAt` (a runner actually started since);
    otherwise it re-queues with the same singleton job key and does not count. `FAILED` still comes at `MAX_RECLAIMS`
    counted reclaims. A run that has waited 24 hours with no runner at all fails with "No worker picked this up for a
    day" (so a permanently stuck queue still ends).
  - **One pure rule.** `lib/jobs/lease.ts` (new, pure:
    `reclaimDecision({ claimedAt, reclaimedAt, reclaims, createdAt, now })` → `skip | requeue | count | fail`) is
    imported by all three; the SQL and the table stay with each owner (the brief does not extract a shared server
    helper; the decision function is the one shared part, tested once).
  - **Spam sweep records first.** In `lib/admin/sweeps-jobs.server.ts`, each item's removal and its
    `ModerationSweepItem` row are written in one transaction (the item row first, then the removal through the same
    `moderateContent` path with the transaction client, if it accepts one; otherwise the row is written `pending` before
    the removal and confirmed after, and undo treats a `pending` row whose content is removed as removed). The
    implementer picks the first if `moderateContent` can run in a caller's transaction and records which.
  - **The confirm cap holds globally:** the 10-per-hour count is taken under `lockKey(tx, 'sweeps:confirm-cap')` rather
    than the subject's lock.
  - **The jobs console** shows, per leased kind, running, waiting for a worker (re-queued and not yet claimed), and
    failed in the last 7 days; rows on rules with `t-meta` figures.

## Functional requirements

1. FR-1 The two columns on `bulk_operation`, `fanout_run` and `moderation_sweep`; the migration.
2. FR-2 Every runner sets `claimedAt` with its lease CAS; every reclaim uses `reclaimDecision`.
3. FR-3 The 24-hour stop.
4. FR-4 Spam-sweep item rows written before or with the removal; the global confirm cap.
5. FR-5 The jobs console's three counts per kind.

## Non-functional requirements

- **Correctness:** every write stays a compare-and-set on what was read; a reclaim that loses its CAS does nothing; a
  duplicated job for a `DONE` row does nothing (unchanged).
- **Performance:** no new index. `fanout_run` and `moderation_sweep` have `@@index([status, heartbeatAt])`;
  `bulk_operation` has `@@index([status, createdAt])`, which its reclaim scan (status first, a small `RUNNING` set)
  already uses today — unchanged. One extra column write per claim.
- **Compatibility:** rows from before the migration have `claimedAt` null and are judged as "claimed at `heartbeatAt`"
  so a run already in flight is not treated as never started.

## Data model and API

- Migration `20261129040200_s09_durable_reclaims`:
  `ALTER TABLE … ADD COLUMN "claimedAt" TIMESTAMP(3), ADD COLUMN "reclaimedAt" TIMESTAMP(3)` on the three tables
  (nullable, no default); schema in their model files (`BulkOperation` in `prisma/schema/developer.prisma`, `FanoutRun`
  in `fanout.prisma`, `ModerationSweep` in `moderation.prisma`).
- New `lib/jobs/lease.ts`. Edits: `lib/bulk/bulk.server.ts`, `lib/bulk/queue.server.ts`, `lib/fanout/run.server.ts`,
  `lib/fanout/run.ts`, `lib/admin/sweeps-jobs.server.ts`, `lib/admin/sweeps.server.ts`, `lib/admin/jobs.server.ts` and
  its console component.

## Testing requirements

- Product suite `lib/jobs/__tests__/lease.product.test.ts`: every branch of `reclaimDecision`, including pre-migration
  rows and the 24-hour stop.
- Main suite, extending each owner's tests (`lib/bulk/__tests__/*`, `lib/fanout/__tests__/run.test.ts`,
  `lib/admin/__tests__/sweeps*.test.ts`): ten reclaim passes with no runner in between leave `reclaims` at most 1 and
  the row `RUNNING`; five real attempts that each die fail it; a crash after the item row and before the removal is
  undone correctly; the cap across two subjects.
- `lib/__tests__/migration-safety.test.ts`.
- Integration smoke (plan §Integration): a reclaim with no attempt in between against Postgres.

## Acceptance criteria

- [ ] Stopping the jobs worker for ten minutes during a 3 000-item bulk clean-up and starting it again finishes the
      clean-up.
- [ ] A fan-out whose runner dies five times in a row is failed and shows in the console.
- [ ] Undoing a spam sweep restores an item whose removal happened just before a worker crash.

## Out of scope

Moving the three kinds onto one table, changing lease lengths, pg-boss configuration, retries of non-leased jobs.
