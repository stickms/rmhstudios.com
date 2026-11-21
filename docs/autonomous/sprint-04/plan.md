# Sprint 04 — implementation plan

How the twenty features are built: seven waves of at most three concurrent
implementers, each in its own git worktree and branch, merged into the sprint
branch `claude/autonomous-sprint-04` by one integration owner between waves.
The machine budget and the per-feature checks are sprint 03's
(`docs/autonomous/sprint-03/plan.md`), restated here so this file stands
alone.

## Precondition: sprint 03 is in the sprint branch

**Status: satisfied.** Sprint 03 landed on `main` (#1769, `285b92736`) and
`claude/autonomous-sprint-04` was re-cut from it before Wave 0. The paragraph
below records why the order mattered.

`claude/autonomous-sprint-04` was cut from `origin/main` (sprint 02 merged)
while sprint 03 was still integrating. Before Wave 0 is committed,
integration merges sprint 03 into it — `git merge origin/main` once sprint 03
has landed on `main`, or `git merge claude/autonomous-sprint-03` if it has
not. Wave 1 does not start until this is done, because:

- the Wave 0 anchors go **after** sprint 03's anchor blocks in
  `lib/account/deletion.server.ts`, `prisma/schema/auth.prisma`,
  `lib/sitemap.ts`, `server/jobs/index.ts` and the `systemIdentity` switch of
  `components/feed/NotificationsColumn.tsx`;
- 16 builds on sprint 03's `lib/messages/send.server.ts` (12 send-later) and
  its re-checks at delivery;
- 17 logs through sprint 03's community moderation log
  (`lib/communities/modlog*.ts`, 14) and member events (15);
- 01 sits on the game library page that sprint 03's game updates (10)
  changed, and 10 relies on sprint 03's scheduled messages failing for a
  removed member;
- 12 and 20 follow sprint 03's server-function guard audit
  (`lib/auth/server-fn-guards.server.ts`);
- the migration timestamps below sort after sprint 03's `20261123…`;
- sprint 03's `.prettierignore` and `lib/i18n/config.ts` blocks sit where
  Wave 0 adds sprint 04's; take both sides on conflict.

## Machine budget

4 cores and 15 GB. A cold `tsc -b` of the site project peaks around 10 GB, so
**implementers never run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`,
`pnpm dev` or `vite`.** They run targeted vitest files, eslint on their changed
files and the commit gate (`--fast`, about 1 GB; it skips `tsc`). They never
run prettier over files that existed before (reformatting causes merge
conflicts); new files may be formatted. Integration runs the one full
typecheck after each merge, alone. Each worktree has its own `node_modules`
(`pnpm install --frozen-lockfile --offline`, hard-linked from the store), so
one feature's `prisma generate` never changes another's client.

## Wave 0 — scaffolding (integration commits it before Wave 1)

1. The precondition merge above.
2. **Namespaces.** Append to `NAMESPACES` in `lib/i18n/config.ts`, after
   sprint 03's block, one per line under the comment
   `// Sprint 04 (docs/autonomous/sprint-04): one namespace per feature.`:
   `replay-library`, `event-waitlist`, `tournament-checkin`,
   `build-releases`, `build-insights`, `coin-adjustments`, `spending-budget`,
   `poll-lifecycle`, `reading-sync`, `group-chat-admin`,
   `achievement-compare`, `rmhbox-stats`, `rmhbox-presets`, `quiet-counts`,
   `message-requests`, `community-handover`, `follow-list-privacy`,
   `flag-targeting` (18 namespaces; 15 and 19 write into existing ones).
   Create each `locales/en/<ns>.json` containing `{}` and a newline. Run
   `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts
   lib/__tests__/i18n-config.test.ts` to check the registry accepts empty
   catalogues.
3. **Anchors** — so that two features of one wave never edit the same lines
   of a shared file. Each anchor is a comment line followed by one blank line;
   a feature keeps **its own anchor line** and adds its code directly below
   it, and git merges the waves without conflicts because the hunks never
   touch.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of
     `anonymizeAccount`, directly after sprint 03's last anchor block: a
     header comment `// Sprint 04 erasures (docs/autonomous/sprint-04/plan.md
     §Anchors): each feature adds its operations under its own line.` then
     `// s04-01 replay-library`, `// s04-05 build-insights`,
     `// s04-06 coin-adjustments`, `// s04-07 spending-budget`,
     `// s04-09 reading-sync`, `// s04-13 rmhbox-presets`,
     `// s04-16 message-requests`, `// s04-17 community-handover`,
     `// s04-20 flag-targeting`.
   - `lib/account/deletion.server.ts`, in `anonymizeAccount` **before** the
     `await prisma.$transaction([` line and after the `DELETED_USER_ID`
     guard: `// Sprint 04 pre-erasure steps: logic that must read before it
     writes (each idempotent, so a re-run of a failed sweep is safe).` then
     `// s04-02 event-waitlist` and `// s04-10 group-chat-admin`.
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation
     fields, after sprint 03's block: `// Sprint 04 back-relations (one block
     per feature)` then `// s04-06 coin-adjustments`,
     `// s04-09 reading-sync`, `// s04-13 rmhbox-presets`,
     `// s04-16 message-requests`, `// s04-17 community-handover`. Run
     `pnpm -s exec prisma validate` (dummy `DATABASE_URL`) to be sure the
     comments are accepted.
   - `lib/sitemap.ts`, `EXCLUDED_ROUTES` (static paths), at the end of its
     personal block: `// Sprint 04` then `// s04-01 replay-library`
     (`/settings/replays`), `// s04-11 achievement-compare`
     (`/progress/compare`), `// s04-16 message-requests`
     (`/messages/requests`). **Param-less paths go here, never in
     `DYNAMIC_ROUTES`** (sprint 03 put static paths in `DYNAMIC_ROUTES`,
     which rejects them).
   - `lib/sitemap.ts`, `DYNAMIC_ROUTES` (paths with a `$param`), after
     sprint 03's block: `// Sprint 04 (docs/autonomous/sprint-04/plan.md
     §Anchors)` then `// s04-05 build-insights`
     (`/create/builds/$slug/insights`), `// s04-12 rmhbox-stats`
     (`/rmhbox/players/$userId`).
   - `server/jobs/index.ts`, at the end of `REGISTRATIONS`: `// Sprint 04`
     then `// s04-03 tournament-checkin` and `// s04-08 poll-lifecycle`.
     (Each also adds one import at the top of the file; 03 and 08 are in
     different waves, so those lines never collide.)
   - `components/feed/NotificationsColumn.tsx`, in `systemIdentity`'s
     `switch`, directly before `default:`: `// Sprint 04 system labels` then
     `// s04-02 event-waitlist`, `// s04-03 tournament-checkin`,
     `// s04-04 build-releases`, `// s04-08 poll-lifecycle`,
     `// s04-10 group-chat-admin`, `// s04-17 community-handover`. (15 in
     wave 7 rewrites this function's keys as literals, all labels included.)
4. **Shared helper.** `lib/db/advisory-lock.server.ts`:

   ```ts
   export async function lockKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
     await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
   }
   ```

   with a main-suite test asserting the SQL
   (`lib/db/__tests__/advisory-lock.test.ts`). 02, 07, 09, 10, 13, 16 and 17
   use it for their check-then-write caps (the sprint 02/03 lesson); the nine
   existing inline uses are left alone.
5. `.prettierignore` gains `/docs/autonomous/sprint-04/` (done in these
   documents); `docs/autonomous/README.md` gains the sprint 04 row ("Games,
   builds, coins, the feed and the gaps between them: twenty features").
6. No other shared UI primitive: features reuse sprint 02's charts
   (`components/ui/bar-chart.tsx`, `line-chart.tsx`), `components/ui/tabs.tsx`
   for every tab strip or segmented filter, `components/ui/confirm-dialog.tsx`
   (`useConfirm`), `components/ui/switch.tsx`, `select.tsx`, `dialog.tsx`,
   and the time helpers in `lib/calendar/tz.ts`. 19 adds `usePrompt` and
   `useCopyFallback` in wave 7; earlier features use `useConfirm` and their
   own dialogs, never `window.prompt`.
7. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

## Waves

Three features per wave, chosen so that features built at the same time touch
different shared files (table below; the anchored files are the one
exception, by design). Within a wave the order does not matter; waves are
merged in order.

| Wave | Slot A                   | Slot B                  | Slot C                  |
| ---- | ------------------------ | ----------------------- | ----------------------- |
| 1    | 06 coin-adjustments      | 09 reading-sync         | 02 event-waitlist       |
| 2    | 07 spending-budget       | 04 build-releases       | 18 follow-list-privacy  |
| 3    | 16 message-requests      | 01 replay-library       | 03 tournament-checkin   |
| 4    | 10 group-chat-admin      | 05 build-insights       | 14 quiet-counts         |
| 5    | 08 poll-lifecycle        | 12 rmhbox-stats         | 17 community-handover   |
| 6    | 13 rmhbox-presets        | 11 achievement-compare  | 20 flag-targeting       |
| 7    | 15 i18n-computed-keys    | 19 native-dialogs       | —                       |

Dependencies that fix the order:

- 04 → 05: insights mark 04's releases on the chart; both edit
  `prisma/schema/builds.prisma` and the build page owner controls.
- 06 → 07: both touch the economy (`lib/economy/`), and 07 must exclude 06's
  `ADMIN` debits from spending; 06 also removes the coin `prompt` from
  `app/routes/_site/admin/users.tsx` before 19 replaces the others.
- 18 → 16 → 14: all three add a column to `UserProfile`
  (`prisma/schema/profile.prisma`); 18 and 16 both add a control to
  `components/feed/profile-edit/PrivacySection.tsx` and a field to the profile
  update path (`lib/profile-schema.ts`, `lib/api/routes/profile.server.ts`,
  `useProfileSave.ts`).
- 14 → 08: both change the post serialisers
  (`lib/feed/map-feed-item.server.ts` and the `/api/v1/posts*` route files).
- 12 → 13: both RMHBox; 12 changes the header menu and history routes, 13 the
  settings form and `prisma/schema/games/rmhbox.prisma`.
- 09 → 15 and 09 → 19: 09 changes the library readers and `/library`, which
  15 (`BookReader.tsx`) and 19 (`LibraryCollections.tsx`,
  `LibraryEditControls.tsx`, `library/index.tsx`) touch later.
- 02, 03, 04, 08, 10, 17 → 15: each adds a system label under its anchor in
  `NotificationsColumn.tsx`; 15 then converts every label to literal keys.
- 15 and 19 run last because they sweep many files other features change.
- Sprint 03 → everything (precondition).

## Shared files and who touches them

| File                                                    | Kind                          | Who                                                                                                   |
| ------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `lib/i18n/config.ts` (`NAMESPACES`)                     | registry                      | **Wave 0 only**; nobody edits it again                                                                |
| `locales/en/<ns>.json`                                  | generated (extract)           | each feature, **its own file only**; 15 writes several existing catalogs by design                    |
| `prisma/schema/<domain>.prisma`                         | source                        | the feature named in its brief; never two features on one file in a wave                              |
| `prisma/schema/auth.prisma` (`User`)                    | source, **anchored**          | 06, 09, 13, 16, 17 under their anchors; 07 edits `UserPlayLimits` (another model in the file)         |
| `prisma/schema/profile.prisma` (`UserProfile`)          | source                        | 18 (w2), 16 (w3), 14 (w4)                                                                             |
| `lib/account/deletion.server.ts` (`anonymizeAccount`)   | source, **anchored**          | 01, 05, 06, 07, 09, 13, 16, 17, 20 in the transaction; 02, 10 in the pre-step block                   |
| `lib/sitemap.ts`                                        | source, **anchored**          | `EXCLUDED_ROUTES`: 01, 11, 16; `DYNAMIC_ROUTES`: 05, 12                                               |
| `server/jobs/index.ts` (`REGISTRATIONS`)                | source, **anchored**          | 03 (w3), 08 (w5)                                                                                      |
| `components/feed/NotificationsColumn.tsx`               | source, **anchored**          | 02, 03, 04, 08, 10, 17 under their anchors; 15 (w7) converts the keys                                 |
| `lib/settings-nav.ts`, `settings-nav-labels.ts`         | source                        | 01 only                                                                                               |
| `lib/feed/map-feed-item.server.ts`, `/api/v1/posts*`    | source                        | 14 (w4), 08 (w5)                                                                                      |
| `components/feed/profile-edit/PrivacySection.tsx`       | source                        | 18 (w2), 16 (w3)                                                                                      |
| `lib/economy/ledger-core.ts`                            | source                        | 07 only (06 calls the ledger, never edits it)                                                         |
| `app/routes/_site/admin/users.tsx`                      | source                        | 06 (w1), 19 (w7)                                                                                      |
| `components/user-builds/BuildDetail.tsx`                | source                        | 04 (w2), 05 (w4)                                                                                      |
| `components/rmhbox/*`                                   | source                        | 12 (w5), 13 (w6)                                                                                      |
| `lib/api/openapi.ts`                                    | source                        | 04 (w2), 18 (w2, a different section — merge both), 14 (w4)                                          |
| `lib/og/static-cards.ts`                                | source                        | 12 if it needs a section card                                                                         |
| `prisma/migrations/<timestamp>_s04_<slug>/`             | source                        | the feature; timestamps fixed below                                                                   |
| `lib/api/route-table.server.ts`                         | generated (`pnpm api:routes`) | each feature regenerates it; **integration regenerates on every merge** and takes no side in a conflict |
| `app/routeTree.gen.ts`                                  | generated (vite)              | **integration only**; implementers never stage it                                                     |
| `docs/_generated/facts.json`, `docs/site-reference/*`   | generated                     | **integration only** (`pnpm facts:generate`, `pnpm docs:site`, `pnpm docs:api`)                       |
| `lib/account/api/account.export.server.ts`              | source                        | **integration only**: features export an `export…(userId)` function; integration wires them           |
| `lib/i18n/config.ts`, `lib/catalog/**`                  | source                        | nobody after Wave 0 (no new games or apps)                                                            |

04 and 18 both touch `lib/api/openapi.ts` in wave 2 (build releases;
follower-list refusals). Their hunks are in different sections; if git
reports a conflict, keep both.

Migration timestamps (all additive;
`.github/scripts/check-migrations-additive.mjs` must pass):

| Feature | Migration                                   |
| ------- | ------------------------------------------- |
| 06      | `20261124010000_s04_coin_adjustments`       |
| 09      | `20261124010100_s04_reader_marks`           |
| 02      | `20261124010200_s04_event_waitlist`         |
| 07      | `20261124020000_s04_spending_budget`        |
| 04      | `20261124020100_s04_build_releases`         |
| 18      | `20261124020200_s04_follow_list_privacy`    |
| 16      | `20261124030000_s04_message_requests`       |
| 03      | `20261124030200_s04_tournament_checkin`     |
| 05      | `20261124040100_s04_build_view_index`       |
| 14      | `20261124040200_s04_quiet_counts`           |
| 08      | `20261124050000_s04_poll_lifecycle`         |
| 17      | `20261124050200_s04_community_handover`     |
| 13      | `20261124060000_s04_rmhbox_presets`         |
| 20      | `20261124060200_s04_flag_targeting`         |

01, 10, 11, 12, 15 and 19 have no schema change. Every timestamp sorts after
sprint 03's `20261123…` migrations. 04 adds a unique index on
`build_version (buildId, version)`: the table has no writer today, so it is
empty, but integration checks `SELECT "buildId", version, count(*) FROM
build_version GROUP BY 1, 2 HAVING count(*) > 1` on production before
deploying.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-04`, never pushed until the sprint
  PR.
- Feature branch: `autonomous/s04-<slug>` from the sprint branch **as it is
  when the wave starts** (after the previous wave's merge).
- Worktree: `/home/user/wt/s04-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge
  or rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite files and product files, plus the
   gate tests that cover what they touched (route table, API handler adoption,
   raw-fetch ratchet, i18n catalogs and drift, sitemap and OG coverage, test
   discovery, design consistency and Steel flat when UI changed, the rAF
   allowlist, the escape-hatch ratchet).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed
   from the wave's base schema, and the additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file.
5. `pnpm api:routes` when an endpoint module was added, moved or removed.
6. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s04-<slug>`. On a conflict in a generated
   file, take either side and regenerate; anchored files should not conflict
   (if one does, keep both features' blocks under their anchors).
2. Regenerate: `pnpm api:routes`; the route tree (start
   `pnpm exec vite --port 7999 --strictPort`, wait until `app/routeTree.gen.ts`
   changes, stop it — 01 and 12 delete route files, so the tree must
   regenerate); `pnpm facts:generate`; `pnpm docs:site`; `pnpm docs:api`.
3. `pnpm exec prisma generate`, then `pnpm exec tsc -b --checkers 1` alone.
4. `pnpm test` and `pnpm test:product`.
5. **Raw SQL smoke test** for 05 (insights), 07 (month spend), 20 (erasure
   `array_remove`) and every `lockKey` user: apply the migrations to a
   throwaway Postgres (the integration suite's, `docs/testing.md` §8) and run
   each new query once — sprint 02 found a wrong table name only this way.
6. Review the diff against the brief and the specification's acceptance
   criteria; fix or send back. Check every read path the feature names
   (sprint 03's drafts leaked through admin server functions, RSS and staging
   news): 14 and 18 list theirs.
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Wire the export functions into `lib/account/api/account.export.server.ts`
  in one commit: `exportReplays` (01), `exportReaderMarks` (09),
  `exportRmhboxPresets` (13), `exportMessageRequests` (16). 07's columns ride
  on the `UserPlayLimits` row the export already includes; 14, 16 and 18 add
  `UserProfile` columns — if the export selects profile fields explicitly,
  add them. Adjustments (06), handovers (17) and flag lists (20) are site
  records and are not exported.
- `pnpm check:consistency --base main`, `pnpm typecheck`,
  `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`, `pnpm build`
  with `scripts/check-bundle-budget.ts`, and a real-browser pass over every new
  or changed page in Day and Night at 390 px and 1280 px, and once in `ar`;
  RMHBox pages (12, 13) in RMHBox's own modes.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code
lines (TypeScript, TSX, SQL, CSS) separately from documentation lines,
measured with `git diff --numstat` from the sprint 03 merge commit to `HEAD`
(or from `origin/main` if sprint 03 had landed on `main` before Wave 0),
filtered by extension, excluding generated files (`routeTree.gen.ts`,
`route-table.server.ts`, `facts.json`, `docs/site-reference/**`,
`locales/**`).
