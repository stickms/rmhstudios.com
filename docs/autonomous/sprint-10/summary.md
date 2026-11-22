# Sprint 10 — summary

Twenty features shipped on `claude/autonomous-sprint-10`. Each was built from its brief in its own worktree, reviewed by a fresh reviewer who fixed what they found, and merged wave by wave (plan: [plan.md](plan.md)). This file covers what shipped, what review and integration changed, what was verified, the owner follow-ups and the size of the work.

## What shipped

| #   | Feature                                                                                  | In one line                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 01  | [Flashcards from your highlights](features/01-highlight-cards.md)                        | "Make a card" on a reading highlight: a basic or cloze card whose text must come from the highlight, with a private link back to it.  |
| 02  | [Sound on flashcards](features/02-card-sound.md)                                         | Record or upload a sound of up to 15 s for each card side, with a required transcript. Only the person who recorded it hears it; there is a 200-card cap. |
| 03  | [A study pace for each deck, and a test date](features/03-study-pace.md)                 | An opt-in daily count of new cards per deck, a forecast, a test date that suggests a pace, and "Learn 10 more" on the end screen.    |
| 04  | [Suggest a correction to a public deck](features/04-deck-suggestions.md)                 | Members suggest new card text. The author has an inbox to accept, edit or decline; it is off by default and capped.                  |
| 05  | [Your own texts in RMHType](features/05-type-texts.md)                                   | Up to 50 private practice texts in `/rmhtype/texts`, with bests per text. Editing a text's body resets its bests.                    |
| 06  | [The bass clef and the grand staff in RMH Music](features/06-bass-clef.md)               | Four new piano lessons: bass lines and spaces, the whole bass staff, the grand staff around middle C, and a grand-staff note finder.  |
| 07  | [Events on a community's page](features/07-community-events.md)                          | An Events tab on `/c/$slug` (`?tab=events`). Moderators host, and hosting and cancelling are recorded in the mod log.                 |
| 08  | [See your profile as others see it](features/08-profile-preview.md)                      | `/settings/preview` renders the profile as a signed-out visitor and as a signed-in stranger see it, computed for real.               |
| 09  | [Bug reports on user builds](features/09-build-issues.md)                                | `/builds/$slug/issues`: report an issue, mark "me too", and the creator changes status with a compare-and-set (a stale change gets 409). |
| 10  | [Mute an account for a day, a week or a month](features/10-timed-mutes.md)               | Timed account mutes are filtered when read, so they expire exactly. A daily job only tidies up, and the settings list shows each end date. |
| 11  | [A link to any passage, and posting one](features/11-passage-links.md)                   | A `?p=` code marks and focuses a passage in the library, blog and news readers. "Post this passage" goes to `/share`.                |
| 12  | [Host your events through the developer API](features/12-api-events.md)                 | A new `manage:events` scope to create, edit and cancel events. It shares the site's event-create rate bucket.                        |
| 13  | [Moderate a community through the developer API](features/13-api-moderation.md)          | `manage:moderation`, granted only when chosen by name: the mod queue, decisions and sanctions.                                       |
| 14  | [RMHTube in the developer API](features/14-api-rmhtube.md)                               | Watch-later, watch parties and stats endpoints, with block checks.                                                                   |
| 15  | [Webhook oversight for admins](features/15-admin-webhooks.md)                            | `/admin/webhooks`: 24-hour figures (deliveries, failures, median), redacted URLs, and an audited admin disable and lift.             |
| 16  | [The speedrun review queue](features/16-speedrun-queue.md)                               | `/admin/speedruns`: audited verdicts with a compare-and-set (the second admin is told who decided), reopen, notices to the runner, and a nightly re-verify. |
| 17  | [Community oversight for admins](features/17-admin-communities.md)                       | `/admin/communities`: open reports, quiet moderators and fast growth, plus delist and relist from discovery.                         |
| 18  | [Close the gaps sprints 08 and 09 left open](features/18-race-fixes.md)                 | Six fixes: one claim for the recurring-thread cron and Post now, the handle reclaim block on the profile form, no ghost for an assisted run, the grant dialog, AutoMod in the held hint, and sweep undo. |
| 19  | [Erasure: subscriptions, activity, RSVPs, handles and listings](features/19-erasure-follows.md) | Seventeen tables erased with the account, and counters corrected inside the transaction. The registry goes from 17 `todo` tables to 4. |
| 20  | [Error messages in the reader's language](features/20-error-language.md)                 | Refusals carry a taxonomy code (184 codes) beside the English, and `useRefusalText` renders them from the `errors` namespace.        |

## Fixes made in review

Each feature's reviewer fixed what they found before the merge. These are the fixes that changed behaviour:

- **01:** the card shares the deck's card lock, cloze blanks keep combining marks, and the reading user-text exemption is narrower.
- **02:** the review scan tolerates props split across lines.
- **03:** a paced deck's badges on `/study` are counted in the member's time zone.
- **05:** a text run's WPM is checked against the characters typed and the time taken, and the export key is pinned.
- **06:** the spec's E2 ledger-line count was corrected.
- **10:** the read-path scan holds every mute reader honestly, unmute tolerates a missing row, and the export carries the end date.
- **11:** a book link that names a page the book lacks says so.
- **12:** the event-create budget is shared with the site, and event dates are bounded.
- **13:** the quiet-count ratchet no longer has a comment hook, and a sanction reason is always a string.
- **14:** a member can leave a party whose host they later blocked.
- **15:** a bypass that let the v1 API re-enable an admin-disabled endpoint is closed, URL redaction is tighter, and host search is tighter.
- **16:** a rejection's reason shows only on the runner's own board row, and the public leaderboard never carries `rejectReason`.
- **08:** the user-text exemption is narrower and each view gets a fresh preview.
- **09:** a creator can read the issues of their own private build.
- **17:** a delisted community keeps its RSS feed, and its posts are hidden from hashtag pages.
- **19:** counter decrements are derived inside the transaction.
- **20:** `TextsPage` is locale-formatted, the handle-cooldown snapshot was refreshed, and the guard's rationale is written down.

## Fixes made at integration

- **Media sweep, listing photos (the known bug).** `referencedUrls` now also checks `HomeListing.images`, `EmailCampaign.imageUrls` and `SiteEra.imageUrl`. These are the remaining tables that store `/api/rmharks/image` URLs as plain strings without a `Media` row (`aiImages` is a subset of `images`). There is a test for each exclusion, and the `post` entry in `sweep-surfaces.ts` names them.
- **Erased members' listing photos (coordinator item, confirmed against the code).** Listing photos have no `Media` row: `/api/rmharks/image` calls `ingest` without `record`, and the AI photo is a bare `putObject`. So `deleteMemberListingImageObjects` matched nothing and the photos stayed in storage.
  - It now deletes the member's own `<userId>-…` feed-space objects (and their variants) using the URLs read before the transaction.
  - It skips any URL the sweep's `referencedUrls` still finds.
  - It deletes nothing if that check cannot run, and leaves an object in place if its delete fails.
  - The tests were rewritten to match.
- **Review queue (02 × 03): sounds dropped on new cards.** The pace's never-reviewed query replaced the card select's `deck` and dropped `userId`. As a result, a member's own new cards never carried their sound until the first review. There is now a test that fails without the fix.
- **Hydration (02).** `CardSoundField` decided the Record button while rendering. The server cannot record, so it rendered differently from the browser, causing React error 418 on every deck and deck-edit page. The button is now decided after hydration (`useCanRecordSound`).
- **Bundle budget (20, 11, and an older leak).**
  - The first production build was over budget: critical path 247.1 KB brotli against a 239.9 KB budget, entry 738.6 KB raw against 694.6 KB.
  - **The cause:** the 184-code catalogue plus the client switch (about 44 KB raw) had joined the entry.
  - **Refusal sentences:** they are now a separate module, `refusal-sentence.ts`. The hook loads it on mount and re-renders its callers through an external store. An earlier version used `useState`, which shifted the state ordinals that five characterization suites seed.
  - **Passage links:** the routes' `?p=` helper moved to `passage-search.ts`.
  - **The `/feeds` route:** its `validateSearch` imported `FEEDS_TABS` from `FeedsPage.tsx`, which pulled that page and four panels into the entry. This predates the sprint; the tabs now have their own module.
  - **Result:** critical path 231.2 KB brotli. No budget was raised.
- **Type errors from the first `tsc -b`.**
  - The v1 events `iso()` helper was typed for strings but received the schema's `Date` (12).
  - `reporterCount` returned `undefined` where null was expected (13).
  - The screenshot save result now allows taxonomy codes (20).
  - The speedrun submit map lacked `ALREADY_DECIDED` (16).
  - `guestbookTabVisible` now accepts an optional mode (08).
  - The highlight card's deck link uses the typed `/study/$deckId` route (01).
  - Two test doubles were typed.
- **Gates.**
  - `lint:ratchet` failed on a `lib → components` import from the refusal product test; the test moved to `components/errors/__tests__`.
  - The product suite's explorer check now finds the Moderation and RMHTube docs groups.
  - The FOUC audit visits `/builds/$slug/issues`.
- **Generated files.** The route tree was regenerated by a Vite dev start. `facts.json` and the prepaint bundle were regenerated; prepaint bundles `lib/i18n/config.ts`, which gained the namespaces.
- **i18n.** A clean `i18n:extract` leaves every new namespace's `locales/en` file unchanged, and all 15 are in `NAMESPACES`.
  - 36 RMH Music strings were missing from `c-rmhmusic.json`: the spot-practice, item-name and bass-clef landmark helpers take the caller's `t`, so the parser cannot trace their namespace. They were added there instead of to `common`.
  - A JSDoc in `useRefusalText` was being extracted as an empty `errors:failed` key.
  - The rest of the extract was key-order churn and was not committed.

## Verification

- **Typecheck:** `tsc -b --checkers 1` is clean, cold. It peaks near 14 GB, and a warm incremental run was killed by the out-of-memory killer, so each run deleted `site.tsbuildinfo` first. `pnpm typecheck:strict` is clean.
- **Lint:** `pnpm lint` has 0 errors and 969 warnings; no changed file has more warnings than on origin/main (every changed file compared). `pnpm lint:ratchet` is OK.
- **Tests:** `pnpm test` passed 17,794 (1,551 files). `pnpm test:product` passed 2,381 (160 files).
- **Build:** `pnpm build` passes, and so does `check-bundle-budget`. Final numbers: entry 663.8 / 694.6 KB raw, critical path 880.8 / 911.6 KB raw and 231.2 / 239.9 KB brotli, site CSS 30.6 / 32.0 KB.
- **Generated files:** all seven generated-file `:check` scripts pass.
- **Commit gate:** `pnpm check:consistency --base origin/main` passes on the final head; its `tsc -b` step ran warm after the single-checker run.
- **Postgres 16 smoke:** all checks pass against the real functions.
  - All 477 migrations apply from an empty database.
  - The three new `CONCURRENTLY` indexes are valid: `flashcard_frontSoundUrl_idx`, `flashcard_backSoundUrl_idx` (02) and `user_mute_expiresAt_idx` (10).
  - The only drift is the known pgvector `embedding` table and the trigram / `content_tsv` objects.
  - Concurrency and SQL checks:
    - **04:** 25 concurrent suggestions give 20 created and 5 `member-cap`; a double accept gives one `ok` and one `already-decided`, and the text is applied once.
    - **05:** 10 concurrent saves at 45 texts give 5 saved and 5 `cap`.
    - **02:** 5 concurrent sounded adds at 198 give 2 added; the 3 refused uploads stay `PENDING`.
    - **10:** an expired mute stops hiding at once even from the 30-second cache, and the expiry job removes it (a second run removes 0).
    - **16:** two admins give one verdict, one audit row, and `ALREADY_DECIDED` naming the winner.
    - **09:** a concurrent status change gives 200 and 409.
    - **12:** 6 site plus 4 API creates share the 10-a-minute bucket; the 11th is refused.
    - **18:** Post now racing the cron gives one post and `nextAt` moves on; Post now twice gives no extra post.
    - **17:** reports, growing and detail queries run with the real `content_report`, `rmheet` and `community_member_event` names.
    - **15:** the `percentile_cont … FILTER` figures give 4 deliveries, 1 failed and a 200 ms median, with the window respected.
    - **03:** the pace forecast and new-today SQL work by local day, and the queue serves exactly the remaining 2.
  - **Account deletion end to end (`anonymizeAccount`)** for a member with Sprint 10 data:
    - Follow counters are decremented and floored at 0.
    - Suggestions, texts, "me too" marks (vote count corrected) and the member's own mutes are erased. Others' mutes of the member stay, by design.
    - The member's reported issue stays under "Deleted user", and the card's sound is cleared.
    - A re-run changes nothing.
- **Browser pass** (production build, fresh page per load):
  - 19 surfaces were loaded in Day and Night at 390 and 1280 px, and once in `ar`: 95 loads.
  - Night was re-run with the account's appearance set: 38 loads. 30 site-tier loads carry `style-graphite`; the 8 app-tier loads keep their own look (L8).
  - After the hydration fix, all loads are clean: no console errors, no hydration warnings and no horizontal scroll. The only exception is the environment's missing realtime URL.
  - Exercised by hand:
    - Make a card from a highlight.
    - Review through to "Session finished … Learn 10 more".
    - The suggest-a-fix dialog, and the author's Suggestions tab.
    - The grant dialog: Cancel and Escape grant nothing.
    - Timed mute "until Nov 29, 2026" in the settings list.
    - A `?p=` link paints `rf-passage` and focuses "Linked passage".
    - The grand-staff and bass lessons render.
    - A full-event RSVP in `ar` (the event filled between load and click) shows the coded "This event is full" toast. It reads in English because this build has no `ar` catalogs.

## Owner follow-ups

- S10-07: an invite-only (PRIVATE) community event still writes a public mod-log row "a moderator hosted an event" (no title).
- S10-04: the deck-suggestion duplicate check is not scoped to the suggester, so it reveals that someone has an identical open suggestion. A decline-and-block that loses the decline race skips the block.
- S10-08: `components/settings/RepostMutesSection.tsx` renders member names without `<bdi>`/`dir=auto`. This predates the sprint and is exempted by exact path with that reason.
- S09-12/S10-19: the media sweep's `referencedUrls` omitted `HomeListing.images`, so the PENDING-orphan rule could reclaim live listing photos once the sweep flag is on. **Fixed at integration**, together with `EmailCampaign.imageUrls` and `SiteEra.imageUrl`. The related erasure gap, where an erased member's listing photos were never deleted, is also **fixed** (option 1, by URL); Sprint 11 feature 18 no longer needs to cover it.
- **Found at integration, not fixed:**
  - After an RSVP refusal, the community Events list is not refetched, so it keeps showing "0 going / 1 · Going".
  - `/admin/users` offers the grant button on the "Deleted user" tombstone row (this predates the sprint).
  - The sprint's new strings, including the 165 new `errors` keys, read in English in other locales until the translation workflow runs.
  - The critical path now has about 8.7 KB brotli of headroom, which came from removing the `/feeds` leak. The budget lines could be re-anchored downward if the owner wants that headroom given back.
- Sprint 03–09's open decisions still stand.

## Size

Measured with `git diff --numstat`, excluding generated files (`lib/api/route-table*`, `app/routeTree.gen.ts`, `docs/_generated`, `lib/prepaint/generated.ts`, `docs/site-reference`, `packages/sdk`, `docs/account-deletion.md`).

Measured against the Sprint 09 tip (`e4b4f80ae`) the sprint was built on, so the table is Sprint 10 alone.

| Kind                                                            | Added  | Removed |
| --------------------------------------------------------------- | ------ | ------- |
| Code (TS, TSX, CSS, Prisma, SQL migrations, scripts, snapshots) | 33,266 | 1,605   |
| of which tests                                                  | 11,828 | 60      |
| Documentation                                                   | 11,757 | 7       |
| English catalogs (`locales/en`)                                 | 856    | 5       |

Per feature, code and tests as merged. These come from each `Merge branch 'autonomous/s10-*'` commit, before the integration fixes. Generated files, docs and catalogs are excluded, and the code count includes tests.

| #   | Feature           | Code  | Tests |
| --- | ----------------- | ----- | ----- |
| 01  | highlight-cards   | 1,654 | 537   |
| 02  | card-sound        | 2,838 | 1,232 |
| 03  | study-pace        | 1,454 | 401   |
| 04  | deck-suggestions  | 2,155 | 588   |
| 05  | type-texts        | 2,051 | 629   |
| 06  | bass-clef         | 888   | 372   |
| 07  | community-events  | 730   | 356   |
| 08  | profile-preview   | 1,942 | 779   |
| 09  | build-issues      | 2,891 | 621   |
| 10  | timed-mutes       | 805   | 375   |
| 11  | passage-links     | 705   | 213   |
| 12  | api-events        | 1,379 | 551   |
| 13  | api-moderation    | 1,666 | 788   |
| 14  | api-rmhtube       | 921   | 352   |
| 15  | admin-webhooks    | 1,992 | 760   |
| 16  | speedrun-queue    | 1,113 | 264   |
| 17  | admin-communities | 2,040 | 778   |
| 18  | race-fixes        | 1,656 | 1,170 |
| 19  | erasure-follows   | 492   | 270   |
| 20  | error-language    | 3,407 | 595   |

The features total 32,779 code lines, 11,631 of them tests.
