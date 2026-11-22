# Sprint 02 — summary

Twenty features shipped, each deepening a surface people already use: flashcards,
RMHType, RMHStudy, the developer platform, the social graph, notifications,
reading, achievements, game saves and keyboard accessibility. Specifications are
in `features/`, the plan in `plan.md`, the implementer briefs in `briefs/`.

## What shipped

| #   | Feature                                    | Where                                  | One check that holds                                                                                 |
| --- | ------------------------------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 01  | Webhooks console                           | `/developer/webhooks`                  | After Rotate, a delivery carries `v1=` signatures for both secrets for 24 hours.                     |
| 02  | API explorer                               | `/developer/explorer`                  | The key never reaches a URL or a default snippet; live-key writes need a confirmation.               |
| 03  | Deck editor, import and export             | `/study/$deckId/edit`                  | A Quizlet paste imports with no separator chosen; a CSV cell starting with `=` exports inert.        |
| 04  | Practice tests                             | `/study/$deckId/practice`              | Retake rebuilds the identical test from its seed; "café" typed as "cafe" is correct.                 |
| 05  | Review history and statistics              | `/study/stats`                         | Every review writes one log row in the same transaction as its SM-2 update.                          |
| 06  | RMHStudy focus history and weekly goal     | `/rmhstudy/history`                    | Sessions page by keyset on a new `(userId, startedAt)` index; weeks follow the locale's first day.   |
| 07  | RMHType touch-typing lessons               | `/rmhtype/lessons`                     | Every QWERTY key is introduced by exactly one lesson; stars are recomputed on the server.            |
| 08  | RMHType progress over time                 | `/rmhtype/progress`                    | Daily medians come from SQL `percentile_cont` in the viewer's zone, capped at 5,000 rows.             |
| 09  | RMHType daily challenge                    | `/rmhtype/daily`                       | The server times the run; a second Start keeps the first clock; 400 wpm is refused.                  |
| 10  | Account security activity                  | `/settings/security`                   | Sign-ins, revokes, passkeys, password changes and resets are logged with no raw IP or user agent.    |
| 11  | Keyboard shortcut settings (WCAG 2.1.4)    | `/settings/keyboard`                   | With Off, `n` does nothing on the feed while Ctrl/⌘+K still opens the palette.                       |
| 12  | Listen to articles                         | Logs, News, library text               | Wires the previously unused `lib/audio/read-aloud.ts`; nothing runs until Listen is pressed.         |
| 13  | Find in book                               | library reader (PDF, EPUB)             | "naïve" finds "naive"; a phrase split by a line-end hyphen is found.                                 |
| 14  | Highlights notebook and export             | `/reading`                             | Markdown export escapes structure characters and `<`; CSV is formula-guarded.                        |
| 15  | Audience insights                          | `/analytics`                           | Follower history from a new follow-event log; unfollowers are counts, never names.                   |
| 16  | Followers and following manager            | `/follows`                             | Remove follower deletes only follows of the member and sends no notification.                        |
| 17  | Notification inbox filters and controls    | `/messages` → Notifications            | Filters are server-side (new `(userId, type, createdAt)` index), so pagination stays correct.        |
| 18  | Follow Logs and News                       | Logs, News, `/settings/notifications`  | The 15-minute fan-out is idempotent: run twice, each notification exists once.                       |
| 19  | Achievement tracker                        | `/progress?tab=achievements`           | At most five tracked; secret achievements are never suggested; each milestone notifies once.        |
| 20  | Cloud save manager and snapshots           | `/settings/cloud-saves`                | An overwrite older than 6 h keeps a snapshot; ten are kept; a backup for another game is refused.   |

Wave 0 added the product test suite (`pnpm test:product`, `*.product.test.ts`)
and registered the twenty namespaces.

## Found in review and integration

Fresh reviewers checked each feature against its specification and fixed what
they found before merge, among them: account-deletion erasure for the review
log, cloud saves, achievement tracks and follow events; HTML escaping in the
highlights Markdown export; daily typing attempts closed on an implausible
finish; focus rows written with their true start time; keyboard shortcuts
skipping IME composition and `role=textbox`; unread state kept truthful past
the first page of the inbox.

Integration (one owner, full machine) then found and fixed:

- **Empty-account merge broke.** The new security log writes a `sign_in` row the
  moment an account exists, so the consolidation check
  (`lib/auth/account-history.server.ts`) saw "history" on every new account and
  refused to merge. `security_event` joins the tables a fresh account owns
  without doing anything. Caught by `pnpm test:integration`.
- **A route file named `*.test.tsx`.** `/study/$deckId/test` lived in
  `$deckId_.test.tsx`, which the test glob collected (and failed). The route is
  now `/study/$deckId/practice`.
- **Hot-table indexes built without `CONCURRENTLY`.** Three migrations would
  have locked `notification`, `rmhstudy_session` and `rmhtype_match_player`
  against writes during the build. Each is now a single-statement concurrent
  build plus an `_ensure_valid` repair migration, the repo's existing pattern.
- **Page data fetched in effects.** Eleven new components loaded their data in
  `useEffect` (`useeffect-fetch-ratchet`). They now use React Query
  (`contractQuery` / `infiniteQueryOptions`) through `*.queries.ts` modules,
  with mutations kept out of the components.
- **zod on a hot route.** The inbox imported a zod schema module for one
  constant; the constant moved to the zod-free filters module.
- **Site-tier scan.** `app/site-tier.css` skipped `lib/audio`, `lib/game-saves`
  and `lib/shortcuts`, which site pages now import.
- **Account export.** The new personal data (decks and cards, review log, test
  results, lessons, daily runs, RMHStudy profile, security log, reading
  subscriptions, cloud saves and snapshots, keyboard preferences, tracked
  achievements, the member's own follow actions) is in `/api/account/export`,
  with a main-suite test that also pins that no unfollower is named.
- **Heatmap overflow in Arabic at 390 px**: week columns now have one fixed
  track.
- Ratchets lowered where the sprint removed debt (`adhoc-cache` 64 → 63,
  `colonAny` 127 → 125, `asAny` 68 → 67); the characterization snapshot of the
  profile column updated for the followers modal's new `canManage` prop.

Follow-ups from review, fixed in this sprint:

- `hashIp` was a bare SHA-256, reversible for IPv4 by brute force. It is now an
  HMAC keyed by `IP_HASH_SECRET` or a key derived from `BETTER_AUTH_SECRET`
  (`lib/__tests__/hash-ip.test.ts`). Existing stored hashes stop matching new
  ones once, which only affects "same network" labels and visitor dedupe for a
  day.
- A forgotten-password reset is now recorded in the security log as a password
  change, attributed through the reset token.
- The RMHStudy hub's streak never grew: the upsert stamped `lastStudyDate`
  before the streak check read it. The streak is now computed from the profile
  as it was (`lib/rmhstudy/streak.ts`, calendar days), and break time is
  written to the session the break followed.
- The settings hub built its i18n keys at run time (`settings-nav-${id}`), so
  they were never extracted. They are literal calls now
  (`components/settings/settings-nav-labels.ts`), with a test that keeps them in
  step with `lib/settings-nav.ts`.

## Verification

- `tsc -b --checkers 1`: clean. (The default `pnpm typecheck`, four checkers,
  is killed by the OOM killer on this 15 GB box from a cold start; one checker
  peaks lower. CI's runners are unaffected.)
- `pnpm typecheck:strict`: island clean.
- `pnpm test`: 1,127 files and 12,994 tests passing (2 files skipped by
  design). `pnpm test:product`: 24 files, 320 tests. `pnpm test:toolbox`: 22
  files, 171 tests.
- `pnpm check:consistency --base main`: passed.
- `pnpm build` and `scripts/check-bundle-budget.ts`: within budget (critical path
  228.7 KB brotli of 239.9 KB; site CSS 32.0 of 32.0 KB).
- `pnpm test:integration` against a local Postgres 16 and the built server: 37
  tests passing.
- Every migration applied to an empty database; the schema matches the
  migrations except for the pre-existing pgvector and trigram objects.
- Every raw-SQL path added this sprint was run against seeded data: `/follows`
  across both tabs × three filters × three sorts with every page walked (no
  repeats, counts matching the seeded graph), study statistics, audience
  insights, RMHType progress and runs, the daily board, focus history and
  sessions, in UTC, Los Angeles and Kolkata.
- Headless Chromium over 27 new or changed pages, Day and Night at 390 and
  1280 px and twice in Arabic (162 page loads): no page errors, hydration
  warnings or horizontal overflow from this sprint. Two findings are outside it:
  every page reports "Realtime URL is not configured" without a local socket
  hub, and `/developer`'s badge snippets differ between server and client when
  the local origin is not the production one (`BadgeSnippets.tsx`, existing).
  The library reader was not exercised in a browser: it needs a stored PDF or
  EPUB; Find in book is covered by its product tests.

## Size

`git diff --numstat origin/main...HEAD` for the sprint, by kind:

| Kind                                                         | Files | Added  | Removed |
| ------------------------------------------------------------ | ----- | ------ | ------- |
| Code (TypeScript, TSX, SQL, Prisma, CSS, config, workflows)  | 334   | 44,830 | 1,210   |
| Tests                                                        | 55    | 19,094 | 6       |
| Documentation (wrapped at 80 columns)                        | 43    | 7,663  | 6       |
| Generated (route tree, route table, locales, facts, SDK)     | 29    | 3,326  | 1,810   |

The code follows the repository's Prettier settings (`printWidth: 1` in many
files), which spreads expressions over many lines.

## Next-sprint candidates

- `BadgeSnippets` renders `window.location.origin` on the client and the site
  URL on the server; a hydration mismatch wherever the two differ.
- The default `pnpm typecheck` (four checkers) does not fit a 15 GB machine from
  cold; the commit gate could pass `--checkers 1` when memory is short.
- Find in book in a real browser against a stored PDF and EPUB.
- Library-wide search, guest email subscriptions and an accessibility statement
  remain owner decisions (see `README.md`, rejected ideas).
