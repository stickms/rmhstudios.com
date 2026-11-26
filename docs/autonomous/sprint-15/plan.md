# Sprint 15 — implementation plan

How the twenty features are built: seven waves of at most three concurrent implementers, each in its own git worktree
and branch, merged into the sprint branch `claude/autonomous-sprint-15` by one integration owner between waves. The
machine budget and the per-feature checks are sprint 14's, restated so this file stands alone, with what sprint 14's
implementers and integration learned folded into the briefs (§Implementer rules).

## Precondition: sprint 14 is in the sprint branch

`claude/autonomous-sprint-15` is cut from `origin/main` once the squashed sprint 14 commit (`23176a429`, "Sprint 14:
games that remember, reports that reach every member text, and rules that hold everywhere") has landed there, or from
`autonomous/s15-design` (which is that commit plus these documents) if it has not landed yet; then `git merge
origin/main` again when it lands (the content is identical). This design was checked against `23176a429`. Wave 0 is
committed on top of that. Wave 1 does not start before, because:

- the Wave 0 anchors go **after** sprint 14's anchor blocks in `lib/account/deletion.server.ts` (after
  `// s14-18 erasure-plain-columns` and its spread, before `// med-schools-phase-4 …`), `prisma/schema/auth.prisma`
  (after `// s14-06 puzzle-reports` and its line), `lib/notifications/notice-keys.ts`,
  `components/feed/notice-previews.ts`, `components/feed/notification-labels.ts` (and its test), `lib/i18n/user-text.ts`,
  `lib/feed/__tests__/quiet-counts.test.ts`, `lib/errors/codes.ts`, `components/errors/refusal-sentence.ts`,
  `lib/game/leaderboard-privacy.ts`, `lib/moderation/mute-expiry.ts`, `lib/api/registry.ts`, `lib/api/scopes.ts`,
  `scripts/generate-sdk.ts`, `docs/developer-api/changelog.md`, `server/jobs/index.ts` and the report files;
- features build on sprint 14 code: 04, 05 and 06 on the report path sprint 14 anchored (07–10) and
  `MEMBER_ITEM_REPORT_TYPES`; 16 on every `moderatedAt` takedown sprints 12–14 added; 07 on the puzzle reports (s14-06)
  and the jam edit (s14-14); 12 on `notifyThreadReply` (s14-11); 15 on "Your matches" (s14-03); 17 on Identity Crisis
  (s14-01) and the pack reports (s13-16, s14-20); 19 on sprint 14's integration findings; 20 on s14-01, s14-04,
  s14-16 and s14-18; 03 and 10 on the explicit scopes (s13-10) and the developer API anchors (s14-15); every brief on
  `shapeChecked` and `assertJsonSafe` (s14-19);
- **migration timestamps:** `main`'s newest migration at the design pass is sprint 14's
  `20261228060300_s14_supporter_marks`; sprint 15's sort after it, at `20270105…`. (Checked again at validation: `origin/main`
  is now `894b511d3`, sprint 14's merge `9b7ff68fd` plus an on-call change that adds no migration and touches only
  `lib/oncall/**`, `components/admin/oncall/**`, `lib/admin/api/admin.oncall*.server.ts`, `lib/admin/admin-ops.contract.ts`
  (16 copies its patterns; nothing edits it), `lib/api/route-table.server.ts` (regenerated) and `locales/en/f-oncall.json`;
  none is a sprint 15 file.) Integration checks the newest name
  on `main` at each wave start and, if `main` has passed `20270105`, renames the wave's migrations forward before
  merging;
- **the refusal switch** ends at sprint 14's `FEATURE_RESTRICTED_UNTIL` (`components/errors/refusal-sentence.ts`, under
  `// s14-17 timeouts-everywhere`), and `ERROR_CODES` ends at the same code (`lib/errors/codes.ts`).

## Machine budget

4 cores and 15 GB, shared. A cold `tsc -b` of the site project does not fit even single-threaded (sprint 14's
integration ran it in 24 slices of 11.6–13.2 GB each), so **implementers never run `pnpm typecheck`, a whole-project
`tsc`, `pnpm test`, `pnpm dev` or `vite` dev.** They run targeted vitest files, eslint on their changed files, the
touched-files type check (about 15–40 s and 2–4 GB), and the commit gate (`--fast`, about 1 GB; it skips `tsc`).
**The client build is new in the implementer's list (rule 3 below), run alone under a lock.** They never run prettier
over files that existed before. Each worktree has its own `node_modules` (`pnpm install --frozen-lockfile --offline`).
At most three implementers run at once. **jsdom is not installed:** component tests render with `react-dom/server` or
test the pure logic. **Timing tests** take the fastest of several runs.

## Implementer rules new this sprint (from sprint 14's integration)

Each brief carries these in its "Sprint 15 additions" section:

1. **Fakes go through the schema checker, always.** Every new Prisma fake is wrapped in `shapeChecked` (or the
   economy fake's `checkedDb`, `lib/economy/__tests__/fake-db.ts`), and every response body a test reads goes
   through `assertJsonSafe` (`lib/db/query-shape.ts`). Sprint 14's adoption found a live bug on its first day.
2. **Touched-files type check, mandatory**, with `lib/tf2-game/vite-env.d.ts` in the list (sprint 14's Wave 0
   correction, now in the recipe from the start). 0 errors before each commit.
3. **The client build when a server module's exports change.** A brief whose feature adds a `*.server.ts` module that
   a client file could reach, or adds or re-exports names from an existing `*.server.ts`, runs the client build once
   before its last commit: `flock /home/user/wt/.s15-build.lock pnpm build:frontend` (about 8 GB, so the lock keeps it
   to one worktree at a time; wait for it). Sprint 14's 17 broke the client build with an inline type re-export, and
   nothing but a build would have caught it. `lib/__tests__/server-stub-exports.test.ts` is in every gate list.
4. **Name the cross-feature gates the files touch.** Each brief lists the gates its files can trip, by name:
   `lib/__tests__/style-tiers.test.ts` (a site page that imports from a folder `app/site-tier.css` excludes whole: make
   the exclusion per-file, as sprint 14's integration did for `components/steam/`, `components/daily-puzzles/` and
   `lib/daily-puzzles/`), `components/shell/__tests__/shell.test.tsx` (it now has a `QueryClientProvider`; a new shell
   query must work under it), the quiet-counts `EXEMPT` anchor, and every characterization snapshot a file feeds.
5. **Dates rendered on the server are formatted in UTC until mount**, then in the viewer's zone (sprint 14 16's
   hydration error #418). A test pins the server render's zone.
6. **Phones at 390 px:** a row's controls must not overlap or push out a name; the brief says which rows to check
   (sprint 14 12's header overlap).
7. **Existing Tailwind utilities only** on the site tier (B5): no new arbitrary values and no new responsive variants
   (sprint 14 09's `sm:border-s` grew the site CSS and was reverted). `git grep` a utility before using it.
8. **A new public GET declares a cache policy** (`lib/api/cache-policies.ts`; `lib/__tests__/api-cache-policy.test.ts`),
   and **audio uses the shared context** (`getAudioContext()` in `lib/shared/platform.ts`;
   `lib/__tests__/audio-context-ratchet.test.ts`), as in sprint 14.

## Wave 0 — scaffolding (integration commits it before Wave 1)

1. The precondition merge above.
2. **Namespaces.** Add to `NAMESPACES` in `lib/i18n/config.ts`, one per line, each **in sorted place** (the list is
   sorted; `lib/__tests__/i18n-catalogs.test.ts` holds that): `calc-graphs`, `character-resources`, `dream-rift-coop`,
   `fix-notices`, `haw-saves`, `human-keyboard`, `jam-suggestions`, `member-text-reports`, `more-packs`,
   `prediction-comments`, `removal-appeals`, `synapse-rivals`, `thread-mentions`, `tournament-prizes`,
   `workshop-reports` (15 namespaces; 03 and 10 are the developer API's English JSON and docs, 18, 19 and 20 write into
   each fixed file's namespace). The design pass checked that none is taken at `23176a429` (`jam-themes` was, sprint
   07's, so 13 is `jam-suggestions`); check again (`grep -n '"<name>"' lib/i18n/config.ts`) and suffix a taken one with
   `-s15`, correcting its brief. Create each `locales/en/<ns>.json` containing `{}` and a newline. Features under
   `features/<id>/` also list their namespace in that folder's `feature.ts` (`namespaces`): 09 in
   `features/dream-rift/`, 11 in `features/rmhcharacters/`, 15 in `features/synapse-storm/`, and 02 in
   `features/nightrail/` if its strings land there — each feature adds its own line (not Wave 0). Run
   `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-config.test.ts`.
3. **Anchors** — so that two features of one wave never edit the same lines of a shared file. Each anchor is a comment
   line followed by one blank line; a feature keeps **its own anchor line** and adds its code directly below it.
   - `lib/account/deletion.server.ts`, three blocks:
     - **pre-steps**, directly after `await eraseSharedMedEvents(userId);` and before `await prisma.$transaction([`:
       `// Sprint 15 pre-erasure steps (docs/autonomous/sprint-15/plan.md §Anchors)` then `// s15-09 dream-rift-coop`
       and `// s15-20 s14-gaps`;
     - **in the transaction**, after `// s14-18 erasure-plain-columns` and its spread, before
       `// med-schools-phase-4 …`: `// Sprint 15 erasures (docs/autonomous/sprint-15/plan.md §Anchors): each feature
       adds its operations under its own line.` then `// s15-08 calc-graphs`, `// s15-09 dream-rift-coop`,
       `// s15-13 jam-suggestions`, `// s15-16 removal-appeals`, `// s15-20 s14-gaps`;
     - **after the transaction**, after the last `await … .catch(() => {});` line: `// Sprint 15 after the transaction
       (docs/autonomous/sprint-15/plan.md §Anchors)` then `// s15-18 s13-gaps`.
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields, after sprint 14's block
     (`dailyPuzzleReports DailyPuzzleReport[]`): `// Sprint 15 back-relations (one block per feature,
     docs/autonomous/sprint-15/plan.md)` then `// s15-08 calc-graphs`, `// s15-13 jam-suggestions`,
     `// s15-16 removal-appeals`. Run `pnpm -s exec prisma validate` (dummy `DATABASE_URL`).
   - **New file `lib/account/export-sprint-15.server.ts`**, the shape of `lib/account/export-sprint-14.server.ts`:
     `async function exportSprint15(userId: string): Promise<Record<string, unknown>>` returning one object literal
     with the header `// Sprint 15 exports (docs/autonomous/sprint-15/plan.md §Anchors)` then `// s15-05
     prediction-comments`, `// s15-06 member-text-reports`, `// s15-08 calc-graphs`, `// s15-09 dream-rift-coop`,
     `// s15-13 jam-suggestions`, `// s15-14 tournament-prizes`, `// s15-16 removal-appeals`. Each feature adds one
     property under its line (a dynamic `import()` of its own module). Wave 0 calls it **once** from
     `lib/account/api/account.export.server.ts` beside `exportSprint14(userId)` as `sprint15` (the import, the
     `Promise.all` entry and both payload keys), with `lib/account/__tests__/export-sprint-15.test.ts` (a copy of
     `export-sprint-14.test.ts`, whose Proxy Prisma mock answers any model) asserting the key and, per anchor, a
     commented-out expectation the feature enables (`predictionComments`, `guestbookAndComments`, `calcTools`,
     `dreamRiftCoop`, `jamSuggestions`, `tournaments`, `contentRemovals`). Implementers **never edit
     `account.export.server.ts`**. 02's saves are `GameSave` rows (already exported), 07's review fields join
     sprint 14's `puzzleReports` export (its own function), 11's resources are in the character JSON (already exported).
   - `lib/sitemap.ts`: **no anchor** (validation: 16 adds no page; `/settings/account-status` stays the
     `LEGACY_REDIRECTS` entry it is). No feature adds to `EXCLUDED_ROUTES`, `STATIC_ROUTES` or `DYNAMIC_ROUTES`.
   - `server/jobs/index.ts`, at the end of the cron list after sprint 13's `// s13-18 billing-hardening` entry:
     `// Sprint 15 (docs/autonomous/sprint-15/plan.md §Anchors)` then `// s15-09 dream-rift-coop`.
   - **Notices** (07, 12, 16): in `lib/notifications/notice-keys.ts`, at the end of `NOTICE_TEMPLATES` and of
     `interface NoticeParamTypes`, the header `// Sprint 15 notices (docs/autonomous/sprint-15/plan.md §Anchors)` then
     `// s15-07 fix-notices`, `// s15-12 thread-mentions`, `// s15-16 removal-appeals`; the same lines directly before
     `default:` in `components/feed/notice-previews.ts`, in `systemLabels`'s object in
     `components/feed/notification-labels.ts` (after sprint 14's block, headed `// Sprint 15 system labels (…)`), and
     in `components/feed/__tests__/notification-labels.test.ts`.
   - `lib/i18n/user-text.ts`, at the end of `USER_TEXT_RENDERERS`: `// Sprint 15 (docs/autonomous/sprint-15/plan.md
     §Anchors)` then `// s15-01 human-keyboard`, `// s15-04 workshop-reports`, `// s15-05 prediction-comments`,
     `// s15-06 member-text-reports`, `// s15-09 dream-rift-coop`, `// s15-12 thread-mentions`,
     `// s15-13 jam-suggestions`, `// s15-14 tournament-prizes`, `// s15-15 synapse-rivals`,
     `// s15-16 removal-appeals`, `// s15-17 more-packs`, `// s15-19 integration-finds`. (A file in a folder
     `USER_TEXT_EXEMPT` already covers needs no entry; the scan says which.)
   - `lib/feed/__tests__/quiet-counts.test.ts`, at the end of `EXEMPT`: the same header, then
     `// s15-05 prediction-comments`, `// s15-06 member-text-reports` (an entry only if the scan asks, with an honest
     reason).
   - **Refusal codes:** `lib/errors/codes.ts`, at the end of `ERROR_CODES` (after `FEATURE_RESTRICTED_UNTIL`), and
     `components/errors/refusal-sentence.ts`, inside the `switch` after its last `case` (`FEATURE_RESTRICTED_UNTIL`)
     and before the switch's closing brace (no `default:`; exhaustive over `ErrorCode`): `// Sprint 15` then
     `// s15-06 member-text-reports`, `// s15-08 calc-graphs`, `// s15-09 dream-rift-coop`, `// s15-13 jam-suggestions`,
     `// s15-16 removal-appeals`. `locales/en/errors.json` cannot hold comments: each feature adds its keys in sorted
     place, and integration merges the JSON by taking both sides. Params are only those `lib/errors/refusal.ts` reads
     (`PARAM_NAMES`: `endsAt`, `count`, `max`, `limit`, `remaining`, `minutes`, `days`).
   - **Report path** (04, 05, 06, one per wave in waves 1–3): the header `// Sprint 15
     (docs/autonomous/sprint-15/plan.md §Anchors)` then `// s15-04 workshop-reports`, `// s15-05 prediction-comments`,
     `// s15-06 member-text-reports` at the end of `REPORT_ENTITY_TYPES`, of `REMOVABLE_REPORT_ENTITY_TYPES` and of
     `MEMBER_ITEM_REPORT_TYPES` (`lib/moderation/report-constants.ts`, after sprint 14's blocks); after the
     `// s14-10 tube-room-reports` blocks in `lib/moderation/api/moderation.report.server.ts` (both),
     `lib/moderation/triage.server.ts` (the takedown branch and the preview block), `lib/moderation/my-reports.server.ts`
     (both) and `components/moderation/MyReportsPanel.tsx` (both maps); and after sprint 14's block in the `labels`
     object of `components/feed/report-kind-label.ts`. 16 edits `decideReports` (not anchored; it is the only feature
     in triage in its wave).
   - `lib/game/leaderboard-privacy.ts`, at the end of `BOARD_PRIVACY_READ_PATHS`: `// Sprint 15` then
     `// s15-03 slice-api`, `// s15-09 dream-rift-coop`.
   - `lib/moderation/mute-expiry.ts`, at the end of `MUTE_READ_PATHS`: `// Sprint 15` then
     `// s15-05 prediction-comments`, `// s15-06 member-text-reports`, `// s15-12 thread-mentions`.
   - `lib/moderation/restriction-paths.ts` (no sprint anchors yet), at the end of `RESTRICTION_ENFORCEMENT_PATHS`, of
     `MEMBER_TEXT_MODELS` and of `RESTRICTION_WRITERS`: `// Sprint 15 (docs/autonomous/sprint-15/plan.md §Anchors)` then
     `// s15-13 jam-suggestions`, `// s15-17 more-packs`.
   - **Developer API** (03, 10; 18 changes one existing entry): `lib/api/registry.ts` at the end of `ENDPOINTS`,
     `lib/api/scopes.ts` at the end of the scope list, `scripts/generate-sdk.ts` at the end of `NULLABLE`:
     `// Sprint 15` then `// s15-03 slice-api`, `// s15-10 notifications-api`; `docs/developer-api/changelog.md` at the
     top of its list: `## Sprint 15 — 2027-02` then `<!-- s15-03 slice-api -->`, `<!-- s15-10 notifications-api -->`,
     `<!-- s15-18 s13-gaps -->`.
4. **One new shared helper, owned by a feature:** `components/ui/handle.tsx` is 19's (wave 1). Otherwise `lockKey`
   serves every cap and claim; `useConfirm` and `usePrompt` every confirmation; `components/ui/tabs.tsx` every site tab
   strip; `components/ui/menu.tsx` every menu; `lib/calendar/tz.ts` every time-zone computation; the site's locale
   formatters every date and number; `components/ui/arrive.tsx` every arrival fade; `notice()` every new `SYSTEM`
   notice; `refusalBody()` and `useRefusalText` every refusal; `lib/core/persist` every stored value;
   `recordAdminActionIn` every admin action; `components/moderation/ReportDialog.tsx` every content report;
   `getAudioContext()` every sound; `createCloudSave` every cloud save; `getHiddenAuthorIds` every block-and-mute filter.
5. Outside `docs/autonomous/sprint-15/` (the design pass wrote nothing else): `.prettierignore` gains
   `/docs/autonomous/sprint-15/` after sprint 14's line, with the same comment, and `docs/autonomous/README.md` gains
   the sprint 15 row ("Shelves members fill, games that keep their word, and the doors back from a removal").
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

**Wave 0 as built (integration, 2026-11-25).** The precondition held without a merge: the sprint branch is cut from
`origin/main` `890b3c406`, which contains sprint 14's merge `9b7ff68fd`, and `main`'s newest migration is still
`20261228060300_s14_supporter_marks`. No namespace was taken, so none is suffixed. Decisions taken where the text above
left room, as sprint 14's Wave 0 took them: every anchor, the last of a block included, is followed by one blank line
(also where the block ends a function, an array or an object); a block that follows code is preceded by one blank
line; in `moderation.report.server.ts`'s `resolveTargetUser` switch the anchors sit after the `tube-room` case's
`return`, before `case 'music-score':`; `exportSprint15` carries `void userId;` until the first feature uses its
argument; the commented expectations in `export-sprint-15.test.ts` use the keys this plan names, with `[]` for a list
and `{}` otherwise, which each feature corrects to the empty value its export returns when it enables its line. The
touched-files type check over the 25 changed files (without `quiet-counts.test.ts`, per the recipe) has 0 errors;
sprint 14's TS1117 on `scripts/generate-sdk.ts` is no longer reported. No brief needed a correction.

## Waves

| Wave | Slot A                   | Slot B                  | Slot C                  |
| ---- | ------------------------ | ----------------------- | ----------------------- |
| 1    | 19 integration-finds     | 04 workshop-reports     | 01 human-keyboard       |
| 2    | 05 prediction-comments   | 03 slice-api            | 02 haw-saves            |
| 3    | 06 member-text-reports   | 15 synapse-rivals       | 11 character-resources  |
| 4    | 16 removal-appeals       | 08 calc-graphs          | 09 dream-rift-coop      |
| 5    | 07 fix-notices           | 10 notifications-api    | 12 thread-mentions      |
| 6    | 17 more-packs            | 13 jam-suggestions      | 14 tournament-prizes    |
| 7    | 18 s13-gaps              | 20 s14-gaps             | —                       |

The rule the waves keep: **no two features of one wave edit the same file unless that file is anchored** (each feature
under its own Wave 0 line) or generated (integration regenerates it). A ratchet's `BASELINE` line is the one exception that cannot be
anchored: if two features of a wave both move one (none is planned to: only 19 lowers the escape-hatch ratchet, in wave
1), integration takes either side and sets it to the recount. The erasure registry
(`lib/account/erasure-registry.ts`) is alphabetical, not anchored: wave 4 adds `CalcGraph` (08, beside `CalcNotebook`)
and `ContentRemoval` (16, between `ContentAward` and `ContentReport`) and changes the reason of `DreamRiftCoopRun` (09),
three hunks hundreds of lines apart; 13 (`GameJamThemeSuggestion`) is wave 6. `TODO_CEILING` stays 4. The Prisma
schema files are split the same way: 16 `moderation.prisma`, 08 `rmhstudy.prisma`, 09 `games.prisma` in wave 4; 07
`games.prisma` in wave 5; 13 `competitive.prisma` in wave 6; 20 `prisma/schema/games/rmhbox.prisma` in wave 7;
04 `prisma/schema/games/tf2.prisma` and `prisma/schema/games/versecraft.prisma` in wave 1.

Dependencies that fix the order:

- **19 first.** It adds `components/ui/handle.tsx`, which later features use for any handle they print, and it
  sweeps 37 handle prints in files no other wave-1 feature touches (checked: none is in the TF2, Versecraft or RMHBox
  folders).
- **The report path:** 04 (w1) → 05 (w2) → 06 (w3), one report feature per wave, each under its own anchor; then 16
  (w4) reads every removable type (including 04's three `moderatedAt` types) and edits `decideReports`.
  `lib/moderation/__tests__/music-reports.test.ts` is run by each.
- **RMHBox:** 01 (w1) adds Human Keyboard → 17 (w6) adds a `packCode` setting to it and to Identity Crisis → 20 (w7)
  changes Identity Crisis's final phase, after 17's handler change merged.
- **Jams:** 07 (w5) edits `updateJam` in `lib/competitive/jams.server.ts` → 13 (w6) adds `deleteJam` beside it and
  edits `JamDetail.tsx` and `JamShortlistDialog.tsx`.
- **The games library:** 12 (w5) edits `lib/games/hub.server.ts`, `lib/games/thread-notices.server.ts`,
  `components/steam/ThreadPage.tsx`; nobody else this sprint.
- **Messages:** 19 (w1) edits `ConversationHeader.tsx` → 18 (w7) edits `lib/messages/mutations.server.ts`.
- **Developer API:** 03 (w2) and 10 (w5) each own their entries under anchors; 18 (w7) changes the characters entry's
  example and `lib/api/v1/characters.server.ts`; the generated SDK and API docs are regenerated by each and **by
  integration on every merge after 03**.
- **Erasure:** 08, 09, 16 (w4), 13 (w6), 18 and 20 (w7) under their anchors in three blocks; 09's and 20's reads before
  the transaction are pre-steps, 18's publish is after it.
- **Altair:** 20 (w7) is the only feature in `features/altair/` this sprint.

## Shared files and who touches them

| File | Kind | Who |
| --- | --- | --- |
| `lib/i18n/config.ts` (`NAMESPACES`) | registry | **Wave 0 only** |
| `locales/en/<ns>.json` | generated (extract) or hand-added | each feature its own; `notice-language.json` and `feed.json` for 07, 12, 16; `errors.json` for refusals; 18 removes one key from `f-reading.json` |
| `prisma/schema/auth.prisma` (`User`) | source, **anchored** | 08, 13, 16 |
| `prisma/schema/games/tf2.prisma`, `prisma/schema/games/versecraft.prisma` | source | 04 |
| `prisma/schema/moderation.prisma` | source | 16 |
| `prisma/schema/rmhstudy.prisma` | source | 08 |
| `prisma/schema/games.prisma` | source | 09 (w4, `DreamRiftCoopRun`), 07 (w5, `DailyPuzzleReport`) |
| `prisma/schema/competitive.prisma` | source | 13 |
| `prisma/schema/games/rmhbox.prisma` | source | 20 |
| `lib/account/deletion.server.ts` | source, **anchored** (three blocks) | 08, 09, 13, 16, 18, 20 |
| `lib/account/erasure-registry.ts` | source (alphabetical) | 08, 09, 16 (w4), 13 (w6) |
| `docs/account-deletion.md` | generated (`pnpm docs:deletion`) | 08, 09, 13, 16, 20 |
| `lib/account/export-sprint-15.server.ts` and its test | new in Wave 0, **anchored** | 05, 06, 08, 09, 13, 14, 16 |
| `lib/account/api/account.export.server.ts` | source | **Wave 0 and integration only** |
| `lib/sitemap.ts`, `lib/route/legacy-redirects.ts` | source | nobody (16 adds no page) |
| `server/jobs/index.ts` | source, **anchored** | 09 |
| `lib/notifications/notice-keys.ts`, `components/feed/notice-previews.ts`, `notification-labels.ts` + test | source, **anchored** | 07, 12, 16 |
| `lib/i18n/user-text.ts` | source, **anchored** | 01, 04, 05, 06, 09, 12–17, 19 |
| `lib/feed/__tests__/quiet-counts.test.ts` (`EXEMPT`) | test registry, **anchored** | 05, 06 if needed |
| `lib/errors/codes.ts`, `components/errors/refusal-sentence.ts` | source, **anchored** | 06, 08, 09, 13, 16 |
| the six report files (`report-constants.ts`, `moderation.report.server.ts`, `triage.server.ts` takedowns and previews, `my-reports.server.ts`, `MyReportsPanel.tsx`, `report-kind-label.ts`) | source, **anchored** | 04 (w1), 05 (w2), 06 (w3) |
| `lib/moderation/triage.server.ts` (`decideReports`) | source | 16 (w4) |
| `components/moderation/ReportDialog.tsx` | source | nobody (opened with an entity type) |
| `lib/game/leaderboard-privacy.ts` (`BOARD_PRIVACY_READ_PATHS`) | source, **anchored** | 03, 09 |
| `lib/moderation/mute-expiry.ts` (`MUTE_READ_PATHS`) | source, **anchored** | 05, 06, 12 |
| `lib/moderation/restriction-paths.ts` | source, **anchored** | 13, 17 |
| `lib/api/registry.ts`, `lib/api/scopes.ts`, `scripts/generate-sdk.ts`, `docs/developer-api/changelog.md` | source, **anchored** | 03, 10; 18 (the characters entry and a changelog line) |
| `lib/developer/explorer.ts` (`DOCUMENTED_GROUPS`) | source | 03 |
| `packages/sdk/**`, `docs/developer-api/endpoints/**` | generated (`pnpm sdk:generate`, `pnpm docs:api`) | 03, 10, 18; **integration regenerates on every merge after 03** |
| `app/routes/api/v1/slice-it/**`, `app/routes/api/v1/me/slice-it/**`, `lib/api/v1/slice-it.server.ts` | source | 03 |
| `app/routes/api/v1/me/notifications*`, `lib/api/v1/notifications*.ts` | source | 10 |
| `components/ui/handle.tsx`, the 37 handle prints, `lib/daily-puzzles/persistence.ts`, `lib/daily-puzzles/result-shapes.ts`, `components/daily-puzzles/{Alibi,Chainlink,Outcast,Spectrum,Impostor}Game.tsx`, `DailyPuzzlesHub.tsx`, `components/feed/conversation/ConversationHeader.tsx` | source | 19 |
| `lib/rmhbox/human-keyboard/**`, `server/rmhbox/minigames/human-keyboard/**`, `components/rmhbox/minigames/human-keyboard/**`, `data/rmhbox/human-keyboard/**`, `lib/rmhbox/minigame-registry.ts`, `server/rmhbox/game-coordinator.ts`, `components/rmhbox/minigames/MinigameRenderer.tsx`, `minigame-loaders.ts`, `minigame-icons.ts`, `lib/rmhbox/history-display-registrations.ts` | source | 01 (w1); 17 (w6) adds `packCode` to the two settings files and handlers |
| `lib/tf2-hud/**`, `lib/tf2-loadout/**`, `lib/shop/loadouts.server.ts`, `app/routes/tf2/**`, `lib/versecraft/api/**`, `components/versecraft/SeedGallery.tsx`, `lib/moderation/workshop-moderation.ts` | source | 04 |
| `lib/forecasting/forecasting.server.ts`, `lib/predictions/api/**`, `lib/predictions/predictions.contract.ts`, `components/forecasting/MarketPanel.tsx` | source | 05 |
| `lib/game-saves/registry.ts`, `lib/game-capabilities.ts`, `lib/house-always-wins/**`, `lib/store/houseAlwaysWinsStore.ts`, `components/house-always-wins/**`, `features/nightrail/**`, `app/routes/_site/settings/cloud-saves.tsx`, `lib/device-data/registry.ts` | source | 02 |
| `lib/guestbook/**`, `components/profile/GuestbookPanel.tsx`, `lib/blog/**` (comments), `components/announcements/AnnouncementDiscussion.tsx` | source | 06 |
| `features/synapse-storm/**` | source | 15 |
| `features/rmhcharacters/**` | source | 11 |
| `lib/moderation/removal-*.ts`, `lib/moderation/api/moderation.removals*.server.ts`, `lib/admin/api/admin.removal-reviews*.server.ts`, `app/routes/_site/settings/security.tsx` (one line: `RemovalsPanel` after `AccountStandingPanel`), `components/moderation/RemovalsPanel.tsx`, `app/routes/_site/admin/appeals.tsx` | source | 16 |
| `lib/rmhcalculator/**`, `components/rmhcalculator/**`, `lib/tools/**` (notebooks) | source | 08 |
| `features/dream-rift/**` | source | 09 |
| `lib/daily-puzzles/reports*.ts`, `lib/admin/api/admin.daily-puzzles*.server.ts`, `components/admin/DailyPuzzlesAdmin.tsx`, `components/daily-puzzles/ReportPuzzleDialog.tsx`, `lib/competitive/jam-notices.server.ts` | source | 07 |
| `lib/competitive/jams.server.ts` | source | 07 (w5, `updateJam`), 13 (w6, `deleteJam`) |
| `lib/notifications/inbox.server.ts` (`markAllRead` gains an optional `before`) | source | 10 |
| `lib/games/hub.server.ts`, `lib/games/thread-notices.server.ts`, `lib/games/thread-*.ts`, `lib/cards/api/games.hub.thread.server.ts`, `components/steam/ThreadPage.tsx`, `HubPage.tsx` | source | 12 |
| `lib/party/**`, `server/rmhbox/pack-loader.ts`, `components/party/PacksPage.tsx` | source | 17 |
| `lib/competitive/jam-suggestions*.ts`, `lib/competitive/api/jams.$slug*.server.ts`, `components/competitive/Jam*.tsx` | source | 13 |
| `lib/tournaments/**`, `components/compete/TournamentsSection.tsx`, `app/routes/_site/tournaments.$id.tsx` | source | 14 |
| `server/rmhtube/**`, `lib/rmhtube/events.ts`, `lib/schedule/**`, `app/routes/_site/calendar.tsx`, `lib/rideshare/**`, `components/rideshare/ActiveRidePanel.tsx`, `lib/messages/mutations.server.ts`, `lib/api/v1/characters.server.ts` | source | 18 |
| `server/rmhbox/minigames/identity-crisis/handler.ts` | source | 17 (w6), 20 (w7) |
| `hooks/useRiskSurfacesHidden.ts`, `components/settings/PlayLimitsPanel.tsx`, `lib/account/erasure-plain.server.ts`, `features/altair/**` | source | 20 |
| `app/site-tier.css` | source | any feature whose site page imports from an excluded folder (per-file exclusion, rule 4) |
| `lib/api/route-table.server.ts` | generated (`pnpm api:routes`) | each feature regenerates it; **integration regenerates on every merge** |
| `app/routeTree.gen.ts` | generated (vite) | **integration only** (03 and 10 add `/api/v1` route files; no feature adds a page) |
| `docs/_generated/facts/` (git-ignored, never committed), `docs/site-reference/*` | generated | **integration regenerates** |
| `lib/catalog/**` | source | nobody |

## Migration timestamps

All additive; `.github/scripts/check-migrations-additive.mjs` must pass. Every timestamp sorts after sprint 14's
`20261228060300…` (see the precondition). The pattern is `20270105<wave><slot>00` (slot A = 1, B = 2, C = 3).

| Feature | Migration |
| ------- | --------- |
| 04 | `20270105010200_s15_workshop_reports` (three nullable `moderatedAt` columns) |
| 16 | `20270105040100_s15_removal_appeals` (a new table with its indexes) |
| 08 | `20270105040200_s15_calc_graphs` (a new table with its index) |
| 09 | `20270105040300_s15_dream_rift_coop` (three nullable or constant-default columns), `20270105040301_s15_dream_rift_coop_members_index` (`CONCURRENTLY`, alone), `20270105040302_s15_dream_rift_coop_members_index_ensure_valid` |
| 07 | `20270105050100_s15_fix_notices` (three nullable columns) |
| 13 | `20270105060200_s15_jam_suggestions` (a new table with its index) |
| 20 | `20270105070200_s15_rmhbox_winner_index` (`CONCURRENTLY`, alone), `20270105070201_s15_rmhbox_winner_index_ensure_valid` |

01, 02, 03, 05, 06, 10, 11, 12, 14, 15, 17, 18 and 19 have no schema change. **Every migration contains real SQL.**
New tables get plain indexes in the migration that creates them; new columns on existing tables are nullable or carry
a constant default (09's `memberIds` is `NOT NULL DEFAULT '{}'`, a constant). **Two indexes on existing tables are
planned** (09's on `"DreamRiftCoopRun"`, 20's on `rmhbox_match`): each `CREATE INDEX CONCURRENTLY` alone in its
migration with Prisma's default name (`DreamRiftCoopRun_memberIds_idx`, a GIN index; `rmhbox_match_winnerUserId_idx`),
followed by its `_ensure_valid` migration (copy `20261228030300_s14_synapse_matches_index` and `…_ensure_valid`). Any
other index a feature finds it needs is reported, not added.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-15`, never pushed until the sprint PR.
- Feature branch: `autonomous/s15-<slug>` from the sprint branch **as it is when the wave starts**.
- Worktree: `/home/user/wt/s15-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge or rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite and product files (product files with `-c vitest.product.config.ts`), plus
   the gate tests in the brief (route table, API handler adoption, raw-fetch ratchet, `useeffect-fetch-ratchet`,
   `zod-off-hot-routes`, `islands`, i18n catalogues and drift, the computed-key ratchet, sitemap and OG coverage, test
   discovery, design consistency and Steel flat, the rAF allowlist, arrival coverage, the escape-hatch ratchet,
   tsconfig projects, server-fn guards, the native-dialog ratchet, migration safety, iOS edge contract, erasure
   coverage and the plain-column erasure registry (`erasure-plain-columns.test.ts`), the device-data registry, quiet counts, the shortcut registry, user-text direction, the notice-key
   catalogue and preview ratchet, the error-code catalogue and the `serverError` ratchet, permissions policy, feature
   manifests, `server-bundle-copies`, field names, the sweep reference columns, the API cache policy, the ad-hoc cache
   ratchet, the audio-context ratchet, **the server-stub exports, style tiers and the shell harness**), the
   removable-type takedown test for any report type (04, 05, 06, 16), and every read-path registry test the feature
   names.
2. `pnpm -s exec eslint <changed .ts/.tsx files>` and the boundary config, with no new warnings.
3. **The touched-files type check** (0 errors).
4. **The client build** (rule 3) when the brief says so, under the lock.
5. Schema features: `prisma validate`, `prisma generate`, the migration diffed by hand against the schema, the
   additive-migration check.
6. `pnpm i18n:extract`, keeping only the feature's namespace file (and `feed.json` / `notice-language.json` /
   `errors.json` where the feature adds there); if the extractor churns unrelated catalogues, add the keys by hand.
7. `pnpm api:routes` when an endpoint module was added, moved or removed.
8. Registry features: `pnpm docs:deletion` and commit `docs/account-deletion.md` (08, 09, 13, 16, 20).
9. API features (03, 10, 18): `pnpm sdk:generate` and `pnpm docs:api`, committed; `git diff packages/sdk` shows no
   existing field changed type.
10. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s15-<slug>`. On a conflict in a generated file, take either side and regenerate;
   anchored files should not conflict (if one does, keep both features' blocks under their anchors); `errors.json`, the
   erasure registry and `notice-language.json` take both sides.
2. Regenerate: `pnpm api:routes`; the route tree (start `pnpm exec vite --port 7999 --strictPort`, wait until
   `app/routeTree.gen.ts` changes, stop it — 03 and 10 add v1 route files); `pnpm facts:generate`; `pnpm docs:site`;
   `pnpm docs:deletion`; after 03 and every later merge, `pnpm sdk:generate` and `pnpm docs:api`.
3. `pnpm exec prisma generate`, then the sliced `tsc` (sprint 14's 24 single-threaded slices), alone.
4. **`pnpm build:frontend` after every wave**, not only at the end (sprint 14's client-build break would have been
   found a wave earlier), then `pnpm test` and `pnpm test:product`.
5. **Real-Postgres smoke test of every new query** (the integration suite's throwaway Postgres, `docs/testing.md` §8),
   through its own function, not a copy: 02's two new save ids with the compare-and-set; 03's three reads (the `BigInt`
   run id as a string, board privacy); 04's filtered readers and three takedowns; 05's keyset across equal times and the
   hidden filter; 06's two takedowns and the blog filter; 07's review claim racing itself (one wins, one notice each);
   08's cap under the lock (two concurrent 50th saves leave 50); 09's `CONCURRENTLY` index and `_ensure_valid`, the
   conditional finish racing itself, the own list and the legacy-JSON erasure match (`array_contains`); 10's tuple
   cursor and the shared mark-read; 12's mention recipients; 13's cap under the lock and the delete racing a first
   entry; 14's entered-or-hosted page; 15's raw self-join (the table and column names, `bigint` counts); 16's record
   idempotence and a review decided twice; 17's trust-gate count; 18's row lock with two concurrent edits; 20's
   `CONCURRENTLY` index and the security-report e-mail match.
6. Review the diff against the brief and the specification's acceptance criteria; fix or send back. Check every read
   path the feature names: 01 (no player's state carries another's letters), 03 (no other member's id; hidden players
   404), 04 (`WORKSHOP_READ_PATHS`), 05 and 06 (blocks and mutes in every read), 08 (no result stored unvalidated), 09
   (accounts only from `memberIds`; board privacy), 10 (keys and params additive), 12 (blocks, mutes, the thread mute),
   15 (no account id in any response), 16 (restore never publishes), 17 (the hub re-parses packs), 19 (the ratchet),
   20 (no final-guess leak before REVEAL).
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Confirm `exportSprint15` carries 05, 06, 08, 09, 13, 14 and 16's sections, that the erasure coverage test passes with
  every sprint 15 table classified and `TODO_CEILING = 4`, and that the plain-column registry has no unclassified model.
- `pnpm check:consistency --base main`, the sliced typecheck, `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`,
  `pnpm build` with `scripts/check-bundle-budget.ts` (the site-tier CSS must not grow, B5: 05, 06, 07, 13, 14 and 16 add
  site-tier UI with existing utilities only), and a real-browser pass over every new or changed page in Day and Night at
  390 px and 1280 px, and once in `ar`, with the catalogs pulled (`pnpm i18n:pull`) so the `ar` pass reads Arabic (sprint
  14's pass read English); the app-tier surfaces (RMHBox 01 and 17, the House and Nightrail 02, the TF2 workshop and
  Versecraft 04, the daily desk 07 and 19, RMHCalculator 08, Dream Rift 09, RMHCharacters 11, the games library 12,
  Synapse Storm 15, Altair 20) in their own look; Human Keyboard (01) on a running hub, and a Dream Rift co-op run (09)
  on a running socket server, since the production-build pass runs no realtime hub.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code lines (TypeScript, TSX, SQL, CSS, JSON
content under `data/`) separately from documentation lines, measured with `git diff --numstat` from the Wave 0 parent
commit to `HEAD`, filtered by extension, excluding generated files (`routeTree.gen.ts`, `route-table.server.ts`,
`docs/_generated/facts/`, `docs/site-reference/**`, `locales/**`, `docs/account-deletion.md`, `packages/sdk/**`,
`docs/developer-api/endpoints/**`). It also lists the follow-ups 18, 19 and 20 closed (and any found already closed),
the `serverError` ratchet's value after the sprint (it must not rise above 17), the raw-fetch and escape-hatch ratchets'
values (19 lowers the escape-hatch ratchet; 08 and 09 lower neither fetch ratchet, which count neither `toolsApi` nor a `fetch(url)` held in a variable, and must not raise the `useEffect` one), the touched-files type checks' results as reported, how many type errors the sliced
check still found, whether any wave's client build failed, and the open owner decisions this sprint met.

## Risks

- **A report path that hides too much or too little (04, 05, 06).** Every reader must honour the takedown; 04's
  `WORKSHOP_READ_PATHS` with a source scan makes a forgotten reader a failing test; 05 and 06 delete rather than hide.
- **Restoring removed content (16).** A restore that republished on the owner's behalf would undo the owner's own
  choice; each branch clears `moderatedAt` only, and a test holds one branch per reversible type.
- **The Account status section (16).** Every "Account status" link reaches `/settings/security#account-status` through
  `LEGACY_REDIRECTS`; 16 adds its list to that section and must not add a page the redirect would shadow, nor show a
  removed item's author anything about who reported it.
- **Hub-written rows (09).** The Dream Rift socket server gains a database write at game start; a slow insert must
  never block the start (fire and log), and the conditional finish is the only gate on a post.
- **Two RMHBox features on one handler (01, 17, 20).** Wave ordering keeps them apart; 20's secrecy change is tested
  against 17's pack draws.
- **Save data (02).** A wrong parse of the zustand envelope would discard a run; the local copy is never rewritten by a
  failed parse, and the kit asks before anything is overwritten.
- **The handle sweep (19).** Thirty-seven files change by one wrapper each; snapshot updates must be only that.
- **The developer API (03, 10, 18).** Explicit scopes must not enter the default grant (pinned); every change is
  additive and in the changelog; the registry guard (03) could fail on a route another feature adds later in the
  sprint (10's), so 10 adds its registry entries in the same commit as its route files.
- **A notice storm (07, 12, 16).** 07's jam notice is capped at 500 recipients a save, 12's at five a post, 16's at one
  per removed target; each is idempotent.
- **Migration order against `main`.** `main`'s future-dated migrations can overtake; integration checks at each wave
  start.
- **Scope creep in 18 and 20.** Six and four items; anything else is reported, not fixed.

## Validation

The design pass checked each specification against the sprint 14 tip (`23176a429`) in the design worktree
`/home/user/wt/s15-design`; what it changed while checking is in the README's "Corrections from the design pass's own
validation".

- **Paths:** a scripted pass listed every backticked repository path in the twenty specifications and briefs and
  checked it against the tree; every path said to exist exists, and every path a feature creates is named as new (or
  listed under "Create" in its brief).
- **Models and registries:** every model (`Tf2Hud`, `Tf2Loadout`, `VersecraftSeedListing`, `VersecraftWorld`,
  `PredictionComment`, `Prediction`, `GuestbookEntry`, `BlogComment`, `DailyPuzzleReport`, `GameJam`, `GameJamEntry`,
  `GameJamTeamMember`, `GameJamThemeCandidate`, `GameJamThemeVote`, `CalcNotebook`, `DreamRiftCoopRun`, `Notification`,
  `RmhCharacter`, `GameThread`, `GameThreadPost`, `Tournament`, `TournamentEntrant`, `TournamentPayout`,
  `SSPlayerMatch`, `SSMatch`, `ContentReport`, `UserStrike`, `RmhboxPack`, `RMHboxMatch`, `RmhTypeMatch`,
  `SecurityReport`, `SliceRun`, `Song`, `Chart`, `SongLeaderboard`, `ChatMessage`, `Ride`, `GameSave`, `User`,
  `Account`) and registry (`MINIGAME_REGISTRY`, `SOCKET_RATE_LIMITS`, `SHARED_SAVE_GAMES`, `GAME_CAPABILITIES`,
  `REPORT_ENTITY_TYPES`, `REMOVABLE_REPORT_ENTITY_TYPES`, `MEMBER_ITEM_REPORT_TYPES`, `GAME_CONTENT_READ_PATHS`,
  `BOARD_PRIVACY_READ_PATHS`, `MUTE_READ_PATHS`, `RESTRICTION_ENFORCEMENT_PATHS`, `MEMBER_TEXT_MODELS`,
  `RESTRICTION_WRITERS`, `SCOPES`, `READ_SCOPES`, `WILDCARD_SCOPES`, `DEFAULT_SCOPES`, `ENDPOINTS`, `NULLABLE`,
  `DOCUMENTED_GROUPS`, `USER_TEXT_RENDERERS`, `NOTICE_TEMPLATES`, `ERROR_CODES`, `NAMESPACES`, `EXCLUDED_ROUTES`,
  `ERASURE_REGISTRY`, `TODO_CEILING`, `PACK_GAMES`, `PACK_AUTOHIDE_REPORTS`, `CACHE_POLICY`) named in a specification
  exists under that name.
- **"Nothing does it" claims** were each checked by grep: the two Slice It v1 routes absent from `ENDPOINTS` (a
  scripted diff of `app/routes/api/v1/**` against the registry finds exactly those two); no report type for TF2 HUDs,
  loadouts, Versecraft seeds, prediction comments, guestbook entries or announcement comments; no `DELETE` on
  Versecraft seeds or prediction comments; no block filter in `listComments`, the seed list or the announcement
  comment list; no reader of `TournamentPayout` on the site; no record of a report takedown shown to its author (validation: `/settings/account-status` is a `LEGACY_REDIRECTS` entry to `/settings/security#account-status`, not a missing page); `PACK_GAMES` is
  `['wit-war']`; the House and Nightrail `local-only`; no `@`-mention parsing in `lib/games/`; no resource-use tracking
  in `Dnd5eCharacter`; no saved graphs; no board privacy in `dream-rift.coop.server.ts`; no `previewKey` in the v1
  notifications read; the Identity Crisis final-phase leaks; no index on `rmhbox_match.winnerUserId`.
- **Migrations:** every planned name sorts after the newest in `prisma/migrations` (`20261228060300_s14_supporter_marks`).
- **Not repeated:** no feature duplicates sprints 1–14. 01 is the next RMHBox stub (one a sprint); 18, 19 and 20 are
  follow-up list items; the rejected ideas are in the README.
