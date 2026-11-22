# Sprint 06 — implementation plan

How the twenty features are built: seven waves of at most three concurrent
implementers, each in its own git worktree and branch, merged into the sprint
branch `claude/autonomous-sprint-06` by one integration owner between waves. The
machine budget and the per-feature checks are sprint 05's
(`docs/autonomous/sprint-05/plan.md` on the sprint 05 branch), restated so this
file stands alone.

## Precondition: sprint 05 is in the sprint branch

`claude/autonomous-sprint-06` is cut from `origin/main`. Sprint 05 is integrating
on `claude/autonomous-sprint-05` and is not on `main` yet. Before Wave 0 is
committed, integration merges sprint 05 in — `git merge origin/main` once sprint
05 has landed on `main`, or `git merge origin/claude/autonomous-sprint-05` if it
has not (and `origin/main` again when it lands; the content is identical, so
that merge is conflict-free). Wave 1 does not start until this is done, because:

- the Wave 0 anchors go **after** sprint 05's anchor blocks in
  `lib/account/deletion.server.ts`, `prisma/schema/auth.prisma`,
  `lib/sitemap.ts`, `server/jobs/index.ts`,
  `components/feed/notification-labels.ts` (and its test) and
  `app/routes/_site/admin/index.tsx`;
- features build on sprint 05 code: 07 on jam teams (`listTeam`), 08 on card
  types and `insertCards` sibling generation, 10 and 11 on event co-hosts
  (`assertHostOrAdmin`), 12 on personal best history (`recordPersonalBest`),
  15 on describing images after posting (`lib/feed/alt-text-edit.server.ts`),
  20 on double elimination and seeding (`settleMatch`), 04 and 03 on Studio
  projects (`project-schema.ts`), 18 on sprint 05's export wiring pattern;
- the migration timestamps below sort after sprint 05's `20261125…`;
- sprint 05's `.prettierignore` and `lib/i18n/config.ts` blocks sit where Wave 0
  adds sprint 06's; take both sides on conflict.

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
   05's block, one per line under the comment `// Sprint 06
   (docs/autonomous/sprint-06): one namespace per feature.`:
   `community-bans`, `community-notes`, `studio-editing`, `studio-export`,
   `feedback-inbox`, `admin-secure-account`, `jam-feedback`, `deck-updates`,
   `group-invites`, `event-occurrences`, `event-updates`, `game-webhooks`,
   `build-comments`, `gif-descriptions`, `content-warnings`, `read-receipts`,
   `away-message`, `ranked-polls`, `match-results` (19 namespaces; 13 writes
   none). Create each `locales/en/<ns>.json` containing `{}` and a newline. Run
   `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts
   lib/__tests__/i18n-config.test.ts` to check the registry accepts empty
   catalogues.
3. **Anchors** — so that two features of one wave never edit the same lines of a
   shared file. Each anchor is a comment line followed by one blank line; a
   feature keeps **its own anchor line** and adds its code directly below it.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of
     `anonymizeAccount`, directly after sprint 05's last anchor block
     (`// s05-20 flashcard-reminders` and its line): a header comment
     `// Sprint 06 erasures (docs/autonomous/sprint-06/plan.md §Anchors): each
     feature adds its operations under its own line.` then
     `// s06-01 community-bans`, `// s06-02 community-notes`,
     `// s06-05 feedback-inbox`, `// s06-07 jam-feedback`,
     `// s06-09 group-invites`, `// s06-10 event-occurrences`,
     `// s06-11 event-updates`, `// s06-14 build-comments`,
     `// s06-18 away-message`, `// s06-20 match-results`.
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields,
     after sprint 05's block: `// Sprint 06 back-relations (one block per
     feature, docs/autonomous/sprint-06/plan.md)` then `// s06-01
     community-bans`, `// s06-07 jam-feedback`, `// s06-09 group-invites`,
     `// s06-18 away-message`. Run `pnpm -s exec prisma validate` (dummy
     `DATABASE_URL`).
   - **New file `lib/account/export-sprint-06.server.ts`** exporting
     `async function exportSprint06(userId: string): Promise<Record<string,
     unknown>>` that builds and returns one object literal; inside it, the
     header comment `// Sprint 06 exports (docs/autonomous/sprint-06/plan.md
     §Anchors)` then `// s06-01 community-bans`, `// s06-05 feedback-inbox`,
     `// s06-07 jam-feedback`, `// s06-09 group-invites`,
     `// s06-11 event-updates`, `// s06-14 build-comments`,
     `// s06-18 away-message`. Each feature adds one
     property (`communitySanctions: await exportCommunitySanctions(userId),`)
     under its line. Wave 0 also calls it once from
     `lib/account/api/account.export.server.ts` and adds the result to the
     payload as `sprint06`, with a test in
     `lib/account/__tests__/export-sprint-06.test.ts` that the payload carries
     the key. Implementers still **never edit `account.export.server.ts`**; 13,
     16 and 17 add fields to rows the export already lists only if it lists
     fields explicitly (integration checks).
   - `lib/sitemap.ts`, `EXCLUDED_ROUTES`: after sprint 05's personal block,
     `// Sprint 06 static personal paths` then `// s06-05 feedback-inbox`
     (`/settings/feedback`); after sprint 05's admin block, `// Sprint 06 admin
     pages` then `// s06-05 feedback-inbox` (`/admin/feedback`). In
     `DYNAMIC_ROUTES`, after `'/c/$slug/invite/$code'`, `// Sprint 06` then
     `// s06-09 group-invites` (`'/groups/join/$code': null`, a capability URL).
     **Param-less paths go in `EXCLUDED_ROUTES`, never `DYNAMIC_ROUTES`.**
   - `server/jobs/index.ts`, at the end of `REGISTRATIONS` after sprint 05's
     block: `// Sprint 06 (docs/autonomous/sprint-06/plan.md §Anchors)` then
     `// s06-11 event-updates` and `// s06-20 match-results`. (Each also adds
     one import at the top; 11 and 20 are in different waves.)
   - `components/feed/notification-labels.ts`, in `systemLabels`'s returned
     object directly before `default:` and after sprint 05's block:
     `// Sprint 06 system labels` then `// s06-01 community-bans`,
     `// s06-05 feedback-inbox`, `// s06-06 admin-secure-account`,
     `// s06-07 jam-feedback`, `// s06-10 event-occurrences`,
     `// s06-11 event-updates`, `// s06-20 match-results`; and the same anchor
     lines in `components/feed/__tests__/notification-labels.test.ts` where it
     pins each label's key and English text. Labels are literal
     `t('system-label-<type>', { ns: 'feed', defaultValue: '…' })` calls (the
     computed-key ratchet rejects computed keys, ternaries included) and land in
     `locales/en/feed.json`.
   - `app/routes/_site/admin/index.tsx`, in the hub's card grid after sprint
     05's block: `{/* Sprint 06 admin tools */}` then
     `{/* s06-05 feedback-inbox */}`. The `t()` calls sit inside the card's
     props, never directly after a `{/* */}` comment.
   - `lib/settings-nav.ts`, after the `blocked` destination: `// Sprint 06`
     then `// s06-05 feedback-inbox`; the same line in
     `components/settings/settings-nav-labels.ts` after `'blocked'` and in
     `components/settings/__tests__/settings-nav-labels.product.test.ts`.
   - `lib/api/registry.ts`, at the end of the paths it declares:
     `// Sprint 06 (docs/autonomous/sprint-06/plan.md §Anchors)` then
     `// s06-12 game-webhooks` and `// s06-13 api-flashcards`. Post schema
     fields (15, 16, 19) are edited in place; those three are in different
     waves.
4. **No new shared helper.** `lockKey` (sprint 04) serves every cap;
   `useConfirm` and `usePrompt` every confirmation; `components/ui/tabs.tsx`
   every tab strip; `lib/calendar/tz.ts` every time-zone computation; the site's
   locale formatting (sprint 05 11) every date and number;
   `components/ui/arrive.tsx` every arrival fade.
5. `.prettierignore` gains `/docs/autonomous/sprint-06/` (after sprint 05's
   line, with the same comment) and `docs/autonomous/README.md` gains the sprint
   06 row (done in these documents).
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

## Waves

| Wave | Slot A                    | Slot B                    | Slot C                  |
| ---- | ------------------------- | ------------------------- | ----------------------- |
| 1    | 01 community-bans         | 08 deck-updates           | 09 group-invites        |
| 2    | 03 studio-editing         | 07 jam-feedback           | 10 event-occurrences    |
| 3    | 05 feedback-inbox         | 12 game-webhooks          | 19 ranked-polls         |
| 4    | 02 community-notes        | 11 event-updates          | 14 build-comments       |
| 5    | 04 studio-export          | 17 read-receipts          | 20 match-results        |
| 6    | 06 admin-secure-account   | 13 api-flashcards         | 15 gif-descriptions     |
| 7    | 16 content-warnings       | 18 away-message           | —                       |

Dependencies that fix the order:

- 01 → 02: both edit `prisma/schema/communities.prisma`,
  `lib/communities/modlog.ts` (`MOD_ACTIONS_BY_GROUP.members`),
  `components/communities/ModLog.tsx` labels and
  `components/feed/CommunityColumn.tsx`; 02 links notes to 01's bans and adds
  a field to 01's dialog.
- 03 → 04: both edit `lib/studio/store.ts`, `lib/studio/hooks/useKeybinds.ts`
  and `components/studio/StudioShell.tsx`; 04's MIDI import is one history step
  of 03's history.
- 10 → 11: both edit `lib/events.server.ts`, `components/events/EventCard.tsx`,
  `prisma/schema/events.prisma` and `lib/calendar/feed-entries.ts`; 11 targets
  occurrences after 10's overrides.
- 07 (w2) and 20 (w5): both edit `prisma/schema/competitive.prisma`.
- 07 (w2) and 14 (w4): both add to `REPORT_ENTITY_TYPES`
  (`lib/moderation/report-constants.ts`) and the admin report resolver.
- 08 (w1) → 13 (w6): both edit `prisma/schema/rmhstudy.prisma` and use
  `lib/study/deck-editor.server.ts`; 13 must leave 08's origin columns alone.
- 12 (w3) → 13 (w6): both edit `lib/api/scopes.ts`, `lib/api/registry.ts`
  (anchored) and the developer docs; 12 and 19 share wave 3 but edit different
  parts of the registry.
- 19 (w3) → 15 (w6) → 16 (w7): all three edit the post create path
  (`lib/feed/api/rmharks.server.ts`), `compose/compose-state.ts`,
  `lib/feed/map-feed-item.server.ts` and `/api/v1/posts*`; 15 and 16 also edit
  `RMHarkCard.tsx`, `EditPostModal.tsx`, embeds and `lib/rss.ts`;
  `prisma/schema/social.prisma` in each. 15 and 16 are the sweeping read-path
  features and run last.
- 09 (w1) → 15 (w6): both edit the group composer (`GroupComposerBar.tsx`) and
  `prisma/schema/messaging.prisma`.
- 17 (w5) → 15 (w6) → 18 (w7): 17 edits `lib/chat-plus/receipts.server.ts` and `ChatOptionsSheet.tsx` (18 alone edits `ConversationView.tsx`); 15 and
  18 edit `lib/messages/send.server.ts`; 15 and 18 edit `messaging.prisma`.
- 05 (w3) → 06 (w6): both admin; 06 links nothing of 05's but both touch the
  admin area and `lib/admin/*`.
- 16 (w7) and 17 (w5) both edit `prisma/schema/profile.prisma`.

## Shared files and who touches them

| File                                                         | Kind                          | Who                                                                              |
| ------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------------- |
| `lib/i18n/config.ts` (`NAMESPACES`)                          | registry                      | **Wave 0 only**                                                                  |
| `locales/en/<ns>.json`                                       | generated (extract)           | each feature, its own file only; `feed.json` for labels (01, 05, 06, 07, 10, 11, 20) |
| `prisma/schema/auth.prisma` (`User`)                         | source, **anchored**          | 01, 07, 09, 18                                                                   |
| `prisma/schema/communities.prisma`                           | source                        | 01 (w1), 02 (w4)                                                                 |
| `prisma/schema/competitive.prisma`                           | source                        | 07 (w2), 20 (w5)                                                                 |
| `prisma/schema/rmhstudy.prisma`                              | source                        | 08 (w1), 13 (w6)                                                                 |
| `prisma/schema/messaging.prisma`                             | source                        | 09 (w1), 15 (w6), 18 (w7)                                                        |
| `prisma/schema/events.prisma`                                | source                        | 10 (w2), 11 (w4)                                                                 |
| `prisma/schema/social.prisma`                                | source                        | 19 (w3), 15 (w6), 16 (w7)                                                        |
| `prisma/schema/profile.prisma`                               | source                        | 17 (w5), 16 (w7)                                                                 |
| `prisma/schema/moderation.prisma`                            | source                        | 05                                                                               |
| `prisma/schema/builds.prisma`                                | source                        | 14                                                                               |
| `lib/account/deletion.server.ts`                             | source, **anchored**          | 01, 02, 05, 07, 09, 10, 11, 14, 18, 20                                           |
| `lib/account/export-sprint-06.server.ts`                     | new in Wave 0, **anchored**   | 01, 05, 07, 09, 11, 14, 18                                                       |
| `lib/account/api/account.export.server.ts`                   | source                        | **Wave 0 and integration only**                                                  |
| `lib/sitemap.ts`                                             | source, **anchored**          | 05 (personal and admin), 09 (`DYNAMIC_ROUTES`)                                   |
| `server/jobs/index.ts`                                       | source, **anchored**          | 11 (w4), 20 (w5)                                                                 |
| `components/feed/notification-labels.ts` + its test         | source, **anchored**          | 01, 05, 06, 07, 10, 11, 20                                                       |
| `app/routes/_site/admin/index.tsx`                           | source, **anchored**          | 05                                                                               |
| `lib/settings-nav.ts`, `settings-nav-labels.ts` + test       | source, **anchored**          | 05                                                                               |
| `lib/api/registry.ts`                                        | source, **anchored** (paths)  | 12, 13 (anchored); 19 (w3), 15 (w6), 16 (w7) post fields                         |
| `lib/api/scopes.ts`                                          | source                        | 12 (w3, no new scope expected), 13 (w6)                                          |
| `lib/communities/modlog.ts`, `components/communities/ModLog.tsx` | source                    | 01 (w1), 02 (w4)                                                                 |
| `components/feed/CommunityColumn.tsx`                        | source                        | 01 (w1), 02 (w4)                                                                 |
| `lib/communities/gate.server.ts`, join/invite/request paths  | source                        | 01                                                                               |
| `lib/moderation/report-constants.ts`, admin report resolver  | source                        | 07 (w2), 14 (w4)                                                                 |
| `lib/studio/store.ts`, `useKeybinds.ts`, `StudioShell.tsx`   | source                        | 03 (w2), 04 (w5)                                                                 |
| `lib/events.server.ts`, `EventCard.tsx`, `feed-entries.ts`   | source                        | 10 (w2), 11 (w4)                                                                 |
| `lib/feed/api/rmharks.server.ts`, `rmharks.$id.server.ts`    | source                        | 19 (w3), 15 (w6), 16 (w7)                                                        |
| `lib/feed/map-feed-item.server.ts`, `/api/v1/posts*`, `/api/v1/feed` | source                | 01 (w1, `posts/$id/comments.ts` POST only), 19 (w3), 15 (w6), 16 (w7)           |
| `components/feed/compose/*`, `EditPostModal.tsx`, `RMHarkCard.tsx` | source                  | 19 (w3: editor, state), 15 (w6), 16 (w7)                                         |
| `lib/rss.ts`, `app/routes/embed.post.$id.tsx`                | source                        | 15 (w6), 16 (w7)                                                                 |
| `lib/messages/send.server.ts`                                | source                        | 15 (w6), 18 (w7)                                                                 |
| `components/feed/ConversationView.tsx`                       | source                        | 18 (w7) (17 no longer needs it)                                                  |
| `components/feed/group-chat/*`                               | source                        | 09 (w1), 15 (w6)                                                                 |
| `lib/study/deck-editor.server.ts`, `lib/study.server.ts`     | source                        | 08 (w1), 13 (w6: extracts `createDeck`, `deleteDeck`) |
| `lib/tournaments/tournament.server.ts`, `BracketView.tsx`    | source                        | 20                                                                               |
| `lib/webhooks/events.ts`, `lib/achievements/engine.server.ts`, `lib/game/submit.server.ts` | source | 12                                                   |
| `app/routes/_site/settings/privacy.tsx`                      | source                        | 17 (also `lib/chat-plus/receipts.server.ts`, `ChatOptionsSheet.tsx`)          |
| `app/routes/_site/settings/content.tsx`                      | source                        | 16                                                                               |
| `components/admin/UserModerationPanel.tsx`                   | source                        | 06                                                                               |
| `lib/api/route-table.server.ts`                              | generated (`pnpm api:routes`) | each feature regenerates it; **integration regenerates on every merge**          |
| `app/routeTree.gen.ts`                                       | generated (vite)              | **integration only**                                                             |
| `docs/_generated/facts.json`, `docs/site-reference/*`        | generated                     | **integration only** (`pnpm facts:generate`, `pnpm docs:site`, `pnpm docs:api`)  |
| `lib/catalog/**`                                             | source                        | nobody (no new games or apps)                                                    |

## Migration timestamps

All additive; `.github/scripts/check-migrations-additive.mjs` must pass. Every
timestamp sorts after sprint 05's `20261125…`.

| Feature | Migration(s)                                                                                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01      | `20261126010000_s06_community_bans`                                                                                                                                        |
| 08      | `20261126010100_s06_deck_updates`                                                                                                                                          |
| 09      | `20261126010200_s06_group_invites`                                                                                                                                         |
| 07      | `20261126020100_s06_jam_feedback`                                                                                                                                          |
| 10      | `20261126020200_s06_event_occurrences`                                                                                                                                     |
| 05      | `20261126030000_s06_feedback_inbox`, `20261126030001_s06_feedback_status_index` (CONCURRENTLY, one statement), `20261126030002_s06_feedback_status_index_ensure_valid`    |
| 19      | `20261126030100_s06_ranked_polls`                                                                                                                                          |
| 02      | `20261126040000_s06_community_notes`                                                                                                                                       |
| 11      | `20261126040100_s06_event_updates`                                                                                                                                         |
| 14      | `20261126040200_s06_build_comments`                                                                                                                                        |
| 17      | `20261126050100_s06_read_receipts`                                                                                                                                         |
| 20      | `20261126050200_s06_match_results`, `20261126050201_s06_match_claim_index` (CONCURRENTLY), `20261126050202_s06_match_claim_index_ensure_valid`                            |
| 13      | `20261126060100_s06_flashcard_external_id`, `20261126060101_s06_flashcard_external_id_index` (CONCURRENTLY, unique), `20261126060102_s06_flashcard_external_id_index_ensure_valid` |
| 15      | `20261126060200_s06_gif_descriptions`                                                                                                                                      |
| 16      | `20261126070000_s06_content_warnings`                                                                                                                                      |
| 18      | `20261126070100_s06_away_message`                                                                                                                                          |

03, 04, 06 and 12 have no schema change. New tables get plain indexes in their
own migration. An index on an **existing** table is created `CONCURRENTLY` in a
migration that holds exactly one statement, followed by an `_ensure_valid`
migration (copy `prisma/migrations/20261124040100_s04_build_view_index` and
`20261124040103_s04_build_insights_indexes_ensure_valid`); `prisma migrate diff`
writes a plain `CREATE INDEX`, which the implementer moves into the concurrent
migration by hand. The `feedback` (05) and `flashcard` (13) and
`tournament_match` (20) indexes are such indexes.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-06`, never pushed until the sprint
  PR.
- Feature branch: `autonomous/s06-<slug>` from the sprint branch **as it is when
  the wave starts**.
- Worktree: `/home/user/wt/s06-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge or
  rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite and product files, plus the gate
   tests that cover what they touched (route table, API handler adoption,
   raw-fetch ratchet, i18n catalogs and drift, the computed-key ratchet, the
   native-dialog ratchet, sitemap and OG coverage, test discovery, design
   consistency and Steel flat when UI changed, the rAF allowlist, the
   escape-hatch ratchet, tsconfig projects, server-fn guards, the
   migration-safety test when a migration was added, the feature's own
   read-path registry test).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed
   from the wave's base schema, and the additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file (and
   `feed.json` for the label features).
5. `pnpm api:routes` when an endpoint module was added, moved or removed.
6. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s06-<slug>`. On a conflict in a generated file,
   take either side and regenerate; anchored files should not conflict (if one
   does, keep both features' blocks under their anchors).
2. Regenerate: `pnpm api:routes`; the route tree (start
   `pnpm exec vite --port 7999 --strictPort`, wait until `app/routeTree.gen.ts`
   changes, stop it — 05 and 09 add route files, 12 and 13 add v1 route files);
   `pnpm facts:generate`; `pnpm docs:site`; `pnpm docs:api`.
3. `pnpm exec prisma generate`, then `pnpm exec tsc -b --checkers 1` alone.
4. `pnpm test` and `pnpm test:product`.
5. **Raw SQL and lock smoke test** for every `lockKey` user and any raw SQL:
   apply the migrations to a throwaway Postgres (the integration suite's,
   `docs/testing.md` §8) and run each new query once; for 20, run the claim
   settlement job's query against a seeded match.
6. Review the diff against the brief and the specification's acceptance
   criteria; fix or send back. Check every read path the feature names: 01
   (`BAN_ENFORCEMENT_PATHS`), 10 (`OCCURRENCE_READ_PATHS`), 14
   (`BUILD_COMMENT_READ_PATHS`), 15 (`GIF_ALT_READ_PATHS`), 16
   (`CONTENT_WARNING_READ_PATHS`), 17 (`READ_RECEIPT_READ_PATHS`).
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Confirm `exportSprint06` carries 01, 05, 07, 09, 11, 14 and 18's sections, and add
  13's `externalId`, 16's and 17's preferences to the export where it lists
  fields explicitly.
- `pnpm check:consistency --base main`, `pnpm typecheck`,
  `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`, `pnpm build` with
  `scripts/check-bundle-budget.ts`, and a real-browser pass over every new or
  changed page in Day and Night at 390 px and 1280 px, and once in `ar`; the
  Studio (03, 04) in its own app look.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code
lines (TypeScript, TSX, SQL, CSS) separately from documentation lines, measured
with `git diff --numstat` from the sprint 05 merge commit to `HEAD` (or from
`origin/main` if sprint 05 had landed on `main` before Wave 0), filtered by
extension, excluding generated files (`routeTree.gen.ts`,
`route-table.server.ts`, `facts.json`, `docs/site-reference/**`, `locales/**`).
