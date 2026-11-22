# Sprint 07 — summary

Twenty features shipped on `claude/autonomous-sprint-07`. Each was built from its brief in its own worktree, reviewed by
a fresh reviewer who fixed what they found, and merged wave by wave (plan: [plan.md](plan.md)). This file records what
shipped, what review and integration changed, what was verified, the follow-ups for the owner and the size of the work.

## What shipped

| #   | Feature | In one line |
| --- | ------- | ----------- |
| 01  | [Copy, paste, mirror and time edits in the chart editor](features/01-slice-it-clipboard.md) | The Slice It editor gains an Edit menu and shortcuts for copy, cut, paste, paste mirrored, duplicate one measure on, mirror, quantise, scale timing and insert/remove time. |
| 02  | [Game assists](features/02-game-assists.md) | `/settings/game-assists` sets calm visuals, colour-safe markers, hold to press, no timed input and a slowest game speed; Synapse Storm and Void Breaker honour them, and an assisted run is decided at run start and kept off the boards. |
| 03  | [What this site keeps on your device](features/03-device-data.md) | `/settings/device` lists and clears IndexedDB, drafts, caches and preferences; sign-out and deletion can clear the device, with a keep-or-delete question when unsent work exists only there. |
| 04  | [Group chat admins](features/04-group-admins.md) | Up to five admins manage members, the group name and invite links; succession under the group lock goes to the earliest admin, then the earliest member. |
| 05  | [Mentions in group chats](features/05-group-mentions.md) | A member picker in the composer and stored mentions; notifications respect All / Mentions only / None, skip blocks and bans, and group info gains "Your mentions". |
| 06  | [Match times and deadlines](features/06-match-scheduling.md) | Players propose and accept a time, hosts set times and deadlines, hourly and 12-hour notices are claimed once, and the host awards an overdue match as a walkover. |
| 07  | [Vote on a jam's theme](features/07-jam-themes.md) | Admins shortlist themes and members mark up to three; the winner is resolved once when the jam starts, without banned voters. |
| 08  | [Review everything due; suspend and leeches](features/08-study-queue.md) | `/study/review` reviews every due card across decks with a tie-safe cursor; cards can be suspended, and leeches are suspended at eight lapses. |
| 09  | [Folders for flashcard decks](features/09-deck-folders.md) | Members file decks into ordered, collapsible folders and review one folder at a time. |
| 10  | [Events and RSVPs in the developer API](features/10-api-events.md) | `/api/v1/events*` lists, reads and answers events through the site's own visibility, capacity, waitlist and RSVP rules. |
| 11  | [Communities in the developer API](features/11-api-communities.md) | Read a community, its rules and its posts, and post into it through the site's shared gate (`POST /api/v1/posts` with `communityId`). |
| 12  | [Highlights, notes and shelves in the developer API](features/12-api-reading.md) | `/api/v1/me/highlights*` with a since-sync, shelves and the reading goal. |
| 13  | [Admin lookup: many at once](features/13-admin-batch-lookup.md) | Up to 50 items per lookup, sent by POST; e-mail addresses never reach the URL, and results can be copied. |
| 14  | [Earlier versions of a Studio project](features/14-studio-history.md) | Each account save keeps the earlier version; "Versions…" restores one or opens it as a copy. |
| 15  | [Bulk clean-ups that finish](features/15-bulk-durable.md) | Runs go through pg-boss with a lease and a reclaim sweep, so a deploy no longer strands them; bulk unlike and bulk repost removal are added. |
| 16  | [Communities that require image descriptions](features/16-community-alt-text.md) | Moderators can require a description on every image and GIF; every composer and edit path enforces it. |
| 17  | [Screenshots on build pages](features/17-build-screenshots.md) | Owners upload described screenshots through the `build` upload policy; build pages show them in a gallery with a viewer. |
| 18  | [Reading time](features/18-reading-time.md) | An opt-in clock records reading time per day, capped at 24 hours under a lock; `/reading` shows the week, four earlier weeks, a weekly target and the month's top documents. |
| 19  | [Quiz polls](features/19-quiz-polls.md) | A single-choice poll can mark a correct answer and an explanation, revealed only to voters, the author, and everyone after the end, on every read path including cached feed pages and the API. |
| 20  | [An erasure registry](features/20-erasure-coverage.md) | Every model with a `User` relation is classified (erase, deidentify, cascade, keep, owner, todo, with a ratchet), and `anonymizeAccount` erases 21 clearly private leaf tables. |

## Fixes made in review

Each feature's reviewer fixed what they found before the merge. The fixes that changed behaviour:

- **01:** "Remove time" moved to Ctrl+Shift+L, because Ctrl+Shift+I opens the browser's developer tools.
- **02:** a failed settings read counts the run as unranked; Void Breaker's island takes its assist helpers from a module
  free of React Query and the router.
- **03:** the `/sections` sign-out goes through the device helper; the elections layout and RMH Music mode were
  reclassified as preferences.
- **05:** a Notifications control in group info (All / Mentions only / Muted), a `#group-message` deep link, and a typed
  conversation-preference contract.
- **06:** a walkover re-checks for an open result claim inside the settling transaction; the bracket match card fits at
  390 px, which also closes sprint 06's off-screen winner button.
- **07:** the vote view no longer hints at vote activity before the start; the vote group is announced.
- **08:** a tie-safe review cursor, the resume-due path, keyboard grading and a pinned export.
- **11:** a stray `flairId` on `POST /api/v1/posts` without a `communityId` is ignored, as before.
- **13:** a failing batch item is isolated from the rest and never logged; the unused GET results component was dropped.
- **14:** restore lives beside the save (no import cycle), and trimming never deletes the version being restored.
- **16:** GIFs count as undescribed images in a requiring community.
- **19:** the author cannot answer their own quiz.

## Fixes made at integration

- **10, sanctioned members RSVPing.** A member banned or timed out of a community could still RSVP to its events, on
  the site and through `PUT /api/v1/events/{id}/rsvp`. `rsvp()` now reads `activeSanction` for a community event; the
  site answers 403 with the same `{ error, code, endsAt }` body as the join and write paths, the API answers 403
  `forbidden`, withdrawing stays open, and `lib/events.server.ts` joins `BAN_ENFORCEMENT_PATHS`.
- **19, quiz edit order.** The post edit route wrote the quiz's answer before the "post cannot be empty" and
  GIF-description checks; it now writes only after every check passes.
- **15, unused string.** `bulk-progress-count` was removed from `settings-content`.
- **18, a draft Log's title.** Reading time read Log titles without `publishedLogWhere`; a Log taken back to draft no
  longer shows its title.
- **Branch fixes during the sprint.** The device-storage registry test moved next to the settings labels (boundaries
  ratchet); composer snapshots gained the image-description focus targets; a personal-bests test mock gained the assist
  settings.
- **Typecheck after the merges.** `LookupBatch` augments history state through `@tanstack/react-router`; a readonly
  cast in the v1 events feed was dropped; a test sentinel was typed into its union.
- **Gates.** The quiz-poll product suite moved out of `lib/` (boundaries); the developer explorer links the new
  communities, events and reading pages; the ComposeBox poll snapshots gained the quiz switch; the deletion-doc
  generator writes to stdout.
- **Browser pass.** The keep-or-delete dialog's actions stack at every width; deck folder rows put counts under the
  name at 390 px; the reading-time header wraps; in `ar` the review-all counter and the admin lookup box read left to
  right; the Slice It Edit menu is 320 px, capped by the viewport.
- **Generated files.** The route tree (official generator) and `facts.json` were regenerated; extractor drift was
  reverted.

## Verification

- `tsc -b --checkers 1`: clean. `pnpm typecheck:strict`: clean.
- `pnpm lint`: 0 errors, no new warnings against `main`. `pnpm lint:ratchet`: OK.
- `pnpm test`: 15,418 passed. `pnpm test:product`: 1,891 passed.
- `pnpm build` and the bundle budget pass; `pnpm check:consistency --base main` passes; the SDK, API docs, site
  reference, deletion doc, prepaint and facts checks are current.
- **Postgres 16 smoke** against a throwaway database: all 434 migrations applied, the `CONCURRENTLY` indexes valid,
  and `migrate diff` showing only drift that predates the sprint. Against the real functions, all passing: group admin
  succession when the owner and earliest admin leave at once; mention recipients; jam theme counts without banned
  voters and a single resolve under two concurrent runs; the study queue cursor across a 30-card tie at the 200
  boundary; deck folder moves; match reminder windows and racing walkovers (one settle, one audit row); a 350-like bulk
  unlike run by two real pg-boss workers plus a direct runner finishing once with exact counters, and a stale lease
  reclaimed once; the reading-time day cap under 100 concurrent writes (exactly 86,400 s); the quiz reveal on a cached
  feed page; and the 21 new erasures against a seeded member.
- **Browser pass** with the production build over 19 new surfaces in Day and Night at 390 and 1280 px and in `ar` at
  390: no hydration warnings, no horizontal scroll. The device-data page has no ink primary, so R4 holds.

## Owner follow-ups

- **Erasure registry (20).** 96 tables are `todo` (`TODO_CEILING = 96`; the ratchet only falls). Owner-kept: follows,
  game reviews, review votes, guides, jam entries and flashcard decks. `RebarReservation` (name, e-mail, allergy notes)
  needs a product call. Erasing `SavedItem` lowers authors' save insights. Sprint 08 takes on 52 of the `todo` tables.
- **Reading time (18):** a book's `finishedAt` is set by a second write after the shelf change.
- **Highlights API (12):** the since-sync cannot report deleted highlights (no soft delete); clients compare ids.
- **Bulk clean-ups (15):** the reclaim sweep can fail a running operation after about five minutes of jobs-worker
  outage.
- **Walkovers (06):** only the host awards one; there is no automatic forfeit, as specified.
- **Found at integration, not fixed:** two members leaving a group at the same instant can deadlock the best-effort
  "left the group" system line (the leaves and succession are correct); in `ar` the game-assists speed slider keeps
  100% at the right; the device page reads "0 byte"; English text in `ar` shows trailing punctuation on the wrong side
  (no `dir="auto"`); the Studio versions dialog was checked at 1280 px only.
- **Schema drift outside the Prisma schema** (pgvector `embedding`, trigram and tsv indexes) shows in `migrate diff`,
  as before this sprint.
- Sprint 03 to 06's open decisions still stand.

## Size

Measured with `git diff --numstat origin/main` over the sprint branch, excluding generated files
(`lib/api/route-table*`, `app/routeTree.gen.ts`, `docs/_generated`, `lib/prepaint/generated.ts`, `docs/site-reference`,
`packages/sdk`, `docs/account-deletion.md`).

| Kind                                                            | Added  | Removed |
| --------------------------------------------------------------- | ------ | ------- |
| Code (TS, TSX, CSS, Prisma, SQL migrations, scripts, snapshots) | 65,637 | 900     |
| of which tests                                                  | 28,628 | 32      |
| Documentation                                                   | 12,022 | 6       |
| English catalogs (`locales/en`)                                 | 570    | 3       |

Per feature, code and tests as merged (from each `Merge branch 'autonomous/s07-*'` commit, before the integration
fixes; generated files, docs and catalogs excluded):

| #   | Feature            | Code  | Tests |
| --- | ------------------ | ----- | ----- |
| 01  | slice-it-clipboard | 2,281 | 661   |
| 02  | game-assists       | 4,187 | 1,477 |
| 03  | device-data        | 3,125 | 623   |
| 04  | group-admins       | 3,836 | 2,634 |
| 05  | group-mentions     | 3,426 | 1,458 |
| 06  | match-scheduling   | 7,783 | 3,666 |
| 07  | jam-themes         | 5,189 | 2,418 |
| 08  | study-queue        | 4,338 | 1,741 |
| 09  | deck-folders       | 1,484 | 424   |
| 10  | api-events         | 5,955 | 2,460 |
| 11  | api-communities    | 4,252 | 2,392 |
| 12  | api-reading        | 1,412 | 531   |
| 13  | admin-batch-lookup | 2,277 | 1,045 |
| 14  | studio-history     | 1,251 | 540   |
| 15  | bulk-durable       | 1,138 | 650   |
| 16  | community-alt-text | 1,657 | 1,260 |
| 17  | build-screenshots  | 2,201 | 785   |
| 18  | reading-time       | 5,050 | 2,154 |
| 19  | quiz-polls         | 1,733 | 753   |
| 20  | erasure-coverage   | 2,303 | 540   |
