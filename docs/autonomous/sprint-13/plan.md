# Sprint 13 — implementation plan

How the twenty features are built: seven waves of at most three concurrent implementers, each in its own git worktree
and branch, merged into the sprint branch `claude/autonomous-sprint-13` by one integration owner between waves. The
machine budget and the per-feature checks are sprint 12's, restated so this file stands alone, with what sprint 12's
implementers and integration learned folded into the briefs.

## Precondition: sprint 12 is in the sprint branch

`claude/autonomous-sprint-13` is cut from `origin/main` once the squashed sprint 12 commit (`e5e8bb911`, "Sprint 12:
play together, results the server stands behind, and the admin doors for deletions and feeds") has landed there, or from
`autonomous/s13-design` (which is that commit plus these documents) if it has not landed yet; then `git merge
origin/main` again when it lands (the content is identical). This design was checked against `e5e8bb911`. Wave 0 is
committed on top of that. Wave 1 does not start before, because:

- the Wave 0 anchors go **after** sprint 12's anchor blocks in `lib/account/deletion.server.ts`,
  `prisma/schema/auth.prisma`, `lib/sitemap.ts`, `server/jobs/index.ts`, `lib/notifications/notice-keys.ts`,
  `components/feed/notice-previews.ts`, `components/feed/notification-labels.ts` (and its test),
  `lib/i18n/user-text.ts`, `lib/feed/__tests__/quiet-counts.test.ts`, `lib/errors/codes.ts`,
  `components/errors/refusal-sentence.ts`, `lib/game/leaderboard-privacy.ts`, `lib/api/registry.ts`, `lib/api/scopes.ts`,
  `scripts/generate-sdk.ts`, `docs/developer-api/changelog.md` and the five report files;
- features build on sprint 12 code: 06, 15, 16 and 17 on the report path's `MEMBER_ITEM_REPORT_TYPES` and takedown
  branches (s12-16) and the decision notices (s12-19); 10 on the explicit-scope mechanism (s12-12) and the newest
  `/api/v1/me` model (s12-13); 18 on the billing reconcile (s12-18) and the admin deletions page (s12-14); 19 on the
  party and roll log (s12-01), the public mod log's query (s12-20), deck takedowns (s12-16) and the route announcer
  (s12-11); 04 on the chart editor's versions panel (s12-04);
- **migration timestamps:** `main` has kept adding RMH Med Schools migrations dated ahead of the calendar (the newest at
  the design pass is `20261211090000_medschools_applicant_stats`), so sprint 13's sort well after it, at
  `20261220…`; integration checks the newest name on `main` at each wave start and, if `main` has passed `20261220`,
  renames the wave's migrations forward before merging (an unapplied migration that sorts before applied ones still
  applies, but keep the order honest);
- **the refusal switch** ends at sprint 12's `API_KEY_REASON_RESERVED` (`components/errors/refusal-sentence.ts`, under
  `// s12-20 s11-gaps`), and `ERROR_CODES` ends at the same code (`lib/errors/codes.ts`).

## Machine budget

4 cores and 15 GB, shared. A cold `tsc -b` of the site project peaks around 10 GB and no longer fits single-threaded on
this box (sprint 12's integration ran it in seven slices), so **implementers never run `pnpm typecheck`, `tsc`,
`pnpm test`, `pnpm build`, `pnpm dev` or `vite`.** They run targeted vitest files, eslint on their changed files and the
commit gate (`--fast`, about 1 GB; it skips `tsc`). They never run prettier over files that existed before
(reformatting causes merge conflicts); new files may be formatted. Integration runs the sliced typecheck after each
merge, alone. Each worktree has its own `node_modules` (`pnpm install --frozen-lockfile --offline`, hard-linked from the
store), so one feature's `prisma generate` never changes another's client. At most three implementers run at once.
**jsdom is not installed:** component tests render with `react-dom/server` (`renderToStaticMarkup`) or test the pure
logic the component calls. **Timing tests** take the fastest of several runs.

## Wave 0 — scaffolding (integration commits it before Wave 1)

1. The precondition merge above.
2. **Namespaces.** Add to `NAMESPACES` in `lib/i18n/config.ts`, one per line, each **in sorted place** (the list is
   sorted and `lib/__tests__/i18n-catalogs.test.ts` holds that; no sprint block, no comment): `altair-runs`,
   `chart-misses`, `dm-reports`, `games-friends`, `ladder-calendar`, `ladder-own-jobs`, `lists-on`, `message-push`,
   `news-stories`, `pack-reports`, `prediction-trades`, `ranked-standing`, `rideshare-safety`, `sequence-sam`,
   `tube-chat-reports`, `tube-subscriptions`, `vega-assists` (17 namespaces; 10 is the developer API's English JSON and
   docs, 18 writes into `admin-deletions`, 19 into each fixed file's namespace and `errors`). The design pass checked
   that none is taken at `e5e8bb911`; check again (`grep -n '"<name>"' lib/i18n/config.ts`) and suffix a taken one with
   `-s13`, correcting its brief. Create each `locales/en/<ns>.json` containing `{}` and a newline. Features under
   `features/<id>/` also list their namespace in that folder's `feature.ts` (`namespaces`): 02 in `features/vega/`, 03
   in `features/altair/`, 04 in `features/slice-it/` — each feature adds its own line there (not Wave 0). Run
   `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-config.test.ts`.
3. **Anchors** — so that two features of one wave never edit the same lines of a shared file. Each anchor is a comment
   line followed by one blank line; a feature keeps **its own anchor line** and adds its code directly below it.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of `anonymizeAccount`, directly after sprint
     12's last block (`// s12-08 deck-ratings` and its spread) and before `// med-schools-phase-4 …`: the header
     `// Sprint 13 erasures (docs/autonomous/sprint-13/plan.md §Anchors): each feature adds its operations under its own line.`
     then `// s13-06 tube-chat-reports`, `// s13-08 ladder-own-jobs`, `// s13-11 lists-on`, `// s13-12 news-stories`,
     `// s13-17 dm-reports`. No feature adds a pre-step.
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields, after sprint 12's block
     (`deckRatings DeckRating[] @relation("DeckRatings")`): `// Sprint 13 back-relations (one block per feature,
     docs/autonomous/sprint-13/plan.md)` then `// s13-08 ladder-own-jobs`, `// s13-11 lists-on`,
     `// s13-12 news-stories`. Run `pnpm -s exec prisma validate` (dummy `DATABASE_URL`).
   - **New file `lib/account/export-sprint-13.server.ts`**, the shape of `lib/account/export-sprint-12.server.ts`:
     `async function exportSprint13(userId: string): Promise<Record<string, unknown>>` returning one object literal with
     the header `// Sprint 13 exports (docs/autonomous/sprint-13/plan.md §Anchors)` then `// s13-03 altair-runs`,
     `// s13-07 tube-subscriptions`, `// s13-08 ladder-own-jobs`, `// s13-11 lists-on`, `// s13-12 news-stories`,
     `// s13-14 prediction-trades`. Each feature adds one property under its line (a dynamic `import()` of its own
     module). Wave 0 calls it **once** from `lib/account/api/account.export.server.ts` beside `exportSprint12(userId)` as
     `sprint13` (both the import, the `Promise.all` entry and the payload key), with
     `lib/account/__tests__/export-sprint-13.test.ts` (a copy of `export-sprint-12.test.ts`, whose Proxy Prisma mock
     answers any model) asserting the key and, per anchor, a commented-out expectation the feature enables. Implementers
     **never edit `account.export.server.ts`**. 06's deidentified chat, 16's moderation stamp, 17's edit versions
     (moderation records, like moderator notes, an open decision) and 18's sync stamp are not personal data the export
     lacks (each specification says why).
   - `lib/sitemap.ts`: in `EXCLUDED_ROUTES`, after sprint 12's block (`'/admin/homes': 'admin',`),
     `// Sprint 13 (docs/autonomous/sprint-13/plan.md §Anchors)` then `// s13-11 lists-on` (`/settings/lists`,
     `personal`); in `STATIC_ROUTES`, at its end, the same header then `// s13-12 news-stories` (`/news/stories`, public,
     with its card). No feature adds to `DYNAMIC_ROUTES` (`/news/stories/$slug` is already there).
   - `server/jobs/index.ts`, at the end of `REGISTRATIONS` after sprint 12's block (`registerBillingSyncWorker`):
     `// Sprint 13 (docs/autonomous/sprint-13/plan.md §Anchors)` then `// s13-06 tube-chat-reports`,
     `// s13-07 tube-subscriptions`, `// s13-12 news-stories`, `// s13-17 dm-reports`, `// s13-18 billing-hardening`. (Each also adds one import at
     the top; 07 and 17 share wave 4, so their imports go on separate lines in sorted place and integration takes both.)
   - **Notices** (07, 12, 20): in `lib/notifications/notice-keys.ts`, at the end of `NOTICE_TEMPLATES` and of
     `interface NoticeParamTypes`, the header `// Sprint 13 notices (docs/autonomous/sprint-13/plan.md §Anchors)` then
     `// s13-07 tube-subscriptions`, `// s13-12 news-stories`, `// s13-20 message-push`; the same lines directly before
     `default:` in `components/feed/notice-previews.ts`, in `systemLabels`'s object in
     `components/feed/notification-labels.ts`, and in `components/feed/__tests__/notification-labels.test.ts`.
   - `lib/i18n/user-text.ts`, at the end of `USER_TEXT_RENDERERS`: `// Sprint 13 (docs/autonomous/sprint-13/plan.md
     §Anchors)` then `// s13-03 altair-runs`, `// s13-05 games-friends`, `// s13-06 tube-chat-reports`,
     `// s13-07 tube-subscriptions`, `// s13-08 ladder-own-jobs`, `// s13-09 ladder-calendar`, `// s13-11 lists-on`,
     `// s13-12 news-stories`, `// s13-15 rideshare-safety`, `// s13-16 pack-reports`, `// s13-17 dm-reports`. (A file
     in a folder `USER_TEXT_EXEMPT` already covers needs no entry; the scan says which.)
   - `lib/feed/__tests__/quiet-counts.test.ts`, at the end of `EXEMPT`: the same header, then `// s13-05 games-friends`
     (an entry only if the scan asks, with an honest reason).
   - **Refusal codes:** `lib/errors/codes.ts`, at the end of `ERROR_CODES` (after `API_KEY_REASON_RESERVED`), and
     `components/errors/refusal-sentence.ts`, inside the `switch` after its last `case` (`API_KEY_REASON_RESERVED`) and
     before the switch's closing brace (no `default:`; exhaustive over `ErrorCode`, so every new code needs its case or
     `tsc` fails): `// Sprint 13` then `// s13-07 tube-subscriptions`, `// s13-08 ladder-own-jobs`, `// s13-11 lists-on`,
     `// s13-12 news-stories`, `// s13-14 prediction-trades`, `// s13-15 rideshare-safety`. `locales/en/errors.json`
     cannot hold comments: each feature adds its keys in sorted place, and integration merges the JSON by taking both
     sides. Params are only those `lib/errors/refusal.ts` reads (`PARAM_NAMES`: `endsAt`, `count`, `max`, `limit`,
     `remaining`, `minutes`, `days`).
   - **Report path** (06, 15, 16, 17, one per wave in waves 1–4; sprint 12 16 edited these files alone, so they carry no
     sprint 13 anchors yet): `// Sprint 13 (docs/autonomous/sprint-13/plan.md §Anchors)` then `// s13-06
     tube-chat-reports`, `// s13-15 rideshare-safety`, `// s13-16 pack-reports`, `// s13-17 dm-reports` at the end of
     `REPORT_ENTITY_TYPES` and of `REMOVABLE_REPORT_ENTITY_TYPES` (`lib/moderation/report-constants.ts`); before
     `case 'music-score':` in `resolveTargetUser`'s switch and after the s12-16 eligibility block in
     `lib/moderation/api/moderation.report.server.ts`; after the s12-16 takedown branches and after the s12-16 preview
     block in `lib/moderation/triage.server.ts`; after the s12-16 blocks in `lib/moderation/my-reports.server.ts`; after
     the s12-16 lines of both maps in `components/moderation/MyReportsPanel.tsx`.
   - `lib/game/leaderboard-privacy.ts`, at the end of `BOARD_PRIVACY_READ_PATHS`: `// Sprint 13` then
     `// s13-05 games-friends`.
   - **Developer API** (10 only): `lib/api/registry.ts` at the end of `ENDPOINTS`, `lib/api/scopes.ts` at the end of the
     scope list, `scripts/generate-sdk.ts` at the end of `NULLABLE`: `// Sprint 13` then `// s13-10 api-ladder`;
     `docs/developer-api/changelog.md` at the top of its list: `## Sprint 13 — 2026-12` then `<!-- s13-10 api-ladder -->`
     and `<!-- s13-11 lists-on -->` (11's one-line note that `PUT /me/feeds/{id}/members` reports a member who left a
     list with the new `skipped` reason `left`).
4. **No new shared helper.** `lockKey` serves every cap and claim; `useConfirm` and `usePrompt` every confirmation;
   `components/ui/tabs.tsx` every tab strip; `lib/calendar/tz.ts` every time-zone computation; the site's locale
   formatters every date and number; `components/ui/arrive.tsx` every arrival fade; `notice()` every new `SYSTEM`
   notice; `refusalBody()` and `useRefusalText` every refusal; `lib/core/persist` every stored value; `getBoss()` every
   job sent from the web tier; `recordAdminActionIn` every admin action; `components/moderation/ReportDialog.tsx` every
   report; `dispatch()` every push; the durable fan-out (`lib/fanout/run.server.ts`) every large notice batch.
5. Outside `docs/autonomous/sprint-13/` (the design pass wrote nothing else): `.prettierignore` gains
   `/docs/autonomous/sprint-13/` after sprint 12's line, with the same comment, and `docs/autonomous/README.md` gains
   the sprint 13 row ("Halves that never met, in the games and apps the last sprints passed by").
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

## Waves

| Wave | Slot A               | Slot B               | Slot C                |
| ---- | -------------------- | -------------------- | --------------------- |
| 1    | 08 ladder-own-jobs   | 06 tube-chat-reports | 01 sequence-sam       |
| 2    | 15 rideshare-safety  | 11 lists-on          | 02 vega-assists       |
| 3    | 16 pack-reports      | 09 ladder-calendar   | 04 chart-misses       |
| 4    | 17 dm-reports        | 10 api-ladder        | 07 tube-subscriptions |
| 5    | 12 news-stories      | 20 message-push      | 03 altair-runs        |
| 6    | 14 prediction-trades | 13 ranked-standing   | 05 games-friends      |
| 7    | 18 billing-hardening | 19 s12-gaps          | —                     |

The rule the waves keep: **no two features of one wave edit the same file unless that file is anchored** (each feature
under its own Wave 0 line) or generated (integration regenerates it). The erasure registry
(`lib/account/erasure-registry.ts`) is alphabetical, not anchored: 08 (`LadderCompany`, `LadderJob`, w1), 11
(`ListLeave`, w2) and 12 (`NewsStoryFollow`, w5) sit in different waves. 06 and 17 add no registry entry (their models
have no `User` relation). `TODO_CEILING` stays 4.

Dependencies that fix the order:

- **The report path:** 06 (w1) → 15 (w2) → 16 (w3) → 17 (w4), one report feature per wave, each under its own anchor in
  the five report files, so the anchors are belt and braces; `components/moderation/ReportDialog.tsx` is opened by all
  four and edited by none (it takes the entity type as a prop). `lib/moderation/__tests__/music-reports.test.ts` (every
  removable type has a takedown branch) is run by each.
- **RMHLadder:** 08 (w1) adds `ownerId` and `catalogJobWhere` and edits `lib/rmhladder/server/queries.ts`, the pipeline
  readers, `actions.ts`, `pipeline.tsx` and `rmhladder.calendar.server.ts`'s query → 09 (w3) edits
  `rmhladder.prisma` (`LadderUserPrefs`), `rmhladder.calendar.server.ts`'s descriptions, `settings.tsx` and the calendar
  files → 10 (w4) only reads (`own-jobs.server.ts`, `actions.ts`) and must not edit them, except one additive line in
  `OWNER_JOB_READ_PATHS` (`lib/rmhladder/own-jobs.ts`) for its own reader; if it needs more, it stops and reports.
- **RMHTube:** 06 (w1) edits `server/rmhtube/chat-handler.ts`, `lib/rmhtube/events.ts`, `components/rmhtube/ChatPanel.tsx`
  → 07 (w4) edits `lib/rmhtube/parties.server.ts`, the subscribe module, the party components and
  `RmhTubeLanding.tsx`.
- **Messages:** 17 (w4) edits `lib/messages/edit-history.server.ts`, `mutations.server.ts`, `MessageActions.tsx` and
  `prisma/schema/messaging.prisma` → 20 (w5) edits `lib/messages/send.server.ts`, `ConversationView.tsx` and
  `lib/notify/categories*.ts`; neither touches the other's files.
- **RMHBox:** 01 (w1) edits `lib/rmhbox/**`, `server/rmhbox/**`, `components/rmhbox/**` → 16 (w3) edits
  `lib/party/packs*.ts`, `lib/rmhbox/api/rmhbox.packs.*.server.ts`, `components/party/PacksPage.tsx` and
  `prisma/schema/games/rmhbox.prisma`; no overlap.
- **Notices:** 07 (w4), 12 and 20 (w5) under their anchors. **Jobs:** 06 (w1), 07 and 17 (w4), 12 (w5), 18 (w7),
  anchored.
  **Fan-outs:** 07 (w4) adds `tube-party` and 12 (w5) adds `news-story-article` to `FANOUT_KINDS` and `reclaimJob`
  (`lib/fanout/run.ts`, `lib/fanout/queue.server.ts`), in different waves. **Export:** 08 (w1), 11 (w2), 07 (w4), 03 and
  12 (w5), 14 (w6), anchored. **Refusals:** anchored; `errors.json`
  merged by integration. **Sitemap:** 11 (w2), 12 (w5), anchored.
- **Developer API:** 10 alone this sprint; the generated SDK (`packages/sdk/`) and API docs are regenerated by it and **by
  integration on every merge after it**.
- **The sweep last:** 19 (w7) touches small parts of files other features own (`features/rmhcharacters/engine/party*.ts`,
  `lib/communities/modlog*.ts`, `lib/study/suggestions.server.ts`, `lib/router/route-announce-client.ts`,
  `components/shell/RouteAnnouncer.tsx`, `app/router.tsx`); only 18 runs beside it, in files 19 does not touch.

## Shared files and who touches them

| File                                                                                                                  | Kind                              | Who                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| `lib/i18n/config.ts` (`NAMESPACES`)                                                                                   | registry                          | **Wave 0 only**                                                             |
| `locales/en/<ns>.json`                                                                                                | generated (extract) or hand-added | each feature its own; `notice-language.json` and `feed.json` for 07, 12, 20; `errors.json` for refusals |
| `prisma/schema/auth.prisma` (`User`)                                                                                  | source, **anchored**              | 08 (w1), 11 (w2), 12 (w5)                                                   |
| `prisma/schema/rmhladder.prisma`                                                                                      | source                            | 08 (w1), 09 (w3)                                                            |
| `prisma/schema/social.prisma`                                                                                         | source                            | 11                                                                          |
| `prisma/schema/games/rmhbox.prisma`                                                                                   | source                            | 16                                                                          |
| `prisma/schema/messaging.prisma`                                                                                      | source                            | 17                                                                          |
| `prisma/schema/library.prisma`                                                                                        | source                            | 12                                                                          |
| `prisma/schema/economy.prisma` (`PredictionPosition`)                                                                 | source                            | 14                                                                          |
| `prisma/schema/deletion.prisma`                                                                                       | source                            | 18                                                                          |
| `lib/account/deletion.server.ts`                                                                                      | source, **anchored**              | 06, 08 (w1), 11 (w2), 17 (w4), 12 (w5)                                      |
| `lib/account/erasure-registry.ts`                                                                                     | source (alphabetical)             | 08, 11, 12                                                                  |
| `docs/account-deletion.md`                                                                                            | generated (`pnpm docs:deletion`)  | each feature that edits the registry                                        |
| `lib/account/export-sprint-13.server.ts` and its test                                                                 | new in Wave 0, **anchored**       | 08, 11, 07, 03, 12, 14                                                      |
| `lib/account/api/account.export.server.ts`                                                                            | source                            | **Wave 0 and integration only**                                             |
| `lib/sitemap.ts`                                                                                                      | source, **anchored**              | 11, 12                                                                      |
| `lib/og/static-cards.ts`, `lib/og/static-card-index.ts`                                                               | source                            | 12                                                                          |
| `server/jobs/index.ts`                                                                                                | source, **anchored**              | 06 (w1), 07, 17 (w4), 12 (w5), 18 (w7)                                      |
| `lib/notifications/notice-keys.ts`, `components/feed/notice-previews.ts`, `notification-labels.ts` + test             | source, **anchored**              | 07 (w4), 12, 20 (w5)                                                        |
| `lib/i18n/user-text.ts`                                                                                               | source, **anchored**              | 03, 05, 06, 07, 08, 09, 11, 12, 15, 16, 17                                  |
| `lib/feed/__tests__/quiet-counts.test.ts` (`EXEMPT`)                                                                  | test registry, **anchored**       | 05 if needed                                                                |
| `lib/errors/codes.ts`, `components/errors/refusal-sentence.ts`                                                        | source, **anchored**              | every feature that refuses                                                  |
| `lib/moderation/report-constants.ts`, `lib/moderation/api/moderation.report.server.ts`, `lib/moderation/triage.server.ts`, `lib/moderation/my-reports.server.ts`, `components/moderation/MyReportsPanel.tsx` | source, **anchored** | 06 (w1), 15 (w2), 16 (w3), 17 (w4) |
| `components/admin/reports/ReportList.tsx`                                                                             | source                            | 17                                                                          |
| `lib/game/leaderboard-privacy.ts` (`BOARD_PRIVACY_READ_PATHS`)                                                        | source, **anchored**              | 05                                                                          |
| `lib/rmhladder/server/queries.ts`, `actions.ts`, `pipeline/**`, `matching/**`, `ai/**`, `alerts/dispatch.server.ts`, `resume/service.server.ts`, `insights.server.ts`, `community.server.ts`, `server/ladder-worker/index.ts`, `app/routes/api/rmhladder/events.ts`, `lib/sitemap.server.ts`, `lib/og/api/og.job.$jobId.server.ts`, `scripts/ladder-status.ts` | source | 08 |
| `lib/rmhladder/api/rmhladder.calendar.server.ts`                                                                      | source                            | 08 (the job query, w1), 09 (the descriptions, w3)                           |
| `app/routes/_site/rmhladder/pipeline.tsx`, `components/rmhladder/PipelineLadder.tsx`, `JobDetail.tsx`                 | source                            | 08                                                                          |
| `app/routes/_site/rmhladder/settings.tsx`                                                                              | source                            | 08 (its company list, w1), 09 (the switch, w3)                              |
| `lib/calendar/feed.server.ts`, `lib/schedule/grid.server.ts`                                                          | source                            | 09                                                                          |
| `lib/api/registry.ts`, `lib/api/scopes.ts`, `scripts/generate-sdk.ts`, `docs/developer-api/changelog.md`              | source, **anchored**              | 10                                                                          |
| `lib/api/v1/feeds.server.ts`, the `PUT /me/feeds/{id}/members` description in `lib/api/registry.ts` (not an anchor; 10 is in wave 4) | source | 11                                                                         |
| `packages/sdk/**`, `docs/developer-api/endpoints/**`                                                                  | generated (`pnpm sdk:generate`, `pnpm docs:api`) | 10; **integration regenerates on every later merge**   |
| `lib/lists/**`, `lib/moderation/api/moderation.block.server.ts`, `lib/settings-nav.ts`, `components/settings/settings-nav-labels.ts` | source         | 11                                                                          |
| `server/rmhtube/chat-handler.ts`, `lib/rmhtube/events.ts`, `components/rmhtube/ChatPanel.tsx`                         | source                            | 06                                                                          |
| `lib/rmhtube/parties.server.ts`, `lib/rmhtube/api/rmhtube.subscribe.$channelId.server.ts`, `components/rmhtube/party/**`, `components/rmhtube/RmhTubeLanding.tsx` | source | 07 |
| `lib/fanout/run.ts`, `lib/fanout/queue.server.ts` | source | 07 (w4), 12 (w5) |
| `lib/messages/edit-history.server.ts`, `lib/messages/mutations.server.ts`, `components/messages/MessageActions.tsx`   | source                            | 17                                                                          |
| `lib/messages/send.server.ts`, `components/feed/ConversationView.tsx`, `lib/notify/categories.ts`, `categories-schema.ts`, `components/settings/NotificationSettings.tsx`, `lib/notify/dispatch.server.ts` | source | 20 |
| `lib/rmhbox/**`, `server/rmhbox/**`, `components/rmhbox/**`                                                           | source                            | 01                                                                          |
| `lib/party/packs*.ts`, `lib/rmhbox/api/rmhbox.packs.*.server.ts`, `components/party/PacksPage.tsx`                    | source                            | 16                                                                          |
| `lib/rideshare/**`, `components/rideshare/**`, `app/routes/_site/rideshare/**`                                        | source                            | 15                                                                          |
| `lib/game/assist.ts`, `lib/game-capabilities.ts`, `features/vega/**`                                                  | source                            | 02                                                                          |
| `features/altair/**`                                                                                                  | source                            | 03                                                                          |
| `features/slice-it/**` (including `engine/rating.server.ts`)                                                          | source                            | 04                                                                          |
| `lib/games/activity*.ts`, `components/steam/LibraryHomePage.tsx`                                                      | source                            | 05                                                                          |
| `lib/reading/stories.server.ts`, `lib/reading/story-follows.server.ts`, `app/routes/_site/news/**`                     | source                            | 12                                                                          |
| `lib/ranked/**`, `components/feed/RankedColumn.tsx`                                                                   | source                            | 13                                                                          |
| `lib/predictions/**`, `components/predictions/**`, `lib/economy/flows.ts`                                             | source                            | 14                                                                          |
| `lib/account/deletion-billing*.ts`, `lib/account/deletion-hold.server.ts`, `lib/admin/deletions.server.ts`, `components/admin/DeletionsAdmin.tsx` | source | 18                                                                         |
| `features/rmhcharacters/engine/party*.ts`, `lib/communities/modlog*.ts`, `lib/study/suggestions.server.ts`, `lib/router/route-announce-client.ts`, `components/shell/RouteAnnouncer.tsx`, `app/router.tsx` | source | 19 |
| `lib/api/route-table.server.ts`                                                                                       | generated (`pnpm api:routes`)     | each feature regenerates it; **integration regenerates on every merge**     |
| `app/routeTree.gen.ts`                                                                                                | generated (vite)                  | **integration only**                                                        |
| `docs/_generated/facts.json`, `docs/site-reference/*`                                                                 | generated                         | **integration regenerates** (`pnpm facts:generate`, `pnpm docs:site`)       |
| `lib/catalog/**`                                                                                                      | source                            | nobody (01 adds a minigame inside RMHBox, not a catalogue entry)            |

## Migration timestamps

All additive; `.github/scripts/check-migrations-additive.mjs` must pass. Every timestamp sorts after `main`'s
`20261211090000…` (see the precondition). The pattern is `20261220<wave><slot>00` (slot A = 1, B = 2, C = 3).

| Feature | Migration                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 08      | `20261220010100_s13_ladder_own_jobs`, `20261220010101_s13_ladder_own_jobs_index` (`CONCURRENTLY`, alone), `20261220010102_s13_ladder_own_jobs_index_ensure_valid` |
| 11      | `20261220020200_s13_lists_on`                                                                                                              |
| 16      | `20261220030100_s13_pack_reports`                                                                                                          |
| 09      | `20261220030200_s13_ladder_calendar`                                                                                                       |
| 17      | `20261220040100_s13_dm_reports`                                                                                                            |
| 12      | `20261220050100_s13_news_stories`                                                                                                          |
| 14      | `20261220060100_s13_prediction_trades`                                                                                                     |
| 18      | `20261220070100_s13_billing_hardening`                                                                                                     |

01, 02, 03, 04, 05, 06, 07, 10, 13, 15, 19 and 20 have no schema change. **Every migration contains real SQL.** New
tables get plain indexes in the migration that creates them (the safety script allows a non-`CONCURRENTLY` index only on
a table created in the same file); new columns on existing tables are nullable or carry a constant default (08's two,
09's one, 14's one, 16's two, 18's one). 16 stamps its existing auto-hidden packs with one `UPDATE` and copies the legacy pack reports with one `INSERT … SELECT` — data, not
structure, one statement, idempotent. **One index on an existing table is planned** (08's, on `ladder_job`):
`CREATE INDEX CONCURRENTLY` alone in its migration with Prisma's default name `ladder_job_ownerId_idx`, followed by the
`_ensure_valid` migration (copy `20261202030201_s12_card_history_index` and `…_ensure_valid`). Any other index a feature
finds it needs is reported, not added.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-13`, never pushed until the sprint PR.
- Feature branch: `autonomous/s13-<slug>` from the sprint branch **as it is when the wave starts**.
- Worktree: `/home/user/wt/s13-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge or rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite and product files (product files with `-c vitest.product.config.ts`), plus
   the gate tests that cover what they touched (route table, API handler adoption, raw-fetch ratchet,
   `useeffect-fetch-ratchet`, `zod-off-hot-routes`, `islands`, boundaries and the lint ratchet, i18n catalogues and
   drift, the computed-key ratchet, the native-dialog ratchet, sitemap and OG coverage, test discovery, design
   consistency and Steel flat when site-tier UI changed, the rAF allowlist, arrival coverage, the escape-hatch ratchet,
   tsconfig projects, server-fn guards, the device-data registry test, the migration-safety test, erasure coverage, the
   shortcut registry test, the notice-key catalogue and preview ratchet, the user-text direction test, the error-code
   catalogue and the `serverError` ratchet, the permissions-policy test, feature manifests, `server-bundle-copies` for
   socket and worker code, the field-names gate, the sweep reference-columns gate for any new picture column (none is
   planned), the economy flows gate for any coin movement (14), the removable-type takedown test for any report type
   (06, 16, 17), and every read-path registry test the feature names).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` and the boundary config, with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed from the wave's base schema, and the
   additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file (and `feed.json` / `notice-language.json` /
   `errors.json` where the feature adds there); if the extractor churns unrelated catalogues, add the keys by hand.
5. `pnpm api:routes` when an endpoint module was added, moved or removed.
6. Registry features: `pnpm docs:deletion` and commit `docs/account-deletion.md`.
7. API feature (10): `pnpm sdk:generate` and `pnpm docs:api`, committed; `git diff packages/sdk` shows no existing field
   changed type.
8. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s13-<slug>`. On a conflict in a generated file, take either side and regenerate;
   anchored files should not conflict (if one does, keep both features' blocks under their anchors); `errors.json`, the
   erasure registry, `notice-language.json` and the jobs index's imports take both sides.
2. Regenerate: `pnpm api:routes`; the route tree (start `pnpm exec vite --port 7999 --strictPort`, wait until
   `app/routeTree.gen.ts` changes, stop it — 11 and 12 add pages); `pnpm facts:generate`; `pnpm docs:site`;
   `pnpm docs:deletion`; after 10 and every later merge, `pnpm sdk:generate` and `pnpm docs:api`.
3. `pnpm exec prisma generate`, then the sliced `tsc` (sprint 12's seven slices, single-checker), alone.
4. `pnpm test` and `pnpm test:product`.
5. **Raw SQL, lock and claim smoke test** against a throwaway Postgres (the integration suite's, `docs/testing.md` §8):
   apply the migrations and run each new query once; for 06 the chat prune's window function on
   `"rmhtube_chat_message"`; for 08 the `CONCURRENTLY` index, its `_ensure_valid` check, and two concurrent own-job
   creates at the cap; for 11 two concurrent adds at the list cap and a block racing an add; for 12 two concurrent follows
   at the cap; for 14 two concurrent full sales of one position (one wins) and a buy-then-sell that never profits; for 16
   the legacy report copy (run twice: idempotent) and three reports racing at the threshold (one hide); for 17 the edit prune keeping a reported message's versions; for 18
   two concurrent reconcile sweeps (each member queued once).
6. Review the diff against the brief and the specification's acceptance criteria; fix or send back. Check every read
   path the feature names: 03 (own rows; teammates' names and blocks), 04 (no chart run on `SongLeaderboard`; misses for
   the author only), 05 (blocks, bans, board privacy), 06 (membership to report; the hub removal; erasure), 07 (no
   counts; blocked subscribers never told), 08 (`CATALOG_JOB_READ_PATHS`: no own job or own company in any catalogue reader, the sitemap or the OG card; `assertJobUsable` on every write), 09 (no
   private field in the feed), 10 (explicit scopes not in the default grant; no pay), 11 (private lists never shown;
   re-add refused through the site and the API), 12 (published-only index), 13 (board privacy in the place count), 14
   (coins in equal coins out), 15 (blocked riders hidden; party-only reports; no coordinates), 16 (moderated packs in no
   shelf or lobby), 17 (members only; versions to admins only), 18 (Stripe faked: crash between update and record then a
   withdrawal, 250 subscriptions, a down queue for a request and for a withdrawal, no `cancel` outside the erasure), 19 (each item), 20 (no message text in any payload; coalescing).
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Confirm `exportSprint13` carries 03, 07, 08, 11, 12 and 14's sections, and that the erasure coverage test passes with
  every sprint 13 table classified and `TODO_CEILING = 4`.
- `pnpm check:consistency --base main`, the sliced typecheck, `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`,
  `pnpm build` with `scripts/check-bundle-budget.ts` (the site-tier CSS must not grow, B5: 08, 09, 11, 12, 13, 14, 15,
  16, 17, 18 and 20 add site-tier UI with existing utilities only), and a real-browser pass over every new or changed
  page in Day and Night at 390 px and 1280 px, and once in `ar`; the app-tier surfaces (RMHBox 01, Vega 02, Altair 03,
  Slice It 04, the games library 05, RMHTube 06 and 07) in their own look; a push received on a real device for 20.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code lines (TypeScript, TSX, SQL, CSS, JSON
content under `data/`) separately from documentation lines, measured with `git diff --numstat` from the Wave 0 parent
commit to `HEAD`, filtered by extension, excluding generated files (`routeTree.gen.ts`, `route-table.server.ts`,
`facts.json`, `docs/site-reference/**`, `locales/**`, `docs/account-deletion.md`, `packages/sdk/**`,
`docs/developer-api/endpoints/**`). It also lists the follow-ups 18 and 19 closed (and any found already closed), the
`serverError` ratchet's value after the sprint (it must not rise above 18), and the open owner decisions this sprint met
(a deleted member's follows beside 07, game reviews beside 05, refunds beside 18).

## Risks

- **Money (14, 18).** A sale that pays more than the market took in mints coins; a wrong Stripe call charges or fails to
  stop a real member. Mitigations: proceeds round down and a property test holds buy-then-sell to no profit; sales run
  under the market's row lock and an idempotency key; a new faucet is classified in the flows registry; Stripe is faked
  in every test, called outside transactions, and checked against test mode before the sprint PR, never live keys.
- **A private job in a public reader (08).** About twenty readers of `LadderJob` and `LadderCompany` (validation found
  the sitemap, the OG card, two company lists and the interview reports beyond the design's fifteen) must each exclude
  own rows, and every write that takes a `jobId` must refuse another member's own job. Two fragments, one registry and
  a source scan over both models make a forgotten reader a failing test; review reads each.
- **Board integrity (04).** Wiring the chart picker changes what a run plays; a chart run must never overwrite a song
  best, and the skill rating (which read the board) moves to `SliceRun` so ranked charts still count. Tests hold both;
  misses are telemetry only, sampled, cleared runs only and checked against the chart.
- **Notification volume (07, 12, 20).** A popular host, story or a busy conversation can notify many members. Fan-outs
  are durable and once-only; message pushes coalesce to one per conversation per two minutes; every notice honours
  preferences and quiet hours through the existing paths.
- **Privacy in moderation reads (06, 15, 17).** A moderator now reads a chat message, a trip's chat and a direct
  message's earlier versions. Each read is one item, admin-only and listed as a moderation read path; reporters must be
  members of the conversation or parties to the trip.
- **Erasure blind spot (06, 17).** Tables without a `User` relation are invisible to the coverage test; both features
  add operations and tests, and the README records the gap.
- **A default grant that widens (10).** Changing `READ_SCOPES` / `DEFAULT_SCOPES` to exclude explicit scopes must not
  remove any scope existing keys hold; it changes only what a new key gets by default. A test pins the set.
- **The report files four waves in a row (06, 15, 16, 17).** One report feature per wave, each under its own anchor.
- **Migration order against `main` (all schema features).** `main`'s future-dated Med Schools migrations can overtake;
  integration checks at each wave start.
- **Scope creep in 19.** Four small items invite more; anything not listed is reported, not fixed.

## Validation

The design pass checked each specification against the sprint 12 tip (`e5e8bb911`) in the read-only design worktree
`/home/user/wt/s13-design`:

- **Paths:** every file path cited in `features/` and `briefs/` that is said to exist was checked to exist; paths of
  files a feature creates are named as new (or listed under "Create" in its brief). A scripted pass listed every
  backticked path in the twenty specifications and the briefs and checked it against the tree.
- **Models and registries:** every model (`RmhboxPack`, `RmhboxPackReport`, `ContentReport`, `AltairSoloRun`,
  `AltairMatch`, `AltairMatchPlayer`, `Chart`, `SliceRun`, `SliceNoteStat`, `SongLeaderboard`, `RmhTubeChatMessage`,
  `RmhTubeRoomMember`, `RmhTubeSubscription`, `FanoutRun`, `LadderJob`, `LadderCompany`, `LadderApplication`,
  `LadderApplicationEvent`, `LadderUserPrefs`, `CustomFeed`, `CustomFeedMember`, `NewsStory`, `NewsStoryArticle`,
  `RankedSeasonRating`, `PredictionPosition`, `Ride`, `RideMessage`, `UserBlock`, `ChatMessage`, `RMHarkEdit`,
  `ConversationPref`, `DeletionHold`, `RmhCharacterParty`, `CommunityModAction`, `DeckSuggestion`, `FlashcardDeck`) and
  registry (`MINIGAME_REGISTRY`, `ASSIST_CAPABLE`, `HONOURED_SETTINGS`, `ASSIST_FEATURES`, `REPORT_ENTITY_TYPES`,
  `REMOVABLE_REPORT_ENTITY_TYPES`, `MEMBER_ITEM_REPORT_TYPES`, `FANOUT_KINDS`, `NOTIFY_CATEGORIES`,
  `CATEGORY_DEFAULTS`, `SCOPES`, `WILDCARD_SCOPES`, `READ_SCOPES`, `DEFAULT_SCOPES`, `ENDPOINTS`, `NULLABLE`,
  `DOCUMENTED_GROUPS`, `BOARD_PRIVACY_READ_PATHS`, `USER_TEXT_RENDERERS`, `NOTICE_TEMPLATES`, `ERROR_CODES`,
  `NAMESPACES`, `REGISTRATIONS`, `EXCLUDED_ROUTES`, `STATIC_ROUTES`, `DYNAMIC_ROUTES`, `TODO_CEILING`) named in a
  specification exists under that name.
- **Corrections made while checking:** RMHTube chat history **is** restored after a restart (`hydrateRoom` reads the
  table; 06 dropped that half and took reports, erasure and retention instead); `/rmhladder/health` already shows run
  errors (a planned "ladder sources for admins" feature was dropped for 20); S10-04, S10-07, S10-08 and S11-11 were
  already fixed (19 lists them as dropped); `READ_SCOPES` includes explicit scopes (10 fixes it before adding the first
  explicit read scope); the Slice It score route already writes a chart run's `chartId` onto `SongLeaderboard`, so 04
  keeps chart runs off the board rather than relying on the client never sending one; `RmhboxPackReport.reason` is
  free text, so 16's copy uses reason `OTHER` with the text as details.
- **Independent validation (2026-11-25):** a second pass re-checked every claim against the worktree and
  `git diff e5e8bb911 origin/main` (Med Schools only; no cited file changed) and corrected 01, 02, 04, 06, 08, 10, 11,
  12, 13, 14, 15, 16, 18 and 20 as the README's "Corrections from the independent validation pass" lists; Wave 0 gained
  the `// s13-12 news-stories` jobs anchor and the `<!-- s13-11 lists-on -->` changelog anchor, and the shared-file
  table gained `lib/fanout/*` (07, 12), `settings.tsx` (08, 09), `lib/notify/dispatch.server.ts` (20) and
  `lib/account/deletion-hold.server.ts` (18). No wave has two features in one unanchored file.
- **Not repeated:** no feature duplicates sprints 1–12. 01 is the next RMHBox stub (one a sprint, sprint 12's rule); 02
  continues sprints 07–09's assist adoptions; 18 and 19 are follow-up list items; the rejected ideas are in the README.
