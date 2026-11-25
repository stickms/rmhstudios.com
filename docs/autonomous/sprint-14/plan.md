# Sprint 14 — implementation plan

How the twenty features are built: seven waves of at most three concurrent implementers, each in its own git worktree
and branch, merged into the sprint branch `claude/autonomous-sprint-14` by one integration owner between waves. The
machine budget and the per-feature checks are sprint 13's, restated so this file stands alone, with what sprint 13's
implementers and integration learned folded into the briefs (§Implementer rules).

## Precondition: sprint 13 is in the sprint branch

`claude/autonomous-sprint-14` is cut from `origin/main` once the squashed sprint 13 commit (`e07d7b737`, "Sprint 13:
finishing what members already use, and the reports, pushes and safeguards it lacked") has landed there, or from
`autonomous/s14-design` (which is that commit plus these documents) if it has not landed yet; then `git merge
origin/main` again when it lands (the content is identical). This design was checked against `e07d7b737`. Wave 0 is
committed on top of that. Wave 1 does not start before, because:

- the Wave 0 anchors go **after** sprint 13's anchor blocks in `lib/account/deletion.server.ts` (after `// s13-17
  dm-reports` and its spread, before `// med-schools-phase-4 …`), `prisma/schema/auth.prisma` (after `// s13-12
  news-stories`), `lib/sitemap.ts`, `lib/notifications/notice-keys.ts`, `components/feed/notice-previews.ts`,
  `components/feed/notification-labels.ts` (and its test), `lib/i18n/user-text.ts`,
  `lib/feed/__tests__/quiet-counts.test.ts`, `lib/errors/codes.ts`, `components/errors/refusal-sentence.ts`,
  `lib/game/leaderboard-privacy.ts`, `lib/api/registry.ts`, `lib/api/scopes.ts`, `scripts/generate-sdk.ts`,
  `docs/developer-api/changelog.md` and the report files;
- features build on sprint 13 code: 07, 08, 09 and 10 on the report path sprint 13 anchored (06, 15, 16, 17) and its
  `MEMBER_ITEM_REPORT_TYPES`; 03 on Altair "Your runs" as the model (s13-03); 04 on `RunsScreen.tsx` and
  `altair.runs.server.ts` (s13-03); 12 on the per-conversation mute (s13-20); 15 on the explicit scopes and the
  `READ_SCOPES` fix (s13-10); 19 on the three sprint 13 tests whose fakes hid bugs; 20 on s13-06, s13-16, s13-17,
  s13-02, s13-13 and s13-18's admin page;
- **migration timestamps:** `main`'s newest migration at the design pass is sprint 13's `20261220070100_s13_billing_hardening`
  (Med Schools' newest is `20261211090000_medschools_applicant_stats`); sprint 14's sort after both, at `20261228…`.
  Integration checks the newest name on `main` at each wave start and, if `main` has passed `20261228`, renames the
  wave's migrations forward before merging;
- **the refusal switch** ends at sprint 13's `RIDE_SCHEDULE_LIMIT` (`components/errors/refusal-sentence.ts`, under
  `// s13-15 rideshare-safety`), and `ERROR_CODES` ends at the same code (`lib/errors/codes.ts`).

## Machine budget

4 cores and 15 GB, shared. A cold `tsc -b` of the site project does not fit even single-threaded (sprint 13's
integration ran it in 20 slices of 11–13 GB each), so **implementers never run `pnpm typecheck`, a whole-project
`tsc`, `pnpm test`, `pnpm build`, `pnpm dev` or `vite`.** They run targeted vitest files, eslint on their changed files,
**the touched-files type check** (new this sprint, below: about 15–40 s and 2–4 GB, measured at the design pass on two
server files and a component: 658 files, 2.6 GB, 16 s, 0 errors) and the commit gate (`--fast`, about 1 GB; it skips
`tsc`). They never run prettier over files that existed before. Each worktree has its own `node_modules`
(`pnpm install --frozen-lockfile --offline`). At most three implementers run at once. **jsdom is not installed:**
component tests render with `react-dom/server` or test the pure logic. **Timing tests** take the fastest of several runs.

## Implementer rules new this sprint (from sprint 13's integration)

Each brief carries these in its "Sprint 14 additions" section:

1. **Touched-files type check, mandatory.** A temporary `.cache/tsc-touched.json` extending `tsconfig.json`, listing
   the three ambient declaration files (plus `lib/tf2-game/vite-env.d.ts` for `vite/client`, a Wave 0 correction) and every changed `.ts`/`.tsx` file (tsc follows imports), run with
   `node --max-old-space-size=6000 node_modules/typescript/bin/tsc -p .cache/tsc-touched.json`; 0 errors before each
   commit, and the file count and result in the report. It catches the class of bug sprint 13's sliced check found
   (a `satisfies`-less readonly filter, a `BigInt` assigned to `number`, invalid Prisma arguments on a required column).
2. **Query shapes against the schema.** Every specification names the Prisma shapes to verify ("Query shapes" under
   its non-functional requirements). From wave 2, every new Prisma fake is wrapped in `shapeChecked` and every
   response body a test reads goes through `assertJsonSafe` (`lib/db/query-shape.ts`, feature 19, wave 1).
3. **Existing Tailwind utilities only** on the site tier (B5): no new arbitrary values; sprint 13 18's `min-w-[56rem]`
   grew the site CSS and was reverted at integration.
4. **A new public GET declares a cache policy** (`lib/api/cache-policies.ts`); `lib/__tests__/api-cache-policy.test.ts`
   is in every brief's gate list.
5. **Audio uses the shared context** (`getAudioContext()` in `lib/shared/platform.ts`) and makes nothing before a
   gesture; `lib/__tests__/audio-context-ratchet.test.ts` is in every gate list.
6. **The cross-feature ratchets that failed sprint 13's first full run** (the ad-hoc cache ratchet, the cache policy,
   the audio ratchet) are in every gate list, so an implementer sees them before integration does.

## Wave 0 — scaffolding (integration commits it before Wave 1)

1. The precondition merge above.
2. **Namespaces.** Add to `NAMESPACES` in `lib/i18n/config.ts`, one per line, each **in sorted place** (the list is
   sorted; `lib/__tests__/i18n-catalogs.test.ts` holds that): `altair-coop`, `doctrine-ledger`, `exclusion-hides`,
   `game-reports`, `hearthworks-saves`, `identity-crisis`, `jam-editing`, `pinned-conversations`, `profile-reports`,
   `puzzle-reports`, `slice-reports`, `supporter-marks`, `synapse-matches`, `thread-replies`, `tube-room-reports`
   (15 namespaces; 15 is the developer API's English JSON and docs, 17 writes refusals into `errors` and one label into
   `c-moderation`, 18 and 19 have no UI, 20 writes into each fixed file's namespace). The design pass checked that none is taken at `e07d7b737`; check again (`grep -n
   '"<name>"' lib/i18n/config.ts`) and suffix a taken one with `-s14`, correcting its brief. Create each
   `locales/en/<ns>.json` containing `{}` and a newline. Features under `features/<id>/` also list their namespace in
   that folder's `feature.ts` (`namespaces`): 02 in `features/hearthworks/`, 03 in `features/synapse-storm/`, 04 in
   `features/altair/`, 05 in `features/doctrine/`, 07 in `features/slice-it/` — each feature adds its own line (not
   Wave 0). Run `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-config.test.ts`.
3. **Anchors** — so that two features of one wave never edit the same lines of a shared file. Each anchor is a comment
   line followed by one blank line; a feature keeps **its own anchor line** and adds its code directly below it.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of `anonymizeAccount`, directly after sprint
     13's last block (`// s13-17 dm-reports` and its spread) and before `// med-schools-phase-4 …`: the header
     `// Sprint 14 erasures (docs/autonomous/sprint-14/plan.md §Anchors): each feature adds its operations under its own line.`
     then `// s14-03 synapse-matches`, `// s14-06 puzzle-reports`, `// s14-18 erasure-plain-columns`. No feature adds
     a pre-step.
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields, after sprint 13's block
     (`newsStoryFollows NewsStoryFollow[] @relation("NewsStoryFollows")`): `// Sprint 14 back-relations (one block per
     feature, docs/autonomous/sprint-14/plan.md)` then `// s14-06 puzzle-reports`. Run `pnpm -s exec prisma validate`
     (dummy `DATABASE_URL`).
   - **New file `lib/account/export-sprint-14.server.ts`**, the shape of `lib/account/export-sprint-13.server.ts`:
     `async function exportSprint14(userId: string): Promise<Record<string, unknown>>` returning one object literal with
     the header `// Sprint 14 exports (docs/autonomous/sprint-14/plan.md §Anchors)` then `// s14-03 synapse-matches`,
     `// s14-04 altair-coop`, `// s14-05 doctrine-ledger`, `// s14-06 puzzle-reports`. Each feature adds one property
     under its line (a dynamic `import()` of its own module). Wave 0 calls it **once** from
     `lib/account/api/account.export.server.ts` beside `exportSprint13(userId)` as `sprint14` (the import, the
     `Promise.all` entry and the payload key), with `lib/account/__tests__/export-sprint-14.test.ts` (a copy of
     `export-sprint-13.test.ts`, whose Proxy Prisma mock answers any model) asserting the key and, per anchor, a
     commented-out expectation the feature enables. Implementers **never edit `account.export.server.ts`**. 02's town
     is a `GameSave` row (already exported), 12's pins are `ConversationPref` rows (already exported as
     `conversationPrefs`), 13's switch is a `UserProfile` column (already exported with the profile); the moderation
     records of 07–10 are not personal data the export lacks (moderator notes in the export are an open decision).
   - `lib/sitemap.ts`: in `EXCLUDED_ROUTES`, after sprint 13's block (`'/settings/lists': 'personal',`),
     `// Sprint 14 (docs/autonomous/sprint-14/plan.md §Anchors)` then `// s14-05 doctrine-ledger`
     (`/strategies/profile/xp`, `personal`) and `// s14-06 puzzle-reports` (`/admin/daily-puzzles`, `admin`). No
     feature adds to `STATIC_ROUTES` or `DYNAMIC_ROUTES`.
   - **`server/jobs/index.ts` gets no anchor:** no sprint 14 feature adds a job (11's notices are bounded at 50 and
     written in the request; 06's prewarm is unchanged).
   - **Notices** (11 only): in `lib/notifications/notice-keys.ts`, at the end of `NOTICE_TEMPLATES` and of
     `interface NoticeParamTypes`, the header `// Sprint 14 notices (docs/autonomous/sprint-14/plan.md §Anchors)` then
     `// s14-11 thread-replies`; the same lines directly before `default:` in `components/feed/notice-previews.ts`, in
     `systemLabels`'s object in `components/feed/notification-labels.ts` (after `// s13-20 message-push` and its line),
     and in `components/feed/__tests__/notification-labels.test.ts`.
   - `lib/i18n/user-text.ts`, at the end of `USER_TEXT_RENDERERS`: `// Sprint 14 (docs/autonomous/sprint-14/plan.md
     §Anchors)` then `// s14-01 identity-crisis`, `// s14-03 synapse-matches`, `// s14-04 altair-coop`,
     `// s14-05 doctrine-ledger`, `// s14-06 puzzle-reports`, `// s14-07 slice-reports`, `// s14-08 game-reports`,
     `// s14-09 profile-reports`, `// s14-10 tube-room-reports`, `// s14-11 thread-replies`,
     `// s14-12 pinned-conversations`, `// s14-13 supporter-marks`, `// s14-14 jam-editing`,
     `// s14-16 exclusion-hides`. (A file in a folder `USER_TEXT_EXEMPT` already covers needs no entry; the scan says
     which.)
   - `lib/feed/__tests__/quiet-counts.test.ts`, at the end of `EXEMPT`: the same header, then
     `// s14-13 supporter-marks` (an entry only if the scan asks, with an honest reason).
   - **Refusal codes:** `lib/errors/codes.ts`, at the end of `ERROR_CODES` (after `RIDE_SCHEDULE_LIMIT`), and
     `components/errors/refusal-sentence.ts`, inside the `switch` after its last `case` (`RIDE_SCHEDULE_LIMIT`) and
     before the switch's closing brace (no `default:`; exhaustive over `ErrorCode`): `// Sprint 14` then
     `// s14-06 puzzle-reports`, `// s14-09 profile-reports`, `// s14-10 tube-room-reports`,
     `// s14-12 pinned-conversations`, `// s14-14 jam-editing`, `// s14-17 timeouts-everywhere`.
     `locales/en/errors.json` cannot hold comments: each feature adds its keys in sorted place, and integration merges
     the JSON by taking both sides. Params are only those `lib/errors/refusal.ts` reads (`PARAM_NAMES`: `endsAt`,
     `count`, `max`, `limit`, `remaining`, `minutes`, `days`).
   - **Report path** (07, 08, 09, 10, one per wave in waves 1–4): the header `// Sprint 14
     (docs/autonomous/sprint-14/plan.md §Anchors)` then `// s14-07 slice-reports`, `// s14-08 game-reports`,
     `// s14-09 profile-reports`, `// s14-10 tube-room-reports` at the end of `REPORT_ENTITY_TYPES`, of
     `REMOVABLE_REPORT_ENTITY_TYPES` and of `MEMBER_ITEM_REPORT_TYPES` (`lib/moderation/report-constants.ts`; the last has
     no sprint 13 anchors, so the sprint 14 block follows `'home-listing'`); before `case 'music-score':` in
     `resolveTargetUser`'s switch, after the `// s13-17 dm-reports` case, and after the s13 eligibility blocks in
     `lib/moderation/api/moderation.report.server.ts`; after the `// s13-17 dm-reports` takedown branch and after the
     s13 preview block in `lib/moderation/triage.server.ts`; after the s13 blocks in `lib/moderation/my-reports.server.ts`;
     after the s13 lines of both maps in `components/moderation/MyReportsPanel.tsx`; and at the end of the `labels`
     object in `components/feed/report-kind-label.ts` (which has no sprint anchors: the block follows `'rmhbox-pack'`).
   - `lib/game/leaderboard-privacy.ts`, at the end of `BOARD_PRIVACY_READ_PATHS`: `// Sprint 14` then
     `// s14-04 altair-coop`.
   - `lib/moderation/mute-expiry.ts`, at the end of `MUTE_READ_PATHS`: `// Sprint 14` then `// s14-09 profile-reports`,
     `// s14-11 thread-replies`.
   - **Developer API** (15; 17 writes one changelog line): `lib/api/registry.ts` at the end of `ENDPOINTS`,
     `lib/api/scopes.ts` at the end of the scope list, `scripts/generate-sdk.ts` at the end of `NULLABLE`: `// Sprint 14`
     then `// s14-15 homes-api`; `docs/developer-api/changelog.md` at the top of its list: `## Sprint 14 — 2027-01` then
     `<!-- s14-15 homes-api -->` and `<!-- s14-17 timeouts-everywhere -->`.
4. **One new shared helper, owned by a feature:** `lib/db/query-shape.ts` is 19's (wave 1). Otherwise `lockKey` serves
   every cap and claim; `useConfirm` and `usePrompt` every confirmation; `components/ui/tabs.tsx` every tab strip;
   `components/ui/menu.tsx` every menu; `lib/calendar/tz.ts` every time-zone computation; the site's locale formatters
   every date and number; `components/ui/arrive.tsx` every arrival fade; `notice()` every new `SYSTEM` notice;
   `refusalBody()` and `useRefusalText` every refusal; `lib/core/persist` every stored value; `recordAdminActionIn`
   every admin action; `components/moderation/ReportDialog.tsx` every content report; `getAudioContext()` every sound.
5. Outside `docs/autonomous/sprint-14/` (the design pass wrote nothing else): `.prettierignore` gains
   `/docs/autonomous/sprint-14/` after sprint 13's line, with the same comment, and `docs/autonomous/README.md` gains
   the sprint 14 row ("Doors nobody built, in the games, apps and safety tools members already use").
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

**Wave 0 as built (integration, 2026-11-25).** No namespace was taken, so none is suffixed. Decisions taken where the
text above left room: every anchor, the last of a block included, is followed by one blank line; the two label files
(`notification-labels.ts` and its test) head their block `// Sprint 14 system labels (…)`, as sprint 13's do;
`exportSprint14` carries `void userId;` until the first feature uses its argument; the commented expectations in
`export-sprint-14.test.ts` use the keys the specifications name (`synapseMatches`, `altairCoop`, `doctrineReputation`,
`puzzleReports`). The touched-files type check gained `lib/tf2-game/vite-env.d.ts` (every brief corrected; see its
"Wave 0 correction" paragraph).

## Waves

| Wave | Slot A                   | Slot B                  | Slot C               |
| ---- | ------------------------ | ----------------------- | -------------------- |
| 1    | 19 schema-fakes          | 07 slice-reports        | 01 identity-crisis   |
| 2    | 08 game-reports          | 12 pinned-conversations | 02 hearthworks-saves |
| 3    | 09 profile-reports       | 15 homes-api            | 03 synapse-matches   |
| 4    | 10 tube-room-reports     | 14 jam-editing          | 04 altair-coop       |
| 5    | 11 thread-replies        | 06 puzzle-reports       | 05 doctrine-ledger   |
| 6    | 17 timeouts-everywhere   | 16 exclusion-hides      | 13 supporter-marks   |
| 7    | 18 erasure-plain-columns | 20 s13-gaps             | —                    |

The rule the waves keep: **no two features of one wave edit the same file unless that file is anchored** (each feature
under its own Wave 0 line) or generated (integration regenerates it). The erasure registry
(`lib/account/erasure-registry.ts`) is alphabetical, not anchored: 06 (`DailyPuzzleReport`, w5) and 18 (the new
`PLAIN_MEMBER_COLUMNS` section, w7) sit in different waves. `TODO_CEILING` stays 4.

Dependencies that fix the order:

- **19 first.** Every later brief requires `shapeChecked` and `assertJsonSafe`; 19 is in wave 1 so waves 2–7 can use
  them. Wave 1's other two (07, 01) check their shapes by reading the schema.
- **The report path:** 07 (w1) → 08 (w2) → 09 (w3) → 10 (w4), one report feature per wave, each under its own anchor
  in the report files; `components/moderation/ReportDialog.tsx` is opened by 07, 08 and 10 and edited by 09 only (if at
  all). `lib/moderation/__tests__/music-reports.test.ts` is run by each.
- **Game hub and Slice It files:** 07 (w1) edits `features/slice-it/ui/SongDetailsPanel.tsx`, `SongComments.tsx` → 08
  (w2) edits `lib/games/meta.server.ts`, `lib/games/hub.server.ts`, `components/steam/*` and the tips route → 11 (w5)
  edits `lib/games/hub.server.ts` (`createPost`), `components/steam/ThreadPage.tsx` and the song comments `POST` → 17
  (w6) adds a check to the review, guide, hub, tips and song comment routes. Each after the one before it merged.
- **RMHTube:** 10 (w4) edits `lib/rmhtube/parties.server.ts`, `lib/rmhtube/events.ts`, `server/rmhtube/room-manager.ts`,
  the header and party page → 17 (w6) edits `server/rmhtube/chat-handler.ts` (the check) → 20 (w7) edits
  `server/rmhtube/chat-handler.ts` (the dangling reply) and `components/rmhtube/ChatPanel.tsx`.
- **Messages:** 12 (w2) edits `lib/messages.server.ts`, `lib/preferences/api/preferences.conversation.server.ts`,
  `MessagesColumn.tsx`, `ConversationHeader.tsx` → 11 (w5) edits `lib/notify/conversation-prefs.server.ts` (a scope) →
  17 (w6) edits `lib/group-chat/api/group-chats.$id.messages.server.ts` → 20 (w7) edits `lib/messages/dm-reports.server.ts`.
- **Altair:** 04 (w4) edits `RunsScreen.tsx`, `MenuScreen.tsx`, `altair.runs.server.ts`, `altair.leaderboard.server.ts`
  → 20 (w7) edits `RunsScreen.tsx` (focus) and the audio modules.
- **Erasure:** 03 (w3) and 06 (w5) add operations under their anchors; 18 (w7) classifies every plain-column model,
  including 03's, after both merged.
- **Developer API:** 15 (w3) owns the catalogue; 17 (w6) changes two route files' behaviour and one changelog line,
  under its anchor; the generated SDK and API docs are regenerated by 15 and **by integration on every merge after
  it**. 10 (w4) changes a v1 reader's filter only.
- **The sweep last:** 20 (w7) touches small parts of files other features own (`triage.server.ts`'s `decideReports`,
  `dm-reports.server.ts`, `ChatPanel.tsx`, `chat-handler.ts`, `DeletionsAdmin.tsx`, the Altair audio and runs screen,
  `vega.score.server.ts`, the ranked files); only 18 runs beside it, in files 20 does not touch.

## Shared files and who touches them

| File | Kind | Who |
| --- | --- | --- |
| `lib/i18n/config.ts` (`NAMESPACES`) | registry | **Wave 0 only** |
| `locales/en/<ns>.json` | generated (extract) or hand-added | each feature its own; `notice-language.json` and `feed.json` for 11; `errors.json` for refusals; 20 in four existing files |
| `prisma/schema/auth.prisma` (`User`) | source, **anchored** | 06 |
| `prisma/schema/games.prisma` | source | 08 (w2), 06 (w5) |
| `prisma/schema/economy.prisma` (`AchievementTip`) | source | 08 |
| `prisma/schema/games/synapse-storm.prisma` | source | 03 |
| `prisma/schema/rmhtube.prisma` | source | 10 |
| `prisma/schema/profile.prisma` (`UserProfile`) | source | 13 |
| `lib/account/deletion.server.ts` | source, **anchored** | 03 (w3), 06 (w5), 18 (w7) |
| `lib/account/erasure-registry.ts` | source (alphabetical) | 06, 18 |
| `lib/account/__tests__/erasure-coverage.test.ts` | test | 18 |
| `docs/account-deletion.md` | generated (`pnpm docs:deletion`) | 06, 18 |
| `lib/account/export-sprint-14.server.ts` and its test | new in Wave 0, **anchored** | 03, 04, 05, 06 |
| `lib/account/api/account.export.server.ts` | source | **Wave 0 and integration only** |
| `lib/sitemap.ts` | source, **anchored** | 05, 06 |
| `lib/notifications/notice-keys.ts`, `components/feed/notice-previews.ts`, `notification-labels.ts` + test | source, **anchored** | 11 |
| `lib/i18n/user-text.ts` | source, **anchored** | 01, 03–14, 16 |
| `lib/feed/__tests__/quiet-counts.test.ts` (`EXEMPT`) | test registry, **anchored** | 13 if needed |
| `lib/errors/codes.ts`, `components/errors/refusal-sentence.ts` | source, **anchored** | 06, 09, 10, 12, 14, 17 |
| `lib/moderation/report-constants.ts`, `lib/moderation/api/moderation.report.server.ts`, `lib/moderation/triage.server.ts` (report branches), `lib/moderation/my-reports.server.ts`, `components/moderation/MyReportsPanel.tsx`, `components/feed/report-kind-label.ts` | source, **anchored** | 07 (w1), 08 (w2), 09 (w3), 10 (w4) |
| `lib/moderation/triage.server.ts` (`decideReports`) | source | 20 (w7) |
| `components/moderation/ReportDialog.tsx` | source | 09 only, if needed |
| `components/admin/reports/ReportGroups.tsx` | source | 09 |
| `lib/game/leaderboard-privacy.ts` (`BOARD_PRIVACY_READ_PATHS`) | source, **anchored** | 04 |
| `lib/moderation/mute-expiry.ts` (`MUTE_READ_PATHS`) | source, **anchored** | 09 (w3), 11 (w5) |
| `lib/api/registry.ts`, `lib/api/scopes.ts`, `scripts/generate-sdk.ts`, `docs/developer-api/changelog.md` | source, **anchored** | 15; 17 (changelog line only) |
| `lib/developer/explorer.ts` (`DOCUMENTED_GROUPS`) | source | 15 |
| `packages/sdk/**`, `docs/developer-api/endpoints/**` | generated (`pnpm sdk:generate`, `pnpm docs:api`) | 15; **integration regenerates on every later merge** |
| `app/routes/api/v1/posts.ts`, `app/routes/api/v1/posts/$id/comments.ts` | source | 17 |
| `lib/api/v1/rmhtube.server.ts` | source | 10 |
| `lib/db/query-shape.ts`, `lib/economy/__tests__/fake-db.ts`, the three sprint 13 tests | new / test | 19 |
| `lib/rmhbox/**`, `server/rmhbox/minigames/**`, `server/rmhbox/game-coordinator.ts`, `components/rmhbox/**`, `data/rmhbox/identity-crisis/**` | source | 01 (w1); 17 (w6) adds the `message` check to `server/rmhbox/minigames/identity-crisis/handler.ts` only |
| `server/rmhbox/chat.ts` | source | 17 |
| `features/hearthworks/**`, `lib/game-saves/registry.ts`, `lib/game-capabilities.ts`, `lib/game-saves/api/game-saves.$gameId.server.ts` (the optional compare-and-set), `lib/game-saves/saves.contract.ts` | source | 02 |
| `features/synapse-storm/**` | source | 03 |
| `features/altair/api/**`, `features/altair/engine/coop-record*.ts`, `features/altair/ui/screens/MenuScreen.tsx` | source | 04 |
| `features/altair/ui/screens/RunsScreen.tsx` | source | 04 (w4), 20 (w7) |
| `features/altair/engine/audio/**` | source | 20 |
| `features/doctrine/**`, `app/routes/strategies/profile/**` | source | 05 |
| `lib/daily-puzzles/**`, `components/daily-puzzles/**`, `lib/admin/api/admin.daily-puzzles*.server.ts`, `app/routes/_site/admin/daily-puzzles.tsx`, `app/routes/_site/admin/index.tsx` | source | 06 |
| `features/slice-it/ui/SongDetailsPanel.tsx`, `SongComments.tsx`, `features/slice-it/engine/song-reports.server.ts` | source | 07 |
| `features/slice-it/api/slice-it.songs.$id.comments.server.ts` | source | 11 (w5), 17 (w6) |
| `features/slice-it/api/slice-it.charts.$id.reviews.server.ts` | source | 17 |
| `lib/games/meta.server.ts`, `profile.server.ts`, `activity.server.ts`, `guide-history.server.ts`, `lib/awards/awards.server.ts`, `lib/arcade/updates.server.ts`, `lib/sitemap.server.ts`, `components/steam/SteamReviews.tsx`, `SteamGuides.tsx`, `HubPage.tsx`, `components/arcade/AchievementTips.tsx` | source | 08 |
| `lib/games/hub.server.ts`, `components/steam/ThreadPage.tsx` | source | 08 (w2), 11 (w5) |
| `lib/arcade/api/arcade.tips.server.ts`, `lib/games/api/games.$id.review.server.ts`, `lib/games/api/guides*.server.ts`, `lib/games/api/games.hub.post.server.ts`, `lib/cards/api/games.hub.thread.server.ts` | source | 08 (w2; tips and readers), 17 (w6; the check) |
| `components/profile/**`, `lib/profile.server.ts`, `lib/handles/**`, `lib/api/routes/handles.impersonation.server.ts`, `lib/admin/api/admin.reports.claims.server.ts`, `lib/profile-links/links.server.ts` (`accountsClaimingHost`'s order) | source | 09 (w3); 16 (w6) edits `components/profile/ProfileHero.tsx`'s coin link only |
| `lib/rmhtube/parties.server.ts`, `lib/rmhtube/events.ts`, `server/rmhtube/room-manager.ts`, `components/rmhtube/RmhTubeHeader.tsx`, `components/rmhtube/party/PartyPage.tsx` | source | 10 |
| `server/rmhtube/chat-handler.ts` | source | 17 (w6), 20 (w7) |
| `components/rmhtube/ChatPanel.tsx` | source | 20 |
| `lib/notify/conversation-prefs.server.ts` | source | 11 |
| `lib/cards/notify.server.ts` (`notifyHubReply` removed), `lib/cards/__tests__/notify.server.test.ts` | source | 11 |
| `lib/messages.server.ts`, `lib/preferences/api/preferences.conversation.server.ts`, `components/feed/MessagesColumn.tsx`, `components/feed/conversation/ConversationHeader.tsx` | source | 12 |
| `lib/feed/api/rmharks.$id.comment.server.ts`, `components/feed/CommentItem.tsx`, `components/feed/profile-edit/CreatorSection.tsx` | source | 13 |
| `lib/competitive/jams*.ts`, `lib/competitive/api/jams.$slug.server.ts`, `components/competitive/JamDetail.tsx` | source | 14 |
| `lib/economy/**` (play limits, risk surfaces), `components/shell/Sidebar.tsx`, `GlobeNav.tsx`, `AccountMenu.tsx`, `app/routes/_site/sections.tsx`, `components/site/CommandPalette.tsx`, `KeyboardShortcuts.tsx`, `app/routes/_site/predictions.tsx`, `wager.$id.tsx`, `compete.tsx`, `components/compete/WagersSection.tsx`, `components/wallet/WalletPage.tsx`, `components/elections/Hero.tsx`, `MarketsPanel.tsx`, `components/rmhcoins/TableInvite.tsx`, `components/settings/PlayLimitsPanel.tsx` | source | 16 |
| `lib/moderation/restrictions*.ts`, `lib/moderation/restriction-paths.ts`, `lib/scheduled/publish.server.ts`, `lib/api/v1/scheduled.server.ts`, the other writers 17 lists | source | 17 |
| `lib/party/pack-moderation.server.ts`, `lib/messages/dm-reports.server.ts`, `components/admin/DeletionsAdmin.tsx`, `features/vega/api/vega.score.server.ts`, `lib/ranked/**`, `components/feed/RankedColumn.tsx`, `RankedStanding.tsx` | source | 20 |
| `lib/api/route-table.server.ts` | generated (`pnpm api:routes`) | each feature regenerates it; **integration regenerates on every merge** |
| `app/routeTree.gen.ts` | generated (vite) | **integration only** (05 and 06 add pages) |
| `docs/_generated/facts.json`, `docs/site-reference/*` | generated | **integration regenerates** |
| `lib/catalog/**` | source | nobody |

## Migration timestamps

All additive; `.github/scripts/check-migrations-additive.mjs` must pass. Every timestamp sorts after sprint 13's
`20261220070100…` (see the precondition). The pattern is `20261228<wave><slot>00` (slot A = 1, B = 2, C = 3).

| Feature | Migration |
| ------- | --------- |
| 08 | `20261228020100_s14_game_reports` (three nullable `moderatedAt` columns) |
| 03 | `20261228030300_s14_synapse_matches_index` (`CONCURRENTLY`, alone), `20261228030301_s14_synapse_matches_index_ensure_valid` |
| 10 | `20261228040100_s14_tube_room_reports` (one nullable column) |
| 06 | `20261228050200_s14_puzzle_reports` (a new table with its indexes) |
| 13 | `20261228060300_s14_supporter_marks` (one `NOT NULL DEFAULT true` column) |

01, 02, 04, 05, 07, 09, 11, 12, 14, 15, 16, 17, 18, 19 and 20 have no schema change. **Every migration contains real
SQL.** New tables get plain indexes in the migration that creates them; new columns on existing tables are nullable or
carry a constant default. **One index on an existing table is planned** (03's, on `ss_player_match`): `CREATE INDEX
CONCURRENTLY` alone in its migration with Prisma's default name `ss_player_match_userId_lastUpdateAt_idx`, followed by the
`_ensure_valid` migration (copy `20261220010101_s13_ladder_own_jobs_index` and `…_ensure_valid`). Any other index a
feature finds it needs is reported, not added.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-14`, never pushed until the sprint PR.
- Feature branch: `autonomous/s14-<slug>` from the sprint branch **as it is when the wave starts**.
- Worktree: `/home/user/wt/s14-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge or rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite and product files (product files with `-c vitest.product.config.ts`), plus
   the gate tests in the brief (route table, API handler adoption, raw-fetch ratchet, `useeffect-fetch-ratchet`,
   `zod-off-hot-routes`, `islands`, i18n catalogues and drift, the computed-key ratchet, sitemap and OG coverage, test
   discovery, design consistency and Steel flat, the rAF allowlist, arrival coverage, the escape-hatch ratchet,
   tsconfig projects, server-fn guards, the native-dialog ratchet, migration safety, iOS edge contract, erasure
   coverage, the device-data registry, quiet counts, the shortcut registry, user-text direction, the notice-key
   catalogue and preview ratchet, the error-code catalogue and the `serverError` ratchet, permissions policy, feature
   manifests, `server-bundle-copies`, field names, the sweep reference columns, **the API cache policy, the ad-hoc
   cache ratchet and the audio-context ratchet**), the removable-type takedown test for any report type (07, 08, 10),
   and every read-path registry test the feature names.
2. `pnpm -s exec eslint <changed .ts/.tsx files>` and the boundary config, with no new warnings.
3. **The touched-files type check** (0 errors).
4. Schema features: `prisma validate`, `prisma generate`, the migration diffed by hand against the schema, the
   additive-migration check.
5. `pnpm i18n:extract`, keeping only the feature's namespace file (and `feed.json` / `notice-language.json` /
   `errors.json` where the feature adds there); if the extractor churns unrelated catalogues, add the keys by hand.
6. `pnpm api:routes` when an endpoint module was added, moved or removed.
7. Registry features: `pnpm docs:deletion` and commit `docs/account-deletion.md` (06, 18).
8. API feature (15): `pnpm sdk:generate` and `pnpm docs:api`, committed; `git diff packages/sdk` shows no existing field
   changed type.
9. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s14-<slug>`. On a conflict in a generated file, take either side and regenerate;
   anchored files should not conflict (if one does, keep both features' blocks under their anchors); `errors.json`, the
   erasure registry and `notice-language.json` take both sides.
2. Regenerate: `pnpm api:routes`; the route tree (start `pnpm exec vite --port 7999 --strictPort`, wait until
   `app/routeTree.gen.ts` changes, stop it — 05 and 06 add pages); `pnpm facts:generate`; `pnpm docs:site`;
   `pnpm docs:deletion`; after 15 and every later merge, `pnpm sdk:generate` and `pnpm docs:api`.
3. `pnpm exec prisma generate`, then the sliced `tsc` (sprint 13's 20 single-threaded slices), alone.
4. `pnpm test` and `pnpm test:product`.
5. **Real-Postgres smoke test of every new query** (the integration suite's throwaway Postgres, `docs/testing.md` §8),
   because sprint 13 showed fakes are not enough: apply the migrations and run each new Prisma query and raw query once
   through its own function, not a copy; in particular 02's compare-and-set (a stale, a matching and a `null`
   `expectedUpdatedAt`, and two concurrent posts with the same one: exactly one wins); 03's `CONCURRENTLY` index and its `_ensure_valid`, the match list
   and the erasure tombstones; 04's co-op board and class count; 05's activity grouping; 06's report upsert racing
   itself and a replace racing a first score (the in-place update under the lock); 08's filtered readers and the
   rating aggregate; 09's claims read (verified first, `nulls: 'last'`); 10's
   takedown keeping an earlier `closedAt`; 11's recipient `distinct`; 12's three-page walk with pins and two concurrent
   sixth pins; 13's reply read; 15's four endpoints; 17's core restriction read; 18's erasure end to end, twice; 20's
   reply-count decrement.
6. Review the diff against the brief and the specification's acceptance criteria; fix or send back. Check every read
   path the feature names: 01 (no own identity in any frame), 02 (no shared world uploaded; local never overwritten
   without a choice), 03 (own rows; no other player's id), 04 (board privacy), 05 (no `metadata` or `reason`), 06 (the
   answer admin-only; no replace of a played day), 07 and 08 and 10 (`moderatedAt` or delete in every reader:
   `GAME_CONTENT_READ_PATHS`, `TUBE_ROOM_READ_PATHS`), 09 (comparison and claims admin-only), 11 (blocks, mutes, muted
   threads), 12 (no duplicate or gap across pages), 13 (the field absent for everyone but the author), 15 (explicit
   scopes not in the default grant; no coordinates), 16 (every linker filtered; the pages server-decided), 17 (every
   writer in `RESTRICTION_ENFORCEMENT_PATHS`; hubs refuse), 18 (no `todo`; every plain-column model classified), 19 (no
   production import), 20 (each item).
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Confirm `exportSprint14` carries 03, 04, 05 and 06's sections, that the erasure coverage test passes with every
  sprint 14 table classified and `TODO_CEILING = 4`, and that the plain-column registry has no unclassified model.
- `pnpm check:consistency --base main`, the sliced typecheck, `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`,
  `pnpm build` with `scripts/check-bundle-budget.ts` (the site-tier CSS must not grow, B5: 06, 09, 12, 13, 14, 16 and
  17 add site-tier UI with existing utilities only), and a real-browser pass over every new or changed page in Day and
  Night at 390 px and 1280 px, and once in `ar`; the app-tier surfaces (RMHBox 01, Hearthworks 02, Synapse Storm 03,
  Altair 04 and 20, Doctrine 05, the daily desk 06, Slice It 07, the games library 08 and 11, RMHTube 10 and 20) in
  their own look; Identity Crisis (01) and the RMHTube room closing (10) on a running hub, since the production-build
  pass runs none.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code lines (TypeScript, TSX, SQL, CSS, JSON
content under `data/`) separately from documentation lines, measured with `git diff --numstat` from the Wave 0 parent
commit to `HEAD`, filtered by extension, excluding generated files (`routeTree.gen.ts`, `route-table.server.ts`,
`facts.json`, `docs/site-reference/**`, `locales/**`, `docs/account-deletion.md`, `packages/sdk/**`,
`docs/developer-api/endpoints/**`). It also lists the follow-ups 20 closed (and any found already closed), the
`serverError` ratchet's value after the sprint (it must not rise above 17), the touched-files type checks' results as
reported, how many type errors the sliced check still found (the measure of rule 1), and the open owner decisions this
sprint met.

## Risks

- **A report that hides too much or too little (07, 08, 10).** Every reader must honour `moderatedAt` or the delete;
  two read-path registries (`GAME_CONTENT_READ_PATHS`, `TUBE_ROOM_READ_PATHS`) with source scans make a forgotten
  reader a failing test; a song takedown is irreversible by design and its confirm says so.
- **Impersonation evidence is sensitive (09).** The comparison and the other accounts claiming a host are admin-only;
  the reporter sees status only; the endpoint keeps its rate limit and dedupe.
- **Timeouts in twenty places at once (17).** A check placed after a write, or a hub that imports the web tier, would
  be worse than none. One core rule, a registry with two scans, one test per hub, and integration tries each surface.
- **Self-exclusion is a safety promise (16).** A missed linker leaves a coin game in sight; the source scan lists every
  file that links a risk surface (the validation pass found seven the design missed, among them the Compete hub's
  Wagers tab). `/predictions`, `/wager/$id` and the Wagers tab are decided on the server, so they hold with scripting
  off and cannot be reached by typing the address.
- **Erasure decisions (03, 06, 18).** A tombstone that collides with a unique key fails erasure for a member; 18 verifies
  every default decision against the readers and records each change. Discord ids are classified `not-member`, not
  erased.
- **Save data (02).** A bad conflict choice loses hours of play. The local copy is always written first, nothing is
  overwritten without a choice, an unreadable account copy is ignored, and a second device's stale upload is refused
  by the optional compare-and-set (`expectedUpdatedAt`, `409`) rather than applied; the other shared-save games are
  unchanged because the field is optional.
- **A puzzle changing under players (06).** The replace generates first and then updates the row in place under a
  lock, re-checking the window, a 10-minute margin and the absence of scores with the time read inside the
  transaction; it never deletes the row, so no gap lets another writer create a different puzzle for the day.
- **The developer API (15, 17).** Explicit scopes must not enter the default grant (pinned); 17's new 403 on `/api/v1`
  posts is a behaviour change for timed-out members only and is in the changelog.
- **A notice storm (11).** Fifty recipients at most per post, deduped per unread row, blocks and mutes honoured, the
  Replies setting governs both.
- **Hub features not seen in the browser pass (01, 10, 17).** Each has hub tests; integration runs a hub for them.
- **The checker itself (19).** A false positive would block later waves; 19 ships first, with tests on real models, and
  its rules are limited to what Postgres rejects.
- **Migration order against `main`.** `main`'s future-dated migrations can overtake; integration checks at each wave
  start.
- **Scope creep in 20.** Seven items; anything else is reported, not fixed.

## Validation

The design pass checked each specification against the sprint 13 tip (`e07d7b737`) in the design worktree
`/home/user/wt/s14-design`:

- **Paths:** every file path cited in `features/` and `briefs/` that is said to exist was checked to exist; paths of
  files a feature creates are named as new (or listed under "Create" in its brief). A scripted pass listed every
  backticked path in the twenty specifications and the briefs and checked it against the tree (§"Corrections" in the
  README lists what it changed).
- **Models and registries:** every model (`SSMatch`, `SSPlayerMatch`, `SSLobby`, `SSLobbyMember`, `AltairCoopProfile`,
  `AltairMatchPlayer`, `AltairPlayer`, `DoctrineReputation`, `DoctrineReputationLedger`, `DailyPuzzle`,
  `DailyPuzzleScore`, `Song`, `SongComment`, `ChartReview`, `GameReview`, `GameGuide`, `GameThread`, `GameThreadPost`,
  `AchievementTip`, `ContentReport`, `ProfileLink`, `RmhTubeRoom`, `RmhTubeRoomMember`, `ConversationPref`, `Chat`,
  `ChatMessage`, `CreatorMembership`, `UserProfile`, `GameJam`, `GameJamThemeCandidate`, `HomeFavorite`,
  `HomeListing`, `HomeListingPriceChange`, `HomeWatch`, `UserPlayLimits`, `FeatureRestriction`, `GameSave`,
  `RmhboxPack`, `SecurityReport`, `ChatRemoval`, `DoctrineIncident`, `RMHboxMatch`, `RmhTypeMatch`, and the other
  plain-column models in 18's table) and registry (`MINIGAME_REGISTRY`, `SHARED_SAVE_GAMES`, `GAME_CAPABILITIES`,
  `XP_ACTIONS`, `AI_PUZZLE_MODES`, `REPORT_ENTITY_TYPES`, `REMOVABLE_REPORT_ENTITY_TYPES`, `MEMBER_ITEM_REPORT_TYPES`,
  `REPORT_REASONS`, `BOARD_PRIVACY_READ_PATHS`, `MUTE_READ_PATHS`, `CONVERSATION_SCOPES`, `RESTRICTABLE_FEATURES`,
  `FEATURE_LABELS`, `SIDEBAR_NAV`, `SCOPES`, `READ_SCOPES`, `ENDPOINTS`, `NULLABLE`, `DOCUMENTED_GROUPS`,
  `USER_TEXT_RENDERERS`, `NOTICE_TEMPLATES`, `ERROR_CODES`, `NAMESPACES`, `EXCLUDED_ROUTES`, `ERASURE_REGISTRY`,
  `TODO_CEILING`) named in a specification exists under that name.
- **"Nothing calls it" claims** were each checked by grep against the worktree: `SSMatch` / `SSPlayerMatch` reads (none),
  `AltairCoopProfile` reads (none), `DoctrineReputationLedger` reads (none), `getSupporterBadgeMap`, `isSupporterOf`,
  `accountsClaimingHost`, `listConversationPrefs`, `isSelfExcluded`, `isRestricted`, `setJamThemeCandidatesApi` (no
  caller), `fileImpersonationReport` / `getImpersonationComparison` (only the route; no client), a `song` report from
  Slice It (none), a profile report, block or mute control (none), `restrictionResponse` in `/api/v1` (none),
  `ActivityHeatmap data={{}}` and the "Full XP Breakdown" link to the leaderboard (both in
  `app/routes/strategies/profile/index.tsx`).
- **Migrations:** every planned name sorts after the newest in `prisma/migrations` (`20261220070100_s13_billing_hardening`).
- **The touched-files type check** was run at the design pass on three files (two server modules and a component)
  with the exact recipe in the briefs: 0 errors, 569–658 files, 2.2–2.6 GB, 13–16 s.
- **Not repeated:** no feature duplicates sprints 1–13. 01 is the next RMHBox stub (one a sprint); 18 and 20 are
  follow-up list items; the rejected ideas are in the README.
- **Independent validation (2026-11-25, second pass):** every feature was re-checked against the tree by a separate
  validator; what it found and changed is in the README's "Corrections from the independent validation".
