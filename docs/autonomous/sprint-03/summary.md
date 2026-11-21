# Sprint 03 — summary

Twenty features shipped, deepening surfaces that sprints 01 and 02 did not
reach: communities and site moderation, direct messages, feed conversations,
the Logs editor, the developer API, RMHTube, RMHMusic, RMHStudy, RMHLadder,
the daily puzzles and the games library. Three security fixes found along the
way shipped with them. Specifications are in `features/`, the plan in
`plan.md`, the implementer briefs in `briefs/`, and the server-function audit
in `serverfn-audit.md`.

## What shipped

| #   | Feature                                        | Where                                   | One check that holds                                                                                          |
| --- | ---------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 01  | RMHMusic practice log                          | `/rmhmusic/history`                     | Every lesson, song, sprint and card session writes one entry; a failed write never fails the request.         |
| 02  | Daily puzzle statistics                        | `/daily/stats`, `/daily`                | The streak comes from stored scores, so it is the same on every device; a `dnf` run does not extend it.       |
| 03  | Mute a conversation, pin a reply               | post menu, replies, settings            | Muting from any reply mutes the thread root; "Mentions only" still delivers a direct reply.                   |
| 04  | Moderator notes on member accounts             | `/admin/users`, `/admin/reports`        | Admin-only, audit-logged, edits keep the previous text; deleted with the member's account.                    |
| 05  | Log drafts, scheduling and revisions           | `/admin/blog`, every Log reader         | One `publishedLogWhere` filter, held by a gate test, keeps drafts out of RSS, sitemap, search and the API.     |
| 06  | API key restrictions                           | `/developer` keys, `/api/v1/**`         | A key restricted to an address answers `403 ip_not_allowed` elsewhere, without spending quota.                |
| 07  | Password resets in the log, last keyed hashes  | `/settings/security`, two view handlers | No module hashes an address without the key (gate test); stored reversible view hashes are nulled.            |
| 08  | RMHStudy streaks in local days                 | RMHStudy rooms and history              | Streaks count the member's own calendar days; a backfill script repairs every pre-fix profile.                |
| 09  | Scheduled watch parties                        | `/rmhtube`, `/rmhtube/party/$roomId`    | Going members get one reminder 15 minutes before and one at the start, even when the job runs twice.          |
| 10  | Game updates and following a game              | `/games/$gameId/updates`                | Every stored patch note is readable; a note or a new guide notifies each follower once.                       |
| 11  | Developer API: games, playtime, achievements   | `/api/v1/games`, `/api/v1/me/*`         | Another member's playtime follows their privacy setting; hidden is a 404.                                     |
| 12  | Send a message later                           | DM and group composers                  | Delivery re-runs every send check; a block before the time means not sent, with the reason shown.             |
| 13  | Community rules, reports to community mods     | `/c/$slug`, mod tools                   | A rule report lands in the community's own queue; reporters are counted, never named.                         |
| 14  | Community moderation log                       | mod tools, public log                   | Each mod action writes one row in its own transaction; the public log names no moderator or member.           |
| 15  | Community insights for moderators              | mod tools                               | Joins, leaves and removals are recorded from this release; a deleted member's events are de-identified.      |
| 16  | Your reports: status and outcome               | `/settings/security`, inbox             | Each reporter is told the outcome once, in two words, and never who decided or what was done.                 |
| 17  | RMHLadder offer comparison                     | `/rmhladder/offers`                     | First-year and yearly totals per currency; a revised offer keeps the previous amounts.                       |
| 18  | RMHLadder search insights                      | `/rmhladder/insights`                   | A stage counts as reached if the history ever entered it; groups under five are not compared.                |
| 19  | Image descriptions in messages                 | message composers and rows              | The member's "Require image descriptions" setting is enforced on the server for messages too.                |
| 20  | Moderation queue triage                        | `/admin/reports`                        | Forty reports on one post are one row; deciding it decides all forty and notifies all forty reporters.        |

Wave 0 registered the nineteen new namespaces and put one anchor line per
feature in the three files several features of one wave had to edit
(`anonymizeAccount`, the `User` model's back-relations, `EXCLUDED_ROUTES`), so
parallel branches merged without conflicts.

## Security fixes beyond the twenty

- **Blocked users could still message each other.** Blocks were enforced only
  when a scheduled message was created or delivered: `POST /api/messages/:id`
  and a new conversation let either side of a block send. `isBlockedPair` now
  lives in `lib/messages/send.server.ts`, and `guardDirect` refuses a blocked
  pair (403, code `blocked`) on the immediate paths and in the cron alike.
- **Server functions are endpoints.** After a reviewer found that the Log
  editor's server functions returned drafts to a direct call (a route
  `beforeLoad` runs on navigation only), all 128 `createServerFn` handlers were
  audited (`serverfn-audit.md`). One more real exposure: `fetchArticle` served
  unpublished (`STAGING`) news by slug to anyone. Both are fixed through shared
  guards in `lib/auth/server-fn-guards.server.ts`, and
  `server-fn-guard-ratchet.test.ts` fails any admin-area server function without
  an admin guard.
- **Account deletion left access alive.** `anonymizeAccount` anonymises in
  place, so cascades never fire: developer API keys, webhook endpoints (with
  signing secrets and queued payloads), RMHCode CLI tokens, recovery codes and
  requests, trusted contacts, reset verifications, calendar feed tokens,
  community invites, Doctrine recruitment codes and TF2 HUD share tokens all
  survived the tombstone. They are erased in the same transaction now, and
  `authenticateApiKey` refuses a key whose owner is a deletion tombstone.

## Found in review and integration

Fresh reviewers checked each feature against its specification and fixed what
they found before merge, among them: the Log draft leak above, caches dropped
on publish and unpublish, and Enter no longer unscheduling a Log; community
report dedupe hashes keyed and scoped with the server secret; a pinned reply
unpinned when moderation, a takedown or a community mod removes it; a key's
`lastUsedAt` stamped only after its address allowlist passes; banned and
blocked members hidden from the games API's playtime endpoint; party links kept
through sign-in and the hub's name and time refreshed on edit; the send-later
cap made race-safe with the endpoints' original check order restored; offers
refusing edits once decided; Your reports labels respecting blocks; message
description edits caught up after a reconnect.

Integration (one owner, full machine) then found and fixed:

- **Page data fetched in effects.** Five new components (the mod Log and Rules
  tabs, moderator notes, both moderation queue lists) and the post menu's rules
  lookup loaded data in `useEffect` (`useeffect-fetch-ratchet`, 217 against a
  baseline of 212). They use React Query now, editable drafts are seeded during
  render instead of in an effect, and the scroll to a revealed notes section is
  a ref callback. The baseline went down to 211.
- **zod on the critical path.** The Log editor route validated its slug with
  zod, and the moderation queue's `validateSearch` reached zod through
  `triage-schema.ts` and `report-schema.ts`. The entry grew 58 KB raw over
  budget. The plain constants moved to `report-constants.ts` and
  `triage-constants.ts` (the schema files re-export them) and the slug check is
  written by hand: the critical path is back to 230.6 KB brotli of 239.9 KB.
- **Site CSS over its line.** Six new utilities (`grid-cols-[8rem_1fr]`,
  `max-h-[30vh]`, `pe-2`, `table-fixed`, `w-60`, `xl:inline`) pushed the site
  sheet 99 B brotli over. Each now uses a utility the sheet already had; the
  sheet matches main's.
- **Indexes on written tables built without `CONCURRENTLY`.** The two
  `content_report` indexes and the `rmhtube_room` index are now single-statement
  concurrent builds, each with an `_ensure_valid` repair migration (the repo's
  pattern). The `blog_post` index is acknowledged: the table holds the Logs and
  is written only by admins.
- **Screen-reader tables overflowing.** The chart primitives
  (`day-heatmap.tsx`, `bar-chart.tsx`) put `sr-only` on a `<table>`, which
  ignores a 1 px width: an 81 px horizontal scroll on RMHMusic's history at
  390 px. The tables sit in an `sr-only` wrapper now.
- **Type errors from parallel merges**: a missing React Query import, a Button
  variant that does not exist (`outline`), `RelativeTime` without its
  `format`, a readonly zod issue path, a Prisma `groupBy` order typed too
  widely, and test fixtures that spread over required fields.
- **Gates**: the Insights server function read the session itself
  (`ssr-session-dedupe`); a public updates endpoint whose data has a write path
  kept the response micro-cache (`api-micro-cache-optout`); two new pages had
  no FOUC fixture; the explorer had no docs page for the Games group; the
  private-community access test needed the two new community modules mocked;
  sprint 02's RMHStudy test now pins the derived streak.
- **Account export.** The sprint's personal data is in `/api/account/export`:
  reports made, scheduled messages, ladder offers, watch-party RSVPs, game
  follows and per-conversation notification choices (muted posts included),
  with a main-suite test that also pins that moderator notes never reach it.
  Music practice goes through RMHMusic's existing `exportMusicData`.
- **Generated files** regenerated: route tree, facts, site reference, API docs,
  the SDK, the pre-paint script, and one extracted string (`c-admin`).

## Verification

- `tsc -b --checkers 1`: clean. (The default four checkers are killed by the
  OOM killer on this 15 GB machine, inside `pnpm check:consistency` too; one
  checker fits.)
- `pnpm typecheck:strict`: island clean.
- `pnpm test`: 1,172 files and 13,471 tests passing (2 files skipped by
  design). `pnpm test:product`: 42 files, 645 tests. `pnpm test:toolbox`: 22
  files, 171 tests.
- `pnpm check:consistency --base main`: every step passed except `tsc -b`,
  killed for memory (SIGKILL) and run separately as above.
- `pnpm build` and `scripts/check-bundle-budget.ts`: within budget (critical
  path 230.6 KB brotli of 239.9 KB; site CSS 32.0 of 32.0 KB);
  `check:entry-composition` finds no zod in the entry.
- Every migration applied to an empty Postgres 16; the schema matches the
  migrations except for the pre-existing pgvector and trigram objects.
  `check-migration-safety` and the additive gate pass.
- `pnpm test:integration` against that database and the built server: 9 files,
  37 tests passing.
- Every raw-SQL path the sprint added or changed was run against Postgres:
  music practice summary, focus history, Log publishing, the subscription
  fan-out, community insights over 28 and 365 days, the scheduled-message and
  party-reminder jobs, upcoming parties, ladder insights, the triage `groupBy`
  with all three sorts and a reason filter, and the four document searches.
  `scripts/rmhstudy/recompute-streaks.ts --dry-run` ran clean.
- Headless Chrome over 19 new or changed pages, Day and Night at 390 and
  1280 px and once in Arabic (95 page loads): no page errors, hydration
  warnings or horizontal overflow from this sprint. Two findings are outside
  it, as in sprint 02: "Realtime URL is not configured" without a local socket
  hub, and `/developer`'s badge snippets differing between server and client
  when the local origin is not the production one.

## Size

`git diff --numstat origin/main` for the sprint (the squashed commit), by kind:

| Kind                                                               | Files | Added  | Removed |
| ------------------------------------------------------------------ | ----- | ------ | ------- |
| Code (TypeScript, TSX, SQL, Prisma, CSS, config, migrations)       | 415   | 57,880 | 1,700   |
| Tests                                                              | 83    | 41,672 | 79      |
| Documentation (wrapped at 80 columns)                              | 50    | 9,276  | 0       |
| Generated (route tree, route table, locales, facts, API docs, SDK) | 31    | 3,376  | 1,897   |

Net: code +56,180, tests +41,593, documentation +9,276, generated +1,479.

The code follows the repository's Prettier settings (`printWidth: 1` in many
files), which spreads expressions over many lines.

## Owner decisions

- **Moderator notes and the data export.** Notes about a member are excluded
  from that member's export as the site's records. Confirm, or decide that a
  data-subject request should include them.
- **The 30-day deletion grace.** During the grace period keys, webhooks and
  sessions stay alive (erasure runs at its end), and the Stripe subscription is
  not cancelled at erasure. Decide whether scheduling deletion should revoke
  access and cancel billing at once.
- **Readable by id.** Unlisted tournament metadata and RMHHomes listing
  metadata can be read by anyone who has the id.
- **Forged `CF-Connecting-IP`.** Apache should strip it from peers that are not
  Cloudflare: API key address allowlists (06) and every per-IP rate limit trust
  the client address `getClientIp` reads.
- **RMHStudy streak backfill.** A one-off production run after deploy, from a
  checkout of this commit with dependencies installed (the runtime image ships
  no `scripts/` and no `tsx`), against the production database:
  `DATABASE_URL=<production URL> pnpm exec tsx scripts/rmhstudy/recompute-streaks.ts --dry-run`
  to see what would change, then the same command without `--dry-run`. It is
  batched and idempotent.

## Next-sprint candidates

- The default `pnpm typecheck` (four checkers) still does not fit a 15 GB
  machine; the commit gate could pass `--checkers 1` when memory is short.
- `BadgeSnippets` hydration mismatch wherever the origin differs from the site
  URL.
- Recovery codes and trusted contacts are erased on deletion now but still have
  no product (owner decision, `README.md`).
- A browser pass with seeded content (offers, parties, a populated mod log),
  which this pass ran with empty states.
