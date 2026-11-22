# Sprint 09 — implementation plan

How the twenty features are built: seven waves of at most three concurrent implementers, each in its own git worktree
and branch, merged into the sprint branch `claude/autonomous-sprint-09` by one integration owner between waves. The
machine budget and per-feature checks are sprint 08's, restated so this file stands alone, with the lessons sprint 08's
implementers and integration recorded folded into the briefs.

## Precondition: sprint 08 is in the sprint branch

`claude/autonomous-sprint-09` is cut from the sprint 08 branch tip (`claude/autonomous-sprint-08`, which holds sprints
1–8) once sprint 08 has finished integrating, or from `origin/main` if sprint 08 has landed there by then (then
`git merge origin/main` again when it lands; the content is identical). Wave 0 is committed on top of that. Wave 1 does
not start before, because:

- the Wave 0 anchors go **after** sprint 08's anchor blocks in `lib/account/deletion.server.ts`,
  `prisma/schema/auth.prisma`, `lib/sitemap.ts`, `server/jobs/index.ts`, `components/feed/notification-labels.ts` (and
  its test), `app/routes/_site/admin/index.tsx`, `lib/api/registry.ts`, `lib/api/scopes.ts`, `scripts/generate-sdk.ts`,
  `docs/developer-api/changelog.md` and `lib/i18n/config.ts`;
- features build on sprint 08 code: 01 on the scheduled create and update (s08-03, `updateScheduledPost`); 03 on card
  pictures (s08-15); 10 on the highlights since-sync (s07-12) and the decks API (s06-13); 11 on recurring threads
  (s08-09) and the scheduled create (s08-03); 12 on the pronunciation clip (s08-19), card pictures (s08-15) and **the
  media-sweep exclusions sprint 08's integration adds** (unpublished scheduled posts, card pictures, build screenshots —
  12 checks they are present and stops if not); 13 on the fan-out lease (s08-05) and spam sweeps (s08-18); 14 on key
  suspension (s08-08); 16 on the game erasure (s08-20) and its snapshot scrub; 17 on the assist layer (s07-02, s08-06);
  18 on the replay library (s04-01);
- the migration timestamps below sort after sprint 08's `20261128040300…`;
- sprint 08's `.prettierignore` and `lib/i18n/config.ts` blocks sit where Wave 0 adds sprint 09's; take both sides on
  conflict.

## Machine budget

4 cores and 15 GB, shared. A cold `tsc -b` of the site project peaks around 10 GB, so **implementers never run
`pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev` or `vite`.** They run targeted vitest files, eslint on
their changed files and the commit gate (`--fast`, about 1 GB; it skips `tsc`). They never run prettier over files that
existed before (reformatting causes merge conflicts); new files may be formatted. Integration runs the one full
typecheck after each merge, alone. Each worktree has its own `node_modules` (`pnpm install --frozen-lockfile --offline`,
hard-linked from the store), so one feature's `prisma generate` never changes another's client. At most three
implementers run at once. **jsdom is not installed:** component tests render with `react-dom/server`
(`renderToStaticMarkup`) or test the pure logic the component calls; no test sets `environment: 'jsdom'`.

## Wave 0 — scaffolding (integration commits it before Wave 1)

1. The precondition merge above.
2. **Namespaces.** Append to `NAMESPACES` in `lib/i18n/config.ts`, after sprint 08's block, one per line under the
   comment `// Sprint 09 (docs/autonomous/sprint-09): one namespace per feature.`: `draft-edit`, `occlusion-cards`,
   `weak-keys`, `community-wiki`, `scheduled-gate`, `guide-history`, `media-sweep`, `community-pins`,
   `durable-reclaims`, `deletion-pause`, `driftway-laundry-assists`, `board-privacy`, `lights-out-replays`,
   `notice-language` (14 namespaces; 08, 09, 10, 15, 16 and 20 write no UI strings). Create each `locales/en/<ns>.json`
   containing `{}` and a newline. Run
   `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-config.test.ts` to check the registry
   accepts empty catalogues.
3. **Anchors** — so that two features of one wave never edit the same lines of a shared file. Each anchor is a comment
   line followed by one blank line; a feature keeps **its own anchor line** and adds its code directly below it.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of `anonymizeAccount`, directly after sprint
     08's last anchor block (`// s08-20 erasure-games` and its line): a header comment
     `// Sprint 09 erasures (docs/autonomous/sprint-09/plan.md §Anchors): each feature adds its operations under its own line.`
     then `// s09-10 api-sync-deletions`, `// s09-14 deletion-pause`, `// s09-15 erasure-lists`,
     `// s09-16 erasure-boards`. Also, **after** the transaction and after sprint 08's `scrubMatchSnapshots(userId)`,
     one line `// s09-16 erasure-boards (after the transaction)`. And, in `cancelDeletion` directly before its `return`,
     one line `// s09-14 deletion-pause (restore on cancel)` (14 alone uses it; it is there so 14's hunk is placed, not
     invented).
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields, after sprint 08's block:
     `// Sprint 09 back-relations (one block per feature, docs/autonomous/sprint-09/plan.md)` then
     `// s09-06 community-pins`, `// s09-10 api-sync-deletions`, `// s09-14 deletion-pause`. Run
     `pnpm -s exec prisma validate` (dummy `DATABASE_URL`).
   - **New file `lib/account/export-sprint-09.server.ts`**, a copy of the shape of
     `lib/account/export-sprint-08.server.ts`:
     `async function exportSprint09(userId: string): Promise<Record<string, unknown>>` returning one object literal;
     inside it the header comment `// Sprint 09 exports (docs/autonomous/sprint-09/plan.md §Anchors)` then
     `// s09-02 weak-keys`, `// s09-03 occlusion-cards`, `// s09-04 community-wiki`, `// s09-05 guide-history`. Each
     feature adds one property under its line. Wave 0 calls it **once** from `lib/account/api/account.export.server.ts`
     beside the `exportSprint08(userId)` call and adds the result to the payload as `sprint09`, with
     `lib/account/__tests__/export-sprint-09.test.ts` asserting the key. Implementers **never edit
     `account.export.server.ts`**. 06's pins are moderator records and 10's tombstones and 14's hold are bookkeeping
     (ids and timestamps the member already has); none is exported, and each specification says so.
   - `lib/sitemap.ts`: in `EXCLUDED_ROUTES`, after sprint 08's block,
     `// Sprint 09 (docs/autonomous/sprint-09/plan.md §Anchors)` then `// s09-12 media-sweep` (`/admin/media-sweep`,
     `admin`); in `DYNAMIC_ROUTES` (the `$param` map), the same header then `// s09-04 community-wiki` (`/c/$slug/wiki`,
     `/c/$slug/wiki/$page`) and `// s09-05 guide-history` (`/games/$gameId/guides/$guideId/history`, author-only, so its
     reason is "private"). **Param-less paths go in `EXCLUDED_ROUTES`, never `DYNAMIC_ROUTES`.**
   - `server/jobs/index.ts`, at the end of `REGISTRATIONS` after sprint 08's block:
     `// Sprint 09 (docs/autonomous/sprint-09/plan.md §Anchors)` then `// s09-10 api-sync-deletions`,
     `// s09-12 media-sweep`, `// s09-16 erasure-boards`. (Each also adds one import at the top; the three are in
     different waves.)
   - `components/feed/notification-labels.ts`, in `systemLabels`'s returned object directly before `default:` and after
     sprint 08's block: `// Sprint 09 system labels (docs/autonomous/sprint-09/plan.md §Anchors)` then
     `// s09-06 community-pins`, `// s09-11 scheduled-gate`, `// s09-14 deletion-pause`; and the same anchor lines in
     `components/feed/__tests__/notification-labels.test.ts` where it pins each label's key and English text. Labels are
     literal `t('system-label-<type>', { ns: 'feed', defaultValue: '…' })` calls and land in `locales/en/feed.json`. 19
     does not use these anchors (its catalogue is its own file).
   - `app/routes/_site/admin/index.tsx`, after sprint 08's block: `{/* Sprint 09 admin tools */}` then
     `{/* s09-12 media-sweep */}`. The `t()` calls sit inside props, never directly after a `{/* */}` comment.
   - `lib/api/registry.ts`, at the end of the paths, after sprint 08's block:
     `// Sprint 09 (docs/autonomous/sprint-09/plan.md §Anchors)` then `// s09-08 api-feeds`, `// s09-09 api-practice`,
     `// s09-10 api-sync-deletions`. 03's card fields are edited in place in the existing flashcard schema (wave 1; 08
     in the same wave only appends under its anchor), and 06's `pinned` field in place in the community post schema
     (wave 3; 09 in the same wave only appends under its anchor).
   - `lib/api/scopes.ts`, at the end of the scope list: `// Sprint 09` then `// s09-08 api-feeds`,
     `// s09-09 api-practice`. (10 adds no scope.)
   - `scripts/generate-sdk.ts`, at the end of `NULLABLE`: `// Sprint 09` then `// s09-03 occlusion-cards`,
     `// s09-08 api-feeds`, `// s09-09 api-practice`, `// s09-10 api-sync-deletions`.
   - `docs/developer-api/changelog.md` (newest section first): a new top section `## Sprint 09 — 2026-11` holding one
     HTML comment line per API feature, `<!-- s09-03 occlusion-cards -->`, `<!-- s09-08 api-feeds -->`,
     `<!-- s09-06 community-pins -->`, `<!-- s09-09 api-practice -->`, `<!-- s09-10 api-sync-deletions -->`,
     `<!-- s09-14 deletion-pause -->`; each feature writes its bullets under its line.
   - **No settings-nav anchor:** no sprint 09 feature adds a settings page (07 edits the text of the existing
     leaderboard switch, 17 adds two games to the existing game-assists page, 14 edits the existing deletion dialog). If
     an implementer finds one is needed, it stops and reports.
4. **No new shared helper.** `lockKey` serves every cap and claim; the lease pattern (s07-15, s08-05) is edited in place
   by 13 only; `useConfirm` and `usePrompt` every confirmation; `components/ui/tabs.tsx` every tab strip;
   `lib/calendar/tz.ts` every time-zone computation; the site's locale formatters every date and number;
   `components/ui/arrive.tsx` every arrival fade; `lib/async-pool.ts` every bounded fan-out; `lib/rss.ts`'s
   control-character stripping for anything that emits XML.
5. `.prettierignore` gains `/docs/autonomous/sprint-09/` after sprint 08's line, with the same comment, and
   `docs/autonomous/README.md` gains the sprint 09 row (done in these documents).
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

## Waves

| Wave | Slot A                | Slot B              | Slot C                      |
| ---- | --------------------- | ------------------- | --------------------------- |
| 1    | 02 weak-keys          | 03 occlusion-cards  | 08 api-feeds                |
| 2    | 04 community-wiki     | 11 scheduled-gate   | 17 driftway-laundry-assists |
| 3    | 05 guide-history      | 06 community-pins   | 09 api-practice             |
| 4    | 12 media-sweep        | 13 durable-reclaims | 15 erasure-lists            |
| 5    | 10 api-sync-deletions | 14 deletion-pause   | 01 draft-edit               |
| 6    | 07 board-privacy      | 16 erasure-boards   | —                           |
| 7    | 19 notice-language    | 20 text-direction   | 18 lights-out-replays       |

The rule the waves keep: **no two features of one wave edit the same file unless that file is anchored** (each feature
under its own Wave 0 line) or the file is generated (integration regenerates it). The erasure registry is not anchored
(it is alphabetical); a wave may hold two one-entry registry features only when their entries land far apart (10's
`SyncTombstone` and 14's `DeletionHold` in wave 5, hundreds of lines apart), never next to another feature's entries —
which is why 06 (`CommunityPinnedPost`, beside `CommunityOnboardingAnswer` and `CommunityPageRevision`) is in wave 3,
not beside 15 in wave 4.

Dependencies that fix the order:

- 08 (w1) → 09 (w3) → 10 (w5): all three edit `lib/api/registry.ts`, `scripts/generate-sdk.ts` (anchored), 08 and 09
  `lib/api/scopes.ts` (anchored), and the hand-written `docs/developer-api/{changelog,scopes}.md` (changelog anchored;
  `scopes.md` appended, different waves). 03 (w1) edits the flashcard schema fields in place and adds a `NULLABLE` line;
  06 (w3) edits the community post schema in place (an additive `pinned`) and writes under its changelog anchor.
- 03 (w1) → 10 (w5): both edit `lib/study/deck-editor.server.ts` (03 the card write path for the new kind, 10 one
  tombstone line in `deleteDeck` and `deleteCard`).
- 04 (w2) → 05 (w3): 04 makes `components/communities/DocEditor.tsx` live and may adjust its props; 05 adopts it for
  guides.
- 04 (w2) → 06 (w3): both edit `app/routes/_site/c.$slug.tsx` (04 one link row, 06 the pinned block above the feed) and
  `lib/communities/modlog.ts` with its labels (04 the wiki actions, 06 the pin actions).
- 08 (w1) → 06 (w3): both add a new reader of posts to the post read-path registries (`CONTENT_WARNING_READ_PATHS`,
  `QUIET_COUNT_READ_PATHS`, `GIF_ALT_READ_PATHS`, `QUIZ_READ_PATHS`); different waves, appended entries.
- 11 (w2) → 14 (w5): both edit `lib/scheduled/publish.server.ts` (11 the gate, 14 one early return for an author whose
  deletion is scheduled) and `lib/communities/recurring.server.ts` (11 the "Post now" claim, 14 skipping a template
  whose author's deletion is scheduled).
- 11 (w2) → 01 (w5): both edit `components/feed/DraftsColumn.tsx` (11 the refused-draft reason line, read from
  `lib/scheduled/list.server.ts`; 01 the "Edit" dialog). 01 edits `lib/scheduled/scheduled-schema.ts`, which nobody else
  touches; 14 in the same wave edits `publish.server.ts`, not these.
- 12 (w4), 10 (w5), 16 (w6): one jobs anchor line each.
- 13 (w4) → 14 (w5): 13 edits the lease code in `lib/bulk`, `lib/fanout` and `lib/admin/sweeps*.ts`; 14 cancels the
  member's queued bulk operations through `cancelBulkOperation` only.
- 15 (w4) → 16 (w6): both edit `lib/account/erasure-registry.ts` and `TODO_CEILING` and regenerate
  `docs/account-deletion.md`. 06 (w3), 10 and 14 (w5) add one non-`todo` entry each at their alphabetical place and
  leave the ceiling alone.
- 06 (w3), 10 (w5), 14 (w5): one `auth.prisma` anchor each.
- 02 (w1) → 07 (w6): 07 edits `lib/rmhtype/api/rmhtype.daily.leaderboard.server.ts`; 02 edits `components/rmhtype/*` and
  `lib/rmhtype/keystats*`. 02 (w1) → 09 (w3): 09's key-statistics endpoint reads what 02 records.
- 02 (w1) and 04 (w2) each add one line to `lib/device-data/registry.ts` (different waves; 03 adds none).
- 07 and 16 share wave 6 but no file: 07 edits board **readers**; 16 adds `lib/account/erasure-boards.server.ts` and
  edits `lib/account/erasure-games.server.ts` (sprint 08's scrub). Neither edits
  `lib/game/leaderboard-privacy.server.ts` except 07, which only adds the exported `BOARD_PRIVACY_READ_PATHS` constant
  beside it.
- 07 (w6) → 18 (w7): both edit `listReplaysForGame` in `lib/replays.server.ts` (07 the hidden-member filter, 18 the
  Lights Out order and the seed filter).
- 17 (w2) → 18 (w7): 17 edits `lib/game/assist.ts` and `lib/game-capabilities.ts`; 18 only reads
  `lib/game-capabilities.ts`.
- 19 (w7) is the sweeping server feature (every `SYSTEM` emitter under `lib/`, `server/` and `features/`, the five
  direct `notification` row writers, plus `NotificationsColumn.tsx`); it runs after every emitter the sprint adds (06,
  11, 14) exists. 20 (w7) is the sweeping UI feature (every renderer of member-written text) and does **not** edit
  `components/feed/NotificationsColumn.tsx` (19's) or `components/replays/*` and `components/lights-out/*` (18's);
  neither 18 file emits a `SYSTEM` notification, so 19 does not touch them.

## Shared files and who touches them

| File                                                                                                                              | Kind                                | Who                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/i18n/config.ts` (`NAMESPACES`)                                                                                               | registry                            | **Wave 0 only**                                                                                                                                                                              |
| `locales/en/<ns>.json`                                                                                                            | generated (extract)                 | each feature, its own file only; `feed.json` for labels (06, 11, 14)                                                                                                                         |
| `prisma/schema/auth.prisma` (`User`)                                                                                              | source, **anchored**                | 06 (w3), 10, 14 (w5)                                                                                                                                                                         |
| `prisma/schema/rmhstudy.prisma`                                                                                                   | source                              | 03                                                                                                                                                                                           |
| `prisma/schema/communities.prisma`                                                                                                | source                              | 06                                                                                                                                                                                           |
| `prisma/schema/{developer,fanout,moderation}.prisma` (`BulkOperation`, `FanoutRun`, `ModerationSweep`)                            | source                              | 13 (columns)                                                                                                                                                                                 |
| `prisma/schema/sync.prisma`                                                                                                       | new                                 | 10 (`SyncTombstone`)                                                                                                                                                                         |
| `prisma/schema/deletion.prisma`                                                                                                   | new                                 | 14 (`DeletionHold`)                                                                                                                                                                          |
| `prisma/schema/social.prisma` (`Notification`)                                                                                    | source                              | 19 (two nullable columns)                                                                                                                                                                    |
| `lib/account/deletion.server.ts`                                                                                                  | source, **anchored**                | 10, 14 (+ `scheduleDeletion`/`cancelDeletion`), 15, 16                                                                                                                                       |
| `lib/account/erasure-registry.ts` (`TODO_CEILING`)                                                                                | source (alphabetical; not anchored) | 06 (w3), 10, 14 (w5) one entry each; 15 (w4), 16 (w6) many; ceiling only 15, 16                                                                                                              |
| `docs/account-deletion.md`                                                                                                        | generated (`pnpm docs:deletion`)    | each feature that edits the registry                                                                                                                                                         |
| `lib/account/export-sprint-09.server.ts`                                                                                          | new in Wave 0, **anchored**         | 02, 03, 04, 05                                                                                                                                                                               |
| `lib/account/api/account.export.server.ts`                                                                                        | source                              | **Wave 0 and integration only**                                                                                                                                                              |
| `lib/account/api/account.delete.server.ts`                                                                                        | source                              | 14                                                                                                                                                                                           |
| `lib/sitemap.ts`                                                                                                                  | source, **anchored**                | 04, 05, 12                                                                                                                                                                                   |
| `server/jobs/index.ts`                                                                                                            | source, **anchored**                | 12 (w4), 10 (w5), 16 (w6)                                                                                                                                                                    |
| `components/feed/notification-labels.ts` + its test                                                                               | source, **anchored**                | 11 (w2), 06 (w3), 14 (w5)                                                                                                                                                                    |
| `app/routes/_site/admin/index.tsx`                                                                                                | source, **anchored**                | 12                                                                                                                                                                                           |
| `lib/api/registry.ts`                                                                                                             | source, **anchored** (paths)        | 08 (w1), 09 (w3), 10 (w5) (anchored); 03 (w1) in place (flashcard fields); 06 (w3) in place (community post `pinned`)                                                                        |
| `lib/api/scopes.ts`                                                                                                               | source, **anchored**                | 08 (w1), 09 (w3)                                                                                                                                                                             |
| `scripts/generate-sdk.ts` (`NULLABLE`)                                                                                            | source, **anchored**                | 03, 08, 09, 10                                                                                                                                                                               |
| `docs/developer-api/changelog.md`                                                                                                 | hand-written, **anchored**          | 03, 08 (w1), 06, 09 (w3), 10, 14 (w5)                                                                                                                                                        |
| `docs/developer-api/{scopes,errors}.md`                                                                                           | hand-written docs                   | scopes: 08, 09 (different waves); errors: 14 (`key_suspended` reason text)                                                                                                                   |
| post read-path registries (`lib/feed/content-warning.ts`, `quiet-counts.ts`, `gif-alt.ts`, `quiz-poll.ts`)                        | source                              | 08 (w1), 06 (w3) — append entries                                                                                                                                                            |
| `lib/feed/__tests__/quiet-counts.test.ts` (`EXEMPT`)                                                                              | test registry                       | any feature whose new file mentions a count field (expected: 06, 08)                                                                                                                         |
| `lib/device-data/registry.ts`                                                                                                     | source                              | 02 (w1) (record switch), 04 (w2) (wiki draft); 03 adds none                                                                                                                                  |
| `lib/__tests__/useeffect-fetch-ratchet.test.ts` (`BASELINE`)                                                                      | test ratchet                        | 02 (w1) lowers it; no feature raises it; integration sets it to the merged count                                                                                                             |
| `components/feed/DraftsColumn.tsx`                                                                                                | source                              | 11 (w2) reason line, 01 (w5) edit dialog                                                                                                                                                     |
| `lib/scheduled/list.server.ts`                                                                                                    | source                              | 11 (w2) (`blockedReason`)                                                                                                                                                                    |
| `lib/scheduled/scheduled-schema.ts` (`patchScheduledSchema`)                                                                      | source                              | 01 (w5)                                                                                                                                                                                      |
| `components/rmhtype/*`, `lib/rmhtype/keystats*`                                                                                   | source                              | 02 (w1)                                                                                                                                                                                      |
| `lib/rmhtype/api/rmhtype.daily.leaderboard.server.ts`                                                                             | source                              | 07                                                                                                                                                                                           |
| `lib/study/*`, `components/study/*`                                                                                               | source                              | 03 (w1); 10 (w5) one line each in `deck-editor.server.ts`                                                                                                                                    |
| `lib/communities/pages*.ts`, `lib/communities/api/community-pages*.server.ts`, `components/communities/DocEditor.tsx`             | source                              | 04 (w2); 05 (w3) only `DocEditor.tsx`                                                                                                                                                        |
| `app/routes/_site/c.$slug.tsx`                                                                                                    | source                              | 04 (w2), 06 (w3)                                                                                                                                                                             |
| `lib/communities/modlog.ts` and its labels, `components/communities/ModPanel.tsx`                                                 | source                              | 04 (w2) wiki actions, 06 (w3) pin actions                                                                                                                                                    |
| `lib/games/meta.server.ts`, `components/games/GuideView.tsx`                                                                      | source                              | 05                                                                                                                                                                                           |
| `lib/feeds/feeds.server.ts`                                                                                                       | source, read only                   | 08 imports it                                                                                                                                                                                |
| `lib/lists/lists.server.ts`                                                                                                       | source                              | 08 (`replaceListMembers`)                                                                                                                                                                    |
| `lib/communities/detail.server.ts` (`getCommunityFeed`)                                                                           | source                              | 06 (`withPins` option)                                                                                                                                                                       |
| `lib/scheduled/publish.server.ts`, `lib/communities/recurring.server.ts`                                                          | source                              | 11 (w2), 14 (w5)                                                                                                                                                                             |
| `lib/media/sweep*.ts`, `lib/media/ingest.server.ts` (one export), `lib/storage/s3.server.ts` (`listObjectEntries`)                | source                              | 12                                                                                                                                                                                           |
| `lib/bulk/*`, `lib/fanout/*`, `lib/admin/sweeps*.ts`, `lib/admin/jobs.server.ts`                                                  | source                              | 13                                                                                                                                                                                           |
| `lib/webhooks/*`, `lib/developer/*` (key suspension)                                                                              | source                              | 14 (calls existing helpers; one reason constant)                                                                                                                                             |
| `lib/admin/secure-account.server.ts`                                                                                              | source                              | 14 (extracts its steps into exported functions, no behaviour change)                                                                                                                         |
| `lib/game/assist.ts`, `lib/game-capabilities.ts`                                                                                  | source                              | 17 (w2); 18 (w7) reads only                                                                                                                                                                  |
| `features/laundry-sort/**`, `lib/neon-driftway/**`, `components/neon-driftway/**`                                                 | source                              | 17                                                                                                                                                                                           |
| `components/lights-out/*`, `components/replays/SaveReplayButton.tsx`, `lib/game/replay.ts`, `lib/game/replay-library-schema.ts`   | source                              | 18 (w7)                                                                                                                                                                                      |
| `lib/replays.server.ts` (`listReplaysForGame`)                                                                                    | source                              | 07 (w6) hidden-member filter, 18 (w7) order and seed                                                                                                                                         |
| `lib/account/erasure-games.server.ts`                                                                                             | source                              | 16                                                                                                                                                                                           |
| `lib/notifications.server.ts`, `components/feed/NotificationsColumn.tsx`, every `SYSTEM` emitter and direct `notification` writer | source                              | 19 (w7, last)                                                                                                                                                                                |
| `components/feed/RMHarkCard.tsx`, `CommentItem.tsx`, message bubbles, profile header, community header                            | source                              | 20 (w7, last; not 18's or 19's files)                                                                                                                                                        |
| `lib/api/route-table.server.ts`                                                                                                   | generated (`pnpm api:routes`)       | each feature regenerates it; **integration regenerates on every merge**                                                                                                                      |
| `app/routeTree.gen.ts`                                                                                                            | generated (vite)                    | **integration only**                                                                                                                                                                         |
| `docs/_generated/facts.json`, `docs/site-reference/*`, the SDK output                                                             | generated                           | **integration regenerates** (`pnpm facts:generate`, `pnpm docs:site`, `pnpm docs:api`, `pnpm sdk:generate`); API features run `sdk:generate` and `docs:api` themselves and commit the output |
| `lib/catalog/**`                                                                                                                  | source                              | nobody (no new games or apps)                                                                                                                                                                |

## Migration timestamps

All additive; `.github/scripts/check-migrations-additive.mjs` must pass. Every timestamp sorts after sprint 08's
`20261128040300…`. The pattern is `202611290<wave><slot>00`.

| Feature | Migration(s)                                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 03      | `20261129010200_s09_occlusion_cards`                                                                                                                                                                                                                                                                          |
| 06      | `20261129030200_s09_community_pins`                                                                                                                                                                                                                                                                           |
| 13      | `20261129040200_s09_durable_reclaims`                                                                                                                                                                                                                                                                         |
| 10      | `20261129050100_s09_sync_tombstones`                                                                                                                                                                                                                                                                          |
| 14      | `20261129050200_s09_deletion_pause`                                                                                                                                                                                                                                                                           |
| 16      | `20261129060200_s09_call_mute_index`, `20261129060201_s09_call_mute_index_ensure_valid`, `20261129060202_s09_slice_daily_entry_user_index`, `20261129060203_s09_slice_daily_entry_user_index_ensure_valid`, `20261129060204_s09_song_play_user_index`, `20261129060205_s09_song_play_user_index_ensure_valid` |
| 19      | `20261129070100_s09_notice_language`                                                                                                                                                                                                                                                                          |

01, 02, 04, 05, 07, 08, 09, 11, 12, 15, 17, 18 and 20 have no schema change. New tables get plain indexes in their own
migration; new columns on existing tables are nullable or carry a constant default (13, 19). **16 is the only feature
that adds indexes to existing tables**: each is `CREATE INDEX CONCURRENTLY` in a migration that holds exactly one
statement, followed by an `_ensure_valid` migration (copy
`prisma/migrations/20261126060101_s06_flashcard_external_id_index` and
`20261126060102_s06_flashcard_external_id_index_ensure_valid`), declared in the schema with `@@index` and **Prisma's
default name** (`<table>_<columns>_idx`) in the SQL. Any other implementer who finds an index needed reports it and does
not add it.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-09`, never pushed until the sprint PR.
- Feature branch: `autonomous/s09-<slug>` from the sprint branch **as it is when the wave starts**.
- Worktree: `/home/user/wt/s09-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge or rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite and product files, plus the gate tests that cover what they touched (route
   table, API handler adoption, raw-fetch ratchet, `useeffect-fetch-ratchet`, `zod-off-hot-routes`, `islands` (any
   island entry), boundaries and the lint ratchet (`pnpm lint:ratchet`: no import cycles, `lib/` never imports
   `components/`), i18n catalogs and drift, the computed-key ratchet, the native-dialog ratchet, sitemap and OG
   coverage, test discovery, design consistency and Steel flat when UI changed, the rAF allowlist, arrival coverage, the
   escape-hatch ratchet, tsconfig projects, server-fn guards, the device-data registry test when a storage key was
   added, the migration-safety test when a migration was added, erasure coverage when a `User` relation was added, the
   shortcut registry test when a key binding was added, every read-path registry test the feature names (content
   warnings, quiet counts, GIF descriptions, quiz polls, follow lists, ban enforcement, leaderboard privacy)).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed from the wave's base schema, and the
   additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file (and `feed.json` for the label features 06, 11, 14).
5. `pnpm api:routes` when an endpoint module was added, moved or removed.
6. API features (08, 09, 10, and 03 and 06 for their field additions): `pnpm sdk:generate` and `pnpm docs:api`,
   committing their output; the SDK must type every new field (no `unknown`), through `NULLABLE` where the example is
   `null`.
7. Registry features (06, 10, 14, 15, 16): `pnpm docs:deletion` and commit `docs/account-deletion.md`.
8. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s09-<slug>`. On a conflict in a generated file, take either side and regenerate;
   anchored files should not conflict (if one does, keep both features' blocks under their anchors). On `TODO_CEILING`,
   set it to the number of `todo` entries the merged registry holds.
2. Regenerate: `pnpm api:routes`; the route tree (start `pnpm exec vite --port 7999 --strictPort`, wait until
   `app/routeTree.gen.ts` changes, stop it — 04, 05 and 12 add pages; 08, 09 and 10 add v1 route files);
   `pnpm facts:generate`; `pnpm docs:site`; `pnpm docs:api`; `pnpm sdk:generate`; `pnpm docs:deletion`.
3. `pnpm exec prisma generate`, then `pnpm exec tsc -b --checkers 1` alone.
4. `pnpm test` and `pnpm test:product`.
5. **Raw SQL and lock smoke test** for every `lockKey` user, lease and any raw SQL: apply the migrations to a throwaway
   Postgres (the integration suite's, `docs/testing.md` §8) and run each new query once; for 13 the lease claim and a
   reclaim with no attempt in between; for 11 two concurrent "Post now" calls; for 06 the three-pin cap under two
   concurrent pins; for 12 a dry run and a real run against a scheduled post with a pending picture (sprint 08's
   exclusion holds, the counts match); for 18 the seed filter's plan; for 16 the `CONCURRENTLY` migrations and their
   `_ensure_valid` checks.
6. Review the diff against the brief and the specification's acceptance criteria; fix or send back. Check every read
   path the feature names: 06 and 08 (the post read-path registries; 06's API path keeps its page), 07 (the board
   registry), 04 (private communities, bans and blocks on every wiki path), 15 and 16 (the erasure registry, both
   directions, foreign-key order, the JSON snapshots), 14 (what cancel restores), 19 (every emitter's key in the
   catalogue).
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Confirm `exportSprint09` carries 02, 03, 04 and 05's sections, and that the erasure coverage test passes with every
  sprint 09 table classified and `TODO_CEILING` equal to the `todo` count (17 if 15 and 16 classified all 26).
- `pnpm check:consistency --base main`, `pnpm typecheck`, `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`,
  `pnpm build` with `scripts/check-bundle-budget.ts`, and a real-browser pass over every new or changed page in Day and
  Night at 390 px and 1280 px, and once in `ar` (20's acceptance is checked there with English, Arabic and mixed text);
  the app-tier surfaces (RMHType 02, Neon Driftway and Laundry Sort 17, Lights Out 18) in their own look.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code lines (TypeScript, TSX, SQL, CSS)
separately from documentation lines, measured with `git diff --numstat` from the Wave 0 parent commit to `HEAD`,
filtered by extension, excluding generated files (`routeTree.gen.ts`, `route-table.server.ts`, `facts.json`,
`docs/site-reference/**`, SDK output, `locales/**`, `docs/account-deletion.md`). It also lists the final `TODO_CEILING`,
every table 15 and 16 left `todo` with its reason, the `SYSTEM` emitters 19 left on English previews (its ratchet's
count), and the open owner decisions this sprint met (the deletion grace period's visibility, purchased cosmetics at
erasure, `RebarReservation`).
