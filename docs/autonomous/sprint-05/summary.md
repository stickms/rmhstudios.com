# Sprint 05 — summary

Twenty features shipped on `claude/autonomous-sprint-05`, each built from its
brief in its own worktree, reviewed by a fresh reviewer who fixed what they
found, and merged wave by wave (plan: [plan.md](plan.md)). This file records
what shipped, what review and integration changed, what was verified, the
follow-ups for the owner and the size of the work.

## What shipped

| #   | Feature                                                              | In one line                                                                                                                                                                       |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [Leaderboard privacy](features/01-leaderboard-privacy.md)            | Members can keep playing off every public game board (Settings > Privacy); banned members drop off, and account deletion erases their scores from all twelve player tables.       |
| 02  | [Background jobs console](features/02-admin-jobs.md)                 | `/admin/jobs`: every pg-boss queue's health, a failed job's error, and retry or cancel, each action atomic and audited in one transaction.                                        |
| 03  | [Outbox dead letters](features/03-admin-outbox.md)                   | `/admin/outbox`: outbox events that gave up, why, and re-send once the cause is fixed, with the redelivery risk recorded.                                                         |
| 04  | [Personal best history](features/04-personal-bests.md)               | `submitGameScore` records each new personal best; the game page shows "Your bests" with when and by how much; the history is in the export.                                      |
| 05  | [Event co-hosts](features/05-event-cohosts.md)                       | Hosts invite co-hosts who accept or decline, then edit the event and run its guest list and waitlist through one rights check; erasure and export cover the role.                 |
| 06  | [Studio projects](features/06-studio-projects.md)                    | RMH Studio gains a Projects menu: local autosave, Open, and revision-checked account sync of the project JSON, with a conflict dialog and a list of missing samples.              |
| 07  | [Turn off reposts](features/07-repost-mutes.md)                      | Keep someone's posts and drop their reposts from the timeline, from the post menu or Settings > Content; the list is exported.                                                   |
| 08  | [Double-elimination tournaments](features/08-double-elimination.md)  | The reserved `DOUBLE_ELIM` format is implemented: winners and losers brackets, grand final, settlement and the bracket view.                                                      |
| 09  | [Reversible and cloze flashcards](features/09-flashcard-types.md)    | Two new card types with generated siblings, a type editor, cloze preview and masked review; import, export and clone handle them.                                                |
| 10  | [Admin lookup](features/10-admin-lookup.md)                          | `/admin/lookup` and a field on the admin hub say what a pasted id, handle, e-mail address or link is, its state, and which tools act on it.                                       |
| 11  | [Locale formatting](features/11-locale-formatting.md)                | Dates, numbers and relative times follow the reader's locale; components that render dates during SSR take the locale from the hook, so server and client agree.                 |
| 12  | [Queue a playlist in RMHTube](features/12-rmhtube-playlist-queue.md) | A host queues a saved playlist in one step and saves the room's queue as a playlist; permission is re-checked after the playlist read.                                           |
| 13  | [Saved replies](features/13-saved-replies.md)                        | DM and group composers offer a member's saved replies from a keyboard-operable listbox; erasure and export cover them.                                                           |
| 14  | [Blocked and muted accounts](features/14-blocked-muted-accounts.md)  | `/settings/blocked` lists everyone blocked or muted with the date, unblock and unmute in place; the lists are erased with the account.                                            |
| 15  | [Game jam teams](features/15-jam-teams.md)                           | Entrants list teammates who accept or decline; teammates are credited and cannot rate their own entry.                                                                           |
| 16  | [Describe images after posting](features/16-alt-text-editing.md)     | Edit image descriptions on your own posts from the post menu, and find every image still lacking one in Settings > Content.                                                      |
| 17  | [Community post alerts](features/17-community-post-alerts.md)        | Opt-in alerts for chosen communities, sent from a pg-boss queue on posting and on mod-queue approval; the choices are exported.                                                  |
| 18  | [Tournament seeding](features/18-tournament-seeding.md)              | Seed by rating (ranked games only), at random or by hand instead of sign-up order.                                                                                               |
| 19  | [Pin up to three posts](features/19-profile-pins.md)                 | A profile pins up to three posts in the member's order, on the site and the developer API; a report takedown unpins.                                                             |
| 20  | [Flashcard review reminders](features/20-flashcard-reminders.md)     | An opt-in daily reminder at a chosen time, sent only on days cards are due, from a per-minute cron in the `jobs` worker.                                                          |

## Fixes made in review

Each feature's reviewer fixed what they found before the merge. The ones that
changed behaviour:

- 04, 05, 13, 14, 15, 17: their new data was wired into the account export.
- 07: the item is offered on a repost of your own post, and a repost of a
  deleted post (the tombstone) is refused.
- 09: the export carries authored cards only, progress resumes over reviewable
  rows, and CSV quotes inside cloze deletions survive.
- 10: the admin audit log is indexed by `targetId`.
- 12: per-item Add to playlist sends milliseconds (queue durations are
  seconds); host and member-queue permission is re-checked after the playlist
  read.
- 13: the composer listbox got `aria-activedescendant`.
- 14: focus stays in the list after a removal and the count is announced.
- 15: accepting a team place says that it drops the member's rating.
- 16: expired posts are refused, the image list is updated by compare-and-set,
  and the SQL blank test matches the JavaScript trim (including NBSP).
- 18: rating seeding is refused for unranked games (400 `RATING_UNAVAILABLE`)
  and disabled in the UI.
- 19: a report takedown unpins the post; superseded feed pin strings were
  dropped.
- 20: never-reviewed cards count as due like the deck page, banned members are
  skipped, the setting is exported, and a reminder-reset failure is tested.

## Fixes made at integration

- **Export.** `exportStudioProjects` (06) was never wired into the account
  export; it is, with `lib/account/__tests__/export-studio-projects.test.ts`.
- **Typecheck.** Regenerated the route tree; restored `// @ts-nocheck` as the
  first line of two `components/velum2099/game/` files the locale codemod had
  moved; fixed the blocked/muted query contract (parsed type), a `UserAvatar`
  src, a Button variant, a test fake's duplicate id and a hub test cast.
- **useEffect + fetch ratchet.** Nine new files: the post-alerts control and the
  RMHTube playlist picker read through React Query; the co-host and teammate
  pickers share a debounced React Query search (`hooks/useMemberSearch.ts`); the
  rest adjust state while rendering or focus through a stable callback ref.
- **Micro-cache.** The leaderboard switch and its cache invalidation moved to
  `lib/game/leaderboard-privacy-settings.server.ts`, so the public boards keep
  their micro-cache and read the hidden set through its 60 s cache.
- **iOS edge contract and arrival coverage.** The Studio dialogs use the shared
  `DialogOverlay` instead of their own fixed `inset-0` layer; the job and outbox
  detail dialogs fade their details in (M9).
- **Allowlists.** Two grew by one entry each, with a reason: the admin-only
  lookup reads a Log by slug to say "draft" (`blog-published-filter`) and a
  moderator note's subject, never its text (`moderator-notes-erasure`).
- **Tests and generated files.** Tests updated for intended changes (pin rows
  in `PinMenuItems`, `ProfileColumn` state ordinals, Prisma mocks for co-host
  and hidden-set reads); a per-call interpolation option the i18n runtime does
  not implement was dropped; the prepaint script, facts and generated docs were
  regenerated.

## Verification

- `tsc -b`: clean.
- `pnpm test`: 14,411 passed. `pnpm test:product`: 1,405 passed.
- `pnpm build` and the bundle budget: pass.
- Postgres smoke against a migrated throwaway database (the three
  `CONCURRENTLY` indexes valid, no schema drift, the post-alerts recipient
  rules, the pg-boss console against a real pg-boss schema), and a browser pass
  over 13 new and changed routes in Day and Night at 390 and 1280 px and in
  `ar`, with no hydration warnings.

## Owner follow-ups

- **Admin lookup and access logs.** An e-mail address searched with
  `GET /admin/lookup?q=` lands in access logs and browser history.
- **Post alerts.** Delivery is at-most-once if the worker is hard-killed
  mid-send; the retry notice reads "New posts in X".
- **Locale formatting.** About 35 sites that hardcoded `en-US` now follow the
  reader's locale; non-React formatters still read `currentDocumentLocale()`.
- **Jobs console.** Its counts lag pg-boss's own stats.
- **Erasure.** A deleted member's follows, game reviews and jam entries, and
  Studio samples staying on the device, remain open (see the README's rejected
  ideas).
- **Allowlists.** Two grew by one entry each (above).
- **Moderator notes in the data export** remain excluded and open.
- Sprint 03 and 04's open decisions still stand.

## Size

Measured with `git diff --numstat origin/main` over the sprint branch,
excluding generated files (`lib/api/route-table*`, `app/routeTree.gen.ts`,
`docs/_generated`, `lib/prepaint/generated.ts`).

| Kind                                                 | Added  | Removed |
| ---------------------------------------------------- | ------ | ------- |
| Code (TS, TSX, CSS, Prisma, SQL migrations, scripts) | 53,313 | 2,409   |
| of which tests                                       | 23,515 | —       |
| Documentation                                        | 10,075 | 0       |
| English catalogs (`locales/en`)                      | 690    | 7       |

Per feature, code and tests as merged (from each `Merge branch
'autonomous/s05-*'` commit, before the integration fixes; generated files,
docs and catalogs excluded):

| #   | Feature                | Code  | Tests |
| --- | ---------------------- | ----- | ----- |
| 01  | leaderboard-privacy    | 559   | 504   |
| 02  | admin-jobs             | 3,273 | 2,055 |
| 03  | admin-outbox           | 2,763 | 2,102 |
| 04  | personal-bests         | 1,335 | 1,660 |
| 05  | event-cohosts          | 1,159 | 660   |
| 06  | studio-projects        | 1,930 | 722   |
| 07  | repost-mutes           | 1,092 | 907   |
| 08  | double-elimination     | 438   | 602   |
| 09  | flashcard-types        | 1,542 | 1,212 |
| 10  | admin-lookup           | 3,267 | 1,917 |
| 11  | locale-formatting      | 1,392 | 969   |
| 12  | rmhtube-playlist-queue | 929   | 412   |
| 13  | saved-replies          | 1,234 | 476   |
| 14  | blocked-muted-accounts | 1,251 | 471   |
| 15  | jam-teams              | 1,271 | 936   |
| 16  | alt-text-editing       | 1,882 | 1,938 |
| 17  | community-post-alerts  | 1,406 | 2,192 |
| 18  | tournament-seeding     | 841   | 674   |
| 19  | profile-pins           | 1,578 | 2,543 |
| 20  | flashcard-reminders    | 568   | 554   |
