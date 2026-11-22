# Sprint 07 — implementation plan

How the twenty features are built: seven waves of at most three concurrent
implementers, each in its own git worktree and branch, merged into the sprint
branch `claude/autonomous-sprint-07` by one integration owner between waves.
The machine budget and per-feature checks are sprint 06's, restated so this
file stands alone.

## Precondition: sprint 06 is in the sprint branch

`claude/autonomous-sprint-07` is cut from the sprint 06 branch tip
(`claude/autonomous-sprint-06`) once sprint 06 has finished integrating —
**including 15 GIF descriptions, 16 content warnings and 18 away message**,
which this design treats as done — or from `origin/main` if sprint 06 has
landed there by then (then `git merge origin/main` again when it lands; the
content is identical). Wave 0 is committed on top of that. Wave 1 does not
start before, because:

- the Wave 0 anchors go **after** sprint 06's anchor blocks in
  `lib/account/deletion.server.ts`, `prisma/schema/auth.prisma`,
  `lib/sitemap.ts`, `server/jobs/index.ts`,
  `components/feed/notification-labels.ts` (and its test),
  `app/routes/_site/admin/index.tsx`, `lib/settings-nav.ts` (and its labels and
  test), `lib/api/registry.ts` and `lib/i18n/config.ts`;
- features build on sprint 06 code: 04 and 05 on group invites and
  `ChatRemoval` (s06-09); 06 on result claims (s06-20, `match-results.server.ts`);
  07 on jam feedback (s06-07); 08 and 09 on deck updates and the flashcards API
  (s06-08, s06-13); 10 on occurrences and updates (s06-10, s06-11); 11 and 16 on
  community bans in the gate (s06-01); 14 on Studio editing and export (s06-03,
  s06-04); 19 on ranked polls (s06-19) and on 15/16's read-path registries
  (GIF descriptions, content warnings), which 11 and 19 must also satisfy;
- the migration timestamps below sort after sprint 06's `20261126…`;
- sprint 06's `.prettierignore` and `lib/i18n/config.ts` blocks sit where Wave 0
  adds sprint 07's; take both sides on conflict.

## Machine budget

4 cores and 15 GB. A cold `tsc -b` of the site project peaks around 10 GB, so
**implementers never run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`,
`pnpm dev` or `vite`.** They run targeted vitest files, eslint on their changed
files and the commit gate (`--fast`, about 1 GB; it skips `tsc`). They never run
prettier over files that existed before (reformatting causes merge conflicts);
new files may be formatted. Integration runs the one full typecheck after each
merge, alone. Each worktree has its own `node_modules`
(`pnpm install --frozen-lockfile --offline`, hard-linked from the store), so one
feature's `prisma generate` never changes another's client. At most three
implementers run at once.

## Wave 0 — scaffolding (integration commits it before Wave 1)

1. The precondition merge above.
2. **Namespaces.** Append to `NAMESPACES` in `lib/i18n/config.ts`, after sprint
   06's block, one per line under the comment `// Sprint 07
   (docs/autonomous/sprint-07): one namespace per feature.`:
   `slice-it-clipboard`, `game-assists`, `device-data`, `group-admins`,
   `group-mentions`, `match-scheduling`, `jam-themes`, `study-queue`,
   `deck-folders`, `admin-batch-lookup`, `studio-history`, `bulk-durable`,
   `community-alt-text`, `build-screenshots`, `reading-time`, `quiz-polls`
   (16 namespaces; 10, 11, 12 and 20 write no UI strings). Create each
   `locales/en/<ns>.json` containing `{}` and a newline. Run
   `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts
   lib/__tests__/i18n-config.test.ts` to check the registry accepts empty
   catalogues.
3. **Anchors** — so that two features of one wave never edit the same lines of
   a shared file. Each anchor is a comment line followed by one blank line; a
   feature keeps **its own anchor line** and adds its code directly below it.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of
     `anonymizeAccount`, directly after sprint 06's last anchor block
     (`// s06-20 match-results` and its line): a header comment `// Sprint 07
     erasures (docs/autonomous/sprint-07/plan.md §Anchors): each feature adds
     its operations under its own line.` then `// s07-02 game-assists`,
     `// s07-05 group-mentions`, `// s07-06 match-scheduling`,
     `// s07-07 jam-themes`, `// s07-09 deck-folders`,
     `// s07-14 studio-history`, `// s07-15 bulk-durable`,
     `// s07-18 reading-time`, `// s07-20 erasure-coverage`.
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields,
     after sprint 06's block: `// Sprint 07 back-relations (one block per
     feature, docs/autonomous/sprint-07/plan.md)` then
     `// s07-05 group-mentions`, `// s07-07 jam-themes`,
     `// s07-09 deck-folders`, `// s07-18 reading-time`. Run
     `pnpm -s exec prisma validate` (dummy `DATABASE_URL`).
   - **New file `lib/account/export-sprint-07.server.ts`**, a copy of the shape
     of `lib/account/export-sprint-06.server.ts`: `async function
     exportSprint07(userId: string): Promise<Record<string, unknown>>` returning
     one object literal; inside it the header comment `// Sprint 07 exports
     (docs/autonomous/sprint-07/plan.md §Anchors)` then
     `// s07-06 match-scheduling`, `// s07-07 jam-themes`,
     `// s07-08 study-queue`, `// s07-09 deck-folders`,
     `// s07-14 studio-history`, `// s07-17 build-screenshots`,
     `// s07-18 reading-time`. Each feature adds one property
     (`deckFolders: await exportDeckFolders(userId),`) under its line. Wave 0
     calls it **once** from `lib/account/api/account.export.server.ts` beside
     the `exportSprint06(userId)` call and adds the result to the payload as
     `sprint07`, with `lib/account/__tests__/export-sprint-07.test.ts` asserting
     the key. Implementers **never edit `account.export.server.ts`**.
   - `lib/sitemap.ts`, `EXCLUDED_ROUTES`: after sprint 06's personal block,
     `// Sprint 07 static personal paths (docs/autonomous/sprint-07/plan.md
     §Anchors)` then `// s07-02 game-assists` (`/settings/game-assists`),
     `// s07-03 device-data` (`/settings/device`), `// s07-08 study-queue`
     (`/study/review`). No sprint 07 feature adds a `$param` page or an admin
     page. **Param-less paths go in `EXCLUDED_ROUTES`, never `DYNAMIC_ROUTES`.**
   - `server/jobs/index.ts`, at the end of `REGISTRATIONS` after sprint 06's
     block: `// Sprint 07 (docs/autonomous/sprint-07/plan.md §Anchors)` then
     `// s07-06 match-scheduling`, `// s07-07 jam-themes`,
     `// s07-15 bulk-durable`. (Each also adds one import at the top; the three
     are in different waves.)
   - `components/feed/notification-labels.ts`, in `systemLabels`'s returned
     object directly before `default:` and after sprint 06's block:
     `// Sprint 07 system labels (docs/autonomous/sprint-07/plan.md §Anchors)`
     then `// s07-05 group-mentions`, `// s07-06 match-scheduling`,
     `// s07-07 jam-themes`, `// s07-16 community-alt-text`; and the same
     anchor lines in `components/feed/__tests__/notification-labels.test.ts`
     where it pins each label's key and English text. Labels are literal
     `t('system-label-<type>', { ns: 'feed', defaultValue: '…' })` calls and
     land in `locales/en/feed.json`.
   - `app/routes/_site/admin/index.tsx`, after sprint 06's block:
     `{/* Sprint 07 admin tools */}` then `{/* s07-13 admin-batch-lookup */}`.
     The `t()` calls sit inside props, never directly after a `{/* */}`
     comment.
   - `lib/settings-nav.ts`, after sprint 06's `feedback` destination:
     `// Sprint 07` then `// s07-02 game-assists` and `// s07-03 device-data`;
     the same lines in `components/settings/settings-nav-labels.ts` after
     sprint 06's line and in
     `components/settings/__tests__/settings-nav-labels.product.test.ts`.
   - `lib/api/registry.ts`, at the end of the paths, after sprint 06's block:
     `// Sprint 07 (docs/autonomous/sprint-07/plan.md §Anchors)` then
     `// s07-10 api-events`, `// s07-11 api-communities`,
     `// s07-12 api-reading`. Fields of existing schemas (08 deck `suspended`,
     17 build `screenshots`, 11 post-create `communityId`, 19 poll fields) are
     edited in place; those four are in four different waves.
   - `lib/api/scopes.ts`, at the end of the scope list: `// Sprint 07` then
     `// s07-10 api-events`, `// s07-11 api-communities`,
     `// s07-12 api-reading`.
   - `scripts/generate-sdk.ts`, at the end of `NULLABLE`: `// Sprint 07` then
     `// s07-10 api-events`, `// s07-11 api-communities`,
     `// s07-12 api-reading`, `// s07-17 build-screenshots` (19 edits the
     existing `poll` entry in place).
4. **No new shared helper.** `lockKey` serves every cap; `useConfirm` and
   `usePrompt` every confirmation; `components/ui/tabs.tsx` every tab strip;
   `lib/calendar/tz.ts` every time-zone computation; the site's locale
   formatters every date and number; `components/ui/arrive.tsx` every arrival
   fade; `lib/async-pool.ts` every bounded fan-out.
5. `.prettierignore` gains `/docs/autonomous/sprint-07/` after sprint 06's line,
   with the same comment, and `docs/autonomous/README.md` gains the sprint 07
   row (done in these documents).
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

## Waves

| Wave | Slot A                    | Slot B                    | Slot C                   |
| ---- | ------------------------- | ------------------------- | ------------------------ |
| 1    | 01 slice-it-clipboard     | 08 study-queue            | 04 group-admins          |
| 2    | 16 community-alt-text     | 07 jam-themes             | 14 studio-history        |
| 3    | 02 game-assists           | 10 api-events             | 13 admin-batch-lookup    |
| 4    | 05 group-mentions         | 09 deck-folders           | 17 build-screenshots     |
| 5    | 11 api-communities        | 06 match-scheduling       | 03 device-data           |
| 6    | 12 api-reading            | 15 bulk-durable           | 18 reading-time          |
| 7    | 19 quiz-polls             | 20 erasure-coverage       | —                        |

Dependencies that fix the order:

- 08 (w1) → 09 (w4): both edit `prisma/schema/rmhstudy.prisma`,
  `components/feed/FlashcardsColumn.tsx`, `lib/study.server.ts` (`listDecks`)
  and the review page; 09 adds a `folder` filter to 08's `queue.server.ts`.
- 04 (w1) → 05 (w4): both edit `prisma/schema/messaging.prisma`,
  `components/feed/group-chat/GroupInfoDialog.tsx` and
  `lib/group-chat/serialize.server.ts`; 05 reads members with 04's roles.
- 16 (w2) → 11 (w5) → 19 (w7): all three edit the post create path
  (`lib/feed/api/rmharks.server.ts`); 16 adds images to
  `gateCommunityContent`, 11 extracts `prepareCommunityPost` from that path and
  calls it from `POST /api/v1/posts`, 19 adds quiz fields to poll creation in
  both. 16 and 19 also edit `lib/scheduled/publish.server.ts` and
  `scheduled-schema.ts`.
- 07 (w2) → 06 (w5): both edit `prisma/schema/competitive.prisma` and the jobs
  anchor block (different lines).
- 02 (w3) → 03 (w5): both add settings pages and settings-nav entries
  (different anchor lines); 03's device registry lists stores 02 does not add.
- 14 (w2) → 03 (w5): 03 lists and clears the Studio's IndexedDB; 14 does not
  touch it, but 03 is tested against the Studio as 14 left it.
- 10 (w3) → 11 (w5) → 12 (w6): all three edit `lib/api/scopes.ts`,
  `lib/api/registry.ts`, `scripts/generate-sdk.ts` (anchored) and the
  hand-written `docs/developer-api/{changelog,scopes}.md` (appended; different
  waves). 08 (w1) and 17 (w4) edit registry fields in place.
- 12 (w6) and 18 (w6): both under `lib/reading/`; 12 only imports from it (its
  own code goes in `lib/api/v1/reading.server.ts`), 18 owns every change there.
- 15 (w6) → 20 (w7): 20's registry classifies `BulkOperation` as erased by 15.
- 20 (w7) runs last and alone in its area: it classifies every table the sprint
  added, and its coverage test must pass on the merged sprint. Its scope is
  fixed (registry, test, 21 named erasures); everything else it finds is a
  classified `todo`, never a widened change.
- 19 (w7) is the sweeping read-path feature (every poll serialiser) and runs
  last with 20, which touches no feed file.

## Shared files and who touches them

| File                                                          | Kind                          | Who                                                         |
| ------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `lib/i18n/config.ts` (`NAMESPACES`)                           | registry                      | **Wave 0 only**                                             |
| `locales/en/<ns>.json`                                        | generated (extract)           | each feature, its own file only; `feed.json` for labels (05, 06, 07, 16) |
| `prisma/schema/auth.prisma` (`User`)                          | source, **anchored**          | 05, 07, 09, 18                                              |
| `prisma/schema/messaging.prisma`                              | source                        | 04 (w1), 05 (w4)                                            |
| `prisma/schema/rmhstudy.prisma`                               | source                        | 08 (w1), 09 (w4)                                            |
| `prisma/schema/competitive.prisma`                            | source                        | 07 (w2), 06 (w5)                                            |
| `prisma/schema/communities.prisma`                            | source                        | 16                                                          |
| `prisma/schema/studio.prisma`                                 | source                        | 14                                                          |
| `prisma/schema/builds.prisma`                                 | source                        | 17                                                          |
| `prisma/schema/developer.prisma`                              | source                        | 15                                                          |
| `prisma/schema/library.prisma`                                | source                        | 18                                                          |
| `prisma/schema/social.prisma`                                 | source                        | 19                                                          |
| `lib/account/deletion.server.ts`                              | source, **anchored**          | 02, 05, 06, 07, 09, 14, 15, 18, 20                           |
| `lib/account/export-sprint-07.server.ts`                      | new in Wave 0, **anchored**   | 06, 07, 08, 09, 14, 17, 18                               |
| `lib/account/api/account.export.server.ts`                    | source                        | **Wave 0 and integration only**                             |
| `lib/sitemap.ts`                                              | source, **anchored**          | 02, 03, 08                                                  |
| `server/jobs/index.ts`                                        | source, **anchored**          | 07 (w2), 06 (w5), 15 (w6)                                    |
| `components/feed/notification-labels.ts` + its test          | source, **anchored**          | 05, 06, 07, 16                                              |
| `app/routes/_site/admin/index.tsx`                            | source, **anchored**          | 13                                                          |
| `lib/settings-nav.ts`, `settings-nav-labels.ts` + test        | source, **anchored**          | 02, 03                                                      |
| `lib/api/registry.ts`                                         | source, **anchored** (paths)  | 10, 11, 12 (anchored); 08 (w1), 17 (w4), 11 (w5), 19 (w7) in place |
| `lib/api/scopes.ts`                                           | source, **anchored**          | 10 (w3), 11 (w5), 12 (w6)                                    |
| `scripts/generate-sdk.ts` (`NULLABLE`)                        | source, **anchored**          | 10, 11, 12, 17; 19 in place (`poll`)                         |
| `docs/developer-api/*.md`                                     | hand-written docs             | 10 (w3), 11 (w5), 12 (w6), 17 (w4), 19 (w7) — append only    |
| `lib/feed/api/rmharks.server.ts`                              | source                        | 16 (w2), 11 (w5), 19 (w7)                                    |
| `lib/scheduled/api/scheduled.server.ts`, `publish.server.ts`, `scheduled-schema.ts` | source  | 16 (w2), 19 (w7)                                            |
| `lib/communities/gate.server.ts`, `settings.server.ts`, `modlog.ts` | source                  | 16 (w2); 11 (w5) calls the gate through its new wrapper      |
| `app/routes/api/v1/posts.ts`                                  | source                        | 11 (w5), 19 (w7)                                             |
| `lib/feed/map-feed-item.server.ts`, `lib/api/serializers.server.ts`, poll serialisers | source | 19                                                       |
| `lib/group-chat/manage.server.ts`, `invites.server.ts`        | source                        | 04 (w1)                                                      |
| `lib/messages/send.server.ts`, `mutations.server.ts`          | source                        | 05 (w4)                                                      |
| `components/feed/group-chat/*`                                | source                        | 04 (w1), 05 (w4)                                             |
| `lib/study/*`, `components/feed/FlashcardsColumn.tsx`         | source                        | 08 (w1), 09 (w4)                                             |
| `lib/game/submit.server.ts`, `lib/game/assist.ts`, `lib/game-capabilities.ts` | source        | 02                                                           |
| `lib/tournaments/*`, `components/tournaments/*`               | source                        | 06                                                           |
| `lib/competitive/jams*.ts`, `components/competitive/Jam*.tsx` | source                        | 07                                                           |
| `lib/studio/cloud-projects.server.ts`, `components/studio/ProjectsMenu.tsx` | source          | 14                                                           |
| `features/slice-it/**`                                        | source                        | 01                                                           |
| `features/synapse-storm/**`, `features/void-breaker/**`       | source                        | 02                                                           |
| `components/shell/AccountMenu.tsx`, `GlobeBar.tsx`, `CommandPalette.tsx`, `SignInMethodsPanel.tsx`, `DeleteAccountPanel.tsx` | source | 03                                         |
| `lib/bulk/*`, `components/trash/BulkCleanupPanel.tsx`         | source                        | 15                                                           |
| `components/user-builds/*`, `lib/builds/*`, `lib/og/` (build card) | source                  | 17                                                           |
| `lib/reading/*`, `components/reading/*`                       | source                        | 18                                                           |
| `lib/admin/lookup*`, `app/routes/_site/admin/lookup.tsx`      | source                        | 13                                                           |
| `lib/api/route-table.server.ts`                               | generated (`pnpm api:routes`) | each feature regenerates it; **integration regenerates on every merge** |
| `app/routeTree.gen.ts`                                        | generated (vite)              | **integration only**                                         |
| `docs/_generated/facts.json`, `docs/site-reference/*`, the SDK output | generated             | **integration regenerates** (`pnpm facts:generate`, `pnpm docs:site`, `pnpm docs:api`, `pnpm sdk:generate`); API features run `sdk:generate` and `docs:api` themselves and commit the output |
| `lib/catalog/**`                                              | source                        | nobody (no new games or apps)                                |

## Migration timestamps

All additive; `.github/scripts/check-migrations-additive.mjs` must pass. Every
timestamp sorts after sprint 06's `20261126…`.

| Feature | Migration(s) |
| ------- | ------------ |
| 08      | `20261127010100_s07_study_queue` |
| 04      | `20261127010200_s07_group_admins` |
| 16      | `20261127020000_s07_community_alt_text` |
| 07      | `20261127020100_s07_jam_themes` |
| 14      | `20261127020200_s07_studio_history` |
| 05      | `20261127040000_s07_group_mentions` |
| 09      | `20261127040100_s07_deck_folders`, `20261127040101_s07_deck_folder_index` (CONCURRENTLY, one statement), `20261127040102_s07_deck_folder_index_ensure_valid` |
| 17      | `20261127040200_s07_build_screenshots` |
| 06      | `20261127050100_s07_match_scheduling`, `20261127050101_s07_match_deadline_index` (CONCURRENTLY), `20261127050102_s07_match_scheduled_index` (CONCURRENTLY), `20261127050103_s07_match_schedule_indexes_ensure_valid` |
| 15      | `20261127060100_s07_bulk_durable` |
| 18      | `20261127060200_s07_reading_time` |
| 19      | `20261127070000_s07_quiz_polls` |

01, 02, 03, 10, 11, 12, 13 and 20 have no schema change. New tables get plain
indexes in their own migration. An index on an **existing** table is created
`CONCURRENTLY` in a migration that holds exactly one statement, followed by an
`_ensure_valid` migration (copy
`prisma/migrations/20261126060101_s06_flashcard_external_id_index` and
`20261126060102_s06_flashcard_external_id_index_ensure_valid`); `prisma migrate
diff` writes a plain `CREATE INDEX`, which the implementer moves into the
concurrent migration by hand. **Declare every such index in the schema with
`@@index` and use Prisma's default name** (`<table>_<columns>_idx`) in the SQL,
so `prisma migrate diff` shows no drift afterwards.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-07`, never pushed until the sprint
  PR.
- Feature branch: `autonomous/s07-<slug>` from the sprint branch **as it is
  when the wave starts**.
- Worktree: `/home/user/wt/s07-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge or
  rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite and product files, plus the gate
   tests that cover what they touched (route table, API handler adoption,
   raw-fetch ratchet, `useeffect-fetch-ratchet`, `zod-off-hot-routes`, i18n
   catalogs and drift, the computed-key ratchet, the native-dialog ratchet,
   sitemap and OG coverage, test discovery, design consistency and Steel flat
   when UI changed, the rAF allowlist, arrival coverage, the escape-hatch
   ratchet, tsconfig projects, server-fn guards, the migration-safety test when
   a migration was added, every read-path registry test the feature names).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed
   from the wave's base schema, and the additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file (and
   `feed.json` for the label features).
5. `pnpm api:routes` when an endpoint module was added, moved or removed.
6. API features (10, 11, 12, and 17 and 19 for their field additions):
   `pnpm sdk:generate` and `pnpm docs:api`, committing their output; the SDK
   must type every new field (no `unknown`), through `NULLABLE` where the
   example is `null`.
7. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s07-<slug>`. On a conflict in a generated file,
   take either side and regenerate; anchored files should not conflict (if one
   does, keep both features' blocks under their anchors).
2. Regenerate: `pnpm api:routes`; the route tree (start
   `pnpm exec vite --port 7999 --strictPort`, wait until `app/routeTree.gen.ts`
   changes, stop it — 02, 03 and 08 add pages; 10, 11 and 12 add v1 route
   files); `pnpm facts:generate`; `pnpm docs:site`; `pnpm docs:api`;
   `pnpm sdk:generate`.
3. `pnpm exec prisma generate`, then `pnpm exec tsc -b --checkers 1` alone.
4. `pnpm test` and `pnpm test:product`.
5. **Raw SQL and lock smoke test** for every `lockKey` user and any raw SQL:
   apply the migrations to a throwaway Postgres (the integration suite's,
   `docs/testing.md` §8) and run each new query once; for 06 the schedule
   cron's query, for 07 the theme resolution, for 15 the lease claim with two
   sessions, for 18 the upsert with the daily cap.
6. Review the diff against the brief and the specification's acceptance
   criteria; fix or send back. Check every read path the feature names: 06
   (`MATCH_READY_PATHS`), 07 (`JAM_THEME_READ_PATHS`), 08
   (`DUE_COUNT_READ_PATHS`), 16 (`COMMUNITY_ALT_WRITE_PATHS`), 19
   (`QUIZ_READ_PATHS`), 03 (the device-store registry), 20 (the erasure
   registry), and that 11 joined sprint 04's and 06's feed registries.
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Confirm `exportSprint07` carries 06, 07, 08, 09, 14, 17 and 18's
  sections, and that 20's coverage test passes with every sprint 07 table in
  its registry.
- `pnpm check:consistency --base main`, `pnpm typecheck`,
  `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`, `pnpm build` with
  `scripts/check-bundle-budget.ts`, and a real-browser pass over every new or
  changed page in Day and Night at 390 px and 1280 px, and once in `ar`; Slice
  It (01), the Studio (14) and the two games (02) in their own app look.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code
lines (TypeScript, TSX, SQL, CSS) separately from documentation lines, measured
with `git diff --numstat` from the Wave 0 parent commit to `HEAD`, filtered by
extension, excluding generated files (`routeTree.gen.ts`,
`route-table.server.ts`, `facts.json`, `docs/site-reference/**`, SDK output,
`locales/**`). It also lists 20's `owner` entries as owner follow-ups, and
20's `todo` count (`TODO_CEILING`) with the models it reported as next
candidates for erasure.
