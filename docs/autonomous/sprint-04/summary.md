# Sprint 04 — summary

Twenty features shipped on `claude/autonomous-sprint-04`, each built from its
brief in its own worktree, reviewed by a fresh reviewer who fixed what they
found, and merged wave by wave (plan: [plan.md](plan.md)). This file records
what shipped, what review and integration changed, what was verified, the open
decisions for the owner and the size of the work.

## What shipped

| #   | Feature                                                   | In one line |
| --- | --------------------------------------------------------- | ----------- |
| 01  | [Replay library](features/01-replay-library.md)           | `/settings/replays` lists, unlists and deletes your replays (speedrun proofs protected); every replayable game page shows its top public replays. |
| 02  | [Event waitlists](features/02-event-waitlist.md)          | Full one-off events take a FIFO waitlist; a freed seat promotes the next member inside the same locked transaction, which also fixes the last-seat race. |
| 03  | [Tournament check-in](features/03-tournament-checkin.md)  | Optional 10–60 minute window; a cron announces it; the start drops and refunds no-shows inside the start transaction. |
| 04  | [Build releases](features/04-build-releases.md)           | `BuildVersion` finally has a writer: releases from the build page and `rmhcode release`, watchers and unlockers notified, releases in `/api/v1/builds`. |
| 05  | [Build insights](features/05-build-insights.md)           | `/create/builds/$slug/insights`: first views, likes, comments, unlocks and coins per UTC day with release markers and a table alternative. |
| 06  | [Coin adjustments](features/06-coin-adjustments.md)       | Admin "set coins" (which overwrote balances outside the ledger) is gone; signed, reasoned, idempotent, reversible adjustments go through the ledger. |
| 07  | [Spending budget](features/07-spending-budget.md)         | A monthly cap on non-wager spending, enforced in `debitCoinsOn`/`transferCoinsOn` under a per-member advisory lock; raising it waits 24 hours. |
| 08  | [Poll lifecycle](features/08-poll-lifecycle.md)           | Authors end or extend polls; a per-minute job tells the author and the voters once when a poll ends. |
| 09  | [Reading sync](features/09-reading-sync.md)               | Library place, bookmarks and notes sync across devices; `library_doc` history beats; Continue reading on `/library` and in the resume rail. |
| 10  | [Group chat admin](features/10-group-chat-admin.md)       | Owners rename, add, remove and hand over groups; block and ban checks at add and at creation; erasure leaves every group. |
| 11  | [Achievement compare](features/11-achievement-compare.md) | `/progress/compare`: you beside another member, with filters, rarity, masked secrets and Track. |
| 12  | [RMHBox stats](features/12-rmhbox-stats.md)               | `/rmhbox/players/$userId`; the two unguarded legacy read routes became contracts that follow game-activity privacy and blocks. |
| 13  | [RMHBox presets](features/13-rmhbox-presets.md)           | Named per-minigame host presets, validated against each minigame's schema, with a default applied when the minigame is picked. |
| 14  | [Hide counts](features/14-quiet-counts.md)                | Authors hide their counts from others (server-side on every read path); viewers hide everyone's while browsing. |
| 15  | [Computed i18n keys](features/15-i18n-computed-keys.md)   | Every computed `t()` key became a literal label map with a test; a ratchet forbids new ones. |
| 16  | [Message requests](features/16-message-requests.md)       | Opt-in: a refused first DM waits in Requests (accept, decline with a 30-day cooldown, block), through one gate on every DM write path. |
| 17  | [Community handover](features/17-community-handover.md)   | Owners offer ownership to a moderator, who accepts; site admins can assign an owner for an orphaned community. |
| 18  | [Follow-list privacy](features/18-follow-list-privacy.md) | Everyone / mutuals / only me for followers and following, on the site, the developer API and suggestion lines; blocked accounts are never listed. |
| 19  | [Native dialogs](features/19-native-dialogs.md)           | `usePrompt` and `useCopyFallback` replace every browser `prompt`/`confirm`/`alert` outside Velum 2099; a ratchet forbids new ones. |
| 20  | [Flag targeting](features/20-flag-targeting.md)           | Server-side allow and deny lists per feature flag, an explain tool for one member, history from the audit log, erasure from every list. |

## Fixes made in review

Each feature's reviewer fixed what they found before the merge. The ones that
changed behaviour:

- 02: the events/waitlist import cycle was broken, RSVPs were added to the
  export, and 15 test mocks were replaced with the real modules.
- 04: release notices got their own notification entity type; versions stay on
  the public build API.
- 06: the audit row is written inside the money transaction; a reused
  idempotency key with a different payload is refused; stale set-coins
  references were removed; adjustments are registered in the coin-flow
  inventory.
- 08: the vote characterization test was kept green under the new poll lock.
- 09: expired reader-mark tombstones are pruned across all books.
- 10: Save became a neutral button so Add is the dialog's one ink primary (R4).
- 12: the RMHBox phase-4 tests were ported to the registered endpoints; a
  match's log loads on expand.
- 14: a hidden author's per-post figures are hidden from community managers
  too; the path ratchet covers comment, quote and reply counts.
- 16: reaction, edit and poll paths into a pending request were closed.
- 18: the follow-edge path ratchet was widened to every list path.
- 20: flag-list erasure moved to a pre-transaction step with model calls (the
  array rewrite cannot run inside the batched erasure transaction).

## Fixes made at integration

- **Migrations.** `20261124030000_s04_message_requests` did not add
  `user_profile.dmRequests` although its header and the schema did; found by
  diffing a migrated Postgres against the schema, and added. Five plain
  `CREATE INDEX` statements on live tables (rsvp, build_version, tournament,
  rmheet_poll twice) were split into one-statement `CONCURRENTLY` migrations
  with `_ensure_valid` repairs, as sprint 03 and feature 05 do;
  `scripts/check-migration-safety.ts` is clean.
- **Typecheck.** `tsc -b` failed on 30 errors from the later waves: a zod
  `limit` that parsed to a required key (12), a `head()` returning a bare meta
  array (12), a button variant that does not exist (20), `number | null`
  against the history contract (12), and test typing in 03, 08, 09, 12 and 17.
  With 1,003 registered endpoints the generated route table's single array
  literal hit TS2590 ("union too complex"); `scripts/gen-api-route-table.ts`
  now emits chunks of 200 that the export spreads.
- **Entry closure.** The compare route imported `HANDLE_OR_ID` from the zod
  schema module at top level, which pulled zod (93 KB) into every page and put
  the critical path 5.7% over budget; the pattern moved to the pure module.
  Critical path is now 231.5 KB brotli of 239.9 KB, site CSS 30.3 of 32.0.
- **Ratchets.** Five new components combined `useEffect` with endpoint calls
  (02, 03, 09, 10, 20): their reads became React Queries and their writes moved
  to `*.queries.ts` modules, so the B4 ratchet is back at its baseline (211).
  `app/site-tier.css` excluded all of `components/replays`, including the
  components of two site pages; it now excludes only the app-tier files. The
  FOUC audit gained the two new parameterised routes. The messages sidebar's
  signed-out answer now carries `requestCount: 0` (16), and its test says so.
- **i18n.** A doc comment in `components/ui/prompt-dialog.tsx` held a `t()`
  example that the extractor turned into a `c-ui` key; it no longer looks like
  a call.
- **Export.** `exportReplays`, `exportReaderMarks`, `exportRmhboxPresets` and
  `exportMessageRequests` are wired into the account export, with
  `lib/account/__tests__/export-sprint04.test.ts`. The new `UserProfile`
  columns (`followListVisibility`, `dmRequests`, `hideCountsOnMine`,
  `hideCountsInFeed`) and the budget columns on `UserPlayLimits` ride on rows
  the export already includes whole, which the test asserts; `exportEventRsvps`
  was already wired by 02.
- **UI.** The build insights page labelled the likes chart twice; the compare
  table needed 34 rem and pushed the other member's column off a phone screen.

## Verification

- `tsc -b --checkers 1` and `pnpm typecheck:strict`: clean.
- `pnpm test`: 14,000 passed, 10 skipped. `pnpm test:product`: 924 passed.
  `pnpm test:toolbox`: 171 passed.
- `pnpm check:consistency --base main`: green after regenerating the SDK and
  the facts.
- `pnpm build`, `pnpm build:frontend:sourcemap`, the bundle budget and the
  entry-composition check: pass.
- `pnpm test:integration` against the built server, a migrated throwaway
  Postgres 16 and Redis: 37 passed. The migrated database matches the schema
  except the pre-existing raw-SQL search indexes and the pgvector table.
- Raw SQL and locks against that Postgres: the four build-insight day buckets,
  the spending-budget month sum, lock and ledger refusal, the event waitlist
  lock and promotion, the tournament check-in notice claim and self check-in,
  the poll-ended job run twice (it notifies once), the reading-sync continue
  query and `lockKey`, flag-list erasure, and `anonymizeAccount` run twice for
  two members holding sprint 04 data.
- Headless Chromium over twelve new or changed routes in Day and Night at
  390 px and 1280 px and once in `ar` (60 page loads): every page 200, no page
  errors, no horizontal scroll.

## Open decisions for the owner

- **Blocked members and events.** A member the host has blocked can still RSVP
  to, and join the waitlist of, the host's events (the RSVP path's block
  handling predates this sprint; 02 kept it as it was).
- **RMHBox per-minigame history.** A minigame's match list shows every
  player's name, including members whose game activity is private
  (pre-existing; 12 gated only the per-player filter).
- **Community ownership transfer** is recorded in the moderators' log only, not
  in the public mod log.
- **Admin membership grant.** Cancelling the "how many months?" question grants
  one month (pre-existing; 19 kept the behaviour when it replaced the prompt).
- **Hidden counts and emoji reactions.** Reaction summaries are not hidden by
  "Hide counts on my posts".
- Sprint 03's open decisions still stand: moderator notes in the subject's
  export, the deletion grace period, unlisted tournament and listing meta,
  Apache `CF-Connecting-IP` stripping.

## Follow-ups

- Move the remaining RMHBox leaderboard and replay-ghost route files into
  registered modules.
- Waitlists for repeating events (needs a decision on standing answers).
- Before deploy: `SELECT "buildId", version, count(*) FROM build_version GROUP
  BY 1, 2 HAVING count(*) > 1` must return nothing (04's unique key; the table
  had no writer, so it should be empty).

## Size

Measured with `git diff --numstat origin/main` over the squashed change.

| Kind                                                         | Added  | Removed |
| ------------------------------------------------------------ | ------ | ------- |
| Code (TS, TSX, CSS, Prisma, SQL migrations, scripts)         | 26,457 | 2,097   |
| Tests                                                        | 22,253 | 96      |
| Documentation (this sprint's docs and touched docs)          | 9,891  | 5       |
| English catalogs (`locales/en`)                              | 720    | 10      |
| Generated (route tree, route table, facts, references, SDK)  | 2,219  | 2,033   |

Per feature, code and tests as merged (before the integration fixes; generated
files, docs and catalogs excluded):

| #   | Feature             | Code  | Tests |
| --- | ------------------- | ----- | ----- |
| 01  | replay-library      | 993   | 290   |
| 02  | event-waitlist      | 935   | 690   |
| 03  | tournament-checkin  | 990   | 574   |
| 04  | build-releases      | 1,014 | 537   |
| 05  | build-insights      | 784   | 1,004 |
| 06  | coin-adjustments    | 1,071 | 515   |
| 07  | spending-budget     | 726   | 807   |
| 08  | poll-lifecycle      | 1,694 | 2,307 |
| 09  | reading-sync        | 3,230 | 3,999 |
| 10  | group-chat-admin    | 3,336 | 3,090 |
| 11  | achievement-compare | 812   | 334   |
| 12  | rmhbox-stats        | 961   | 650   |
| 13  | rmhbox-presets      | 926   | 723   |
| 14  | quiet-counts        | 651   | 1,314 |
| 15  | i18n-computed-keys  | 754   | 758   |
| 16  | message-requests    | 1,711 | 841   |
| 17  | community-handover  | 1,402 | 583   |
| 18  | follow-list-privacy | 604   | 468   |
| 19  | native-dialogs      | 753   | 355   |
| 20  | flag-targeting      | 2,955 | 2,477 |
