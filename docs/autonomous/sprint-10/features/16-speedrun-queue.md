# 16 — The speedrun review queue

Surface: `/admin/speedruns` (new), the admin hub, the jobs worker, the runner's notifications and run list. Wave 2.
Namespace `speedrun-queue`. Site tier (Steel).

## User story

As an admin, I want a page listing the speedruns waiting for a human verdict, with the replay one click away, so that I
can verify or reject them with a reason; and as a runner, I want to be told when my run is verified or rejected and why,
so that a pending run does not sit unexplained for weeks.

## Requirements elicitation

- **What exists (verified):**
  - `SpeedrunEntry` (`prisma/schema/competitive.prisma`: `status` `pending | verified | rejected`, `rejectReason`,
    `verifiedAt`, `replayId` unique) and the verifier registry (`lib/speedrun/verifier.ts`: tiers `deterministic`,
    `consistency`, `manual`; a `consistency` or `manual` pass stays `pending` by design).
  - The admin API is built and has no page: `lib/speedrun/api/speedrun.verify.server.ts` (`auth: 'admin'`): `GET` →
    `getPendingQueue(limit)`; `POST { action: 'drain' }` → `reverifyPending(limit)` — "the worker pass, on demand until
    it is wired into `server/jobs`" — and `POST { action: 'review', entryId, status, reason }` → `reviewEntry`.
  - `reviewEntry` (`lib/speedrun/speedrun.server.ts`) writes the verdict with no admin audit row, no notice to the
    runner and no compare-and-set (two admins can overwrite each other, and a verdict can overwrite an automatic
    rejection).
  - `/admin` has no speedrun entry; `reverifyPending` is not in `server/jobs/index.ts`.
- **Decisions:**
  - **The page:** pending runs oldest first (game, category, runner, time or score, submitted, tier, the verifier's
    note), each with "Watch replay" (the existing `/replays/$id` page), "Verify" and "Reject" (reason required for a
    rejection, optional for a verification, up to 200 characters, as `clampReason` already bounds it); a "Recently
    decided" view of the last 50 verdicts with who decided.
  - **Compare-and-set:** a verdict applies only to a run still `pending` (`updateMany where status = 'pending'`); a
    second admin's verdict reports "Already decided by <admin>".
  - **Reopen (validation pass 2).** Today `reviewEntry` can overwrite any verdict, which is also how an admin reverses a
    verification after cheating comes to light. The compare-and-set must not remove that: "Recently decided" offers
    "Reopen" (reason required), a compare-and-set from the status the admin saw back to `pending`, audited; the run then
    takes a fresh verdict. The runner is told only of the new verdict.
  - **Audit:** `recordAdminActionIn(tx, …)` with the entry, the verdict and the reason, in the same transaction.
  - **Who decided:** `reviewedById String?` and `reviewedAt DateTime?` on the entry (an admin id, not a relation).
  - **Notice to the runner** through `notice()` keys: "Your <game> run was verified" / "Your <game> run was not
    verified: <reason>". Automatic verdicts from the drain pass notify the same way, once.
  - **The nightly pass:** `reverifyPending` registered in `server/jobs/index.ts` (anchor), daily at 04:23 UTC, batches
    of 200 until the queue is drained or 2,000 runs, logging its `ReverifyResult`.
  - **Board privacy:** the admin queue is not a board; if the leaderboard-privacy scan flags the new admin reader, it is
    classified with that reason, honestly.

## Functional requirements

1. FR-1 The two columns on `SpeedrunEntry`.
2. FR-2 `reviewEntry` gains the compare-and-set, the audit row, the reviewer columns and the notice; `reverifyPending`
   notifies on a change of status.
3. FR-3 The job (anchor) and its handler module.
4. FR-4 `/admin/speedruns` (server function guarded inside its handler for the first page, React Query for the rest),
   the admin hub entry (anchor), sitemap entry (anchor).
5. FR-5 The runner's run list (`components/speedrun/SubmitRunPanel.tsx` or the board's "your runs") shows the reason of
   a rejection.
6. FR-6 Two notice keys, labels and their tests.

## Non-functional requirements

- **Security:** admin-only, guarded in the handler and the server function; the reason is plain text.
- **Correctness:** the verdict is idempotent; the job is safe to run twice (the pass already writes only changes).
- **Design:** rows on rules; `t-meta` figures; one primary per dialog.

## Data model and API

- `prisma/schema/competitive.prisma` (`SpeedrunEntry`): `reviewedById String?`, `reviewedAt DateTime?`. Migration
  `20261130020300_s10_speedrun_queue`.
- New `lib/speedrun/review-jobs.server.ts`, `lib/speedrun/queue.contract.ts` (types for the page),
  `app/routes/_site/admin/speedruns.tsx`, `components/admin/SpeedrunQueue.tsx`.
- Edits: `lib/speedrun/speedrun.server.ts`, `lib/speedrun/api/speedrun.verify.server.ts` (409 on an already decided
  run), the runner's run list component, the anchored files (jobs, admin hub, sitemap, notice keys and previews, labels
  and test, `user-text.ts`).

## Testing requirements

- Main suite `lib/speedrun/__tests__/review-queue.test.ts`: a verdict on a decided run does nothing and reports who
  decided; reopen is compare-and-set and audited; the audit row is written in the transaction; the runner is notified
  once; the drain pass notifies on a status change only; non-admin refused.
- Main suite `lib/speedrun/__tests__/review-jobs.test.ts`: the job batches and stops at the cap.
- Existing speedrun tests stay green; the server-fn guard ratchet; sitemap coverage; notice-key and labels tests;
  leaderboard-privacy scan.

## Acceptance criteria

- [ ] `/admin/speedruns` lists pending runs with a replay link; verifying one moves it onto the board.
- [ ] Rejecting with a reason tells the runner the reason.
- [ ] Two admins deciding the same run: the second is told it was already decided.
- [ ] A verified run can be reopened with a reason and decided again; both actions are in the audit log.
- [ ] The nightly pass runs and its result is in the jobs console.

## Out of scope

Game-moderator roles below admin, community-run boards, video proof, changing the verifier tiers.
