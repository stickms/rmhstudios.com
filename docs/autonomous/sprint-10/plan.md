# Sprint 10 — implementation plan

How the twenty features are built: seven waves of at most three concurrent implementers, each in its own git worktree
and branch, merged into the sprint branch `claude/autonomous-sprint-10` by one integration owner between waves. The
machine budget and per-feature checks are sprint 09's, restated so this file stands alone, with the lessons sprint 09's
implementers and integration recorded folded into the briefs.

## Precondition: sprint 09 is in the sprint branch

`claude/autonomous-sprint-10` is cut from the sprint 09 branch tip (`claude/autonomous-sprint-09`, which holds sprints
1–9) once sprint 09 has finished integrating, or from `origin/main` if sprint 09 has landed there by then (then
`git merge origin/main` again when it lands; the content is identical). Wave 0 is committed on top of that. Wave 1 does
not start before, because:

- the Wave 0 anchors go **after** sprint 09's anchor blocks in `lib/account/deletion.server.ts`,
  `prisma/schema/auth.prisma`, `lib/sitemap.ts`, `server/jobs/index.ts`, `components/feed/notification-labels.ts` (and
  its test), `app/routes/_site/admin/index.tsx`, `lib/api/registry.ts`, `lib/api/scopes.ts`, `scripts/generate-sdk.ts`,
  `docs/developer-api/changelog.md` and `lib/i18n/config.ts`;
- features build on sprint 09 code: 02 on the media sweep's surface list (s09-12) and the occlusion card kind (s09-03);
  05 on the pasted custom test and key statistics (s09-02); 13 on the post read-path registries as sprint 09 left them;
  15 on the deletion hold's webhook pause (s09-14); 18 on the scheduled gate (s09-11), the durable reclaims (s09-13) and
  the Neon Driftway assists (s09-17); 19 on sprint 09's erasures (s09-15, s09-16, `TODO_CEILING = 17`); every feature
  that writes a `SYSTEM` notice on `notice()` keys (s09-19); every feature that renders member text on
  `USER_TEXT_RENDERERS` (s09-20);
- the migration timestamps below sort after sprint 09's `20261129070100…`;
- sprint 09's `.prettierignore` and `lib/i18n/config.ts` blocks sit where Wave 0 adds sprint 10's; take both sides on
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
2. **Namespaces.** Append to `NAMESPACES` in `lib/i18n/config.ts`, after sprint 09's block, one per line under the
   comment `// Sprint 10 (docs/autonomous/sprint-10): one namespace per feature.`: `highlight-cards`, `card-sound`,
   `study-pace`, `deck-suggestions`, `type-texts`, `bass-clef`, `community-events`, `profile-preview`, `build-issues`,
   `timed-mutes`, `passage-links`, `admin-webhooks`, `speedrun-queue`, `admin-communities`, `race-fixes` (15 namespaces;
   12, 14 and 19 write no UI strings; 13 adds one string to the existing `f-devplatform` namespace; 20 writes into the
   existing `errors` namespace, which `lib/errors/codes.ts` already names). Create each `locales/en/<ns>.json`
   containing `{}` and a newline. Run
   `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-config.test.ts` to check the registry
   accepts empty catalogues.
3. **Anchors** — so that two features of one wave never edit the same lines of a shared file. Each anchor is a comment
   line followed by one blank line; a feature keeps **its own anchor line** and adds its code directly below it.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of `anonymizeAccount`, directly after sprint
     09's last anchor block (`// s09-16 erasure-boards` and its line): a header comment
     `// Sprint 10 erasures (docs/autonomous/sprint-10/plan.md §Anchors): each feature adds its operations under its own line.`
     then `// s10-02 card-sound`, `// s10-04 deck-suggestions`, `// s10-05 type-texts`, `// s10-09 build-issues`,
     `// s10-19 erasure-follows`. Also, **before** the transaction and after sprint 09's pre-steps, one line
     `// s10-19 erasure-follows (counter reads before the transaction)` (19 alone uses it), and **after** the
     transaction, beside sprint 08/09's after-transaction block, one line
     `// s10-02 card-sound (stored objects deleted after the transaction)` (02 alone uses it).
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields, after sprint 09's block:
     `// Sprint 10 back-relations (one block per feature, docs/autonomous/sprint-10/plan.md)` then
     `// s10-04 deck-suggestions`, `// s10-05 type-texts`, `// s10-09 build-issues`. Run `pnpm -s exec prisma validate`
     (dummy `DATABASE_URL`).
   - **New file `lib/account/export-sprint-10.server.ts`**, a copy of the shape of
     `lib/account/export-sprint-09.server.ts`:
     `async function exportSprint10(userId: string): Promise<Record<string, unknown>>` returning one object literal;
     inside it the header comment `// Sprint 10 exports (docs/autonomous/sprint-10/plan.md §Anchors)` then
     `// s10-02 card-sound`, `// s10-03 study-pace`, `// s10-04 deck-suggestions`, `// s10-05 type-texts`,
     `// s10-09 build-issues`. Each feature adds one property under its line (a dynamic `import()` of its own module, as
     sprint 09's entries do). Wave 0 calls it **once** from `lib/account/api/account.export.server.ts` beside the
     `exportSprint09(userId)` call and adds the result to the payload as `sprint10`, with
     `lib/account/__tests__/export-sprint-10.test.ts` (a copy of `export-sprint-09.test.ts`, whose Proxy Prisma mock
     answers any model) asserting the key. Implementers **never edit `account.export.server.ts`**. 01's link rows, 07's
     events, 15's and 17's admin columns and 16's reviewer columns are bookkeeping or other people's records; none is
     exported, and each specification says so. 10's `expiresAt` needs no section: the existing export reads `userMute`
     rows with no `select`.
   - `lib/sitemap.ts`: in `EXCLUDED_ROUTES`, after sprint 09's block,
     `// Sprint 10 (docs/autonomous/sprint-10/plan.md §Anchors)` then `// s10-05 type-texts` (`/rmhtype/texts`,
     `personal`), `// s10-08 profile-preview` (`/settings/preview`, `personal`), `// s10-15 admin-webhooks`
     (`/admin/webhooks`, `admin`), `// s10-16 speedrun-queue` (`/admin/speedruns`, `admin`),
     `// s10-17 admin-communities` (`/admin/communities`, `admin`); in `DYNAMIC_ROUTES` (the `$param` map), the same
     header then `// s10-09 build-issues` (`/builds/$slug/issues`, `content`). **Param-less paths go in
     `EXCLUDED_ROUTES`, never `DYNAMIC_ROUTES`.**
   - `server/jobs/index.ts`, at the end of `REGISTRATIONS` after sprint 09's block:
     `// Sprint 10 (docs/autonomous/sprint-10/plan.md §Anchors)` then `// s10-16 speedrun-queue`,
     `// s10-10 timed-mutes`, `// s10-19 erasure-follows`. (Each also adds one import at the top; the three are in
     different waves.)
   - `components/feed/notification-labels.ts`, in `systemLabels`'s returned object directly before `default:` and after
     sprint 09's block: `// Sprint 10 system labels (docs/autonomous/sprint-10/plan.md §Anchors)` then
     `// s10-04 deck-suggestions`, `// s10-09 build-issues`, `// s10-15 admin-webhooks`, `// s10-16 speedrun-queue`,
     `// s10-17 admin-communities`; and the same anchor lines in `components/feed/__tests__/notification-labels.test.ts`
     where it pins each label's key and English text. Labels are literal
     `t('system-label-<type>', { ns: 'feed', defaultValue: '…' })` calls and land in `locales/en/feed.json`.
   - **Notice keys** (sprint 09 19), the same five features: in `lib/notifications/notice-keys.ts`, at the end of
     `NOTICE_TEMPLATES` (before `} as const;`) and at the end of `interface NoticeParamTypes`, the header
     `// Sprint 10 notices (docs/autonomous/sprint-10/plan.md §Anchors)` then `// s10-04 deck-suggestions`,
     `// s10-09 build-issues`, `// s10-15 admin-webhooks`, `// s10-16 speedrun-queue`, `// s10-17 admin-communities`; in
     `components/feed/notice-previews.ts`, the same lines directly before `default:`. Keys added under an anchor are
     exempt from the object's alphabetical order (the catalogue test compares sorted key sets, not positions); the
     integration owner may sort them after the sprint.
   - `lib/feed/__tests__/quiet-counts.test.ts`, at the end of `EXEMPT`:
     `// Sprint 10 (docs/autonomous/sprint-10/plan.md §Anchors)` then `// s10-08 profile-preview`,
     `// s10-09 build-issues`, `// s10-13 api-moderation`, `// s10-17 admin-communities` (08 and 17 share wave 6 and may
     both need an entry).
   - `lib/i18n/user-text.ts`, at the end of `USER_TEXT_RENDERERS`:
     `// Sprint 10 (docs/autonomous/sprint-10/plan.md §Anchors)` then `// s10-01 highlight-cards`,
     `// s10-02 card-sound`, `// s10-04 deck-suggestions`, `// s10-05 type-texts`, `// s10-08 profile-preview`,
     `// s10-09 build-issues`, `// s10-15 admin-webhooks`, `// s10-16 speedrun-queue`, `// s10-17 admin-communities`.
   - `app/routes/_site/admin/index.tsx`, after sprint 09's block: `{/* Sprint 10 admin tools */}` then
     `{/* s10-16 speedrun-queue */}`, `{/* s10-15 admin-webhooks */}`, `{/* s10-17 admin-communities */}`. The `t()`
     calls sit inside props, never directly after a `{/* */}` comment.
   - `lib/settings-nav.ts`, after sprint 07's block: `// Sprint 10` then `// s10-08 profile-preview`.
   - `lib/api/registry.ts`, at the end of the paths, after sprint 09's block:
     `// Sprint 10 (docs/autonomous/sprint-10/plan.md §Anchors)` then `// s10-12 api-events`,
     `// s10-13 api-moderation`, `// s10-14 api-rmhtube`. 02's card fields are edited in place in the existing flashcard
     card schema (wave 2; no other API feature in that wave), and 18's `held` value in place in the scheduled schema
     (wave 6; no other API feature in that wave).
   - `lib/api/scopes.ts`, at the end of the scope list: `// Sprint 10` then `// s10-12 api-events`,
     `// s10-13 api-moderation`, `// s10-14 api-rmhtube`.
   - `scripts/generate-sdk.ts`, at the end of `NULLABLE`: `// Sprint 10` then `// s10-02 card-sound`,
     `// s10-12 api-events`, `// s10-13 api-moderation`, `// s10-14 api-rmhtube`.
   - `docs/developer-api/changelog.md` (newest section first): a new top section `## Sprint 10 — 2026-11` holding one
     HTML comment line per API feature, `<!-- s10-12 api-events -->`, `<!-- s10-02 card-sound -->`,
     `<!-- s10-13 api-moderation -->`, `<!-- s10-14 api-rmhtube -->`, `<!-- s10-18 race-fixes -->`; each feature writes
     its bullets under its line.
4. **No new shared helper.** `lockKey` serves every cap and claim; `useConfirm` and `usePrompt` every confirmation;
   `components/ui/tabs.tsx` every tab strip; `lib/calendar/tz.ts` and `lib/study/stats.ts`'s `dayKeyInZone` every
   time-zone computation; the site's locale formatters every date and number; `components/ui/arrive.tsx` every arrival
   fade; `lib/async-pool.ts` every bounded fan-out; `notice()` every new `SYSTEM` notice; `recordAdminActionIn` every
   admin action.
5. `.prettierignore` gains `/docs/autonomous/sprint-10/` after sprint 09's line, with the same comment, and
   `docs/autonomous/README.md` gains the sprint 10 row (done in these documents).
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

## Waves

| Wave | Slot A              | Slot B               | Slot C            |
| ---- | ------------------- | -------------------- | ----------------- |
| 1    | 01 highlight-cards  | 12 api-events        | 06 bass-clef      |
| 2    | 02 card-sound       | 07 community-events  | 16 speedrun-queue |
| 3    | 03 study-pace       | 13 api-moderation    | 05 type-texts     |
| 4    | 04 deck-suggestions | 14 api-rmhtube       | 15 admin-webhooks |
| 5    | 11 passage-links    | 09 build-issues      | 10 timed-mutes    |
| 6    | 08 profile-preview  | 17 admin-communities | 18 race-fixes     |
| 7    | 19 erasure-follows  | 20 error-language    | —                 |

The rule the waves keep: **no two features of one wave edit the same file unless that file is anchored** (each feature
under its own Wave 0 line) or the file is generated (integration regenerates it). The erasure registry is not anchored
(it is alphabetical); 09 is the only registry feature in wave 5 (10 adds no model), and 19, which rewrites thirteen
entries, runs alone with 20 in wave 7 after every feature that adds an entry (04 `DeckSuggestion`, 05 `RmhTypeText`
beside 19's `RmhTubeSubscription`, 09, 10).

Dependencies that fix the order:

- **Study, one feature per wave:** 01 (w1) → 02 (w2) → 03 (w3) → 04 (w4). All four edit `prisma/schema/rmhstudy.prisma`
  (01 and 04 new models, 02 `Flashcard` columns, 03 and 04 `FlashcardDeck` columns) and the study components; 02 and 03
  both edit `lib/study/queue.ts` and `queue.server.ts`; 01 and 04 both edit `components/study/CardRow.tsx`; 03 and 04
  both edit `components/feed/DeckStudyColumn.tsx`.
- **Developer API, one feature per wave:** 12 (w1), 02 (w2, in place), 13 (w3), 14 (w4), 18 (w6, in place). Each edits
  `lib/api/registry.ts`, `scripts/generate-sdk.ts` and the changelog under anchors; 12, 13 and 14 also append to the
  hand-written `docs/developer-api/scopes.md` (different waves); the SDK output is regenerated by each and by
  integration.
- **Communities:** 07 (w2) → 13 (w3) → 17 (w6). 07 and 17 both edit `components/communities/CommunityPlusBody.tsx` (07
  the tab, 17 the moderators' line); 07 and 13 both touch the mod log (`lib/communities/modlog.ts`: 07 two actions, 13
  the `via` detail).
- **Events:** 12 (w1) → 07 (w2): 12 adds functions to `lib/api/v1/events.server.ts` only; 07 edits
  `lib/events.server.ts` (the past list and the mod-log writes) and the event components. 12 must not edit
  `lib/events.server.ts`; if it needs to, it stops and reports.
- **Reading:** 01 (w1) → 11 (w5): both edit `components/reading/useHighlightKit.tsx` (01 one menu item, 11 two).
- **Notices and labels:** 16 (w2), 04 and 15 (w4), 09 (w5), 17 (w6), anchored. `USER_TEXT_RENDERERS`: anchored.
- **Admin hub and sitemap:** 16 (w2), 15 (w4), 17 (w6), 05 (w3), 09 (w5), 08 (w6), anchored.
- **Jobs:** 16 (w2), 10 (w5), 19 (w7), anchored.
- **Post read-path registries** (`lib/feed/content-warning.ts`, `quiet-counts.ts`, `gif-alt.ts`, `quiz-poll.ts`): 13
  (w3) and 08 (w6) append entries, different waves.
- **Profiles:** 18 (w6) edits `lib/api/routes/profile.server.ts` (the handle change); 08 (w6) edits
  `lib/profile.server.ts` and `components/profile/ProfileHero.tsx`. Different files; 08 must not edit the profile route.
- **Mutes:** 10 (w5) edits the seven `userMute` readers, including `lib/safety/view-as.server.ts` and
  `lib/communities/post-alerts.server.ts`, and `lib/moderation/moderation.contract.ts`; nobody else in wave 5 touches
  them. 10 does not touch muted words (they already expire, sprint 05).
- **Erasure:** 04 (w4), 05 (w3), 09 (w5) add one or two registry entries each and leave `TODO_CEILING` alone; 02 (w2)
  adds an operation on `Flashcard` (no registry entry: `Flashcard` has no `User` relation); 19 (w7) changes thirteen and
  sets the ceiling to 4.
- **Scopes:** 13 (w3) alone changes `hasScope` and `ScopeDetail` in `lib/api/scopes.ts` outside the anchors (the
  explicit-only scope) and the key pickers in `components/developer/`; 12 (w1) and 14 (w4) only add entries.
- **The sweep:** 20 (w7) edits route handlers and components across ten domains and **not** `lib/account/**` or
  `server/jobs/index.ts` (19's). It runs last because every feature before it adds refusals it may convert; it converts
  only call sites that exist when wave 7 starts.

## Shared files and who touches them

| File                                                                                                                                                                                                 | Kind                                | Who                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/i18n/config.ts` (`NAMESPACES`)                                                                                                                                                                  | registry                            | **Wave 0 only**                                                                                                                                                                              |
| `locales/en/<ns>.json`                                                                                                                                                                               | generated (extract) or hand-added   | each feature, its own file only; `feed.json` for labels (04, 09, 15, 16, 17); `notice-language.json` for notice keys (same five); `errors.json` (20 only)                                    |
| `prisma/schema/auth.prisma` (`User`)                                                                                                                                                                 | source, **anchored**                | 05 (w3), 04 (w4), 09 (w5)                                                                                                                                                                    |
| `prisma/schema/rmhstudy.prisma`                                                                                                                                                                      | source                              | 01 (w1), 02 (w2), 03 (w3), 04 (w4)                                                                                                                                                           |
| `prisma/schema/{rmhtype,builds,moderation,developer,competitive,communities}.prisma`                                                                                                                 | source                              | 05; 09; 10; 15; 16; 17 (one each)                                                                                                                                                            |
| `lib/account/deletion.server.ts`                                                                                                                                                                     | source, **anchored**                | 02 (w2), 05 (w3), 04 (w4), 09 (w5), 19 (w7)                                                                                                                                                  |
| `lib/account/erasure-registry.ts` (`TODO_CEILING`)                                                                                                                                                   | source (alphabetical; not anchored) | 05, 04, 09 one or two entries; 19 thirteen and the ceiling                                                                                                                                   |
| `docs/account-deletion.md`                                                                                                                                                                           | generated (`pnpm docs:deletion`)    | each feature that edits the registry                                                                                                                                                         |
| `lib/account/export-sprint-10.server.ts`                                                                                                                                                             | new in Wave 0, **anchored**         | 02, 03, 04, 05, 09                                                                                                                                                                           |
| `lib/account/api/account.export.server.ts`                                                                                                                                                           | source                              | **Wave 0 and integration only**                                                                                                                                                              |
| `lib/sitemap.ts`                                                                                                                                                                                     | source, **anchored**                | 16, 05, 15, 09, 08, 17                                                                                                                                                                       |
| `server/jobs/index.ts`                                                                                                                                                                               | source, **anchored**                | 16 (w2), 10 (w5), 19 (w7)                                                                                                                                                                    |
| `components/feed/notification-labels.ts` + test, `lib/notifications/notice-keys.ts`, `components/feed/notice-previews.ts`                                                                            | source, **anchored**                | 16 (w2), 04, 15 (w4), 09 (w5), 17 (w6)                                                                                                                                                       |
| `lib/i18n/user-text.ts` (`USER_TEXT_RENDERERS`)                                                                                                                                                      | source, **anchored**                | 01, 02, 16, 05, 04, 15, 09, 08, 17                                                                                                                                                           |
| `app/routes/_site/admin/index.tsx`                                                                                                                                                                   | source, **anchored**                | 16, 15, 17                                                                                                                                                                                   |
| `lib/settings-nav.ts`                                                                                                                                                                                | source, **anchored**                | 08                                                                                                                                                                                           |
| `lib/api/registry.ts`                                                                                                                                                                                | source, **anchored** (paths)        | 12 (w1), 13 (w3), 14 (w4) anchored; 02 (w2) and 18 (w6) in place                                                                                                                             |
| `lib/api/scopes.ts`                                                                                                                                                                                  | source, **anchored**                | 12, 13, 14; 13 also `hasScope` / `ScopeDetail` (explicit-only scopes)                                                                                                                        |
| `components/developer/KeysManager.tsx`, `TestKeyCreator.tsx`                                                                                                                                         | source                              | 13                                                                                                                                                                                           |
| `scripts/generate-sdk.ts` (`NULLABLE`)                                                                                                                                                               | source, **anchored**                | 12, 02, 13, 14                                                                                                                                                                               |
| `docs/developer-api/changelog.md`                                                                                                                                                                    | hand-written, **anchored**          | 12, 02, 13, 14, 18                                                                                                                                                                           |
| `docs/developer-api/scopes.md`                                                                                                                                                                       | hand-written docs                   | 12, 13, 14 (different waves, appended)                                                                                                                                                       |
| `lib/api/errors.ts` (`ERROR_TYPES`, the status map)                                                                                                                                                  | source                              | 12, 13, 14 (different waves, new codes appended)                                                                                                                                             |
| post read-path registries (`lib/feed/content-warning.ts`, `quiet-counts.ts`, `gif-alt.ts`, `quiz-poll.ts`)                                                                                           | source                              | 13 (w3), 08 (w6) — append entries                                                                                                                                                            |
| `lib/feed/__tests__/quiet-counts.test.ts` (`EXEMPT`)                                                                                                                                                 | test registry, **anchored**         | any feature whose new file mentions a count field (expected: 08, 09, 13, 17), under its own line, with an honest reason                                                                      |
| `lib/device-data/registry.ts`                                                                                                                                                                        | source                              | any feature that adds a browser storage key (expected: 05 for the last-picked text, if it keeps one)                                                                                         |
| `lib/study/deck-editor.server.ts`, `deck-sync.server.ts`                                                                                                                                             | source                              | 02 (w2) edits (sync only to keep sounds out of copies); 01, 04 call only; `card-images.server.ts` nobody                                                                                     |
| `lib/study/queue.ts`, `queue.server.ts`                                                                                                                                                              | source                              | 02 (w2), 03 (w3)                                                                                                                                                                             |
| `components/study/CardRow.tsx`; `components/feed/DeckStudyColumn.tsx`                                                                                                                                | source                              | 01, 04; 03, 04                                                                                                                                                                               |
| `components/reading/useHighlightKit.tsx`                                                                                                                                                             | source                              | 01 (w1), 11 (w5)                                                                                                                                                                             |
| `lib/events.server.ts`, `components/events/*`                                                                                                                                                        | source                              | 07 (w2)                                                                                                                                                                                      |
| `lib/api/v1/events.server.ts`, `events-schema.ts`                                                                                                                                                    | source                              | 12 (w1)                                                                                                                                                                                      |
| `components/communities/CommunityPlusBody.tsx`                                                                                                                                                       | source                              | 07 (w2), 17 (w6)                                                                                                                                                                             |
| `lib/communities/modlog.ts` and its labels                                                                                                                                                           | source                              | 07 (w2), 13 (w3)                                                                                                                                                                             |
| `lib/communities/api/communities.$slug.modqueue.$itemId.server.ts`                                                                                                                                   | source                              | 13                                                                                                                                                                                           |
| `lib/webhooks/emit.server.ts`, `lib/developer/webhooks.server.ts`, `components/developer/Webhook*.tsx`                                                                                               | source                              | 15                                                                                                                                                                                           |
| `lib/speedrun/*`                                                                                                                                                                                     | source                              | 16                                                                                                                                                                                           |
| the seven `userMute` readers, `lib/moderation/moderation.contract.ts`                                                                                                                                | source                              | 10 (not `lib/feed/timeline.ts`: words already expire)                                                                                                                                        |
| the discovery readers (`lib/communities/directory.server.ts`, `lib/explore.server.ts`, `sisters.server.ts`, `lib/games/detail.server.ts`, `lib/sitemap.server.ts`)                                   | source                              | 17                                                                                                                                                                                           |
| `lib/moderation/api/moderation.report.server.ts`, `lib/moderation/triage.server.ts`                                                                                                                  | source                              | 09 (`build-issue` entity)                                                                                                                                                                    |
| `lib/api/routes/profile.server.ts`, `app/routes/api/replays/ghost.ts`, `lib/communities/recurring*.ts`, `lib/api/v1/scheduled*.ts`, `lib/admin/sweeps.server.ts`, `app/routes/_site/admin/users.tsx` | source                              | 18                                                                                                                                                                                           |
| `lib/media/sweep-surfaces.ts`, `lib/media/sweep.server.ts` (`referencedUrls`)                                                                                                                        | source                              | 02                                                                                                                                                                                           |
| `components/rmhmusic/learn/LessonScreen.tsx`                                                                                                                                                         | source                              | 06                                                                                                                                                                                           |
| `lib/errors/codes.ts`, `locales/en/errors.json`                                                                                                                                                      | source                              | 20                                                                                                                                                                                           |
| `lib/api/route-table.server.ts`                                                                                                                                                                      | generated (`pnpm api:routes`)       | each feature regenerates it; **integration regenerates on every merge**                                                                                                                      |
| `app/routeTree.gen.ts`                                                                                                                                                                               | generated (vite)                    | **integration only**                                                                                                                                                                         |
| `docs/_generated/facts.json`, `docs/site-reference/*`, the SDK output                                                                                                                                | generated                           | **integration regenerates** (`pnpm facts:generate`, `pnpm docs:site`, `pnpm docs:api`, `pnpm sdk:generate`); API features run `sdk:generate` and `docs:api` themselves and commit the output |
| `lib/catalog/**`                                                                                                                                                                                     | source                              | nobody (no new games or apps)                                                                                                                                                                |

## Migration timestamps

All additive; `.github/scripts/check-migrations-additive.mjs` must pass. Every timestamp sorts after sprint 09's
`20261129070100…`. The pattern is `20261130<wave><slot>00` (slot A = 1, B = 2, C = 3), with `01`, `02`, … for a
feature's follow-on migrations.

| Feature | Migration(s)                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01      | `20261130010100_s10_highlight_cards`                                                                                                                                                                                                        |
| 02      | `20261130020100_s10_card_sound`, `20261130020101_s10_card_sound_front_index`, `20261130020102_s10_card_sound_front_index_ensure_valid`, `20261130020103_s10_card_sound_back_index`, `20261130020104_s10_card_sound_back_index_ensure_valid` |
| 16      | `20261130020300_s10_speedrun_queue`                                                                                                                                                                                                         |
| 03      | `20261130030100_s10_study_pace`                                                                                                                                                                                                             |
| 05      | `20261130030300_s10_type_texts`                                                                                                                                                                                                             |
| 04      | `20261130040100_s10_deck_suggestions`                                                                                                                                                                                                       |
| 15      | `20261130040300_s10_admin_webhooks`                                                                                                                                                                                                         |
| 09      | `20261130050200_s10_build_issues`                                                                                                                                                                                                           |
| 10      | `20261130050300_s10_timed_mutes`, `20261130050301_s10_user_mute_expires_index`, `20261130050302_s10_user_mute_expires_index_ensure_valid`                                                                                                   |
| 17      | `20261130060200_s10_admin_communities`                                                                                                                                                                                                      |

06, 07, 08, 11, 12, 13, 14, 18, 19 and 20 have no schema change. **Every migration contains real SQL** (sprint 08 11's
migration held only comments). New tables get plain indexes in their own migration; new columns on existing tables are
nullable or carry a constant default. **02 and 10 are the only features that add indexes to existing tables**: each is
`CREATE INDEX CONCURRENTLY` in a migration that holds exactly one statement, followed by an `_ensure_valid` migration
(copy `prisma/migrations/20261126060101_s06_flashcard_external_id_index` and
`20261126060102_s06_flashcard_external_id_index_ensure_valid`, or sprint 09's `20261129060200…`/`…060201…`), declared in
the schema with `@@index` and **Prisma's default name** (`flashcard_frontSoundUrl_idx`, `flashcard_backSoundUrl_idx`,
`user_mute_expiresAt_idx`) in the SQL. Any other implementer who finds an index on an existing table needed reports it
and does not add it.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-10`, never pushed until the sprint PR.
- Feature branch: `autonomous/s10-<slug>` from the sprint branch **as it is when the wave starts**.
- Worktree: `/home/user/wt/s10-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge or rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite and product files, plus the gate tests that cover what they touched (route
   table, API handler adoption, raw-fetch ratchet, `useeffect-fetch-ratchet`, `zod-off-hot-routes`, `islands` (any
   island entry), boundaries and the lint ratchet (no import cycles, `lib/` never imports `components/`), i18n catalogs
   and drift, the computed-key ratchet, the native-dialog ratchet, sitemap and OG coverage, test discovery, design
   consistency and Steel flat when UI changed, the rAF allowlist, arrival coverage, the escape-hatch ratchet, tsconfig
   projects, server-fn guards, the device-data registry test when a storage key was added, the migration-safety test
   when a migration was added, erasure coverage when a `User` relation was added, the shortcut registry test when a key
   binding was added, the notice-key catalogue and the notice-preview ratchet when a notice was added, the user-text
   direction test when member text is rendered, and every read-path registry test the feature names).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed from the wave's base schema, and the
   additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file (and `feed.json` / `notice-language.json` for the
   notice features); if the extractor churns unrelated catalogues, add the feature's keys to its JSON by hand instead.
5. `pnpm api:routes` when an endpoint module was added, moved or removed.
6. API features (12, 13, 14, and 02 and 18 for their field changes): `pnpm sdk:generate` and `pnpm docs:api`, committing
   their output; the SDK must type every new field (no `unknown`), through `NULLABLE` where the example is `null`; and
   **`git diff` of the SDK output must change no existing field** (`NULLABLE` applies by field name across the whole
   SDK). Integration also runs `pnpm docs:site`.
7. Registry features (04, 05, 09, 10, 19): `pnpm docs:deletion` and commit `docs/account-deletion.md`.
8. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s10-<slug>`. On a conflict in a generated file, take either side and regenerate;
   anchored files should not conflict (if one does, keep both features' blocks under their anchors). On `TODO_CEILING`,
   set it to the number of `todo` entries the merged registry holds.
2. Regenerate: `pnpm api:routes`; the route tree (start `pnpm exec vite --port 7999 --strictPort`, wait until
   `app/routeTree.gen.ts` changes, stop it — 05, 08, 09, 15, 16, 17 add pages; 12, 13, 14 add v1 route files);
   `pnpm facts:generate`; `pnpm docs:site`; `pnpm docs:api`; `pnpm sdk:generate`; `pnpm docs:deletion`.
3. `pnpm exec prisma generate`, then `pnpm exec tsc -b --checkers 1` alone.
4. `pnpm test` and `pnpm test:product`.
5. **Raw SQL and lock smoke test** for every `lockKey` user, compare-and-set and raw SQL: apply the migrations to a
   throwaway Postgres (the integration suite's, `docs/testing.md` §8) and run each new query once; for 03 the new-today
   query (paced decks only; an unpaced member's queue unchanged); for 04 the 20-open and 200-per-deck caps under two
   concurrent suggestions and a double accept; for 05 the text cap; for 09 a concurrent status change; for 15 the
   24-hour figures; for 16 two concurrent verdicts and a reopen; for 17 the figures query; for 18 a cron tick and a
   "Post now" in the same instant; for 19 the counter decrements; for 02 and 10 the `CONCURRENTLY` migrations and their
   `_ensure_valid` checks.
6. Review the diff against the brief and the specification's acceptance criteria; fix or send back. Check every read
   path the feature names: 13 and 08 (the post read-path registries), 10 (`MUTE_READ_PATHS`), 17
   (`DISCOVERY_READ_PATHS`), 07 (private communities, bans), 09 (build visibility on every issue path), 04 (blocks, the
   suggestion's privacy), 15 (no secret leaves), 19 (the erasure registry, both directions, foreign-key order, the
   counters), 20 (every converted route keeps `error`).
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Confirm `exportSprint10` carries 02, 03, 04, 05 and 09's sections (and the main export carries `UserMute.expiresAt`),
  and that the erasure coverage test passes with every sprint 10 table classified and `TODO_CEILING = 4`.
- `pnpm check:consistency --base main`, `pnpm typecheck`, `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`,
  `pnpm build` with `scripts/check-bundle-budget.ts`, and a real-browser pass over every new or changed page in Day and
  Night at 390 px and 1280 px, and once in `ar`; the app-tier surfaces (RMHType 05, RMH Music 06, the book reader 11) in
  their own look.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code lines (TypeScript, TSX, SQL, CSS)
separately from documentation lines, measured with `git diff --numstat` from the Wave 0 parent commit to `HEAD`,
filtered by extension, excluding generated files (`routeTree.gen.ts`, `route-table.server.ts`, `facts.json`,
`docs/site-reference/**`, SDK output, `locales/**`, `docs/account-deletion.md`). It also lists the final `TODO_CEILING`
and the four tables left `todo` with their reasons, the `serverError` ratchet's baseline, the follow-ups 18 closed, and
the open owner decisions this sprint met (a deleted member's follows beside 19's subscriptions, purchased cosmetics and
streak freezes, `RebarReservation`, public decks beside 02 and 04).

## Validation

A second pass against the sprint 09 tip, after the specifications were written, changed these:

- **06:** the path's unit and lesson titles are not translated today (`PathUnit.tsx`: "localised in a later phase"), so
  the new titles stay English catalogue strings like the rest, and the namespace holds only the new interface strings;
  the staff card is `StaffCard.tsx`, named.
- **10:** `UserMute` has seven readers, one writer and the export, not nine readers; the export lives in
  `account.export.server.ts`, which implementers never edit, so it is exempt from `MUTE_READ_PATHS` with its reason
  (pass 2: its read has no `select`, so it carries `expiresAt` with no export section).
- **17:** universal search lists no communities; the community search is `listCommunities`' `q`. The discovery list
  names the five readers that exist.
- **18:** the two handle cooldowns are 14 days (`lib/handle.ts`) and 30 days (`lib/handles/history.ts`); the decision
  says which wins and that the form's help text changes.
- **07:** `lib/events.server.ts` writes no mod-log row today; the two new actions join the public mod log beside the pin
  actions.
- **12, 13, 14:** new v1 error codes must be added to `lib/api/errors.ts` (an unknown code falls back to `api_error`);
  the file is in the shared table.
- **13:** sanction permissions are the site's three rules, named.
- **14:** Watch later keeps the newest 200 (`addWatchLater` drops the oldest); the API documents it.
- **01:** the card's "From" link goes to the document; 11's passage links come four waves later.
- **03:** the due counts are `reviewAllCount` and `dueByDeck`, named.
- **02:** the v1 card serialiser is `lib/api/v1/study.server.ts`, named.
- **Follow-ups found already fixed** and so not features: the RMHStudy hub streak, the card-picture lock order and
  re-read (fixed by s09-03), and the quiz edit order (README §Rejected ideas).

## Validation pass 2

A fresh pass against the sprint 09 tip changed these (each specification and brief carries the change):

- **10:** muted words already expire (`mutedWordExpiries`, `lib/feed/muted-expiry.ts`, sprint 05); the feature is now
  account mutes only, reusing `MUTE_DURATIONS`. `MutedWordExpiry` is gone, so 10 adds no model, no `User` relation, no
  registry entry, no deletion operation and no export section (the export reads `userMute` with no `select`); its
  `auth.prisma`, deletion and export anchors are removed.
- **03:** the per-day default would silently change every member's queue; the pace is opt-in per deck, an unpaced deck
  keeps today's per-session rule, and the existing queue tests pass unmodified.
- **02:** sharing member audio with copiers is the open audio-storage owner decision, and decks have no report path;
  sounds are private to the recorder (no copy, no sync, no other member's payload), with an explicit upload policy
  (sniffed bytes, `Content-Length` pre-check, a `PENDING` `Media` claim), a 200-card cap, the pictures' daily allowance,
  a `card-sound` sweep surface kept by `referencedUrls`, and erasure of the recordings (new `s10-02` deletion anchors).
  `card-images.server.ts` is no longer edited (no URL locks).
- **13:** `hasScope` lets `*` and `manage:*` satisfy any `manage:` scope; `manage:moderation` is explicit-only
  (`ScopeDetail.explicit`), so no existing wildcard key gains ban power.
- **19:** `RmhTubeSubscription.channelId` is a `User`, so it is a follow of a member: classified `owner` with `Follow`,
  not erased. 12 erased plus one `owner` still takes `todo` from 17 to 4 (`RebarReservation`, `Streak`, `UserInventory`,
  `UserSeasonProgress`).
- **04:** suggestions default off (the author consents), a 200-open-per-deck cap, duplicate and no-op refusal, a 7-day
  account age; accept runs `updateCardIn` inside the decision's transaction (`updateCard` opens its own).
- **08:** every other member's item in the preview is intersected with the owner's own view; follow lists are not
  listed; readers called with the stranger id must not write.
- **15:** webhook URLs are redacted to scheme, host and first path segment on every admin path (they often carry
  tokens), including inside delivery error text.
- **16:** "Reopen" keeps the ability to reverse a verdict that today's overwrite provides.
- **06:** the playing lesson is a new `grand-staff-find` note-finder mode (`play-note` is the first-note lesson); the
  unit is piano only, since `PATH` has no per-instrument lesson filter and guitar reads the treble clef.
- **07:** no count in the tab label (a query on every page view); an unknown slug and a hidden community answer alike.
- **05, 09, 20:** 05's runs are browser-scored like the custom test and re-checked server-side, ghosts through
  `ghost-save.server.ts`; 09's release and duplicate links are `SetNull` relations and its notices use `dedupeUnread`
  (grouping is display-only), as 04's do; 20's `t()` switch moves to `components/errors/useRefusalText.ts` because the
  extractor never reads `lib/`, and its call-site figure is about 250 (recounted at wave start).
- **Plan:** `lib/feed/__tests__/quiet-counts.test.ts` `EXEMPT` is anchored (08 and 17 share wave 6); the shared table
  gains `lib/media/sweep.server.ts` (02), `LessonScreen.tsx` (06) and the key pickers (13).
