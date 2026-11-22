# Sprint 02 — implementation plan

How the twenty features are built: in seven waves of at most three concurrent
implementers, each in its own git worktree and branch, merged into the sprint
branch `claude/autonomous-sprint-02` by one integration owner between waves.

## Machine budget

4 cores and 15 GB. A cold `tsc -b` of the site project peaks around 10 GB, so
**implementers never run `pnpm typecheck`, `pnpm test`, `pnpm build` or
`pnpm dev`.** They run targeted vitest files, eslint on their changed files, and
the commit gate (`--fast`, about 1 GB, 7–11 s; it skips `tsc`). The integration
owner runs the one full typecheck after each merge, alone. Each worktree has its
own `node_modules` (a hard-linked `pnpm install --offline`, about 40 s and
almost no extra disk), so a feature's `prisma generate` never changes another
worktree's Prisma client.

## Waves

Three features per wave, chosen so that features built at the same time touch
different shared files (table below). Within a wave the order does not matter;
waves are merged in order.

| Wave | Slot A            | Slot B                 | Slot C                 |
| ---- | ----------------- | ---------------------- | ---------------------- |
| 1    | 03 study-editor   | 07 rmhtype-lessons     | 01 dev-webhooks        |
| 2    | 05 study-stats    | 08 rmhtype-progress    | 10 security-activity   |
| 3    | 04 study-tests    | 09 rmhtype-daily       | 15 audience            |
| 4    | 06 rmhstudy-focus | 02 dev-explorer        | 17 notifications-inbox |
| 5    | 12 read-aloud     | 16 follows             | 11 keyboard            |
| 6    | 14 highlights     | 18 subscriptions       | 20 cloud-saves         |
| 7    | 13 find-in-book   | 19 achievement-tracker | —                      |

Dependencies that fix the order: 16 needs 15's `FollowEvent`; 18 needs 17's
inbox changes; 06 and 15 reuse the chart components 05 and 08 create; the three
flashcard features (03 → 05 → 04) all edit `DeckStudyColumn.tsx`; the three
RMHType features (07 → 08 → 09) all edit the RMHType header and landing and
`rmhtype.prisma`; 01 and 02 both edit the developer index; 12 and 14 both edit
the reading toolbar area and 13 the library reader next to it; 10, 11 and 20 are
kept apart because 11 and 20 edit `lib/settings-nav.ts` and 10 and 18 edit
`server/jobs/index.ts`.

## Shared files and who touches them

| File                                                           | Kind                          | Who                                                                                                                                                           |
| -------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/i18n/config.ts` (`NAMESPACES`)                            | registry                      | **done in wave 0**; nobody edits it again                                                                                                                     |
| `locales/en/<ns>.json`                                         | generated (extract)           | each feature, **its own file only** (one namespace per feature)                                                                                               |
| `prisma/schema/<domain>.prisma`                                | source                        | the feature named in the brief; never two features on the same file in one wave                                                                               |
| `prisma/migrations/<timestamp>_s02_<slug>/`                    | source                        | the feature; the timestamp is fixed in its brief so ordering is deterministic                                                                                 |
| `lib/api/route-table.server.ts`                                | generated (`pnpm api:routes`) | each feature regenerates it (the commit gate's `route-table.test.ts` requires it); **integration regenerates on every merge** and takes no side in a conflict |
| `app/routeTree.gen.ts`                                         | generated (vite)              | **integration only**; implementers never stage it                                                                                                             |
| `docs/_generated/facts.json`, `docs/site-reference/*`          | generated                     | **integration only** (`pnpm facts:generate`, `pnpm docs:site`, `pnpm docs:api`)                                                                               |
| `lib/prepaint/generated.ts`                                    | generated                     | nobody expects to change it; integration runs `pnpm prepaint:check`                                                                                           |
| `lib/sitemap.ts` (`STATIC_ROUTES`, `EXCLUDED_ROUTES`)          | source                        | each feature adds its routes **next to its domain's existing entries**, so waves do not collide; integration resolves any leftovers                           |
| `lib/og/static-cards.ts`                                       | source                        | none expected: 02's public page resolves to the `/developer` section card                                                                                     |
| `lib/settings-nav.ts`                                          | source                        | 11 (wave 5), 20 (wave 6)                                                                                                                                      |
| `server/jobs/index.ts` (`REGISTRATIONS`)                       | source                        | 10 (wave 2), 18 (wave 6)                                                                                                                                      |
| `lib/account/api/account.export.server.ts`                     | source                        | **integration only**: features export an `export…(userId)` function; integration wires them                                                                   |
| `lib/catalog/**`                                               | source                        | nobody (no new games or apps)                                                                                                                                 |
| `components/ui/day-heatmap.tsx`, `components/ui/bar-chart.tsx` | new shared                    | created by 05; reused, not changed, by 06 and 15                                                                                                              |
| `components/ui/line-chart.tsx`                                 | new shared                    | created by 08; reused by 15                                                                                                                                   |

Migration timestamps (all additive;
`.github/scripts/check-migrations-additive.mjs` must pass):

| Feature | Migration                                    |
| ------- | -------------------------------------------- |
| 01      | `20261122010000_s02_webhook_console`         |
| 07      | `20261122010100_s02_rmhtype_lessons`         |
| 05      | `20261122020000_s02_flashcard_review_log`    |
| 08      | `20261122020100_s02_rmhtype_progress_index`  |
| 10      | `20261122020200_s02_security_events`         |
| 04      | `20261122030000_s02_flashcard_tests`         |
| 09      | `20261122030100_s02_rmhtype_daily`           |
| 15      | `20261122030200_s02_follow_events`           |
| 06      | `20261122040000_s02_rmhstudy_focus_history`  |
| 17      | `20261122040200_s02_notification_type_index` |
| 11      | `20261122050200_s02_keyboard_preferences`    |
| 18      | `20261122060100_s02_reading_subscriptions`   |
| 20      | `20261122060200_s02_game_save_snapshots`     |
| 19      | `20261122070100_s02_achievement_tracks`      |

02, 03, 12, 13, 14 and 16 have no schema change.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-02` (from `origin/main`), never
  pushed until the sprint PR.
- Feature branch: `autonomous/s02-<slug>` from the sprint branch **as it is when
  the wave starts** (after the previous wave's merge).
- Worktree: `/home/user/wt/s02-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge or
  rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite files
   (`pnpm -s exec vitest run <files>`) and product files
   (`pnpm -s exec vitest run --config vitest.product.config.ts <files>`), plus
   the gate tests that cover what they touched (route table, i18n catalogs and
   drift, sitemap and OG coverage, API handler adoption).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed
   from the wave's base schema, and the additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file.
5. `pnpm api:routes` when an endpoint was added.
6. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s02-<slug>` into the sprint branch. On a
   conflict in a generated file, take either side and regenerate; in
   `lib/sitemap.ts`, keep both entries.
2. Regenerate: `pnpm api:routes`; the route tree (start
   `pnpm exec vite --port 7999 --strictPort`, wait until `app/routeTree.gen.ts`
   changes — about 4 s — then stop it); `pnpm facts:generate`; `pnpm docs:site`;
   `pnpm docs:api`.
3. `pnpm exec prisma generate`, then `pnpm exec tsc -b --checkers 1` alone.
4. `pnpm test` (main suite) and `pnpm test:product`.
5. Review the diff against the brief and the spec's acceptance criteria; fix or
   send back.
6. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7: wire the account-export functions (04, 05, 10, 18, 20 and the
lesson progress of 07) into `lib/account/api/account.export.server.ts` in one
commit; run `pnpm check:consistency --base main`, `pnpm typecheck`,
`pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`, `pnpm build` with
`scripts/check-bundle-budget.ts`, and a real-browser pass over every new or
changed page in Day and Night at 390 px and 1280 px, and once in `ar`.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code
lines (TypeScript, TSX, SQL, CSS) separately from documentation lines, measured
with `git diff --numstat origin/main...HEAD` filtered by extension, excluding
generated files (`routeTree.gen.ts`, `route-table.server.ts`, `facts.json`,
`docs/site-reference/**`, `locales/**`).
