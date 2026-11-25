# Sprint 12 — summary

Twenty features shipped on `claude/autonomous-sprint-12`. Each was built from its brief in its own worktree, reviewed by a fresh reviewer who fixed what they found, and merged wave by wave (plan: [plan.md](plan.md)).

## What shipped
- **01 Roll for the table.** A party in RMHCharacters has a "Table rolls" log. The server rolls from the stored sheet, and a client never sends a modifier or a result. Rolls are for the table, for the game master, or secret (the game master's own). The newest 200 per party are kept under the party's lock. Rolls join names rather than copying them. The review shut banned and blocked players out of the log's reads.
- **02 Ranking File.** The RMHBox stub is a playable minigame. Everyone orders the same five items, scored by footrule, and nothing about the order reaches a client before the reveal. Review dropped or trimmed the sets whose sources disagree, which leaves 62 sourced sets with at least fifteen per category.
- **03 Race a friend's ghost.** Neon Driftway's ghost switch has a fourth mode, "A friend". It lists up to 20 mutual follows with a ghost on the level, fastest first. Blocks, bans, pending deletions and members hidden from boards are excluded, and a ghost is offered only up to the friend's validated board score.
- **04 Earlier versions of a Slice It chart.** The editor has a "Versions" panel and "Save a version" with a name. Restore is one undoable edit, saved through the normal save path, so a published chart's lint still applies. A nightly prune keeps named and published versions, the newest 30 autosaves, and one autosave a day for 30 days. It deletes with ids bound as `text[]` cast to `bigint[]`.
- **05 Read and tap rhythms.** A "Read rhythms" unit follows "Rhythm basics" on every path, voice included. It has five lessons of eight one-bar patterns, in 4/4 and then 3/4. Taps are scored against the existing timing windows. Review focused the tap pad when it opens, so Space and Enter tap.
- **06 Draft, test and fix Connections grids.** Members can save drafts, which count toward the cap and appear in no list. "Try it" checks guesses in the browser and writes nothing. A grid can be edited until another member plays it; the edit is a compare-and-set that serialises with a first play. `/connections/mine` lists a member's grids with their figures. Drafts are erased with the account.
- **07 Made here.** An opt-in profile module lists up to four of each kind a member made: grids, Lights Out boards, public decks, charts and builds. Nothing unpublished, hidden, private or moderated is listed. Review added charts on archived songs.
- **08 Deck ratings.** `/study/browse` sorts by most cards, best rated (a Bayesian average) or most copied. Only a member who studied a copy (20 reviews) may rate, with stars only. An average shows from three ratings. `copyCount` counts current copies under the deck's lock. Review cast the Best rated SQL parameters and left the ratings of a member whose deletion is pending to the erasure.
- **09 One card's history.** "Card info" (key `i`) shows the member's own reviews of a card and its schedule. "Start this card over" resets the schedule and keeps the log. One `CONCURRENTLY` index has an `_ensure_valid` repair migration.
- **10 Notes on saved homes, and a comparison.** A saved listing can carry a private note, shown only to the member, on the Saved tab and on the listing page. `/homes/compare` puts up to four saved homes side by side, with straight-line distance to a place that stays on the device. Saved homes join the data export.
- **11 Say where you are.** After each pathname change, the page title is announced in one polite live region. After a keyboard-started navigation on the site tier, focus moves to the content, but never out of a field or an open dialog. A title gate found one duplicate title and five pages with none, and all were fixed. The baseline is 0 duplicates and 2 named embed frames.
- **12 Review flashcards through the API.** The API has endpoints for a deck's due cards and for grading one card. Both go through the site's single grading path, behind a new explicit scope, `write:study-reviews`. Grades are named, grading is idempotent, an API grade earns no quest progress or XP, and no response includes card sound.
- **13 Characters and parties in the API.** A new `read:characters` scope reads the member's own sheets and the party summaries the site already shows them. The summaries come from the site's functions, never another player's sheet, and `portrait` is removed. Review made the SDK party summary required and nullable on a member.
- **14 Account deletions, for admins.** `/admin/deletions` lists accounts that are waiting, overdue or finished. Every erasure attempt is recorded with only its error's name. The claim is the attempt row, so a sweep and an admin's audited "Try again now" never run the same account twice. Review made the claim read the clock afresh for each account.
- **15 The home listing feeds, for admins.** `/admin/homes` lists the scrape sources and recent runs. Pause and resume are a compare-and-set that a run in flight cannot undo. An admin can add an RSS feed through the SSRF guard, or run one `MANUAL` scrape now.
- **16 Report a grid, a deck, a persona or a listing.** There are four new report types, and all of them can be removed. A takedown sets `moderatedAt`, and the owner's own toggle cannot undo it. Every reader leaves moderated items out. "Your reports" lists the new kinds. Review made a report of a hidden grid refused as if the grid were missing.
- **17 RMHType results the server can stand behind.** Solo and room runs go through one check (`run-check.ts`). A run that fails is shown as "Not ranked" with its reason. Positions are clamped, and existing bests are not rewritten. Review widened the curve check after measuring false refusals of fast, honest typists, at about 10% at 160 WPM. The whole-run speed is still held to `MAX_WPM`.
- **18 A deletion request ends the membership too.** A request sets the member's subscriptions to cancel at the period's end. A restore resumes only what the request changed, and the erasure cancels whatever still bills. One reconciling job decides from the member's state when it runs. Review dropped recorded subscriptions that are gone from Stripe on resume.
- **19 The last English notices.** Five helpers (RMHLadder alerts, API key suspension and restore, report decisions, admin review alerts) write keys with 21 new `notice-language` templates. `PASSED_THROUGH_HELPERS` is empty. Review restored the singular wording through `-one` keys.
- **20 Close the sprint 10 and 11 gaps.**
  - (a) A banned co-editor's shared deck leaves their queue and statistics. A shared `activeEditorSql` and `activeEditorWhere` cover this.
  - (b) A reserved suspension reason says why it is refused.
  - (c) A public mod-log page is full whenever more rows exist.
  - (e) A shared Studio project keeps no audio track name.
  - (f) A refused RSVP no longer leaves a stale Events list.
  - (g) A deleted account cannot be granted a membership.
  - (h) Two forms name each field once.
  - (d) was already fixed (the Studio recorder faults).

## Fixes made at integration
- **Merge of main** (2 commits: Med Schools phase D and the source toggle). The one conflict was `docs/account-deletion.md`, which was regenerated. The site reference was regenerated too, and picked up the sprint's page routes.
- **Type errors.** No feature had run tsc. The sliced whole-branch check found 4 errors, all in `lib/admin/deletions.server.ts` (14): an `as const` filter whose readonly `OR` Prisma rejects. It is now `satisfies Prisma.UserWhereInput`.
- **Product test (13).** The explorer's `DOCUMENTED_GROUPS` did not know the new RMHCharacters group, so it showed no docs link and `explorer.product.test.ts` failed.
- **Lint (17).** The one new warning against main was an explicit `any` in the RMHType scoring test's recorder.
- **Bundle.** The branch measured 704.3 KB against main's 702.1 KB entry line, about 5.7 KB over main. The extra bytes were the announcer, new route records, namespaces and preload lists.
  - The route announcer's browser half (1.6 KB) now loads with a dynamic import while the router is created.
  - `/tools/cron` and `/tools/contrast` ran their parsers in `validateSearch`, which put 5.1 KB of `lib/toolbox` in every page's entry. They now parse in the page.
  - The entry is 697.7 KB, below main's 698.7 KB. No budget was raised.
- **Radios (found with 08).** The site's drawn radio filled on `:indeterminate`, which every radio of an unanswered group matches. All five "Rate this deck" stars showed filled before a member rated. Only a checkbox now fills on `:indeterminate`.
- **Homes compare (10).** At 1280 px the unit tabs took the row and squeezed the place field to an icon-wide column. The tabs are now sized to their content.

## Verification
- **Typecheck.** A cold `tsc -b` is still killed by the out-of-memory killer on this 15 GB box. The site project was checked single-threaded in seven slices, each with the route tree and the ambient declarations: app, components, lib, features in two halves, server/hooks/stores/testing/deploy/packages/docs, and root configs. All seven have 0 errors. Core and engine are up to date and clean, and `typecheck:strict` is clean.
- **Lint.** 354 changed files against `origin/main`: 0 errors, and 48 warnings, the same 48 main has on those files. `lint:ratchet` OK. `check:consistency --fast --base origin/main` green.
- **Tests.** `pnpm test` passed 21,164 tests in 1,801 files, with 14 skipped. `pnpm test:product` passed 2,792 tests in 186 files.
- **Build.**
  - Entry 697.7 / 702.1 KB raw (main 698.7).
  - Critical path 914.7 / 919.1 KB raw (main 915.7) and 239.3 / 242.6 KB brotli (main 240.2).
  - Site CSS 31.3 / 32.0 KB brotli (main 31.4).
  - Every island is within budget.
- **Generated docs.** `api:routes`, `docs:site`, `docs:api`, `sdk:check`, `docs:deletion`, `images:variants` and `fonts:check` are up to date. The facts were regenerated (untracked).
- **Postgres 16** (local cluster, no pgvector). 514 migrations apply from empty with 0 invalid indexes. The only schema drift is the hand-written trigram and tsvector indexes, plus the embedding table that is skipped without pgvector. Ten smoke cases run against the real functions:
  - 08: the `copyCount` backfill counts copies, two concurrent clones count once, two concurrent ratings both count, and Best rated orders by the Bayesian average.
  - 04: the prune keeps named and published versions and is idempotent.
  - 20: a banned editor drops out of `dueByDeck` and the statistics, and the public mod log pages 50 + 6 with `text[]` binds.
  - 09: the index is valid.
  - 14: of two concurrent claims, exactly one wins. Two concurrent sweeps make one attempt and one erasure. "Try again now" refuses an account in its grace period and audits an overdue one.
  - 01: 20 concurrent rolls on 195 leave exactly 200.
  - 06: an edit that races a first play never lets both land.
  - 18 with Stripe faked: stop, a second stop as a no-op, resume of only what the request flipped, a withdrawal mid-stop that re-queues, and cancel at erasure.
  - Erasure end to end: a re-run is a no-op. `TODO_CEILING` stays 4, and `exportSprint12` carries 01, 08 and 10.
- **Browser.** The production build was loaded 105 times: 21 surfaces in Day and Night at 390 and 1280 px, and in `ar`. There was no horizontal scroll and no console or hydration errors.
  - Surfaces: homes saved, compare and listing; music path and lesson; party as game master and player; connections mine, new and edit; the report dialog; card info; the deck editor; browse sorted two ways; a deck page; profile Made here; chart versions; admin homes and deletions; and Your reports.
  - The report dialog, card info and the Versions panel open in every combination.
  - The announcer said "Flashcards" and "Study statistics" on navigation, and moved focus to `#main-content`.
- **Size.** About 30,300 lines of code (TypeScript, TSX, SQL, CSS and `data/` JSON) were added across the twenty merges, excluding generated files. The largest are 02 (4,608 lines), 05 (2,932) and 01 (2,397); the smallest is 11 (642). The `serverError` ratchet stays at 18.

## Owner follow-ups
- **S12-01:** `getParty` (the party view) does not check bans or blocks. This predates the sprint.
- **S12-11:**
  - Some screen readers may coalesce a clear-then-write in one task, so a repeated title on a different path can be silent. The screen-reader pass is still pending.
  - The announcer now loads just after the router starts, so a navigation made before that small chunk arrives is not announced.
- **S12-17:**
  - A room page cached from before the deploy sends no samples, so its runs are "Did not finish" until reload (release note).
  - The ghost check is unchanged, so honest runs above about 200 WPM rank without a saved ghost.
  - The count of current `bestWpm` values above `MAX_WPM` needs production data, so it was not measured here.
- **S12-18:**
  - A crash between Stripe's update and the hold write leaves a subscription unrecorded. A fix would be a Stripe metadata marker.
  - `enqueueBillingSync` swallows queue errors.
  - `subscriptions.list` is not paginated past 100.
- **S12-02:** Ranking File was not loaded in the browser pass, because the production-build pass runs no realtime hub. Its handler and set tests and the RMHBox masking tests cover it.
- **S12-20 (found at integration, predates the sprint):** both mod logs page by `id` while ordering by `createdAt`. A row whose `id` order differs from its time order, for example two transactions that commit out of order, can be skipped across a page boundary.
- **Integration:**
  - The `ar` pass checked direction and layout only. The non-English catalogs were not pulled, so pages served English text.
  - `/tools/contrast` now keeps the colour as typed in the URL until the next change, rather than rewriting it to canonical hex.
- **Integration:** a cold `tsc -b` still does not fit in 15 GB, even single-threaded. The commit gate's tsc step needs more memory or a split.
- **Open owner decisions the sprint met, each kept at its default:**
  - Refunds, beside 18: no refund and no proration.
  - Written reviews, beside 08: stars only.
  - The deletion grace period, beside 14 and 18: unchanged, and 14 has no "delete now".
