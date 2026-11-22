# Sprint 09 — summary

Twenty features shipped on `claude/autonomous-sprint-09`, each built from its brief in its own worktree, reviewed by a
fresh reviewer who fixed what they found, and merged wave by wave (plan: [plan.md](plan.md)). This file records what
shipped, what review and integration changed, what was verified, the follow-ups for the owner and the size of the work.

## What shipped

| #   | Feature                                                                                       | In one line                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [Edit a draft or scheduled post](features/01-draft-edit.md)                                   | `/drafts` gets an edit dialog on each row, with stable error codes for a past, published or sealed post.                                 |
| 02  | [Your slow and missed keys in RMHType](features/02-weak-keys.md)                              | Solo and daily runs record per-key statistics; `/rmhtype/progress` shows the worst keys and the key heatmap.                            |
| 03  | [Picture-occlusion flashcards](features/03-occlusion-cards.md)                                | A picture with up to 20 masks, hide-all or hide-one, one card per mask, in the form, review, deck files and the API.                   |
| 04  | [Community wiki pages](features/04-community-wiki.md)                                         | `/c/$slug/wiki` and `/c/$slug/wiki/$page`: read, edit with a conflict check, history; public pages are in the sitemap.                  |
| 05  | [A game guide's history](features/05-guide-history.md)                                        | The guide's author (or an admin) sees its revisions with lengths, a bounded diff and restore.                                           |
| 06  | [Pinned posts in communities](features/06-community-pins.md)                                  | Moderators pin up to three posts under an advisory lock; the author hears once and the mod log records it.                              |
| 07  | [Leaderboard privacy on every board](features/07-board-privacy.md)                            | "Show me on game leaderboards" now covers every ranked list, the RMHBox boards and the Lights Out board included.                       |
| 08  | [Feeds and lists in the developer API](features/08-api-feeds.md)                              | `/api/v1/me/feeds*` and `/api/v1/feeds/{id}/posts`, with list members replaceable through the API.                                      |
| 09  | [Practice in the developer API](features/09-api-practice.md)                                  | `read:practice` and five read-only endpoints (typing, typing daily, typing keys, focus sessions, music practice).                       |
| 10  | [Deletions in the sync APIs](features/10-api-sync-deletions.md)                               | Tombstones for highlights, decks, cards, bookmarks and shelf entries; `/api/v1/me/deleted` pages them over a 90-day window.             |
| 11  | [Scheduled posts through the same gate, once](features/11-scheduled-gate.md)                  | A scheduled community post runs the full community gate (AutoMod included) under the row lock; "Post now" posts once.                  |
| 12  | [Uploads nobody uses, cleaned up safely](features/12-media-sweep.md)                          | A nightly media sweep and a weekly clip sweep, off behind a flag, with `/admin/media-sweep` to preview and run them.                    |
| 13  | [Reclaims that wait for the worker](features/13-durable-reclaims.md)                          | Bulk, fan-out and spam-sweep reclaims count only attempts that started, and stop after a day with no worker.                           |
| 14  | [A deletion request stops everything at once](features/14-deletion-pause.md)                  | Sessions, keys, webhooks, tokens and due drafts pause at the request; signing back in restores what the hold paused.                    |
| 15  | [Erasure: private tools, lists and study data](features/15-erasure-lists.md)                  | 18 more private tables erased at anonymisation (`TODO_CEILING` 43 → 25).                                                                |
| 16  | [Erasure: ratings, puzzle boards and names in match records](features/16-erasure-boards.md)   | Eight board tables erased (25 → 17); names and avatars scrubbed from match JSON; after-erasure steps retry as a job; three indexes.     |
| 17  | [Game assists in Neon Driftway and Laundry Sort](features/17-driftway-laundry-assists.md)      | The assists apply in both games; an assisted run is unranked, and Laundry Sort gains an untimed round.                                 |
| 18  | [Save and share a Lights Out solve](features/18-lights-out-replays.md)                        | Save a verified solve, post it, and see the day's fewest-moves list; the board now ranks fewest moves first.                           |
| 19  | [System notices in the reader's language](features/19-notice-language.md)                     | Site-written `SYSTEM` notices store a key and params; the inbox renders them in the reader's language and dates.                       |
| 20  | [Text that reads right in any direction](features/20-text-direction.md)                       | Member-written text gets `dir="auto"` or `<bdi>` in posts, comments, messages, profiles and the other places members write.            |

## Fixes made in review

Each feature's reviewer fixed what they found before the merge. The ones that changed behaviour:

- 01: errors for a past, published or sealed post are stable codes, not matched server wording.
- 05: the history diff is bounded (it could exhaust memory on a long rewrite) and its read-path scan requires the
  access-checked import.
- 06: the pins file left read-path registries it only satisfied by a comment; a pin on a deleted or held post is
  ignored and frees its slot.
- 07: the contributors cache key is versioned (a pre-deploy entry would have shown hidden members), and the "via"
  delegation rule requires real use.
- 09: the focus-session `summary` is optional in the SDK; generated docs regenerated.
- 10: the bulk bookmark clear writes tombstones, with a test.
- 11: a refused draft is re-gated with a 15-minute back-off rather than on every pass; banned authors are told; the
  scheduled-path enforcement scan strips comments and requires a real call.
- 12: uploads still named by live posts, announcements and chat are kept; each batch is re-checked before deleting; a
  pending upload past the sweep's age can no longer be attached.
- 13: settling a sweep never confirms another moderator's removal; dead fan-out reclaim code and strings removed.
- 14: a failed restore is retried on sign-in, and the pause is undone if scheduling the deletion fails.
- 15: a private persona that other members chatted with is kept, so their chats survive its owner's erasure.
- 16: the match JSON scrubs clear `avatarUrl` with the name.
- 17: the assisted branch of the Laundry Sort score route is tested, and the honoured-settings map is held coherent.
- 19: more notices keyed (watched items, build releases, event date changes); a refreshed notice clears a stale key;
  the remaining English-only helpers are named in the ratchet.
- 20: seven weak exemptions became real listings, the scan was widened (raw textareas, bare children), and the shared
  `Textarea` defaults to `dir="auto"`.

## Fixes made at integration

- **Notice language (19), two runtime bugs.** Locking a poll that has a group chat threw a ReferenceError after the
  lock was claimed, so the chat line and result never arrived. The party invite passed a notice object as the `preview`
  column; Prisma rejected it and a swallowed error meant offline invitees got no row.
- **Media sweep (12).** The sweep named the posts table `rmhark` instead of Prisma's `rMHark`, hidden by a cast, so
  every sweep, preview and "Run now" would have thrown against Postgres. `mediaSweepDeps` now names each table so a wrong
  name fails `tsc`, and a test runs a preview through the real deps.
- **Browser pass.** `/rmhtype/progress` scrolled sideways at 390 px (the heatmap's hidden labels escaped its scroll
  box); occlusion mask labels were about 56 px wide inside a deck row.
- **Sprint-branch gates fixed during the merges.** The content-warning and quiet-count scans classified the spam sweep
  (with reasons); the wiki draft store moved onto `lib/core/persist`; the device-registry scan now sees persist-helper
  writes, which also registered Studio's `rmh-studio-cloud-links:` key, never listed before; the export, sitemap and
  game-progress tests learned the sprint's new models; the deletion doc was regenerated after two registry edits met.
- **Developer explorer.** The feeds and practice groups link to their docs pages.
- **FOUC audit.** The wiki and guide-history routes have not-found fixtures.
- **Generated files.** Route tree, `facts.json`, the site API reference and the prepaint bundle regenerated.
- **Typecheck after the merges.** Test doubles typed against the merged code; the replay "Post it" link passes the
  `/share` route's `pending` parameter; four older suites gained the reads the sprint added.
- A clean `i18n:extract` leaves every new namespace's `locales/en` file unchanged; all 14 namespaces are in `NAMESPACES`.

## Verification

- `tsc -b --checkers 1`: clean. `pnpm typecheck:strict`: clean.
- `pnpm lint`: 0 errors and no new warnings against origin/main (every changed file compared). `pnpm lint:ratchet`: OK.
- `pnpm test`: 16,535 passed (17,719 with the translated catalogs pulled). `pnpm test:product`: 2,209 passed.
- `pnpm build` and the bundle budget pass: critical path 238.6 / 239.9 KB, site CSS 30.5 / 32.0 KB.
- All seven generated-file `:check` scripts pass. `pnpm check:consistency --base origin/main` passes on the final
  head; on a cold run its default-checker `tsc -b` step is killed at the 15 GB memory limit, as in Sprint 08, and the
  single-checker run above covers it.
- **Postgres 16 smoke.** All 458 migrations apply from empty; the three `CONCURRENTLY` indexes from 16 are valid; the
  only drift is the pre-existing pgvector and trigram objects. 37 of 37 checks against the real functions pass,
  including: the match-JSON scrubs (only the member, order kept, re-run a no-op); reclaim compare-and-set (two
  reclaimers count once, no attempt counts nothing, a day with no worker fails); two concurrent pins at 2 of 3 give one
  pin and one `pin_limit`; three racing publishers make one post and "Post now" twice posts once; a media-sweep dry run
  deletes nothing and keeps a scheduled post's pending picture; deletion pause and restore lift only what the hold
  paused; `/me/deleted` pages 8 tombstones over 3 pages once each with 410 past 90 days; the Lights Out seeded board
  ranks fewest moves first; `anonymizeAccount` completes end to end and is a no-op on a re-run.
- **Browser pass** (production build): 20 routes in Day and Night at 390 and 1280 px and in `ar` (100 loads), no
  horizontal scroll and no hydration warnings after the fixes, and every new surface exercised (drafts edit, RMHType
  keys, occlusion editing and review, wiki, guide history, pins, deletion preview, the admin jobs and media-sweep pages,
  the keyed inbox in `ar`, mixed-direction text, both assisted games, a Lights Out solve saved and listed).

## Owner follow-ups

- **Scheduled posts (11).** The developer API's listing hint checks sanctions and image descriptions but not AutoMod. A
  recurring-thread cron firing at the same instant as "Post now" could still post twice.
- **Ghosts (17).** `/api/replays/ghost` has no server-side assisted check; ghosts are visible only to their owner.
- **Media sweep (12).** It stays off until the `media-sweep` flag is created in `/admin/flags` after reading a preview.
  The `imageUrls` reference checks have no GIN index (a scan per 500-candidate chunk, nightly only); scheduled runs are
  logged, not audited (no system actor); resized copies of pre-Sprint 09 uploads stay in storage.
- **Spam sweep (13).** A failed sweep holding only pending item rows refuses undo until it is next settled.
- **Erasure (14, 15).** A private persona kept because others chatted with it stays as an unreachable row with its
  prompt. Restore lifts a suspended key by the hold's ids plus the reason text, so an admin re-suspending with that exact
  text would be lifted.
- **Lights Out (18).** The seeded board filters inside the replay JSON (about 20 ms per 20k rows); a seed column or
  expression index if replays grow. The fewest-moves list refetches within 30 s rather than on save.
- **Notice language (19).** Notices passed through helpers stay English (ladder alerts, admin review, moderation
  triage, API-key suspension, developer recipes), named in the ratchet so the list only shrinks; notices quoting member
  text stay mixed.
- **Found at integration, not fixed.** Laundry Sort's leaderboard panel sends and cancels about ten requests on load
  (unchanged by the sprint). The sprint's new strings read English in other locales until the translation workflow runs.
- Sprint 03–08's open decisions still stand.

## Size

Measured with `git diff --numstat origin/main` over the sprint branch, excluding generated files (`lib/api/route-table*`,
`app/routeTree.gen.ts`, `docs/_generated`, `lib/prepaint/generated.ts`, `docs/site-reference`, `packages/sdk`,
`docs/account-deletion.md`).

| Kind                                                            | Added  | Removed |
| --------------------------------------------------------------- | ------ | ------- |
| Code (TS, TSX, CSS, Prisma, SQL migrations, scripts, snapshots) | 25,366 | 1,734   |
| of which tests                                                  | 11,031 | 223     |
| Documentation                                                   | 10,366 | 28      |
| English catalogs (`locales/en`)                                 | 489    | 3       |

Per feature, code and tests as merged (from each `Merge branch 'autonomous/s09-*'` commit, before the integration fixes;
generated files, docs and catalogs excluded; code includes tests):

| #   | Feature                  | Code  | Tests |
| --- | ------------------------ | ----- | ----- |
| 01  | draft-edit               | 794   | 250   |
| 02  | weak-keys                | 762   | 186   |
| 03  | occlusion-cards          | 3,157 | 1,640 |
| 04  | community-wiki           | 2,073 | 620   |
| 05  | guide-history            | 1,173 | 264   |
| 06  | community-pins           | 1,507 | 673   |
| 07  | board-privacy            | 1,007 | 621   |
| 08  | api-feeds                | 1,024 | 406   |
| 09  | api-practice             | 958   | 372   |
| 10  | api-sync-deletions       | 1,015 | 587   |
| 11  | scheduled-gate           | 954   | 681   |
| 12  | media-sweep              | 2,028 | 874   |
| 13  | durable-reclaims         | 1,272 | 905   |
| 14  | deletion-pause           | 1,025 | 570   |
| 15  | erasure-lists            | 215   | 113   |
| 16  | erasure-boards           | 694   | 291   |
| 17  | driftway-laundry-assists | 1,487 | 697   |
| 18  | lights-out-replays       | 487   | 250   |
| 19  | notice-language          | 2,760 | 634   |
| 20  | text-direction           | 701   | 224   |

The features total 25,093 code lines, 10,858 of them tests.
