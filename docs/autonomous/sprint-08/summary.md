# Sprint 08 — summary

Twenty features shipped on `claude/autonomous-sprint-08`, each built from its brief in its own worktree, reviewed by a
fresh reviewer who fixed what they found, and merged wave by wave (plan: [plan.md](plan.md)). This file records what
shipped, what review and integration changed, what was verified, the follow-ups for the owner and the size of the work.

## What shipped

| #   | Feature                                                                                      | In one line                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [RMHTube watch statistics that count](features/01-rmhtube-stats.md)                          | The RMHTube hub samples rooms and flushes watch time, videos, rooms and messages into `RmhTubeUserStats` and a per-day table; members see, pause and clear them, and deletion erases them. |
| 02  | [Tournaments in the developer API](features/02-api-tournaments.md)                           | `/api/v1/tournaments*` lists, reads, checks in and claims, confirms or withdraws results through the site's own rules; a prize-deciding confirm is refused (`409 confirm_on_site`).        |
| 03  | [Drafts and scheduled posts in the developer API](features/03-api-scheduled.md)              | `/api/v1/me/scheduled*` creates, edits, lists and publishes drafts and scheduled posts, with `media_ids`, through the site's create and publish paths and the full community gate.         |
| 04  | [Lint on the notes, and a minimap of the whole song](features/04-chart-overview.md)          | The Slice It editor rings the notes the chart checks flag, steps through the issues, and shows a minimap of the whole song.                                                                 |
| 05  | [Fan-outs that finish after a restart](features/05-durable-fanouts.md)                       | Community post alerts and event updates run as `FanoutRun` rows with a lease, a cursor and a per-minute reclaim, so a worker restart no longer loses members.                               |
| 06  | [Game assists in Dream Rift and Nightrail](features/06-more-game-assists.md)                 | The five game assists apply in Dream Rift and Nightrail; an assisted seeded daily is kept off the board, and co-op applies only the local visual assists.                                  |
| 07  | [Move through the feed with the keyboard](features/07-feed-keyboard.md)                      | `j`/`k`/`o` and the post keys work on every post list, under the existing On / Off / With Alt setting, and `?` lists them.                                                                 |
| 08  | [Developer API oversight for admins](features/08-admin-api-oversight.md)                     | `/admin/api-keys` lists keys, suspends them with a reason and caps their rate; a suspended key answers `key_suspended`, and its owner sees why.                                             |
| 09  | [Recurring community threads](features/09-recurring-threads.md)                              | Moderators schedule weekly or monthly threads that pass `prepareCommunityPost` at fire time; an erased author's templates pass to the owner, paused.                                       |
| 10  | [Scales and key signatures in RMH Music](features/10-music-scales.md)                        | A Scales and keys unit: play major and natural minor scales, and name major and minor keys from their signatures.                                                                          |
| 11  | [Race your own best in RMHType](features/11-type-ghost.md)                                   | Solo races can show a ghost caret replaying your best run on the passage.                                                                                                                  |
| 12  | [Webhooks for your builds, events, reading and tournaments](features/12-webhook-activity.md) | Four new events: `build.released`, `event.rsvp_changed`, `reading.finished` / `highlight.created` and `tournament.match_settled`.                                                           |
| 13  | [What each game supports, on its page and in the library](features/13-game-access-info.md)   | Game pages gain "Playing this game" (controls, players, accessibility, content), and the library filters by input and access options.                                                      |
| 14  | [Search in the developer API](features/14-api-search.md)                                     | `/api/v1/search/posts` and `/people` give lexical keyword search under the site's visibility rules.                                                                                        |
| 15  | [Pictures on flashcards](features/15-card-images.md)                                         | A described picture on either side of a card, in the form, review, decks and the API; copies share the object, which is reference-counted.                                                 |
| 16  | [Brackets you can read as a list](features/16-bracket-list.md)                               | Single- and double-elimination brackets get a Rounds view, the default on narrow screens.                                                                                                  |
| 17  | [RSS for communities, build releases and game updates](features/17-rss-feeds.md)             | `/c/{slug}/rss.xml`, `/builds/{slug}/rss.xml` and `/games/{id}/updates/rss.xml`, with links and `rel=alternate`; private communities and unlisted builds are 404.                          |
| 18  | [Remove a spam account's recent content in one step](features/18-admin-spam-sweep.md)        | `/admin/sweeps`: preview, a durable leased run and undo of a member's posts and replies in a window, with an optional strike and an audit trail.                                           |
| 19  | [Erasure: profile extras, private tools and app data](features/19-erasure-private.md)        | 27 more tables erased at anonymisation, and the pronunciation clip deleted at the deletion request (`TODO_CEILING` 95 → 68).                                                               |
| 20  | [Erasure: game progress and saves, board by board](features/20-erasure-games.md)             | Per-game progress erased or reset board by board; match-player name copies and the RMHBox results snapshot renamed (`TODO_CEILING` 68 → 43).                                               |

## Fixes made in review

Each feature's reviewer fixed what they found before the merge. The ones that changed behaviour:

- 01: a member in two rooms is counted once per sample; held deltas and stale maps are bounded.
- 02: the tournament prize race is closed under the match lock.
- 03: the scheduled post's media claim and the SDK nullability were fixed.
- 04: the minimap's playhead moves by transform, and the canvas redraws only when the chart, lint result or width changes.
- 05: "already told" on resume matches the post or update link, not the shared community or event id.
- 06: the assist claim settles after the first Dream Rift submit, and the player is told an assisted daily is off the board.
- 07: the post keys stay off pending (optimistic) and deleted posts, which would have sent a temporary id to the API.
- 09: the scheduler's next-run column was renamed `nextThreadAt` to pass the occurrence read-path scan.
- 10: the on-screen keys show for scales the computer keys cannot reach.
- 11: the migration was completed (it held only comments); the save module is safe for the hub to load.
- 15: the claim re-checks the flashcard policy; indexes support reference counting; deck updates say "Picture changed".
- 16: the match time field's id is scoped per panel, so the two views never repeat an id.
- 17: XML-illegal control characters are stripped; the GIF exemption that only passed by naming a field in a comment was
  removed; the games feed route is out of the `/games` layout.
- 18: removed posts are published on their own feed channels, so open feeds drop them; the refusal strings got keys.
- 19: a failed pronunciation clip removal is logged and does not stop the deletion.
- 20: the erased member is renamed inside the `RMHboxMatch.results` snapshots other players read.

## Fixes made at integration

- **Media sweep.** `sweepUnreferencedMedia` (still not wired to a job) drops any candidate whose URL is still named by an
  unpublished `ScheduledPost`, a flashcard side, or a build screenshot or cover, checked in chunks of 500, with a test
  per exclusion.
- **Slice It editor (04).** `Timeline` read the open difficulty below the line that declared it and threw on first
  render.
- **RMH Music (10).** `KeySignatureLesson` left the hint line's key unset while a question was open.
- **Scheduled API (03).** The audience type is the column's enum, since a site-scheduled post can be for SUPPORTERS or a
  CIRCLE.
- **RSS 404s.** `throw notFound()` inside a server handler answers 500 in the production build. The three new feeds,
  and the profile feed, tag feed and `sitemaps/$name` beside them, now return a plain 404.
- **Erasure (20).** The snapshot scrub keeps the rankings in position order (`WITH ORDINALITY`).
- **Spam sweep (18).** The refusal keys name their namespace, so the extractor no longer files them in `common.json`.
- **Registry and ratchet entries, each with its reason:**
  - the sweep preview in the content-warning read-path registry, because only the admin removing the posts sees them;
  - the sweep's reply tally in the quiet-count ratchet, because it counts nothing on any post;
  - the RMHTube stats recorder's two hub timers in the scheduler ratchet, because they sample in-memory room state
    that only the hub process holds.
- **Other gates.**
  - The developer explorer links the tournaments, scheduled and search pages.
  - The FOUC audit lists the RSS routes as non-documents.
  - One new eslint warning, an unused import, was removed.
- **Typecheck after the merges.** Five test doubles were typed against the merged code.
- **Main's repository-wide prettier reformat.** Merged in, with the 75 conflicting files taken from the sprint and every
  sprint-touched file formatted with the new `.prettierrc.json`; generated files regenerated.

## Verification

- **Types.** `tsc -b --checkers 1` is clean, before and after merging main, and `pnpm typecheck:strict` is clean.
- **Lint.** `pnpm lint` has 0 errors and no new warnings against main; `pnpm lint:ratchet` passes.
- **Tests and build.**
  - `pnpm test` before merging main: 15,886 passed.
  - `pnpm test:product`: 2,073 passed.
  - `pnpm build` and the bundle budget pass: critical path 236.6 / 239.9 KB, site CSS 30.3 / 32.0 KB.
- **Commit gate.** Every step of `pnpm check:consistency --base origin/main` passes except its `tsc -b` step. That step
  runs with the default checkers and is killed at about 13.6 GB on this machine (exit 3, "incomplete"). The
  single-checker run above covers it.
- **Postgres 16 smoke.**
  - All 444 migrations apply from an empty database. Both `CONCURRENTLY` indexes are valid, and the only drift is the
    pgvector and trigram objects that predate the sprint.
  - 18 of 18 checks against the real functions pass:
    - concurrent and killed fan-out runners send exactly 1,200, none twice;
    - three concurrent spam-sweep runners remove 42 items once each, and undo restores them;
    - stale leases are reclaimed under compare-and-set;
    - the snapshot scrub renames only the member, in order;
    - `anonymizeAccount` completes end to end and is a no-op on a re-run.
- **RSS.**
  - The three feeds answer 200 with `application/rss+xml`.
  - A private community, an unlisted build, an unknown community and a non-game answer 404.
- **Browser pass.**
  - Coverage: 21 new and changed surfaces in Day and Night at 390 and 1280 px, and in `ar` at 390 px (105 page loads).
  - No horizontal scroll, and no hydration warnings except the existing `/developer` badge snippets.
  - In the feed, `j`/`k` move focus between posts and `?` opens the overlay.

## Owner follow-ups

- **Media sweep.** It is still not run by any job. Sprint 09 feature 12 wires it, off behind a flag.
- **Reclaim counting (05, 18, and bulk).** A cron tick while a lease is expired counts another reclaim. About five
  minutes of jobs-worker outage can fail a run that never started (Sprint 09 feature 13).
- **Scheduled community posts (09, 03).**
  - Scheduled community posts made on the site skip AutoMod at publish.
  - A double "Post now" posts twice.

  Sprint 09 feature 11 fixes both.
- **Spam sweep (18).**
  - A worker crash between removing an item and writing its item row leaves that removal unrecorded, so undo misses it.
  - The 10-per-hour confirm cap is counted under the per-subject lock, so it is slightly soft across subjects.
- **Card pictures (15).**
  - The shared-picture update doesn't re-read the source card under the URL lock.
  - Per-card URL locks are taken unsorted, so Postgres aborts one of two deadlocking requests.
  - An animated WebP from the post upload surface passes the claim.
- **Erasure (19, 20).**
  - A pronunciation clip whose storage delete keeps failing is orphaned.
  - `RMHboxMatch.gameLog`, free-form JSON shown only to participants, may carry names.
  - `CallMute.mutedUserId`, `SliceDailyEntry` and `SongPlay` have no index leading on the member's id, so each
    deletion scans them once.
  - The anonymous tallies (`Stamp.addCount`, song plays, Connections) are not corrected.
  - The snapshot scrub runs after the deletion transaction and is logged, not retried, on failure.
- **Feed keys (07).** A member who remapped a site shortcut onto a feed key loses that feed key, because the site
  binding wins. The overflow menu's saved state can lag after `s`.
- **Found at integration, not fixed.**
  - The `/developer` badge snippets mismatch on hydration off-production; this predates the sprint.
  - Future bracket slots read "bye" while still waiting for players.
  - Not exercised in the browser: the spam-sweep preview flow and the Studio picture upload.
- **Scheduler ratchet.** One row was added for the RMHTube stats timers, with its reason, to a list whose header says
  entries only come out. The owner may prefer another shape.
- Sprint 03–07's open decisions still stand.

## Size

Measured with `git diff --numstat origin/main` over the sprint branch, before main's reformat was merged, excluding
generated files (`lib/api/route-table*`, `app/routeTree.gen.ts`, `docs/_generated`, `lib/prepaint/generated.ts`,
`docs/site-reference`, `packages/sdk`, `docs/account-deletion.md`).

| Kind                                                            | Added  | Removed |
| --------------------------------------------------------------- | ------ | ------- |
| Code (TS, TSX, CSS, Prisma, SQL migrations, scripts, snapshots) | 58,046 | 1,378   |
| of which tests                                                  | 26,058 | 398     |
| Documentation                                                   | 12,292 | 9       |
| English catalogs (`locales/en`)                                 | 446    | 1       |

Per feature, code and tests as merged (from each `Merge branch 'autonomous/s08-*'` commit, before the integration fixes;
generated files, docs and catalogs excluded; code includes tests):

| #   | Feature             | Code  | Tests |
| --- | ------------------- | ----- | ----- |
| 01  | rmhtube-stats       | 5,615 | 2,871 |
| 02  | api-tournaments     | 5,894 | 2,995 |
| 03  | api-scheduled       | 2,029 | 730   |
| 04  | chart-overview      | 2,723 | 860   |
| 05  | durable-fanouts     | 2,975 | 1,809 |
| 06  | more-game-assists   | 1,774 | 626   |
| 07  | feed-keyboard       | 2,636 | 1,725 |
| 08  | admin-api-oversight | 4,878 | 1,872 |
| 09  | recurring-threads   | 6,868 | 2,773 |
| 10  | music-scales        | 6,017 | 2,753 |
| 11  | type-ghost          | 899   | 319   |
| 12  | webhook-activity    | 621   | 294   |
| 13  | game-access-info    | 2,521 | 1,017 |
| 14  | api-search          | 2,451 | 1,328 |
| 15  | card-images         | 2,573 | 649   |
| 16  | bracket-list        | 831   | 243   |
| 17  | rss-feeds           | 850   | 394   |
| 18  | admin-spam-sweep    | 3,256 | 1,124 |
| 19  | erasure-private     | 1,075 | 719   |
| 20  | erasure-games       | 1,036 | 645   |

The features total 57,522 code lines, 25,746 of them tests.
