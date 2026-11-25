# Sprint 12 — implementation plan

How the twenty features are built: seven waves of at most three concurrent implementers, each in its own git worktree
and branch, merged into the sprint branch `claude/autonomous-sprint-12` by one integration owner between waves. The
machine budget and the per-feature checks are sprint 11's, restated so this file stands alone, with what sprint 11's
implementers and integration learned folded into the briefs.

## Precondition: sprint 11 is in the sprint branch

`claude/autonomous-sprint-12` is cut from the sprint 11 branch tip (`claude/autonomous-sprint-11`, which holds sprints
1–11) once sprint 11 has finished integrating, or from `origin/main` if sprint 11 has landed there by then (then
`git merge origin/main` again when it lands; the content is identical). This design was checked against the sprint 11
tip `83d19d02b` (all twenty sprint 11 features merged, wave 7's `s11-field-names` last) and re-validated on
`5714f0006` (25 commits later: a merge of `main`, and fixes that closed part of 17 — `13e809261` — and all of 20 (d) —
`3e40f4280`; both specifications say so). Wave 0 is committed on top of
that. Wave 1 does not start before, because:

- the Wave 0 anchors go **after** sprint 11's anchor blocks in `lib/account/deletion.server.ts`,
  `prisma/schema/auth.prisma`, `lib/sitemap.ts`, `server/jobs/index.ts`, `components/feed/notification-labels.ts` (and
  its test), `lib/notifications/notice-keys.ts`, `components/feed/notice-previews.ts`, `lib/i18n/user-text.ts`,
  `lib/feed/__tests__/quiet-counts.test.ts`, `lib/device-data/registry.ts`, `lib/errors/codes.ts`,
  `components/errors/refusal-sentence.ts`, `lib/game/leaderboard-privacy.ts` and `lib/i18n/config.ts`;
- features build on sprint 11 code: 01 on the party (s11-03) and the sheet rolls (s11-02); 06 and 07 on Lights Out
  boards' report and visibility pattern (s11-05); 08, 09, 12, 16 and 20 on deck editors and `DECK_ACCESS_PATHS`
  (s11-10); 10 on price changes (s11-13); 13 on parties (s11-03); 17 on `evaluateFinish` (s11-12); 20 on the Studio's
  shares (s11-07), the public mod log (s11-19) and the field-names gate (s11-20);
- the migration timestamps below sort after sprint 11's last, `20261201060200_s11_card_listen`;
- **the refusal switch moved:** sprint 11's codes are rendered by `components/errors/refusal-sentence.ts` (the
  exhaustive `switch` over `ErrorCode`, sprint 11's last `case` `LISTING_PHOTO_NOT_SITE`, since followed by `main`'s
  `MEDSCHOOLS_LIST_IMPORT_*` codes, so the switch now ends at `MEDSCHOOLS_LIST_IMPORT_UNREADABLE`); `components/errors/useRefusalText.ts` is
  now the hook only. The anchors go in `refusal-sentence.ts`.

## Machine budget

4 cores and 15 GB, shared. A cold `tsc -b` of the site project peaks around 10 GB, so **implementers never run
`pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev` or `vite`.** They run targeted vitest files, eslint on
their changed files and the commit gate (`--fast`, about 1 GB; it skips `tsc`). They never run prettier over files that
existed before (reformatting causes merge conflicts); new files may be formatted. Integration runs the one full
typecheck after each merge, alone. Each worktree has its own `node_modules` (`pnpm install --frozen-lockfile --offline`,
hard-linked from the store), so one feature's `prisma generate` never changes another's client. At most three
implementers run at once. **jsdom is not installed:** component tests render with `react-dom/server`
(`renderToStaticMarkup`) or test the pure logic the component calls. **Timing tests** take the fastest of several runs.

## Wave 0 — scaffolding (integration commits it before Wave 1)

1. The precondition merge above.
2. **Namespaces.** Add to `NAMESPACES` in `lib/i18n/config.ts`, one per line, each **in sorted place** (Wave 0
   correction: `main` now keeps the list sorted and `lib/__tests__/i18n-catalogs.test.ts` holds that, so there is no
   sprint block and no comment): `party-rolls`, `ranking-file`,
   `friend-ghosts`, `chart-history`, `music-rhythms`, `connections-maker`, `profile-made`, `deck-ratings`,
   `card-history`, `homes-compare`, `route-announce`, `admin-deletions`, `admin-homes`, `member-reports`,
   `type-scoring`, `deletion-billing` (16 namespaces; 12 and 13 are the developer API's English JSON, 19 writes into
   `notice-language.json` and `feed.json`, 20 into each fixed file's namespace and `errors`). The design pass checked
   that none is taken at the sprint 11 tip; check again (`grep -n '"<name>"' lib/i18n/config.ts`) and suffix a taken one
   with `-s12`, correcting its brief. Create each `locales/en/<ns>.json` containing `{}` and a newline, and run
   `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-config.test.ts`.
3. **Anchors** — so that two features of one wave never edit the same lines of a shared file. Each anchor is a comment
   line followed by one blank line; a feature keeps **its own anchor line** and adds its code directly below it.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of `anonymizeAccount`, directly after sprint
     11's last block (`// s11-16 rmhtube-subtitles` and its line): the header
     `// Sprint 12 erasures (docs/autonomous/sprint-12/plan.md §Anchors): each feature adds its operations under its own line.`
     then `// s12-01 party-rolls`, `// s12-06 connections-maker`, `// s12-08 deck-ratings`. **Before** the transaction,
     after sprint 11's pre-step line (`// s11-09 read-alongs (hand-over reads before the transaction)`), one line
     `// s12-18 deletion-billing (billing stop before the transaction)` (18 alone uses it). 14 edits
     `finalizeDueDeletions` in the same file, which no other feature touches (no anchor).
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields, after sprint 11's block:
     `// Sprint 12 back-relations (one block per feature, docs/autonomous/sprint-12/plan.md)` then
     `// s12-01 party-rolls`, `// s12-08 deck-ratings`. Run `pnpm -s exec prisma validate` (dummy `DATABASE_URL`).
   - **New file `lib/account/export-sprint-12.server.ts`**, the shape of `lib/account/export-sprint-11.server.ts`:
     `async function exportSprint12(userId: string): Promise<Record<string, unknown>>` returning one object literal with
     the header `// Sprint 12 exports (docs/autonomous/sprint-12/plan.md §Anchors)` then `// s12-01 party-rolls`,
     `// s12-08 deck-ratings`, `// s12-10 homes-compare`. Each feature adds one property under its line (a dynamic
     `import()` of its own module). Wave 0 calls it **once** from `lib/account/api/account.export.server.ts` beside
     `exportSprint11(userId)` as `sprint12`, with `lib/account/__tests__/export-sprint-12.test.ts` (a copy of
     `export-sprint-11.test.ts`, whose Proxy Prisma mock answers any model) asserting the key and, per anchor, a
     commented-out expectation the feature enables. Implementers **never edit `account.export.server.ts`**. 06's drafts,
     14's attempts, 16's moderation stamps and 18's hold ids are not personal data the export lacks (each specification
     says why).
   - `lib/sitemap.ts`: in `EXCLUDED_ROUTES`, after sprint 11's block,
     `// Sprint 12 (docs/autonomous/sprint-12/plan.md §Anchors)` then `// s12-06 connections-maker`
     (`/connections/mine`, `personal`), `// s12-10 homes-compare` (`/homes/compare`, `personal`),
     `// s12-14 admin-deletions` (`/admin/deletions`, `admin`), `// s12-15 admin-homes` (`/admin/homes`, `admin`). No
     feature adds to `STATIC_ROUTES` or `DYNAMIC_ROUTES`.
   - `server/jobs/index.ts`, at the end of `REGISTRATIONS` after sprint 11's block:
     `// Sprint 12 (docs/autonomous/sprint-12/plan.md §Anchors)` then `// s12-04 chart-history`,
     `// s12-18 deletion-billing`. (Each also adds one import at the top; the two are in different waves.)
   - **Notices** (16 and 19): in `lib/notifications/notice-keys.ts`, at the end of `NOTICE_TEMPLATES` and of
     `interface NoticeParamTypes`, the header `// Sprint 12 notices (docs/autonomous/sprint-12/plan.md §Anchors)` then
     `// s12-16 member-reports`, `// s12-19 notice-helpers`; the same lines directly before `default:` in
     `components/feed/notice-previews.ts`, in `systemLabels`'s object in `components/feed/notification-labels.ts`, and
     in `components/feed/__tests__/notification-labels.test.ts`.
   - `lib/i18n/user-text.ts`, at the end of `USER_TEXT_RENDERERS`:
     `// Sprint 12 (docs/autonomous/sprint-12/plan.md §Anchors)` then `// s12-01 party-rolls`,
     `// s12-03 friend-ghosts`, `// s12-06 connections-maker`, `// s12-07 profile-made`, `// s12-08 deck-ratings`,
     `// s12-09 card-history`, `// s12-10 homes-compare`, `// s12-14 admin-deletions`, `// s12-16 member-reports`. (A
     file in a folder `USER_TEXT_EXEMPT` already covers needs no entry; the scan says which.)
   - `lib/feed/__tests__/quiet-counts.test.ts`, at the end of `EXEMPT`: the same header, then
     `// s12-06 connections-maker`, `// s12-07 profile-made` (both may name `playCount`, which is not a post count; an
     entry only if the scan asks, with an honest reason).
   - **Device data:** `lib/device-data/registry.ts`, at the end of `DEVICE_STORES`, and
     `components/settings/device-data-labels.ts`, at the end of its map: `// Sprint 12` then `// s12-03 friend-ghosts`,
     `// s12-10 homes-compare`.
   - **Refusal codes:** `lib/errors/codes.ts`, at the end of `ERROR_CODES` (after `MEDSCHOOLS_LIST_IMPORT_UNREADABLE`;
     Wave 0 correction: `main` added the RMH Med Schools codes after sprint 11's `LISTING_PHOTO_NOT_SITE`), and
     `components/errors/refusal-sentence.ts`, inside the `switch` after its last `case` (`MEDSCHOOLS_LIST_IMPORT_UNREADABLE`) and
     before the switch's closing brace (no `default:`; exhaustive over `ErrorCode`, so every new code needs its case or
     `tsc` fails): `// Sprint 12` then `// s12-01 party-rolls`, `// s12-03 friend-ghosts`, `// s12-04 chart-history`,
     `// s12-06 connections-maker`, `// s12-08 deck-ratings`, `// s12-10 homes-compare`, `// s12-14 admin-deletions`,
     `// s12-15 admin-homes`, `// s12-16 member-reports`, `// s12-20 s11-gaps`. `locales/en/errors.json` cannot hold
     comments: each feature adds its keys in sorted place, and integration merges the JSON by taking both sides.
     Params are only those `lib/errors/refusal.ts` reads (`PARAM_NAMES`: `endsAt`, `count`, `max`, `limit`,
     `remaining`, `minutes`, `days`).
   - `lib/game/leaderboard-privacy.ts`, at the end of `BOARD_PRIVACY_READ_PATHS`: `// Sprint 12` then
     `// s12-03 friend-ghosts`.
   - `lib/study/deck-access.ts`, at the end of `DECK_ACCESS_PATHS`:
     `// Sprint 12 (docs/autonomous/sprint-12/plan.md §Anchors)` then `// s12-08 deck-ratings`,
     `// s12-09 card-history`, `// s12-12 api-reviews`, `// s12-16 member-reports`.
   - `app/routes/_site/admin/index.tsx`, after the sprint 10 admin cards: `{/* Sprint 12 admin tools */}` then
     `{/* s12-14 admin-deletions */}`, `{/* s12-15 admin-homes */}`.
   - **Developer API** (12 and 13, waves 2 and 4): `lib/api/registry.ts` at the end of `ENDPOINTS`, `lib/api/scopes.ts`
     at the end of the scope list, `scripts/generate-sdk.ts` at the end of `NULLABLE`: `// Sprint 12` then
     `// s12-12 api-reviews`, `// s12-13 api-characters` (each adds one scope: 12 `write:study-reviews`, explicit; 13 `read:characters`); `docs/developer-api/changelog.md` at
     the top of its list: `<!-- s12-12 api-reviews -->`, `<!-- s12-13 api-characters -->`.
4. **No new shared helper.** `lockKey` serves every cap and claim; `useConfirm` and `usePrompt` every confirmation;
   `components/ui/tabs.tsx` every tab strip; `lib/calendar/tz.ts` every time-zone computation; the site's locale
   formatters every date and number; `components/ui/arrive.tsx` every arrival fade; `notice()` every new `SYSTEM`
   notice; `refusalBody()` and `useRefusalText` every refusal; `lib/core/persist` every stored value; `getBoss()` every
   job sent from the web tier; `recordAdminActionIn` every admin action.
5. Outside `docs/autonomous/sprint-12/` (the design pass wrote nothing else): `.prettierignore` gains
   `/docs/autonomous/sprint-12/` after sprint 11's line, with the same comment, and `docs/autonomous/README.md` gains
   the sprint 12 row ("Members' work, made trustworthy and findable: twenty features").
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

## Waves

| Wave | Slot A               | Slot B              | Slot C            |
| ---- | -------------------- | ------------------- | ----------------- |
| 1    | 01 party-rolls       | 10 homes-compare    | 05 music-rhythms  |
| 2    | 06 connections-maker | 18 deletion-billing | 12 api-reviews    |
| 3    | 02 ranking-file      | 09 card-history     | 15 admin-homes    |
| 4    | 13 api-characters    | 16 member-reports   | 03 friend-ghosts  |
| 5    | 07 profile-made      | 14 admin-deletions  | 17 type-scoring   |
| 6    | 08 deck-ratings      | 04 chart-history    | 19 notice-helpers |
| 7    | 20 s11-gaps          | 11 route-announce   | —                 |

The rule the waves keep: **no two features of one wave edit the same file unless that file is anchored** (each feature
under its own Wave 0 line) or generated (integration regenerates it). The erasure registry
(`lib/account/erasure-registry.ts`) is alphabetical, not anchored: 01 (`RmhCharacterPartyRoll`, w1), 06
(`ConnectionsGrid` becomes a scoped `erase` of drafts, w2) and 08 (`DeckRating`, w6) sit in different waves. `TODO_CEILING` stays 4.

Dependencies that fix the order:

- **Connections:** 06 (w2) adds drafts → 16 (w4) adds the grid report button to the same page
  (`components/party/ConnectionsPages.tsx`) and a takedown in `lib/party/connections.server.ts` → 07 (w5) lists only
  published, unhidden grids and reads 16's moderation flags on decks.
- **Study:** 12 (w2) extracts `reviewCard` into `lib/study/review.server.ts` and edits
  `lib/study/api/study.cards.$id.review.server.ts` → 09 (w3) adds card history beside it and edits
  `components/study/ReviewAll.tsx` and `prisma/schema/rmhstudy.prisma` (`resetAt`, the log index) → 16 (w4) adds
  `FlashcardDeck.moderatedAt` and the deck report on `components/feed/DeckStudyColumn.tsx` → 08 (w6) adds ratings
  columns, the rating control on the same `DeckStudyColumn.tsx` and the marketplace sort in `lib/study.server.ts` →
  20 (w7) edits `lib/study/deck-access.server.ts`'s fragments. One study feature per wave; `DECK_ACCESS_PATHS` anchored.
- **Homes:** 10 (w1) edits `prisma/schema/hearth.prisma` (`HomeFavorite.note`), `lib/homes/listings.server.ts` and
  `components/homes/ListingDetailView.tsx` → 15 (w3) edits only the scraper's trigger and admin files → 16 (w4) adds
  `HomeListing.moderatedAt`, `setListingStatus`'s refusal and the report item on `ListingDetailView.tsx`.
- **Deletion:** 18 (w2) adds `DeletionHold.subscriptionIds` in `prisma/schema/deletion.prisma`, the pre-step, and edits
  `lib/account/deletion-hold.server.ts` → 14 (w5) adds `AccountErasureAttempt` in the same schema file, edits
  `finalizeDueDeletions` and shows 18's subscription counts.
- **Developer API:** 12 (w2) → 13 (w4), both anchored in the registry, the SDK's `NULLABLE` and the changelog; the
  generated SDK (`packages/sdk/`) and API docs are regenerated by each and **by integration on every merge**.
- **RMHCharacters:** 01 (w1) edits `features/rmhcharacters/**` (rolls); 13 (w4) only reads its engine functions
  (`party-summary.ts`, `party.server.ts`) and must not edit them; if it needs to, it stops and reports.
- **Moderation and notices:** 16 (w4) owns the report files (no other feature this sprint edits them, so they carry
  no anchors; 16 marks its blocks `// s12-16 member-reports`); 19 (w6) edits the decision-message part of
  `lib/moderation/triage.server.ts` after 16's takedown branches are merged; notices anchored for both.
- **Admin hub:** 15 (w3), 14 (w5), anchored. **Sitemap:** 10 (w1), 06 (w2), 15 (w3), 14 (w5), anchored. **Jobs:** 18
  (w2), 04 (w6), anchored. **Refusals:** anchored; `errors.json` merged by integration.
- **RMHType:** 17 (w5) alone edits `server/socket-server/handlers/rmhtype.ts`, `lib/rmhtype/challenges.ts` and the two
  RMHType pages.
- **The sweeps last:** 20 (w7) touches small parts of many features' files (study fragments, the admin keys table, the
  mod log, Studio shares, community events, admin users, two forms) and 11 (w7) mounts in `app/routes/__root.tsx` and may
  retitle routes, except the two route files 20 edits (`admin/users.tsx`, `rideshare/drive.tsx`), whose duplicates stay
  in the baseline; nothing else runs beside them.

## Shared files and who touches them

| File                                                                                                            | Kind                              | Who                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `lib/i18n/config.ts` (`NAMESPACES`)                                                                             | registry                          | **Wave 0 only**                                                                               |
| `locales/en/<ns>.json`                                                                                          | generated (extract) or hand-added | each feature its own; `notice-language.json` and `feed.json` for 16, 19; `errors.json` for refusals |
| `prisma/schema/auth.prisma` (`User`)                                                                            | source, **anchored**              | 01 (w1), 08 (w6)                                                                              |
| `prisma/schema/rmhcharacters.prisma`                                                                            | source                            | 01                                                                                            |
| `prisma/schema/hearth.prisma`                                                                                   | source                            | 10 (w1), 16 (w4)                                                                              |
| `prisma/schema/games.prisma`                                                                                    | source                            | 06                                                                                            |
| `prisma/schema/rmhstudy.prisma`                                                                                 | source                            | 09 (w3), 16 (w4), 08 (w6)                                                                     |
| `prisma/schema/moderation.prisma` (`AiPersona`)                                                                 | source                            | 16                                                                                            |
| `prisma/schema/deletion.prisma`                                                                                 | source                            | 18 (w2), 14 (w5)                                                                              |
| `lib/account/deletion.server.ts`                                                                                | source, **anchored**              | 01 (w1), 06, 18 (w2), 14 (w5, `finalizeDueDeletions`), 08 (w6)                                |
| `lib/account/deletion-hold.server.ts`, `deletion-hold.ts`                                                       | source                            | 18                                                                                            |
| `lib/account/erasure-registry.ts`                                                                               | source (alphabetical)             | 01, 06, 08                                                                                    |
| `docs/account-deletion.md`                                                                                      | generated (`pnpm docs:deletion`)  | each feature that edits the registry                                                          |
| `lib/account/export-sprint-12.server.ts` and its test                                                           | new in Wave 0, **anchored**       | 01, 08, 10                                                                                    |
| `lib/account/api/account.export.server.ts`                                                                      | source                            | **Wave 0 and integration only**                                                               |
| `lib/sitemap.ts`                                                                                                | source, **anchored**              | 10, 06, 15, 14                                                                                |
| `server/jobs/index.ts`                                                                                          | source, **anchored**              | 18 (w2), 04 (w6)                                                                              |
| `lib/notifications/notice-keys.ts`, `components/feed/notice-previews.ts`, `notification-labels.ts` + test       | source, **anchored**              | 16 (w4), 19 (w6)                                                                              |
| `lib/i18n/user-text.ts`                                                                                         | source, **anchored**              | 01, 10, 06, 09, 03, 16, 07, 14, 08                                                            |
| `lib/feed/__tests__/quiet-counts.test.ts` (`EXEMPT`)                                                            | test registry, **anchored**       | 06, 07 if needed                                                                              |
| `lib/device-data/registry.ts`, `components/settings/device-data-labels.ts`                                      | source, **anchored**              | 10 (w1), 03 (w4)                                                                              |
| `lib/errors/codes.ts`, `components/errors/refusal-sentence.ts`                                                  | source, **anchored**              | every feature that refuses                                                                    |
| `lib/game/leaderboard-privacy.ts` (`BOARD_PRIVACY_READ_PATHS`)                                                  | source, **anchored**              | 03                                                                                            |
| `lib/study/deck-access.ts` (`DECK_ACCESS_PATHS`)                                                                | source, **anchored**              | 12 (w2), 09 (w3), 16 (w4), 08 (w6)                                                            |
| `lib/study/deck-access.server.ts`                                                                               | source                            | 20                                                                                            |
| `lib/study.server.ts`                                                                                           | source                            | 16 (marketplace filter, `getDeck`, w4); 08 (`listMarketplaceDecks`, `cloneDeck`, w6)          |
| `lib/study/deck-editor.server.ts`                                                                               | source                            | 16 (`updateDeck`, w4), 08 (`deleteDeck`, w6)                                                  |
| `lib/study/queue.server.ts`                                                                                     | source                            | 12 (`reviewQueue`'s optional `deckId`, w2)                                                    |
| `components/feed/DeckStudyColumn.tsx`                                                                           | source                            | 16 (w4), 08 (w6)                                                                              |
| `components/study/ReviewAll.tsx`, `lib/study/api/study.cards.$id.review.server.ts`                              | source                            | 12 (w2, the route), 09 (w3, the screen)                                                       |
| `app/routes/_site/admin/index.tsx`                                                                              | source, **anchored**              | 15 (w3), 14 (w5)                                                                              |
| report files (`report-constants.ts`, the report route, `triage.server.ts`, `my-reports.server.ts`, `MyReportsPanel.tsx`) | source                     | 16 (w4); 19 (w6) the decision message in `triage.server.ts` only                              |
| `lib/party/connections.server.ts`, `components/party/ConnectionsPages.tsx`                                      | source                            | 06 (w2), 16 (w4)                                                                              |
| `lib/homes/listings.server.ts`, `components/homes/ListingDetailView.tsx`                                        | source                            | 10 (w1), 16 (w4)                                                                              |
| `lib/homes/scrape/**` (incl. `process-source.ts`), `server/homes-worker/index.ts`                               | source                            | 15                                                                                            |
| `docs/developer-api/scopes.md`                                                                                  | source                            | 12 (w2), 13 (w4)                                                                              |
| `features/rmhcharacters/**`                                                                                     | source                            | 01 (w1); 13 (w4) reads only                                                                   |
| `features/slice-it/**`                                                                                          | source                            | 04                                                                                            |
| `lib/rmhmusic/learn/**`, `components/rmhmusic/learn/**`                                                         | source                            | 05                                                                                            |
| `lib/rmhbox/**`, `server/rmhbox/**`, `components/rmhbox/**`, `data/rmhbox/ranking-file/`                        | source                            | 02                                                                                            |
| `lib/replays.server.ts`, `lib/game/replay-*.ts`, `app/routes/api/replays/ghost.ts`, `components/neon-driftway/**` | source                          | 03                                                                                            |
| `lib/profile/**`, `components/profile/**`                                                                       | source                            | 07                                                                                            |
| `server/socket-server/handlers/rmhtype.ts`, `lib/rmhtype/**`, `components/rmhtype/**`                           | source                            | 17                                                                                            |
| `lib/auth.ts` (the Stripe client moves out)                                                                     | source                            | 18                                                                                            |
| `lib/rmhladder/alerts/dispatch.server.ts`, `lib/admin/api-keys.server.ts`, `lib/admin-review.server.ts` and its callers, `lib/developer/recipes.server.ts`, `lib/__tests__/notice-preview-ratchet.test.ts` | source | 19 |
| `lib/admin/api-keys-schema.ts`, `components/admin/api-keys/ApiKeysTable.tsx`, `lib/communities/modlog.server.ts`, `lib/studio/share.ts`, `components/communities/CommunityEventsPanel.tsx`, `app/routes/_site/admin/users.tsx`, `app/routes/_site/rideshare/drive.tsx`, `components/tf2-hud/ui.tsx` | source | 20 |
| `app/routes/__root.tsx`, `components/shell/**`, `lib/router/**`                                                 | source                            | 11                                                                                            |
| `lib/api/registry.ts`, `lib/api/scopes.ts`, `scripts/generate-sdk.ts`, `docs/developer-api/changelog.md`        | source, **anchored**              | 12 (w2), 13 (w4)                                                                              |
| `packages/sdk/**`, `docs/developer-api/endpoints/**`                                                            | generated (`pnpm sdk:generate`, `pnpm docs:api`) | 12, 13; **integration regenerates on every merge**                             |
| `lib/api/route-table.server.ts`                                                                                 | generated (`pnpm api:routes`)     | each feature regenerates it; **integration regenerates on every merge**                       |
| `app/routeTree.gen.ts`                                                                                          | generated (vite)                  | **integration only**                                                                          |
| `docs/_generated/facts.json`, `docs/site-reference/*`                                                           | generated                         | **integration regenerates** (`pnpm facts:generate`, `pnpm docs:site`)                          |
| `lib/catalog/**`                                                                                                | source                            | nobody (02 adds a minigame inside RMHBox, not a catalogue entry)                              |

## Migration timestamps

All additive; `.github/scripts/check-migrations-additive.mjs` must pass. Every timestamp sorts after sprint 11's
`20261201060200…`. The pattern is `20261202<wave><slot>00` (slot A = 1, B = 2, C = 3).

| Feature | Migration                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| 01      | `20261202010100_s12_party_rolls`                                                                                            |
| 10      | `20261202010200_s12_homes_compare`                                                                                          |
| 06      | `20261202020100_s12_connections_maker`                                                                                      |
| 18      | `20261202020200_s12_deletion_billing`                                                                                       |
| 09      | `20261202030200_s12_card_history`, `20261202030201_s12_card_history_index` (`CONCURRENTLY`, alone), `20261202030202_s12_card_history_index_ensure_valid` |
| 16      | `20261202040200_s12_member_reports`                                                                                         |
| 14      | `20261202050200_s12_admin_deletions`                                                                                        |
| 08      | `20261202060100_s12_deck_ratings`                                                                                           |

02, 03, 04, 05, 07, 11, 12, 13, 15, 17, 19 and 20 have no schema change. **Every migration contains real SQL.** New
tables get plain indexes in the migration that creates them (the safety script allows a non-`CONCURRENTLY` index only on
a table created in the same file); new columns on existing tables are nullable or carry a constant default
(06's three, 08's three, 09's one, 10's one, 16's three, 18's one). 06 and 08 backfill with one `UPDATE` each (06's
`publishedAt` from `createdAt`; 08's `copyCount` from the copies that exist) — data, not structure, and each is one
statement. **One index on an existing table is planned** (09's, on `flashcard_review_log`): `CREATE INDEX CONCURRENTLY`
alone in its migration with Prisma's default name `flashcard_review_log_userId_cardId_reviewedAt_idx`, followed by the
`_ensure_valid` migration (copy `20261126060101_s06_flashcard_external_id_index` and `…_ensure_valid`). Any other index
a feature finds it needs is reported, not added.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-12`, never pushed until the sprint PR.
- Feature branch: `autonomous/s12-<slug>` from the sprint branch **as it is when the wave starts**.
- Worktree: `/home/user/wt/s12-<slug>`. The exact commands are in every brief.
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
   socket and worker code, the field-names gate (`lib/__tests__/field-names.test.ts`) for any new form field, the
   sweep reference-columns gate (`lib/media/__tests__/sweep-reference-columns.test.ts`) for any new picture column, and
   every read-path registry test the feature names).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` and the boundary config, with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed from the wave's base schema, and the
   additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file (and `feed.json` / `notice-language.json` /
   `errors.json` where the feature adds there); if the extractor churns unrelated catalogues, add the keys by hand.
5. `pnpm api:routes` when an endpoint module was added, moved or removed.
6. Registry features: `pnpm docs:deletion` and commit `docs/account-deletion.md`.
7. API features (12, 13): `pnpm sdk:generate` and `pnpm docs:api`, committed; `git diff packages/sdk` shows no existing
   field changed type.
8. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s12-<slug>`. On a conflict in a generated file, take either side and regenerate;
   anchored files should not conflict (if one does, keep both features' blocks under their anchors); `errors.json`, the
   erasure registry and `notice-language.json` take both sides.
2. Regenerate: `pnpm api:routes`; the route tree (start `pnpm exec vite --port 7999 --strictPort`, wait until
   `app/routeTree.gen.ts` changes, stop it — 06, 10, 14 and 15 add pages); `pnpm facts:generate`; `pnpm docs:site`;
   `pnpm docs:deletion`; after 12 and 13, `pnpm sdk:generate` and `pnpm docs:api`.
3. `pnpm exec prisma generate`, then `pnpm exec tsc -b --checkers 1` alone.
4. `pnpm test` and `pnpm test:product`.
5. **Raw SQL, lock and claim smoke test** against a throwaway Postgres (the integration suite's, `docs/testing.md` §8):
   apply the migrations and run each new query once; for 01 the roll trim under the lock; for 04 the prune's raw SQL on
   `"ChartRevision"`; for 06 the edit CAS against a concurrent first play and the `publishedAt` backfill; for 08 two
   concurrent ratings on one deck and the `copyCount` backfill; for 09 the `CONCURRENTLY` index and its
   `_ensure_valid` check; for 14 two concurrent erasures of one account (one runs); for 15 run-now twice (one job).
6. Review the diff against the brief and the specification's acceptance criteria; fix or send back. Check every read
   path the feature names: 01 (`gm` and `secret` rolls, removed members), 03 (mutuals, blocks, board privacy, the
   board-score rule), 06 (drafts in no list, cache, daily, sitemap or OG card), 07 (each visibility rule, blocks), 08
   (eligibility; counters equal rows), 09 (own rows only), 10 (notes in no other member's read), 12 (no sound field;
   idempotency), 13 (no other sheet; `portrait` removed), 14 (no e-mail or message), 15 (SSRF guard), 16 (each takedown
   sticks; every reader excludes moderated items), 17 (no forged figure reaches a board), 18 (Stripe faked: stop,
   resume, cancel, and a request withdrawn before, during and after the sync job's stop), 19 (old rows render), 20 (each item).
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Confirm `exportSprint12` carries 01, 08 and 10's sections, and that the erasure coverage test passes with every sprint
  12 table classified and `TODO_CEILING = 4`.
- `pnpm check:consistency --base main`, `pnpm typecheck`, `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`,
  `pnpm build` with `scripts/check-bundle-budget.ts` (the site-tier CSS must not grow, B5: 06, 07, 08, 09, 10, 14, 15,
  16 and 18 add site-tier UI with existing utilities only; 11 adds no visible UI), and a real-browser pass over every
  new or changed page in Day and Night at 390 px and 1280 px, and once in `ar`; the app-tier surfaces (RMHCharacters 01,
  RMHBox 02, Neon Driftway 03, Slice It 04, RMH Music 05, RMHType 17) in their own look; a screen-reader pass for 11.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code lines (TypeScript, TSX, SQL, CSS, JSON
content under `data/`) separately from documentation lines, measured with `git diff --numstat` from the Wave 0 parent
commit to `HEAD`, filtered by extension, excluding generated files (`routeTree.gen.ts`, `route-table.server.ts`,
`facts.json`, `docs/site-reference/**`, `locales/**`, `docs/account-deletion.md`, `packages/sdk/**`,
`docs/developer-api/endpoints/**`). It also lists the follow-ups 17, 18, 19 and 20 closed (and any found already
closed), the `serverError` ratchet's value after the sprint (it must not rise above 18), 11's title-duplicate baseline
at wave start and at the end, 17's count of current `bestWpm` values above `MAX_WPM`, and the open owner decisions this
sprint met (refunds beside 18, written reviews beside 08, the deletion grace period beside 14 and 18).

## Risks

- **Money (18).** A wrong Stripe call charges or refunds a real member. Mitigations: Stripe is faked in every test;
  calls are idempotent (Stripe's state read first); the stop and resume run as retried jobs outside transactions; the
  erasure refuses to finish while a subscription is still active; integration checks the jobs against Stripe's test
  mode before the sprint PR, never against live keys.
- **Erasure stalls (18 with 14).** A Stripe outage now blocks erasures. 14 makes the stall visible within a day, and its
  retry is audited; if Stripe is unconfigured the step is a no-op, so local and test runs never stall.
- **Wrong answers in content (02).** Sixty sets of facts can carry a wrong value. Every set names a source, values must
  be strictly ordered, and only stable facts are allowed; review reads a sample against the sources.
- **Behaviour change for honest typists (17).** A legitimate run whose curve is rejected becomes "Not ranked". The check
  is the one sprint 11's races already use; a recorded honest run is replayed in tests; the reason is shown, not hidden.
- **Index on a large table (09).** `CONCURRENTLY` cannot run inside a transaction and can leave an invalid index; the
  `_ensure_valid` migration and integration's smoke test cover it.
- **The study files four waves in a row (12, 09, 16, 08) and 20 after.** One study feature per wave; `DECK_ACCESS_PATHS`
  anchored; 20 edits the access fragments last.
- **Moderation reach (16).** A moderated item that some reader still shows is a takedown that did not take; each reader
  is listed in the specification and checked at review.
- **Route announcements (11).** A wrong title is announced on every navigation; the title gate and the baseline make
  duplicates visible; announcements are polite and pathname-only, and the focus move is keyboard-only, so pointer users
  see no change.
- **Developer API twice (12, 13).** Generated SDK conflicts are expected and resolved by regeneration; `NULLABLE`
  applies by field name across the whole SDK, so each new nullable name is checked.
- **Scope creep in 20.** Seven small items invite more; anything not listed is reported, not fixed.

## Validation

The design pass checked each specification against the sprint 11 tip (`83d19d02b`, then `5714f0006` by the validation pass) in a read-only worktree:

- **Paths:** every file path cited in `features/` and `briefs/` that is said to exist was checked to exist; paths of
  files a feature creates are named as new. A scripted pass listed every backticked path in the twenty specifications
  and the briefs and checked it against the tree (new files excepted by the "create" lists).
- **Models and registries:** every model (`RmhCharacterParty`, `RmhCharacterPartyMember`, `RmhCharacter`,
  `ConnectionsGrid`, `ConnectionsPlay`, `LightsOutBoard`, `FlashcardDeck`, `FlashcardReview`, `FlashcardReviewLog`,
  `DeckEditor`, `HomeFavorite`, `HomeListing`, `HomeSource`, `HomeScrapeRun`, `AiPersona`, `Chart`, `ChartRevision`,
  `UserBuild`, `Subscription`, `DeletionHold`, `GameReplay`, `RmhTypeProfile`, `RmhTypeMatch`) and registry
  (`MINIGAME_REGISTRY`, `REPORT_ENTITY_TYPES`, `REMOVABLE_REPORT_ENTITY_TYPES`, `DECK_ACCESS_PATHS`,
  `CARD_SOUND_READ_PATHS`, `BOARD_PRIVACY_READ_PATHS`, `MODULE_KINDS`, `PLUS_MODULE_KINDS`, `NOTICE_TEMPLATES`,
  `PASSED_THROUGH_HELPERS`, `USER_TEXT_RENDERERS`, `DEVICE_STORES`, `ERROR_CODES`, `ENDPOINTS`, `GHOST_GAME_IDS`,
  `GHOST_MODES`, `NAMESPACES`) named in a specification exists under that name.
- **Corrections made while checking:** the refusal switch is in `components/errors/refusal-sentence.ts`, not
  `useRefusalText.ts` (anchors moved); `isDeletedAccount` is in `lib/account-lifecycle.ts`; the RMH Music folder's tests
  are colocated (05's test names follow); the deck access fragments are `studiedDeckWhere` and `readableDeckWhere`
  (20 (a) names them); Slice It's chart PATCH already lints a published chart (04 restores through it rather than adding
  a server write); the Connections export and erasure keep published grids (06 erases drafts only); `HomeFavorite` is
  not in the data export today (10 exports it).
- **Validation pass (2026-11-25, tip `5714f0006`):** 06's erasure entry (a `keep` model may not be touched by
  `anonymizeAccount`: now a scoped `erase`), its edit/first-play race and cap lock; 08's deck delete is
  `deleteDeck` in `lib/study/deck-editor.server.ts` and decks stay at erasure; 12's new explicit scope, no quest
  rewards and `reviewQueue`'s missing deck filter; 14's claim (an advisory lock cannot span `anonymizeAccount`); 15's
  pause overwritten by a run in flight; 16's re-publish through `/api/v1`, single-item reads, no appeal or restore
  path; 17 narrowed to what `13e809261` left open; 18 one reconciling job so a withdrawn request cannot leave a
  membership cancelled; 19's seven callers; 20 (d) dropped (fixed by `3e40f4280`); smaller corrections in 02, 03,
  04, 05, 07, 09, 11.
- **Not repeated:** no feature duplicates sprints 1–11. 01 is sprint 11's recorded "Shared roll log in a party"; 10 is
  its recorded "Saved notes and side-by-side comparison"; 16 includes its recorded "report path for Connections grids";
  17 is sprint 11 12's recorded follow-up; 18, 19 and 20 are follow-up list items; the rejected ideas are in the
  README.
