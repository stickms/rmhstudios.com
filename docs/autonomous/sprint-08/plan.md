# Sprint 08 — implementation plan

How the twenty features are built: seven waves of at most three concurrent
implementers, each in its own git worktree and branch, merged into the sprint
branch `claude/autonomous-sprint-08` by one integration owner between waves.
The machine budget and per-feature checks are sprint 07's, restated so this
file stands alone, with the lessons sprint 07's implementers and integration
recorded folded into the briefs.

## Precondition: sprint 07 is in the sprint branch

`claude/autonomous-sprint-08` is cut from the sprint 07 branch tip
(`claude/autonomous-sprint-07`, which holds sprints 1–7) once sprint 07 has
finished integrating, or from `origin/main` if sprint 07 has landed there by
then (then `git merge origin/main` again when it lands; the content is
identical). Wave 0 is committed on top of that. Wave 1 does not start before,
because:

- the Wave 0 anchors go **after** sprint 07's anchor blocks in
  `lib/account/deletion.server.ts`, `prisma/schema/auth.prisma`,
  `lib/sitemap.ts`, `server/jobs/index.ts`,
  `components/feed/notification-labels.ts` (and its test),
  `app/routes/_site/admin/index.tsx`, `lib/api/registry.ts`,
  `lib/api/scopes.ts`, `scripts/generate-sdk.ts` and `lib/i18n/config.ts`;
- features build on sprint 07 code: 02 on match scheduling (s07-06) and
  result claims (s06-20); 05 on the bulk lease pattern (s07-15); 06 on the
  assist layer and its page (s07-02); 09 and 14 on `prepareCommunityPost`
  and the community gate (s07-11, s07-16); 14 and 17 on the quiz-poll
  read-path registry (s07-19); 15 on review-all (s07-08) and folders
  (s07-09); 18 on the batch lookup (s07-13); 19 and 20 on the erasure
  registry (s07-20); 11 and 16 on the device-data registry (s07-03);
- the migration timestamps below sort after sprint 07's `20261127…`;
- sprint 07's `.prettierignore` and `lib/i18n/config.ts` blocks sit where
  Wave 0 adds sprint 08's; take both sides on conflict.

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
   07's block, one per line under the comment `// Sprint 08
   (docs/autonomous/sprint-08): one namespace per feature.`:
   `chart-overview`, `card-images`, `admin-api-oversight`, `rmhtube-stats`,
   `recurring-threads`, `more-game-assists`, `type-ghost`,
   `webhook-activity`, `admin-spam-sweep`, `music-scales`, `bracket-list`,
   `game-access`, `rss-feeds`, `feed-keyboard` (14 namespaces; 02, 03, 05,
   14, 19 and 20 write no UI strings). Create each `locales/en/<ns>.json`
   containing `{}` and a newline. Run `pnpm -s exec vitest run
   lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-config.test.ts` to
   check the registry accepts empty catalogues.
3. **Anchors** — so that two features of one wave never edit the same lines of
   a shared file. Each anchor is a comment line followed by one blank line; a
   feature keeps **its own anchor line** and adds its code directly below it.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of
     `anonymizeAccount`, directly after sprint 07's last anchor block
     (`// s07-20 erasure-coverage` and its line): a header comment `// Sprint 08
     erasures (docs/autonomous/sprint-08/plan.md §Anchors): each feature adds
     its operations under its own line.` then `// s08-01 rmhtube-stats`,
     `// s08-09 recurring-threads`, `// s08-11 type-ghost`,
     `// s08-19 erasure-private`, `// s08-20 erasure-games`. Also, **after**
     the transaction and after `dropLearnerBoardCaches(…)`, one line
     `// s08-20 erasure-games (after the transaction)` for 20's cache drops.
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields,
     after sprint 07's block: `// Sprint 08 back-relations (one block per
     feature, docs/autonomous/sprint-08/plan.md)` then
     `// s08-01 rmhtube-stats`, `// s08-09 recurring-threads`,
     `// s08-11 type-ghost`, `// s08-18 admin-spam-sweep`. Run
     `pnpm -s exec prisma validate` (dummy `DATABASE_URL`).
   - **New file `lib/account/export-sprint-08.server.ts`**, a copy of the shape
     of `lib/account/export-sprint-07.server.ts`: `async function
     exportSprint08(userId: string): Promise<Record<string, unknown>>` returning
     one object literal; inside it the header comment `// Sprint 08 exports
     (docs/autonomous/sprint-08/plan.md §Anchors)` then
     `// s08-01 rmhtube-stats`, `// s08-09 recurring-threads`,
     `// s08-11 type-ghost`, `// s08-15 card-images`. Each feature adds one
     property (`typeGhosts: await exportTypeGhosts(userId),`) under its line.
     Wave 0 calls it **once** from `lib/account/api/account.export.server.ts`
     beside the `exportSprint07(userId)` call and adds the result to the
     payload as `sprint08`, with `lib/account/__tests__/export-sprint-08.test.ts`
     asserting the key. Implementers **never edit `account.export.server.ts`**.
     18's sweeps are admin records and are not exported (moderator records in
     the export are an open owner decision).
   - `lib/sitemap.ts`, `EXCLUDED_ROUTES`: after sprint 07's personal block,
     `// Sprint 08 (docs/autonomous/sprint-08/plan.md §Anchors)` then
     `// s08-08 admin-api-oversight` (`/admin/api-keys`, `admin`),
     `// s08-17 rss-feeds` (only if the coverage test lists feed routes),
     `// s08-18 admin-spam-sweep` (`/admin/sweeps`, `admin`).
     **Param-less paths go in `EXCLUDED_ROUTES`, never `DYNAMIC_ROUTES`.**
   - `server/jobs/index.ts`, at the end of `REGISTRATIONS` after sprint 07's
     block: `// Sprint 08 (docs/autonomous/sprint-08/plan.md §Anchors)` then
     `// s08-05 durable-fanouts`, `// s08-09 recurring-threads`,
     `// s08-18 admin-spam-sweep`. (Each also adds one import at the top; the
     three are in different waves.)
   - `components/feed/notification-labels.ts`, in `systemLabels`'s returned
     object directly before `default:` and after sprint 07's block:
     `// Sprint 08 system labels (docs/autonomous/sprint-08/plan.md §Anchors)`
     then `// s08-08 admin-api-oversight`, `// s08-09 recurring-threads`,
     `// s08-18 admin-spam-sweep`; and the same anchor lines in
     `components/feed/__tests__/notification-labels.test.ts` where it pins
     each label's key and English text. Labels are literal
     `t('system-label-<type>', { ns: 'feed', defaultValue: '…' })` calls and
     land in `locales/en/feed.json`.
   - `app/routes/_site/admin/index.tsx`, after sprint 07's block:
     `{/* Sprint 08 admin tools */}` then `{/* s08-08 admin-api-oversight */}`
     and `{/* s08-18 admin-spam-sweep */}`. The `t()` calls sit inside props,
     never directly after a `{/* */}` comment.
   - `lib/api/registry.ts`, at the end of the paths, after sprint 07's block:
     `// Sprint 08 (docs/autonomous/sprint-08/plan.md §Anchors)` then
     `// s08-02 api-tournaments`, `// s08-03 api-scheduled`,
     `// s08-14 api-search`. 15's flashcard image fields are edited in place
     in the existing flashcard schema (wave 1, alone in its area).
   - `lib/api/scopes.ts`, at the end of the scope list: `// Sprint 08` then
     `// s08-02 api-tournaments`, `// s08-03 api-scheduled`,
     `// s08-14 api-search`.
   - `scripts/generate-sdk.ts`, at the end of `NULLABLE`: `// Sprint 08` then
     `// s08-02 api-tournaments`, `// s08-03 api-scheduled`,
     `// s08-14 api-search`, `// s08-15 card-images`.
   - `docs/developer-api/changelog.md` (newest section first): a new top
     section `## Sprint 08 — 2026-11` holding one HTML comment line per API
     feature, `<!-- s08-08 admin-api-oversight -->`,
     `<!-- s08-15 card-images -->`, `<!-- s08-02 api-tournaments -->`,
     `<!-- s08-03 api-scheduled -->`, `<!-- s08-12 webhook-activity -->`,
     `<!-- s08-14 api-search -->`; each feature writes its bullets under its
     line. (08 and 15 share wave 1, and both would otherwise prepend at the
     top of the file and conflict.) Integration may split the section by
     domain after wave 7.
   - **No settings-nav anchor:** no sprint 08 feature adds a settings page
     (01's pause lives in RMHTube, 07's keys in the existing keyboard page,
     11's switch in RMHType solo settings).
4. **No new shared helper.** `lockKey` serves every cap; the bulk lease
   pattern (s07-15) is copied, not extracted, by 05 and 18 (05's
   `lib/fanout/` is its own); `useConfirm` and `usePrompt` every
   confirmation; `components/ui/tabs.tsx` every tab strip;
   `lib/calendar/tz.ts` every time-zone computation; the site's locale
   formatters every date and number; `components/ui/arrive.tsx` every arrival
   fade; `lib/async-pool.ts` every bounded fan-out.
5. `.prettierignore` gains `/docs/autonomous/sprint-08/` after sprint 07's line,
   with the same comment, and `docs/autonomous/README.md` gains the sprint 08
   row (done in these documents).
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

## Waves

| Wave | Slot A                    | Slot B                    | Slot C                   |
| ---- | ------------------------- | ------------------------- | ------------------------ |
| 1    | 04 chart-overview         | 15 card-images            | 08 admin-api-oversight   |
| 2    | 01 rmhtube-stats          | 02 api-tournaments        | 09 recurring-threads     |
| 3    | 06 more-game-assists      | 03 api-scheduled          | 05 durable-fanouts       |
| 4    | 11 type-ghost             | 12 webhook-activity       | 18 admin-spam-sweep      |
| 5    | 10 music-scales           | 14 api-search             | 16 bracket-list          |
| 6    | 13 game-access-info       | 17 rss-feeds              | 19 erasure-private       |
| 7    | 07 feed-keyboard          | 20 erasure-games          | —                        |

Dependencies that fix the order:

- 02 (w2) → 03 (w3) → 14 (w5): all three edit `lib/api/scopes.ts`,
  `lib/api/registry.ts`, `scripts/generate-sdk.ts` (anchored) and the
  hand-written `docs/developer-api/{changelog,scopes}.md` (appended; different
  waves). 15 (w1) edits the flashcard schema fields in place and adds a
  `NULLABLE` line; 12 (w4) appends to `docs/developer-api/webhooks.md` and
  `changelog.md`.
- 02 (w2) → 12 (w4) → 16 (w5): `lib/tournaments/`: 02 only imports from it
  (its code is in `lib/api/v1/tournaments.server.ts`), 12 adds the emit in
  `settleMatch` (`tournament.server.ts`), 16 adds `rounds-view.ts` and edits
  `components/tournaments/*`.
- 09 (w2) → 03 (w3): 03 moves the scheduled create into
  `lib/scheduled/create.server.ts`; 09 only calls `publishScheduledPost` and
  writes its own `ScheduledPost` rows from its job (not counted against the
  moderator's drafts cap, since they publish at once). Neither edits
  `publish.server.ts`.
- 09 (w2) → 05 (w3): 05 rewrites the post-alert fan-out; 09's posts reach it
  through the existing enqueue, unchanged.
- 05 (w3) → 18 (w4): both copy the s07-15 lease; the jobs anchor lines are
  separate.
- 08 (w1) → 18 (w4): admin hub, sitemap and notification-label anchors
  (separate lines).
- 06 (w3) → 13 (w6): 13 shows 06's new capability claims.
- 06 (w3), 11 (w4) → 20 (w7): 20 erases `ArcadeSeedRun` (06 adds
  `detail.assisted`) and the RMHType tables (11 adds and classifies
  `RmhTypeGhost` itself).
- 01 (w2) → 19 (w6) → 20 (w7): all three edit `erasure-registry.ts` and
  `TODO_CEILING` (01 by one, 19 and 20 by their counts) and regenerate
  `docs/account-deletion.md`; 19 leaves `RmhTubeUserStats` to 01.
- 14 (w5) → 17 (w6): both add files to the post read-path registries
  (content warnings, GIF descriptions, quiz polls, quiet counts where it
  applies); different waves, appended entries.
- 11 (w4) → 16 (w5): both add a line to `lib/device-data/registry.ts`.
- 07 (w7) is the sweeping feature (every post list, `RMHarkCard.tsx`,
  `RMHarkActions.tsx`, `VirtualPostList.tsx`) and runs last with 20, which
  touches no UI file.

## Shared files and who touches them

| File                                                          | Kind                          | Who                                                         |
| ------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `lib/i18n/config.ts` (`NAMESPACES`)                           | registry                      | **Wave 0 only**                                             |
| `locales/en/<ns>.json`                                        | generated (extract)           | each feature, its own file only; `feed.json` for labels (08, 09, 18) |
| `prisma/schema/auth.prisma` (`User`)                          | source, **anchored**          | 01, 09, 11, 18                                              |
| `prisma/schema/rmhtube.prisma`                                | source                        | 01                                                          |
| `prisma/schema/communities.prisma`                            | source                        | 09                                                          |
| `prisma/schema/rmhtype.prisma`                                | source                        | 11                                                          |
| `prisma/schema/rmhstudy.prisma`                               | source                        | 15                                                          |
| `prisma/schema/developer.prisma`                              | source                        | 08                                                          |
| `prisma/schema/moderation.prisma`                             | source                        | 18                                                          |
| `prisma/schema/fanout.prisma`                                 | new                           | 05                                                          |
| `lib/account/deletion.server.ts`                              | source, **anchored**          | 01, 09, 11, 19, 20                                          |
| `lib/account/erasure-registry.ts` (`TODO_CEILING`)            | source (alphabetical; not anchored) | 01, 09 (w2), 11, 18 (w4) add entries at their alphabetical place, so same-wave hunks are far apart; 19 (w6), 20 (w7) many; ceiling only 01, 19, 20 (different waves) |
| `docs/account-deletion.md`                                    | generated (`pnpm docs:deletion`) | each feature that edits the registry                     |
| `lib/account/export-sprint-08.server.ts`                      | new in Wave 0, **anchored**   | 01, 09, 11, 15                                              |
| `lib/account/api/account.export.server.ts`                    | source                        | **Wave 0 and integration only**                             |
| `lib/sitemap.ts`                                              | source, **anchored**          | 08, 17 (if needed), 18                                      |
| `server/jobs/index.ts`                                        | source, **anchored**          | 09 (w2), 05 (w3), 18 (w4)                                   |
| `components/feed/notification-labels.ts` + its test          | source, **anchored**          | 08, 09, 18                                                  |
| `app/routes/_site/admin/index.tsx`                            | source, **anchored**          | 08, 18                                                      |
| `lib/api/registry.ts`                                         | source, **anchored** (paths)  | 02, 03, 14 (anchored); 15 in place (flashcard fields)       |
| `lib/api/scopes.ts`                                           | source, **anchored**          | 02 (w2), 03 (w3), 14 (w5)                                   |
| `scripts/generate-sdk.ts` (`NULLABLE`)                        | source, **anchored**          | 02, 03, 14, 15                                              |
| `docs/developer-api/changelog.md`                             | hand-written, **anchored**    | 08, 15 (w1), 02 (w2), 03 (w3), 12 (w4), 14 (w5)             |
| `docs/developer-api/{scopes,webhooks,errors,rate-limits}.md`  | hand-written docs             | scopes: 02, 03, 14 (different waves); webhooks: 12; errors, rate-limits: 08 |
| `lib/api/errors.ts`                                           | source                        | 08 (`key_suspended`); 02, 03, 14 only if they add a code (different waves) |
| `lib/device-data/registry.ts`                                 | source                        | 11 (w4), 16 (w5) — one line each                            |
| post read-path registries (content warnings, GIF descriptions, quiz polls) | source           | 14 (w5), 17 (w6) — append entries                           |
| `lib/scheduled/api/scheduled.server.ts`, `scheduled.$id.server.ts` | source                   | 03                                                          |
| `lib/communities/post-alerts.server.ts`, `lib/events/updates.server.ts` | source              | 05                                                          |
| `lib/communities/modlog.ts`, `components/communities/ModPanel.tsx` | source                   | 09                                                          |
| `lib/moderation/content.server.ts`                            | source                        | 18                                                          |
| `lib/api/developer-auth.server.ts`, `with-developer-api.server.ts` | source                   | 08                                                          |
| `components/developer/KeysManager.tsx`, `lib/developer/keys-list.server.ts` | source          | 08                                                          |
| `lib/webhooks/*`, `components/developer/webhooks/EndpointFormDialog.tsx` | source             | 12                                                          |
| `lib/builds/releases.server.ts`, `lib/events.server.ts` (`rsvp`), `lib/reading/shelves.server.ts`, `highlights.server.ts` | source | 12 (one emit line each)                  |
| `lib/tournaments/tournament.server.ts`                        | source                        | 12 (w4)                                                     |
| `components/tournaments/*`, `app/routes/_site/tournaments.$id.tsx` | source                   | 16                                                          |
| `lib/game/assist.ts`, `lib/game-capabilities.ts`              | source                        | 06 (w3); 13 (w6) reads only                                 |
| `lib/arcade/runs.server.ts`                                   | source                        | 06                                                          |
| `features/dream-rift/**`, `features/nightrail/**`             | source                        | 06                                                          |
| `features/slice-it/**`                                        | source                        | 04                                                          |
| `server/rmhtube/*`, `components/rmhtube/RmhTubeLanding.tsx`   | source                        | 01                                                          |
| `server/socket-server/handlers/rmhtype.ts`, `components/rmhtype/*` | source                   | 11                                                          |
| `lib/rmhmusic/learn/**`, `components/rmhmusic/learn/*`        | source                        | 10                                                          |
| `components/steam/GamePage.tsx`, `LibraryList.tsx`, `lib/games/library.ts` | source           | 13                                                          |
| `lib/study/*`, `components/study/*`, `lib/media/ingest.server.ts` (`POLICIES`) | source       | 15                                                          |
| `app/routes/_site/c.$slug.tsx`, `_site/builds/$slug.tsx`, `games/_library/$gameId_.updates.tsx` | source | 17 (`head()` and one link)                |
| `lib/shortcuts/registry.ts`, `components/site/KeyboardShortcuts.tsx`, `components/feed/RMHarkCard.tsx`, `RMHarkActions.tsx`, `VirtualPostList.tsx`, `FeedRow.tsx` | source | 07 (w7, last) |
| `lib/api/route-table.server.ts`                               | generated (`pnpm api:routes`) | each feature regenerates it; **integration regenerates on every merge** |
| `app/routeTree.gen.ts`                                        | generated (vite)              | **integration only**                                         |
| `docs/_generated/facts.json`, `docs/site-reference/*`, the SDK output | generated             | **integration regenerates** (`pnpm facts:generate`, `pnpm docs:site`, `pnpm docs:api`, `pnpm sdk:generate`); API features run `sdk:generate` and `docs:api` themselves and commit the output |
| `server/rmhbox/leaderboard.ts`                                | source                        | 20 (the board skips reset profiles)                          |
| `lib/account/api/account.delete.server.ts`                    | source                        | 19 (the pronunciation clip's object, beside the résumé objects) |
| `lib/tournaments/match-results.ts` (`wouldCompleteTournament`) | source, read only             | 02 imports it                                                |
| `lib/catalog/**`                                              | source                        | nobody (no new games or apps)                                |

## Migration timestamps

All additive; `.github/scripts/check-migrations-additive.mjs` must pass. Every
timestamp sorts after sprint 07's `20261127070000…`. The pattern is
`202611280<wave><slot>00`.

| Feature | Migration(s) |
| ------- | ------------ |
| 15      | `20261128010200_s08_card_images` |
| 08      | `20261128010300_s08_admin_api_oversight` |
| 01      | `20261128020100_s08_rmhtube_stats` |
| 09      | `20261128020300_s08_recurring_threads` |
| 05      | `20261128030300_s08_durable_fanouts` |
| 11      | `20261128040100_s08_type_ghost` |
| 18      | `20261128040300_s08_admin_spam_sweep` |

02, 03, 04, 06, 07, 10, 12, 13, 14, 16, 17, 19 and 20 have no schema change.
New tables get plain indexes in their own migration. No feature adds an index
to an existing table; if an implementer finds one needed, it is
`CREATE INDEX CONCURRENTLY` in a migration that holds exactly one statement,
followed by an `_ensure_valid` migration (copy
`prisma/migrations/20261126060101_s06_flashcard_external_id_index` and
`20261126060102_s06_flashcard_external_id_index_ensure_valid`), declared in
the schema with `@@index` and **Prisma's default name**
(`<table>_<columns>_idx`) in the SQL, and reported to integration.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-08`, never pushed until the sprint
  PR.
- Feature branch: `autonomous/s08-<slug>` from the sprint branch **as it is
  when the wave starts**.
- Worktree: `/home/user/wt/s08-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge or
  rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite and product files, plus the gate
   tests that cover what they touched (route table, API handler adoption,
   raw-fetch ratchet, `useeffect-fetch-ratchet`, `zod-off-hot-routes`,
   `islands` (any island entry), boundaries and the lint ratchet
   (`pnpm lint:ratchet`: no import cycles, `lib/` never imports
   `components/`), i18n catalogs and drift, the computed-key ratchet, the
   native-dialog ratchet, sitemap and OG coverage, test discovery, design
   consistency and Steel flat when UI changed, the rAF allowlist, arrival
   coverage, the escape-hatch ratchet, tsconfig projects, server-fn guards,
   the device-data registry test when a storage key was added, the
   migration-safety test when a migration was added, erasure coverage when
   a `User` relation was added, every read-path registry test the feature
   names).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed
   from the wave's base schema, and the additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file (and
   `feed.json` for the label features).
5. `pnpm api:routes` when an endpoint module was added, moved or removed.
6. API features (02, 03, 14, and 15 for its field additions; 12 when the
   webhook list is in generated output): `pnpm sdk:generate` and
   `pnpm docs:api`, committing their output; the SDK must type every new
   field (no `unknown`), through `NULLABLE` where the example is `null`.
7. Registry features (01, 09, 11, 18, 19, 20): `pnpm docs:deletion` and commit
   `docs/account-deletion.md`.
8. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s08-<slug>`. On a conflict in a generated file,
   take either side and regenerate; anchored files should not conflict (if one
   does, keep both features' blocks under their anchors). On
   `TODO_CEILING`, set it to the number of `todo` entries the merged registry
   holds.
2. Regenerate: `pnpm api:routes`; the route tree (start
   `pnpm exec vite --port 7999 --strictPort`, wait until `app/routeTree.gen.ts`
   changes, stop it — 08 and 18 add admin pages; 02, 03 and 14 add v1 route
   files; 17 adds feed routes); `pnpm facts:generate`; `pnpm docs:site`;
   `pnpm docs:api`; `pnpm sdk:generate`; `pnpm docs:deletion`.
3. `pnpm exec prisma generate`, then `pnpm exec tsc -b --checkers 1` alone.
4. `pnpm test` and `pnpm test:product`.
5. **Raw SQL and lock smoke test** for every `lockKey` user, lease and any raw
   SQL: apply the migrations to a throwaway Postgres (the integration suite's,
   `docs/testing.md` §8) and run each new query once; for 05 and 18 the lease
   claim with two sessions, for 09 the cron claim, for 03 the drafts cap
   under two concurrent creates, for 15 the picture cap.
6. Review the diff against the brief and the specification's acceptance
   criteria; fix or send back. Check every read path the feature names: 14
   and 17 (the post read-path registries), 11 and 16 (the device-data
   registry), 01, 09, 11, 18, 19, 20 (the erasure registry and its ceiling),
   06 (`ASSIST_CAPABLE` ↔ capabilities), 12 (payload allowlists).
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Confirm `exportSprint08` carries 01, 09, 11 and 15's sections, and that the
  erasure coverage test passes with every sprint 08 table classified and
  `TODO_CEILING` equal to the `todo` count.
- `pnpm check:consistency --base main`, `pnpm typecheck`,
  `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`, `pnpm build` with
  `scripts/check-bundle-budget.ts`, and a real-browser pass over every new or
  changed page in Day and Night at 390 px and 1280 px, and once in `ar`; the
  app-tier surfaces (Slice It 04, RMHTube 01, RMHType 11, RMH Music 10, the
  games library 13, Dream Rift and Nightrail 06) in their own look.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code
lines (TypeScript, TSX, SQL, CSS) separately from documentation lines, measured
with `git diff --numstat` from the Wave 0 parent commit to `HEAD`, filtered by
extension, excluding generated files (`routeTree.gen.ts`,
`route-table.server.ts`, `facts.json`, `docs/site-reference/**`, SDK output,
`locales/**`, `docs/account-deletion.md`). It also lists the final
`TODO_CEILING`, every table 19 and 20 left `todo` with its reason, and the
open owner decisions this sprint met (01's public card, `RebarReservation`).
