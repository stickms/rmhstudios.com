# Sprint 05 — implementation plan

How the twenty features are built: seven waves of at most three concurrent
implementers, each in its own git worktree and branch, merged into the sprint
branch `claude/autonomous-sprint-05` by one integration owner between waves. The
machine budget and the per-feature checks are sprint 04's
(`docs/autonomous/sprint-04/plan.md`), restated so this file stands alone.

## Precondition: sprint 04 is in the sprint branch

**Status: satisfied.** `claude/autonomous-sprint-05` was re-cut from
`origin/claude/autonomous-sprint-04` at sprint 04's squashed integration commit
`98a890ce7` (PR #1775, awaiting the owner's merge into `main`). When that squash
lands on `main`, integration merges `origin/main` into this branch; the content
is identical, so the merge is conflict-free. The paragraph below records why the
order matters.

`claude/autonomous-sprint-05` was cut from `origin/main` while sprint 04 was
still integrating on `claude/autonomous-sprint-04`. Before Wave 0 is committed,
integration merges sprint 04 in — `git merge origin/main` once sprint 04 has
landed on `main`, or `git merge claude/autonomous-sprint-04` if it has not. Wave
1 does not start until this is done, because:

- the Wave 0 anchors go **after** sprint 04's anchor blocks in
  `lib/account/deletion.server.ts`, `prisma/schema/auth.prisma`,
  `lib/sitemap.ts` and `server/jobs/index.ts`, and the notification-label
  anchors go into sprint 04's `components/feed/notification-labels.ts` (it does
  not exist on `main` before sprint 04);
- `lib/db/advisory-lock.server.ts` (`lockKey`) is sprint 04's Wave 0 helper and
  every cap below uses it;
- 05 extends sprint 04's event waitlist (`lib/events/waitlist.server.ts`,
  `WaitlistPanel.tsx`); 08 and 18 build on sprint 04's tournament check-in
  (`startTournament` only starts checked-in entrants;
  `CreateTournamentDialog.tsx` and `competitive.prisma` changed); 07 and 16 edit
  `lib/feed/timeline.ts` and post serialisers that sprint 04's quiet counts and
  poll lifecycle changed; 14 edits the settings nav after sprint 04's replay
  library; 06 and 12 avoid `window.prompt`/`confirm` per sprint 04's
  native-dialog ratchet (`usePrompt`, `useConfirm`);
- the migration timestamps below sort after sprint 04's `20261124…`;
- sprint 04's `.prettierignore` and `lib/i18n/config.ts` blocks sit where Wave 0
  adds sprint 05's; take both sides on conflict.

## Machine budget

4 cores and 15 GB. A cold `tsc -b` of the site project peaks around 10 GB, so
**implementers never run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`,
`pnpm dev` or `vite`.** They run targeted vitest files, eslint on their changed
files and the commit gate (`--fast`, about 1 GB; it skips `tsc`). They never run
prettier over files that existed before (reformatting causes merge conflicts);
new files may be formatted. Integration runs the one full typecheck after each
merge, alone. Each worktree has its own `node_modules`
(`pnpm install --frozen-lockfile --offline`, hard-linked from the store), so one
feature's `prisma generate` never changes another's client.

## Wave 0 — scaffolding (integration commits it before Wave 1)

1. The precondition merge above.
2. **Namespaces.** Append to `NAMESPACES` in `lib/i18n/config.ts`, after sprint
   04's block, one per line under the comment `// Sprint 05
   (docs/autonomous/sprint-05): one namespace per feature.`:
   `leaderboard-privacy`, `admin-jobs`, `admin-outbox`, `personal-bests`,
   `event-cohosts`, `studio-projects`, `repost-mutes`, `double-elimination`,
   `flashcard-types`, `admin-lookup`, `rmhtube-playlists`, `saved-replies`,
   `blocked-muted`, `jam-teams`, `alt-text-editing`, `community-alerts`,
   `tournament-seeding`, `profile-pins`, `study-reminders` (19 namespaces; 11
   writes none). Create each `locales/en/<ns>.json` containing `{}` and a
   newline. Run `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts
   lib/__tests__/i18n-config.test.ts` to check the registry accepts empty
   catalogues.
3. **Anchors** — so that two features of one wave never edit the same lines of a
   shared file. Each anchor is a comment line followed by one blank line; a
   feature keeps **its own anchor line** and adds its code directly below it.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of
     `anonymizeAccount`, directly after sprint 04's last anchor block: a header
     comment `// Sprint 05 erasures (docs/autonomous/sprint-05/plan.md
     §Anchors): each feature adds its operations under its own line.` then
     `// s05-01 leaderboard-privacy`, `// s05-04 personal-bests`,
     `// s05-05 event-cohosts`, `// s05-06 studio-projects`,
     `// s05-07 repost-mutes`, `// s05-13 saved-replies`,
     `// s05-14 blocked-muted-accounts`, `// s05-15 jam-teams`,
     `// s05-17 community-post-alerts`, `// s05-20 flashcard-reminders`.
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields,
     after sprint 04's block:
     `// Sprint 05 back-relations (one block per feature)` then
     `// s05-04 personal-bests`, `// s05-05 event-cohosts`,
     `// s05-06 studio-projects`, `// s05-07 repost-mutes`,
     `// s05-13 saved-replies`, `// s05-15 jam-teams`,
     `// s05-20 flashcard-reminders`. Run `pnpm -s exec prisma validate` (dummy
     `DATABASE_URL`).
   - `lib/sitemap.ts`, `EXCLUDED_ROUTES`: at the end of the personal block,
     `// Sprint 05` then `// s05-14 blocked-muted-accounts`
     (`/settings/blocked`); at the end of the admin block,
     `// Sprint 05 admin pages` then `// s05-02 admin-jobs` (`/admin/jobs`),
     `// s05-03 admin-outbox` (`/admin/outbox`), `// s05-10 admin-lookup`
     (`/admin/lookup`). **Param-less paths go in `EXCLUDED_ROUTES`, never
     `DYNAMIC_ROUTES`.** No feature adds a `$param` page.
   - `server/jobs/index.ts`, at the end of `REGISTRATIONS`: `// Sprint 05` then
     `// s05-17 community-post-alerts` and `// s05-20 flashcard-reminders`.
     (Each also adds one import at the top; 17 and 20 are in different waves.)
   - `components/feed/notification-labels.ts`, in `systemLabels`'s returned
     object directly before `default:`: `// Sprint 05 system labels` then
     `// s05-05 event-cohosts`, `// s05-15 jam-teams`,
     `// s05-17 community-post-alerts`, `// s05-20 flashcard-reminders`; and the
     same four anchor lines in
     `components/feed/__tests__/notification-labels.test.ts` where it pins each
     label's key and English text. Labels are literal `t('system-label-<type>',
     { ns: 'feed', defaultValue: '…' })` calls (the sprint 04 ratchet rejects
     computed keys, ternaries included) and land in `locales/en/feed.json`.
   - `app/routes/_site/admin/index.tsx`, in the hub's card grid directly after
     `<AdminMedSchoolsLink />` (before the closing `</div>`):
     `{/* Sprint 05 admin tools */}` then `{/* s05-02 admin-jobs */}`,
     `{/* s05-03 admin-outbox */}`, `{/* s05-10 admin-lookup */}`. Each feature
     adds one `<AdminHubCard to=… title={t('hub-card-title', { ns: '<its
     namespace>', defaultValue: … })} … />` below its anchor; the `t()` calls
     sit inside the element's props, never directly after a `{/* */}` comment
     (the extractor skips a `t()` that immediately follows a JSX comment). 10
     also adds its lookup field above the grid (outside the anchors, the only
     feature that does).
4. **No new shared helper.** `lockKey` (sprint 04) serves every cap;
   `useConfirm` and `usePrompt` (sprint 04) every confirmation and text prompt;
   `components/ui/tabs.tsx` every tab strip; the chart primitives
   (`bar-chart.tsx`, `line-chart.tsx`) every chart; `lib/calendar/tz.ts` every
   time-zone computation; `formatRelativeTime` and
   `components/ui/RelativeTime.tsx` every relative time.
5. `.prettierignore` gains `/docs/autonomous/sprint-05/` and
   `docs/autonomous/README.md` gains the sprint 05 row (both done in these
   documents, on top of `main`; the precondition merge must keep sprint 04's
   block and row before them).
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

## Waves

| Wave | Slot A                    | Slot B                      | Slot C                     |
| ---- | ------------------------- | --------------------------- | -------------------------- |
| 1    | 01 leaderboard-privacy    | 06 studio-projects          | 08 double-elimination      |
| 2    | 07 repost-mutes           | 09 flashcard-types          | 02 admin-jobs              |
| 3    | 05 event-cohosts          | 12 rmhtube-playlist-queue   | 18 tournament-seeding      |
| 4    | 16 alt-text-editing       | 20 flashcard-reminders      | 03 admin-outbox            |
| 5    | 04 personal-bests         | 13 saved-replies            | 15 jam-teams               |
| 6    | 19 profile-pins           | 14 blocked-muted-accounts   | 17 community-post-alerts   |
| 7    | 11 locale-formatting      | 10 admin-lookup             | —                          |

Dependencies that fix the order:

- 08 → 18: both change `startTournament`, `prisma/schema/competitive.prisma`,
  `CreateTournamentDialog.tsx`, `BracketView.tsx` and `tournament-schema.ts`; 18
  seeds 08's double elimination. 15 also edits `competitive.prisma` (jam models)
  in wave 5.
- 09 → 20: both edit `prisma/schema/rmhstudy.prisma`; 20 counts 09's generated
  cards as due cards and stamps reviews in the review endpoints 09 touches.
- 07 → 16 → 19: all three edit `components/feed/RMHarkOverflowMenu.tsx`; 07 and
  16 add sections to `app/routes/_site/settings/content.tsx`; 16 and 19 touch
  post serialisers (`map-feed-item.server.ts`, `/api/v1/posts*`).
- 02 → 03 → 10: admin pages; 03 reuses 02's JSON block and truncation helper;
  each adds an admin hub card under its anchor; 10 resolves outbox events (03).
- 01 before 04: both in `lib/game/`; 04 reads boards' personal-best path
  (`personalBest`) that 01 must leave intact, and `GamePage.tsx` changes in 04
  only.
- 05 after sprint 04's waitlist (precondition); 05 changes `assertHostOrAdmin`.
- 14 after 07: 14 deletes nothing of 07's, but both touch the settings area and
  07's block hook (`moderation.block.server.ts`) — 14 extends that endpoint's
  schema.
- 17 after 19 in the same wave is safe: 17 edits
  `lib/feed/api/rmharks.server.ts` (create), 19 edits
  `rmharks.$id.pin.server.ts`; different files.
- 11 runs last because it sweeps about 150 component files that every other
  feature may change; 10 adds only new files and anchored lines, so it can share
  wave 7.

## Shared files and who touches them

| File                                                    | Kind                          | Who                                                                                                    |
| ------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `lib/i18n/config.ts` (`NAMESPACES`)                     | registry                      | **Wave 0 only**                                                                                        |
| `locales/en/<ns>.json`                                  | generated (extract)           | each feature, its own file only; `feed.json` for the four notification labels (05, 15, 17, 20)        |
| `prisma/schema/auth.prisma` (`User`)                    | source, **anchored**          | 04, 05, 06, 07, 13, 15, 20                                                                             |
| `prisma/schema/profile.prisma`                          | source                        | 01                                                                                                     |
| `prisma/schema/competitive.prisma`                      | source                        | 08 (w1), 18 (w3), 15 (w5)                                                                              |
| `prisma/schema/rmhstudy.prisma`                         | source                        | 09 (w2), 20 (w4)                                                                                       |
| `prisma/schema/social.prisma`                           | source                        | 07                                                                                                     |
| `prisma/schema/events.prisma`                           | source                        | 05                                                                                                     |
| `prisma/schema/games.prisma`                            | source                        | 04                                                                                                     |
| `prisma/schema/messaging.prisma`                        | source                        | 13                                                                                                     |
| `prisma/schema/communities.prisma`                      | source                        | 17                                                                                                     |
| `prisma/schema/studio.prisma`                           | new                           | 06                                                                                                     |
| `lib/account/deletion.server.ts`                        | source, **anchored**          | 01, 04, 05, 06, 07, 13, 14, 15, 17, 20                                                                 |
| `lib/sitemap.ts`                                        | source, **anchored**          | 02, 03, 10 (admin block); 14 (personal block)                                                          |
| `server/jobs/index.ts`                                  | source, **anchored**          | 17 (w6), 20 (w4)                                                                                       |
| `components/feed/notification-labels.ts` + its test    | source, **anchored**          | 05, 15, 17, 20                                                                                         |
| `app/routes/_site/admin/index.tsx`                      | source, **anchored**          | 02, 03, 10                                                                                             |
| `components/feed/RMHarkOverflowMenu.tsx`                | source                        | 07 (w2), 16 (w4), 19 (w6)                                                                              |
| `app/routes/_site/settings/content.tsx`                 | source                        | 07 (w2), 16 (w4)                                                                                       |
| `app/routes/_site/settings/privacy.tsx`                 | source                        | 01                                                                                                     |
| `lib/settings-nav.ts`, `settings-nav-labels.ts` + test  | source                        | 14                                                                                                     |
| `lib/feed/timeline.ts`                                  | source                        | 07                                                                                                     |
| `lib/feed/map-feed-item.server.ts`, `/api/v1/posts*`    | source                        | 16 (w4), 19 (w6)                                                                                       |
| `lib/feed/api/rmharks.server.ts`                        | source                        | 17                                                                                                     |
| `lib/tournaments/*`, `components/tournaments/*`         | source                        | 08 (w1), 18 (w3)                                                                                       |
| `lib/events.server.ts`, `lib/events/waitlist.server.ts` | source                        | 05                                                                                                     |
| `lib/game/adapters.server.ts`, leaderboard routes       | source                        | 01                                                                                                     |
| `lib/game/submit.server.ts`, `components/steam/GamePage.tsx` | source                   | 04                                                                                                     |
| `lib/study/*`                                           | source                        | 09 (w2), 20 (w4)                                                                                       |
| `lib/moderation/api/moderation.block.server.ts`         | source                        | 07 (w2: delete repost mute on block), 14 (w6: explicit intent field)                                  |
| `components/**`, `app/**`, `features/*/ui/**` call sites | source (sweep)               | 11 (w7) only changes formatting calls                                                                  |
| `lib/api/route-table.server.ts`                         | generated (`pnpm api:routes`) | each feature regenerates it; **integration regenerates on every merge**                                |
| `app/routeTree.gen.ts`                                  | generated (vite)              | **integration only**                                                                                   |
| `docs/_generated/facts.json`, `docs/site-reference/*`   | generated                     | **integration only** (`pnpm facts:generate`, `pnpm docs:site`, `pnpm docs:api`)                        |
| `lib/account/api/account.export.server.ts`              | source                        | **integration only**: features export an `export…(userId)` function; integration wires them           |
| `lib/i18n/config.ts`, `lib/catalog/**`                  | source                        | nobody after Wave 0 (no new games or apps)                                                             |

## Migration timestamps

All additive; `.github/scripts/check-migrations-additive.mjs` must pass. Every
timestamp sorts after sprint 04's `20261124…`.

| Feature | Migration(s)                                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01      | `20261125010000_s05_leaderboard_privacy`                                                                                                                          |
| 06      | `20261125010100_s05_studio_projects`                                                                                                                              |
| 08      | `20261125010200_s05_double_elimination`                                                                                                                           |
| 07      | `20261125020000_s05_repost_mutes`                                                                                                                                 |
| 09      | `20261125020100_s05_flashcard_card_types`, `20261125020101_s05_flashcard_source_index` (CONCURRENTLY, one statement), `20261125020102_s05_flashcard_source_index_ensure_valid` |
| 05      | `20261125030000_s05_event_cohosts`                                                                                                                                |
| 18      | `20261125030200_s05_tournament_seeding`                                                                                                                           |
| 20      | `20261125040100_s05_flashcard_reminders`                                                                                                                          |
| 04      | `20261125050000_s05_personal_bests`                                                                                                                               |
| 13      | `20261125050100_s05_saved_replies`                                                                                                                                |
| 15      | `20261125050200_s05_jam_teams`                                                                                                                                    |
| 17      | `20261125060200_s05_community_post_alerts`, `20261125060201_s05_community_member_alerts_index` (CONCURRENTLY), `20261125060202_s05_community_member_alerts_index_ensure_valid` |

02, 03, 10, 11, 12, 14, 16 and 19 have no schema change. A
`CREATE INDEX CONCURRENTLY` migration holds exactly one statement and is
followed by an `_ensure_valid` migration (copy
`prisma/migrations/20261124040100_s04_build_view_index` and
`20261124040103_s04_build_insights_indexes_ensure_valid`); `prisma migrate diff`
writes a plain `CREATE INDEX`, which the implementer moves into the concurrent
migration by hand.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-05`, never pushed until the sprint
  PR.
- Feature branch: `autonomous/s05-<slug>` from the sprint branch **as it is when
  the wave starts**.
- Worktree: `/home/user/wt/s05-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge or
  rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite and product files, plus the gate
   tests that cover what they touched (route table, API handler adoption,
   raw-fetch ratchet, i18n catalogs and drift, the computed-key ratchet, the
   native-dialog ratchet, sitemap and OG coverage, test discovery, design
   consistency and Steel flat when UI changed, the rAF allowlist, the
   escape-hatch ratchet, tsconfig projects, the migration-safety test when a
   migration was added).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed
   from the wave's base schema, and the additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file (and
   `feed.json` for the four label features).
5. `pnpm api:routes` when an endpoint module was added, moved or removed.
6. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s05-<slug>`. On a conflict in a generated file,
   take either side and regenerate; anchored files should not conflict (if one
   does, keep both features' blocks under their anchors).
2. Regenerate: `pnpm api:routes`; the route tree (start
   `pnpm exec vite --port 7999 --strictPort`, wait until `app/routeTree.gen.ts`
   changes, stop it — 02, 03, 10 and 14 add route files); `pnpm facts:generate`;
   `pnpm docs:site`; `pnpm docs:api`.
3. `pnpm exec prisma generate`, then `pnpm exec tsc -b --checkers 1` alone.
4. `pnpm test` and `pnpm test:product`.
5. **Raw SQL smoke test** for 02 (the `pgboss.job` / `pgboss.schedule` reads,
   against a database where the jobs worker has created its schema), 17
   (recipient query, if raw), 19 and 07 if they used raw SQL, and every
   `lockKey` user: apply the migrations to a throwaway Postgres (the integration
   suite's, `docs/testing.md` §8) and run each new query once.
6. Review the diff against the brief and the specification's acceptance
   criteria; fix or send back. Check every read path the feature names: 01
   (every leaderboard), 07 (both timelines), 16 and 19 (feed, post page, embeds,
   RSS, `/api/v1/posts*`).
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Wire the export functions into `lib/account/api/account.export.server.ts` in
  one commit: `exportPersonalBests` (04), `exportStudioProjects` (06),
  `exportRepostMutes` (07), `exportSavedReplies` (13), `exportStudyReminder`
  (20). 01's column rides on the `UserProfile` row if the export selects it (add
  it if fields are listed explicitly). Co-host rows (05), jam teams (15) and
  community alert settings (17) are relationships already represented by the
  export's events, jams and memberships; add them only if those sections list
  fields explicitly.
- `pnpm check:consistency --base main`, `pnpm typecheck`,
  `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`, `pnpm build` with
  `scripts/check-bundle-budget.ts`, and a real-browser pass over every new or
  changed page in Day and Night at 390 px and 1280 px, and once in `ar`; the
  Studio (06) and RMHTube (12) in their own app looks.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code
lines (TypeScript, TSX, SQL, CSS) separately from documentation lines, measured
with `git diff --numstat` from the sprint 04 merge commit to `HEAD` (or from
`origin/main` if sprint 04 had landed on `main` before Wave 0), filtered by
extension, excluding generated files (`routeTree.gen.ts`,
`route-table.server.ts`, `facts.json`, `docs/site-reference/**`, `locales/**`).
