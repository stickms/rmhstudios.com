# Sprint 11 — implementation plan

How the twenty features are built: seven waves of at most three concurrent implementers, each in its own git worktree
and branch, merged into the sprint branch `claude/autonomous-sprint-11` by one integration owner between waves. The
machine budget and the per-feature checks are sprint 10's, restated so this file stands alone, with the lessons sprint
10's implementers and integration recorded folded into the briefs.

## Precondition: sprint 10 is in the sprint branch

`claude/autonomous-sprint-11` is cut from the sprint 10 branch tip (`claude/autonomous-sprint-10`, which holds sprints
1–10) once sprint 10 has finished integrating, **including feature 20 (`autonomous/s10-error-language`, merged by the
third validation pass)**, or from `origin/main` if sprint 10 has landed there by then (then `git merge origin/main`
again when it lands; the content is identical). Wave 0 is committed on top of that. Wave 1 does not start before,
because:

- the Wave 0 anchors go **after** sprint 10's anchor blocks in `lib/account/deletion.server.ts`,
  `prisma/schema/auth.prisma`, `lib/sitemap.ts`, `server/jobs/index.ts`, `components/feed/notification-labels.ts` (and
  its test), `lib/notifications/notice-keys.ts`, `components/feed/notice-previews.ts`, `lib/i18n/user-text.ts`,
  `lib/feed/__tests__/quiet-counts.test.ts` and `lib/i18n/config.ts`;
- every feature that refuses a request does so with a taxonomy code rendered by `components/errors/useRefusalText.ts`,
  and the `serverError(` ratchet (`lib/__tests__/server-error-ratchet.test.ts`) only lets that count fall — both are
  sprint 10 20's;
- features build on sprint 10 code: 10 and 17 on card sounds being the recorder's (s10-02, `CARD_SOUND_READ_PATHS`) and
  on the deck pace and suggestion columns (s10-03, s10-04); 12 on saved texts being private (s10-05); 09 on community
  events in the mod log (s10-07) and the recurring threads' gate; 13 and 14 on the listing erasure (s10-19); 18 on the
  sweep as sprint 10 integration left it (`a0a545c0a`) and the s10-19 listing-photo erasure; 19 on the sprint 10 code it
  fixes (s10-04, s10-07, s10-08);
- the migration timestamps below sort after sprint 10's `20261130060200…`;
- sprint 10's `.prettierignore` and `lib/i18n/config.ts` blocks sit where Wave 0 adds sprint 11's; take both sides on
  conflict.

## Machine budget

4 cores and 15 GB, shared. A cold `tsc -b` of the site project peaks around 10 GB, so **implementers never run
`pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev` or `vite`.** They run targeted vitest files, eslint on
their changed files and the commit gate (`--fast`, about 1 GB; it skips `tsc`). They never run prettier over files that
existed before (reformatting causes merge conflicts); new files may be formatted. Integration runs the one full
typecheck after each merge, alone. Each worktree has its own `node_modules` (`pnpm install --frozen-lockfile --offline`,
hard-linked from the store), so one feature's `prisma generate` never changes another's client. At most three
implementers run at once. **jsdom is not installed:** component tests render with `react-dom/server`
(`renderToStaticMarkup`) or test the pure logic the component calls; no test sets `environment: 'jsdom'`. **Timing
tests** (anything asserting a duration) take the fastest of several runs, never one.

## Wave 0 — scaffolding (integration commits it before Wave 1)

1. The precondition merge above.
2. **Namespaces.** Append to `NAMESPACES` in `lib/i18n/config.ts`, after sprint 10's block, one per line under the
   comment `// Sprint 11 (docs/autonomous/sprint-11): one namespace per feature.`: `gabriels-horn-bots`,
   `character-rolls`, `character-party`, `music-chords`, `lights-out-maker`, `daily-following`, `studio-share`,
   `studio-record`, `read-alongs`, `deck-coeditors`, `type-layouts`, `type-challenges`, `listing-prices`,
   `listing-photo-alt`, `room-quiz`, `rmhtube-subtitles`, `card-listen` (17 namespaces; 18 and 19 add no interface
   strings beyond `errors:` codes, and 20 writes into each fixed file's existing namespace). Check first that none of
   the names is already taken (`grep -n '"<name>"' lib/i18n/config.ts`); if one is, suffix it with `-s11` and correct
   the brief. Create each `locales/en/<ns>.json` containing `{}` and a newline. Run
   `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-config.test.ts` to check the registry
   accepts empty catalogues.
3. **Anchors** — so that two features of one wave never edit the same lines of a shared file. Each anchor is a comment
   line followed by one blank line; a feature keeps **its own anchor line** and adds its code directly below it.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of `anonymizeAccount`, directly after sprint
     10's last anchor block (`// s10-19 erasure-follows` and its lines): a header comment
     `// Sprint 11 erasures (docs/autonomous/sprint-11/plan.md §Anchors): each feature adds its operations under its own line.`
     then `// s11-03 character-party`, `// s11-05 lights-out-maker`, `// s11-07 studio-share`, `// s11-09 read-alongs`,
     `// s11-10 deck-coeditors`, `// s11-12 type-challenges`, `// s11-16 rmhtube-subtitles`. Also, **before** the
     transaction and after sprint 10's pre-step line, one line
     `// s11-09 read-alongs (hand-over reads before the transaction)` (09 alone uses it).
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields, after sprint 10's block:
     `// Sprint 11 back-relations (one block per feature, docs/autonomous/sprint-11/plan.md)` then
     `// s11-03 character-party`, `// s11-05 lights-out-maker`, `// s11-07 studio-share`, `// s11-09 read-alongs`,
     `// s11-10 deck-coeditors`, `// s11-12 type-challenges`, `// s11-16 rmhtube-subtitles`. Run
     `pnpm -s exec prisma validate` (dummy `DATABASE_URL`).
   - **New file `lib/account/export-sprint-11.server.ts`**, a copy of the shape of
     `lib/account/export-sprint-10.server.ts`:
     `async function exportSprint11(userId: string): Promise<Record<string, unknown>>` returning one object literal;
     inside it the header comment `// Sprint 11 exports (docs/autonomous/sprint-11/plan.md §Anchors)` then
     `// s11-03 character-party`, `// s11-05 lights-out-maker`, `// s11-07 studio-share`, `// s11-09 read-alongs`,
     `// s11-10 deck-coeditors`, `// s11-12 type-challenges`, `// s11-16 rmhtube-subtitles`. Each feature adds one
     property under its line (a dynamic `import()` of its own module, as sprint 10's entries do). Wave 0 calls it
     **once** from `lib/account/api/account.export.server.ts` beside the `exportSprint10(userId)` call and adds the
     result to the payload as `sprint11`, with `lib/account/__tests__/export-sprint-11.test.ts` (a copy of
     `export-sprint-10.test.ts`, whose Proxy Prisma mock answers any model) asserting the key. Implementers **never edit
     `account.export.server.ts`**. 13's change rows have no member, 14's descriptions and 17's deck languages are
     columns the existing export already reads (no `select`), and 02's and 11's data never leaves the device; each
     specification says so.
   - `lib/sitemap.ts`: in `STATIC_ROUTES`, after sprint 10's last entry (or at the end),
     `// Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)` then `// s11-05 lights-out-maker`
     (`/lights-out/boards`); in `EXCLUDED_ROUTES`, after sprint 10's block, the same header then
     `// s11-05 lights-out-maker` (`/lights-out/new`, `personal`), `// s11-12 type-challenges` (`/rmhtype/challenges`,
     `personal`); in `DYNAMIC_ROUTES`, the same header then `// s11-05 lights-out-maker` (`/lights-out/b/$id`, `null`),
     `// s11-09 read-alongs` (`/c/$slug/read/$id`). **Param-less paths never go in `DYNAMIC_ROUTES`.**
   - `server/jobs/index.ts`, at the end of `REGISTRATIONS` after sprint 10's block:
     `// Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)` then `// s11-09 read-alongs`,
     `// s11-12 type-challenges`. (Each also adds one import at the top; the two are in different waves.)
   - `components/feed/notification-labels.ts`, in `systemLabels`'s returned object directly before `default:` and after
     sprint 10's block: `// Sprint 11 system labels (docs/autonomous/sprint-11/plan.md §Anchors)` then
     `// s11-09 read-alongs`, `// s11-10 deck-coeditors`, `// s11-12 type-challenges`, `// s11-13 listing-prices`; and
     the same lines in `components/feed/__tests__/notification-labels.test.ts`.
   - **Notice keys**, the same four features: in `lib/notifications/notice-keys.ts`, at the end of `NOTICE_TEMPLATES`
     and at the end of `interface NoticeParamTypes`, the header
     `// Sprint 11 notices (docs/autonomous/sprint-11/plan.md §Anchors)` then `// s11-09 read-alongs`,
     `// s11-10 deck-coeditors`, `// s11-12 type-challenges`, `// s11-13 listing-prices`; in
     `components/feed/notice-previews.ts`, the same lines directly before `default:`.
   - `lib/i18n/user-text.ts`, at the end of `USER_TEXT_RENDERERS`:
     `// Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)` then `// s11-03 character-party`,
     `// s11-05 lights-out-maker`, `// s11-06 daily-following`, `// s11-09 read-alongs`, `// s11-10 deck-coeditors`,
     `// s11-12 type-challenges`, `// s11-14 listing-photo-alt`, `// s11-15 room-quiz`, `// s11-16 rmhtube-subtitles`,
     `// s11-19 s10-gaps`. (A file in a folder `USER_TEXT_EXEMPT` already covers, such as `components/studio/` or
     `components/rmhmusic/`, needs no entry; the scan says which.)
   - `lib/feed/__tests__/quiet-counts.test.ts`, at the end of `EXEMPT`:
     `// Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)` then `// s11-05 lights-out-maker`,
     `// s11-09 read-alongs` (05's `playCount` and 09's part threads may need an entry, with an honest reason; neither
     shows a post count).
   - **Reports** (05 and 07 add an entity type, in different waves): `lib/moderation/report-constants.ts` at the end of
     `REPORT_ENTITY_TYPES` and of `REMOVABLE_REPORT_ENTITY_TYPES`; `lib/moderation/api/moderation.report.server.ts` in
     `resolveTargetUser`'s switch before its fallback; `lib/moderation/triage.server.ts` at the end of
     `takedownReportedContent`'s chain and of the admin snippet block; `lib/moderation/my-reports.server.ts` where
     targets are set; `components/moderation/MyReportsPanel.tsx` at the end of both label maps (`kind-…`, `gone-…`): the
     header `// Sprint 11 (docs/autonomous/sprint-11/plan.md §Anchors)` then `// s11-05 lights-out-maker`,
     `// s11-07 studio-share`.
   - **Device data:** `lib/device-data/registry.ts`, at the end of `DEVICE_STORES`, and
     `components/settings/device-data-labels.ts`, at the end of its map: `// Sprint 11` then
     `// s11-02 character-rolls`, `// s11-11 type-layouts`, `// s11-16 rmhtube-subtitles`, `// s11-17 card-listen`.
   - **Refusal codes** (sprint 10 20): `lib/errors/codes.ts`, at the end of `ERROR_CODES` (after `EVENT_NOT_FOUND`), and
     `components/errors/useRefusalText.ts`, inside `sentence()`'s switch after its last `case` (`EVENT_NOT_FOUND`) and
     before the switch's closing brace (the switch has no `default:`; it is exhaustive over `ErrorCode`, so every new
     code needs its case or `tsc` fails): `// Sprint 11` then `// s11-03 character-party`, `// s11-05 lights-out-maker`,
     `// s11-06 daily-following`, `// s11-07 studio-share`, `// s11-09 read-alongs`, `// s11-10 deck-coeditors`,
     `// s11-12 type-challenges`, `// s11-13 listing-prices`, `// s11-14 listing-photo-alt`,
     `// s11-16 rmhtube-subtitles`, `// s11-17 card-listen`, `// s11-18 sweep-references`. `locales/en/errors.json`
     cannot hold comments: each feature adds its keys in sorted place, and integration merges the JSON by taking both
     sides. A refusal's params are only those `lib/errors/refusal.ts` reads (`PARAM_NAMES`: `endsAt`, `count`, `max`,
     `limit`, `remaining`, `minutes`, `days`); the briefs say so.
   - `lib/game/leaderboard-privacy.ts`, at the end of `BOARD_PRIVACY_READ_PATHS`: `// Sprint 11` then
     `// s11-05 lights-out-maker`, `// s11-06 daily-following`.
4. **No new shared helper.** `lockKey` serves every cap and claim; `useConfirm` and `usePrompt` every confirmation;
   `components/ui/tabs.tsx` every tab strip; `lib/calendar/tz.ts` every time-zone computation; the site's locale
   formatters every date and number; `components/ui/arrive.tsx` every arrival fade; `lib/async-pool.ts` every bounded
   fan-out; `notice()` every new `SYSTEM` notice; `refusalBody()` and `useRefusalText` every refusal; `lib/core/persist`
   every stored value.
5. `.prettierignore` gains `/docs/autonomous/sprint-11/` after sprint 10's line, with the same comment (Wave 0 does
   this); `docs/autonomous/README.md` already has the sprint 11 row (the design pass added it).
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

## Waves

| Wave | Slot A                | Slot B            | Slot C               |
| ---- | --------------------- | ----------------- | -------------------- |
| 1    | 01 gabriels-horn-bots | 13 listing-prices | 04 music-chords      |
| 2    | 02 character-rolls    | 10 deck-coeditors | 05 lights-out-maker  |
| 3    | 11 type-layouts       | 07 studio-share   | 16 rmhtube-subtitles |
| 4    | 03 character-party    | 15 room-quiz      | 06 daily-following   |
| 5    | 12 type-challenges    | 08 studio-record  | 14 listing-photo-alt |
| 6    | 09 read-alongs        | 17 card-listen    | 19 s10-gaps          |
| 7    | 18 sweep-references   | 20 field-names    | —                    |

The rule the waves keep: **no two features of one wave edit the same file unless that file is anchored** (each feature
under its own Wave 0 line) or generated (integration regenerates it). The erasure registry
(`lib/account/erasure-registry.ts`) is alphabetical, not anchored: wave 2's two entries (`DeckEditor`,
`LightsOutBoard*`), wave 3's (`RmhTubeSubtitle`, `StudioProjectShare`) and wave 6's (`AiPersona`'s reason, `ReadAlong*`)
sit in different places of the file; integration takes both sides on a conflict. `TODO_CEILING` stays 4: no feature adds
or classifies a `todo` entry.

Dependencies that fix the order:

- **One feature per app per wave:** RMHCharacters 02 (w2) → 03 (w4), both editing `ui/dnd5e/Sheet5e.tsx` and
  `ui/pf2e/SheetPf2e.tsx` (02 the roll buttons, 03 the read-only mode); RMHType 11 (w3) → 12 (w5), both editing
  `RmhTypeSoloPage.tsx` (11 the layout passed to key statistics, 12 the challenge start); Studio 07 (w3) → 08 (w5), both
  editing `StudioShell.tsx` or `StudioAppShell.tsx` and `lib/studio/store.ts`; RMHHomes 13 (w1) → 14 (w5) → 18 (w7), all
  three editing `lib/homes/listings.server.ts` or the two listing routes and `components/homes/*`; daily puzzles 05 (w2)
  → 06 (w4), both near the daily components (05 extracts `LightsGrid.tsx` from `LightsOutGame.tsx`; 06 edits
  `DailyPuzzleLeaderboard.tsx` and the hub).
- **Study:** 10 (w2) → 15 (w4) → 17 (w6). 10 adds `lib/study/deck-access.server.ts`, which 15's deck check and 17's
  owner-only language setting use; 10 and 17 both edit `prisma/schema/rmhstudy.prisma`, `lib/study.server.ts` and the
  deck editor's settings; 17 and 19 (both w6) do not share a file (17 the review components and `lib/study/listen*`, 19
  `lib/study/suggestions.server.ts` only).
- **Communities:** 09 (w6) edits `lib/communities/modlog.ts` (two actions) and `CommunityPlusBody.tsx`; 19 (w6) edits
  `lib/communities/modlog.server.ts` (`listPublicModLog`) and must not touch `modlog.ts`; 09 must not touch
  `modlog.server.ts`. If either needs the other's file, it stops and reports.
- **Reports:** 05 (w2), 07 (w3), anchored. **Notices and labels:** 13 (w1), 10 (w2), 12 (w5), 09 (w6), anchored.
  **Jobs:** 12 (w5), 09 (w6), anchored. **Sitemap:** 05 (w2), 12 (w5), 09 (w6), anchored.
- **Board privacy:** 05 (w2), 06 (w4), anchored. **Device data:** 02 (w2), 11 (w3), 16 (w3), 17 (w6), anchored (11 and
  16 share wave 3).
- **Refusal codes:** anchored in `codes.ts` and `useRefusalText.ts`; `errors.json` merged by integration.
- **The sweeps last:** 18 (w7) edits the media sweep and the listing write paths after 13 and 14; 20 (w7) edits form
  fields across components and must not edit 18's files (listed in its specification); it converts only fields that
  exist when wave 7 starts, because every earlier feature adds fields of its own (each already labelled, which 20's gate
  then holds).
- **No developer API change this sprint.** `lib/api/registry.ts`, `lib/api/scopes.ts`, `scripts/generate-sdk.ts` and the
  API changelog are untouched; a feature that finds it needs `/api/v1` stops and reports.

## Shared files and who touches them

| File                                                                                                      | Kind                              | Who                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/i18n/config.ts` (`NAMESPACES`)                                                                       | registry                          | **Wave 0 only**                                                                                                                                              |
| `locales/en/<ns>.json`                                                                                    | generated (extract) or hand-added | each feature, its own file; `feed.json` and `notice-language.json` for 09, 10, 12, 13; `errors.json` for refusals; 20 the files of the namespaces it touches |
| `prisma/schema/auth.prisma` (`User`)                                                                      | source, **anchored**              | 10, 05 (w2), 07, 16 (w3), 03 (w4), 12 (w5), 09 (w6)                                                                                                          |
| `prisma/schema/hearth.prisma`                                                                             | source                            | 13 (w1), 14 (w5)                                                                                                                                             |
| `prisma/schema/rmhstudy.prisma`                                                                           | source                            | 10 (w2), 17 (w6)                                                                                                                                             |
| `prisma/schema/{games,studio,rmhtube,rmhcharacters,rmhtype,communities}.prisma`                           | source                            | 05; 07; 16; 03; 12; 09 (one each)                                                                                                                            |
| `lib/account/deletion.server.ts`                                                                          | source, **anchored**              | 05, 10 (w2), 07, 16 (w3), 03 (w4), 12 (w5), 09 (w6)                                                                                                          |
| `lib/account/erasure-registry.ts`                                                                         | source (alphabetical)             | 05, 10, 07, 16, 03, 12, 09 (entries), 19 (`AiPersona` reason)                                                                                                |
| `lib/account/erasure-lists.server.ts`                                                                     | source                            | 19                                                                                                                                                           |
| `docs/account-deletion.md`                                                                                | generated (`pnpm docs:deletion`)  | each feature that edits the registry                                                                                                                         |
| `lib/account/export-sprint-11.server.ts`                                                                  | new in Wave 0, **anchored**       | 03, 05, 07, 09, 10, 12, 16                                                                                                                                   |
| `lib/account/api/account.export.server.ts`                                                                | source                            | **Wave 0 and integration only**                                                                                                                              |
| `lib/sitemap.ts`                                                                                          | source, **anchored**              | 05, 12, 09                                                                                                                                                   |
| `lib/og/static-cards.ts`                                                                                  | source                            | 05 (the boards page's card)                                                                                                                                  |
| `server/jobs/index.ts`                                                                                    | source, **anchored**              | 12 (w5), 09 (w6)                                                                                                                                             |
| `components/feed/notification-labels.ts` + test, `lib/notifications/notice-keys.ts`, `notice-previews.ts` | source, **anchored**              | 13 (w1), 10 (w2), 12 (w5), 09 (w6)                                                                                                                           |
| `lib/i18n/user-text.ts`                                                                                   | source, **anchored**              | 05, 10, 16, 03, 15, 06, 12, 14, 09, 19 (19 also removes one `USER_TEXT_EXEMPT` entry)                                                                        |
| `lib/feed/__tests__/quiet-counts.test.ts` (`EXEMPT`)                                                      | test registry, **anchored**       | 05, 09 if needed                                                                                                                                             |
| report files (constants, report route, triage, my-reports, `MyReportsPanel.tsx`)                          | source, **anchored**              | 05 (w2), 07 (w3)                                                                                                                                             |
| `lib/device-data/registry.ts`, `components/settings/device-data-labels.ts`                                | source, **anchored**              | 02 (w2), 11, 16 (w3), 17 (w6)                                                                                                                                |
| `lib/errors/codes.ts`, `components/errors/useRefusalText.ts`                                              | source, **anchored**              | every feature that refuses                                                                                                                                   |
| `lib/game/leaderboard-privacy.ts` (`BOARD_PRIVACY_READ_PATHS`)                                            | source, **anchored**              | 05 (w2), 06 (w4)                                                                                                                                             |
| `lib/communities/bans.ts` (`BAN_ENFORCEMENT_PATHS`)                                                       | source                            | 09                                                                                                                                                           |
| `lib/communities/modlog.ts`; `lib/communities/modlog.server.ts`                                           | source                            | 09; 19                                                                                                                                                       |
| `components/communities/CommunityPlusBody.tsx`                                                            | source                            | 09                                                                                                                                                           |
| `lib/study.server.ts`, `lib/study/deck-editor.server.ts`, `lib/study/queue*.ts`                           | source                            | 10 (w2), 17 (w6: `cloneDeck` and the deck update only)                                                                                                       |
| `lib/study/deck-access.server.ts`, `deck-access.ts`                                                       | new in 10                         | 10; 15 and 17 call it                                                                                                                                        |
| `lib/study/suggestions.server.ts`                                                                         | source                            | 19                                                                                                                                                           |
| `components/study/ReviewAll.tsx`, `components/feed/DeckStudyColumn.tsx`                                   | source                            | 17                                                                                                                                                           |
| `lib/audio/read-aloud.ts`                                                                                 | source                            | 17                                                                                                                                                           |
| `features/gabriels-horn/**`                                                                               | source                            | 01                                                                                                                                                           |
| `features/rmhcharacters/**`                                                                               | source                            | 02 (w2), 03 (w4)                                                                                                                                             |
| `lib/rmhmusic/learn/**`, `components/rmhmusic/learn/**`                                                   | source                            | 04                                                                                                                                                           |
| `lib/lights-out/**`, `components/lights-out/**`                                                           | source                            | 05                                                                                                                                                           |
| `lib/daily-puzzles/**`, `components/daily-puzzles/**`                                                     | source                            | 06                                                                                                                                                           |
| `lib/studio/**`, `components/studio/**`                                                                   | source                            | 07 (w3), 08 (w5)                                                                                                                                             |
| `lib/rmhtype/**`, `components/rmhtype/**`, `server/socket-server/handlers/rmhtype.ts`                     | source                            | 11 (w3), 12 (w5)                                                                                                                                             |
| `server/socket-server/config.ts` (`SOCKET_RATE_LIMITS`)                                                   | source                            | 01 (w1), 15 (w4), 12 (w5): one entry per new client-to-server event                                                                                          |
| `server/rmhtube/config.ts` (`SOCKET_RATE_LIMITS`), `server/rmhtube/schemas.ts`                            | source                            | 16                                                                                                                                                           |
| `lib/toolbox/dice.ts`, `lib/game/leaderboard-scope.server.ts` (`scopeFilter`)                             | source, **read only**             | 02 imports the dice parser; 06 calls `scopeFilter('friends')`; neither edits them                                                                            |
| `lib/homes/**`, `components/homes/**`, `app/routes/api/homes/listings.ts`                                 | source                            | 13 (w1), 14 (w5), 18 (w7)                                                                                                                                    |
| `lib/rmhstudy/**`, `components/rmhstudy/**`, `server/socket-server/handlers/rmhstudy.ts`                  | source                            | 15                                                                                                                                                           |
| `lib/rmhtube/**`, `components/rmhtube/**`, `server/rmhtube/**`                                            | source                            | 16                                                                                                                                                           |
| `lib/media/sweep-surfaces.ts` (`SWEEP_REFERENCE_EXEMPT`), `lib/account/erasure-follows.server.ts`         | source                            | 18 (`sweep.server.ts` is read by its gate, not edited)                                                                                                       |
| `lib/admin/api-keys-schema.ts`, `components/settings/RepostMutesSection.tsx`                              | source                            | 19                                                                                                                                                           |
| component files with unnamed fields                                                                       | source                            | 20 (w7), not 18's files                                                                                                                                      |
| `lib/api/route-table.server.ts`                                                                           | generated (`pnpm api:routes`)     | each feature regenerates it; **integration regenerates on every merge**                                                                                      |
| `app/routeTree.gen.ts`                                                                                    | generated (vite)                  | **integration only**                                                                                                                                         |
| `docs/_generated/facts.json`, `docs/site-reference/*`                                                     | generated                         | **integration regenerates** (`pnpm facts:generate`, `pnpm docs:site`)                                                                                        |
| `lib/catalog/**`                                                                                          | source                            | nobody (no new games or apps)                                                                                                                                |

## Migration timestamps

All additive; `.github/scripts/check-migrations-additive.mjs` must pass. Every timestamp sorts after sprint 10's
`20261130060200…`. The pattern is `20261201<wave><slot>00` (slot A = 1, B = 2, C = 3).

| Feature | Migration                              |
| ------- | -------------------------------------- |
| 13      | `20261201010200_s11_listing_prices`    |
| 10      | `20261201020200_s11_deck_coeditors`    |
| 05      | `20261201020300_s11_lights_out_maker`  |
| 07      | `20261201030200_s11_studio_share`      |
| 16      | `20261201030300_s11_rmhtube_subtitles` |
| 03      | `20261201040100_s11_character_party`   |
| 12      | `20261201050100_s11_type_challenges`   |
| 14      | `20261201050300_s11_listing_photo_alt` |
| 09      | `20261201060100_s11_read_alongs`       |
| 17      | `20261201060200_s11_card_listen`       |

01, 02, 04, 06, 08, 11, 15, 18, 19 and 20 have no schema change. **Every migration contains real SQL.** New tables get
plain indexes in their own migration; new columns on existing tables are nullable or carry a constant default (13's
three, 14's one, 17's two). **No feature adds an index to an existing table**; an implementer who finds one needed
reports it and does not add it (if integration agrees, it is a `CREATE INDEX CONCURRENTLY` migration of one statement
with Prisma's default name, followed by an `_ensure_valid` migration, as sprint 10's `user_mute_expiresAt_idx`).

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-11`, never pushed until the sprint PR.
- Feature branch: `autonomous/s11-<slug>` from the sprint branch **as it is when the wave starts**.
- Worktree: `/home/user/wt/s11-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge or rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite and product files, plus the gate tests that cover what they touched (route
   table, API handler adoption, raw-fetch ratchet, `useeffect-fetch-ratchet`, `zod-off-hot-routes`, `islands`,
   boundaries and the lint ratchet (no import cycles, `lib/` never imports `components/`), i18n catalogs and drift, the
   computed-key ratchet, the native-dialog ratchet, sitemap and OG coverage, test discovery, design consistency and
   Steel flat when site-tier UI changed, the rAF allowlist, arrival coverage, the escape-hatch ratchet, tsconfig
   projects, server-fn guards, the device-data registry test when a storage key was added, the migration-safety test
   when a migration was added, erasure coverage when a `User` relation was added, the shortcut registry test when a key
   binding was added, the notice-key catalogue and the notice-preview ratchet when a notice was added, the user-text
   direction test when member text is rendered, the error-code catalogue and the `serverError` ratchet when a refusal
   was added, the permissions-policy test when a device API is called, and every read-path registry test the feature
   names).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed from the wave's base schema, and the
   additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file (and `feed.json` / `notice-language.json` /
   `errors.json` where the feature adds there); if the extractor churns unrelated catalogues, add the keys by hand.
5. `pnpm api:routes` when an endpoint module was added, moved or removed.
6. Registry features: `pnpm docs:deletion` and commit `docs/account-deletion.md`.
7. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s11-<slug>`. On a conflict in a generated file, take either side and regenerate;
   anchored files should not conflict (if one does, keep both features' blocks under their anchors); `errors.json` and
   the erasure registry take both sides.
2. Regenerate: `pnpm api:routes`; the route tree (start `pnpm exec vite --port 7999 --strictPort`, wait until
   `app/routeTree.gen.ts` changes, stop it — 05, 09 and 12 add pages); `pnpm facts:generate`; `pnpm docs:site`;
   `pnpm docs:deletion`.
3. `pnpm exec prisma generate`, then `pnpm exec tsc -b --checkers 1` alone.
4. `pnpm test` and `pnpm test:product`.
5. **Raw SQL, lock and claim smoke test** against a throwaway Postgres (the integration suite's, `docs/testing.md` §8):
   apply the migrations and run each new query once; for 03 the party caps; for 05 a solve recorded twice at once and
   the board cap; for 07 the share cap; for 09 two concurrent job runs over one due part; for 10 the editor cap and a
   removed editor's next read; for 12 two concurrent race starts claiming one challenge and two concurrent finishes
   settling it once; for 13 a scraper batch's single read; for 16 the three-per-item rule.
6. Review the diff against the brief and the specification's acceptance criteria; fix or send back. Check every read
   path the feature names: 03 (party membership on every read; the full sheet only where the player shared it, never its
   `notes`), 05 and 06 (board privacy, blocks; 06 mutuals only), 07 (token only, no device sample id or name in a
   snapshot), 09 (private communities, bans, the content warning on each thread), 10 (`DECK_ACCESS_PATHS`, owner-only
   fields, `CARD_SOUND_READ_PATHS`), 12 (mutuals, blocks, one attempt per challenge, a finish that does not cover the
   passage or fails the plausibility check never wins), 15 (no answer before the reveal; a private deck only by its
   owner), 16 (current room members only; cue text never rendered as HTML), 18 (the schema gate, the erasure's photo
   objects), 19 (each item), 20 (the field gate at zero for the site tier).
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Confirm `exportSprint11` carries 03, 05, 07, 09, 10, 12 and 16's sections, and that the erasure coverage test passes
  with every sprint 11 table classified and `TODO_CEILING = 4`.
- `pnpm check:consistency --base main`, `pnpm typecheck`, `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`,
  `pnpm build` with `scripts/check-bundle-budget.ts` (the site-tier CSS must not grow, B5: 05, 06, 09, 10, 13, 14 and 17
  add site-tier UI with existing utilities only), and a real-browser pass over every new or changed page in Day and
  Night at 390 px and 1280 px, and once in `ar`; the app-tier surfaces (Gabriel's Horn 01, RMHCharacters 02 and 03, RMH
  Music 04, the daily puzzles 06, the Studio 07 and 08, RMHType 11 and 12, RMHStudy 15, RMHTube 16) in their own look.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code lines (TypeScript, TSX, SQL, CSS)
separately from documentation lines, measured with `git diff --numstat` from the Wave 0 parent commit to `HEAD`,
filtered by extension, excluding generated files (`routeTree.gen.ts`, `route-table.server.ts`, `facts.json`,
`docs/site-reference/**`, `locales/**`, `docs/account-deletion.md`). It also lists the follow-ups 18 and 19 closed (and
any they found already closed), the `serverError` ratchet's value after the sprint (it must not have risen), 20's field
gate baseline at wave start and at the end, and the open owner decisions this sprint met (uploading Studio samples
beside 07 and 08, public decks beside 10, a deleted member's follows beside 12's mutuals rule).

## Validation

A second pass read each specification against the sprint 10 branch tip and changed:

- **04:** the spelling helpers to reuse are `content/spelling.ts` as well as the theory modules; the folder's tests are
  colocated main-suite files, not product tests.
- **05:** `/lights-out` is a legacy redirect to the daily (`lib/route/legacy-redirects.ts`, exact path only), so the
  three pages are flat route files with no parent; the keyboard rule follows the daily's native cell buttons (there is
  no arrow-key grid today).
- **08:** the settings live in `StudioSettings` / `DEFAULT_SETTINGS` (`lib/studio/constants.ts`) and persist through
  `store.ts`'s `partialize`, so new fields need defaults on rehydrate; the transport already has a metronome.
- **10:** `FlashcardDeck` is `owner` in the erasure registry (decks stay at deletion), so editor rows on a deleted
  owner's decks stay; only the member's rows as an editor are erased.
- **12:** lore passages are challengeable only if their ids are stable; no RMHType socket handler test exists, so the
  new one copies `rmhstudy-window.test.ts`'s harness; the opt-out is its own small table.
- **14:** the reminder is `User.requireAltText` (`lib/feed/alt-text.server.ts`); listings are created through
  `app/routes/api/homes/listings.ts` as well as updated through the registered module.
- **17:** `Space` and `Enter` already reveal in `ReviewAll.tsx`; the one new key is `a`, guarded like the existing `p`;
  `createReader` reads the document language today, so it gains an optional `lang`.
- **18:** `SweepDeps` is built in `lib/media/sweep-jobs.server.ts` (`mediaSweepDeps()`); the sweep's tests are
  `lib/__tests__/media-sweep.test.ts` and `lib/media/__tests__/sweep-surfaces.test.ts` (superseded by the third pass
  below).
- **19:** the exact places (the persona's `tagline` and `greeting`, the decline-and-block `updateMany` with no block
  table, `listPublicModLog` and `EventVisibility`, `lib/admin/api-keys-schema.ts`) and the existing test files to
  extend.
- **Briefs:** 01, 02 and 03 add their namespaces to `features/<id>/feature.ts` (`namespaces`, held by
  `lib/__tests__/feature-manifests.test.ts`), which joins every brief's gate list.
- **Checked and unchanged:** the follow-ups sprint 10 18 closed (the profile handle path, the ghost assist check, the
  recurring claims, the held hint, the sweep's crash window, the grant on cancel) and older ones already fixed in code
  (blocked prize claims are paged past in `settleUnansweredClaims`; `CallMute.mutedUserId` has an index; the Studio's
  dirty flag compares with the saved document; card-picture claims refuse animated WebP; banned members cannot RSVP to
  community events) are not re-specified.

### Third pass (after sprint 10 integration, s10-20 merged)

- **Refusals:** `useRefusalText`'s switch has no `default:` (exhaustive over `ErrorCode`), so the Wave 0 anchor goes
  after its last `case`; params are limited to `PARAM_NAMES` (`lib/errors/refusal.ts`) and a code is honoured only when
  the body's English equals its text, so every brief says to use `refusalBody()`. The `serverError(` ratchet's
  `BASELINE` is 18 at the tip; it must not rise.
- **Socket rate limits:** `checkRateLimit` allows any event name with no `SOCKET_RATE_LIMITS` entry, so 01, 12 and 15
  add theirs to `server/socket-server/config.ts` and 16 to `server/rmhtube/config.ts` (new rows in the shared-file
  table; the three socket-server features are in different waves).
- **01:** the two new events' rate-limit entries.
- **02:** reuses `lib/toolbox/dice.ts` and `random.ts` (sprint 01 19's dice roller) instead of a new parser; adds only a
  sheet limit.
- **03:** the game master opens a sheet only where its player turned "Let the game master open my full sheet" on (a
  `sheetShared` column, off by default), and never receives `notes` or `portrait`; the summary never carries the
  player's free text.
- **05:** `solvePuzzle` is a brute force capped at 2^15 subsets, wrong above 15 cells; a new exact GF(2) solver
  (`lib/lights-out/solve.ts`) backs the maker, and `solvePuzzle` delegates to it (the daily's 4×4 becomes exact).
- **06:** the board is mutual follows through `scopeFilter('friends')`, as the game boards and RMH Music do; a one-way
  board would let anyone watch a member's daily results by following them.
- **07:** there is no built-in sample library (every `bufferId` is a device UUID), so every audio clip's `bufferId` and
  `name` are emptied on the server; the token is `randomBytes(16)` base64url; one 404 for revoked, hidden and unknown;
  `?share=` is removed from the address bar.
- **08:** the playhead is the store's `currentBeat`; the recorder reads the transport clock.
- **12:** solo finishes take the client's position with no upper bound, so a challenge settles only on a clamped, full,
  `MAX_WPM`-bounded, `isPlausibleGhost` finish, and a race is one attempt (`pending → racing → done`; a left or stale
  race is "Did not finish"). **Follow-up for the integration summary:** ordinary solo runs and their leaderboard rows
  (`persistSoloResult`) still trust the unbounded client position; a separate fix, not in this sprint.
- **15:** a private deck is quizzed only by its owner (an editor from 10 cannot show it to a room); rate-limit entries.
- **16:** reads require a current room member (`RmhTubeRoomMember.leftAt` null) or the host; the parser's injection
  rules (tags removed before entities are decoded, `STYLE` dropped, controls and bidi overrides removed) and the 512 KB
  cue cap under the hub's 1 MB buffer; hub zod and rate-limit entries.
- **18:** rebuilt. Sprint 10 integration (`a0a545c0a`) already added `homeListing`, `emailCampaign` and `siteEra` to
  `referencedUrls`, so that requirement is gone. The code shows `/api/rmharks/image` writes no `Media` row
  (`ingest(..., { userId })` without `record`), which sprint 10 19's comments and review got wrong: the erasure's
  `deleteMemberListingImageObjects` matches no row and deletes no photo. 18 now deletes by URL (`ownsFeedImageUrl`,
  skipping anything `referencedUrls` still names), limits listing photos to the author's own feed uploads, and keeps the
  schema gate. 20's do-not-touch list follows.
- **19:** all six items re-checked open at the final tip; (e)'s refinement lives in `lib/admin/api-keys-schema.ts`.
- **Briefs:** the per-feature `vitest` lines were not runnable (backticks, prose in the command) and passed
  `*.product.test.ts` files to the main config, which excludes them; each now runs main tests and product tests
  (`-c vitest.product.config.ts`) separately. Socket features add `server-bundle-copies.test.ts` to their gate list.
- **Checked and unchanged:** 04, 09, 10, 11, 13, 14, 17, 20's claims (the cited files, functions and tests exist as
  stated); no feature duplicates sprints 1–10 (02's dice roller overlap is resolved by reuse; 11 is sprint 02 07's
  recorded "other layouts" follow-up).
