# Sprint 03 — implementation plan

How the twenty features are built: seven waves of at most three concurrent
implementers, each in its own git worktree and branch, merged into the sprint
branch `claude/autonomous-sprint-03` by one integration owner between waves.
The machine budget and the per-feature checks are sprint 02's
(`docs/autonomous/sprint-02/plan.md`), restated here so this file stands alone.

## Precondition: sprint 02 is in the sprint branch

`claude/autonomous-sprint-03` was cut from `origin/main` while sprint 02 was
still integrating. Before Wave 0 is committed, integration merges sprint 02
into it — `git merge origin/main` once sprint 02 has landed on `main`, or
`git merge claude/autonomous-sprint-02` if it has not. Wave 1 does not start
until this is done, because:

- 05 changes sprint 02's subscription fan-out
  (`lib/reading/subscriptions.server.ts`);
- 07 extends sprint 02's security log (`lib/auth/security-log*.ts`,
  `SecurityActivityPanel.tsx`, `locales/en/security-activity.json`);
- 08 extends sprint 02's RMHStudy history (`lib/rmhstudy/history*.ts`,
  `components/rmhstudy/FocusHistory.tsx`);
- every feature may reuse `components/ui/day-heatmap.tsx`, `bar-chart.tsx`,
  `line-chart.tsx` and the product suite (`vitest.product.config.ts`,
  `pnpm test:product`), which sprint 02 added;
- sprint 02's `.prettierignore` and `lib/i18n/config.ts` blocks sit where
  Wave 0 adds sprint 03's; take both sides on conflict.

## Machine budget

4 cores and 15 GB. A cold `tsc -b` of the site project peaks around 10 GB, so
**implementers never run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`,
`pnpm dev` or `vite`.** They run targeted vitest files, eslint on their changed
files and the commit gate (`--fast`, about 1 GB; it skips `tsc`). Integration
runs the one full typecheck after each merge, alone. Each worktree has its own
`node_modules` (`pnpm install --frozen-lockfile --offline`, hard-linked from
the store), so one feature's `prisma generate` never changes another's client.

## Wave 0 — scaffolding (integration commits it before Wave 1)

1. The precondition merge above.
2. **Namespaces.** Append to `NAMESPACES` in `lib/i18n/config.ts`, after
   sprint 02's block, one per line under the comment
   `// Sprint 03 (docs/autonomous/sprint-03): one namespace per feature.`:
   `music-history`, `daily-stats`, `conversation-controls`, `mod-notes`,
   `log-drafts`, `key-restrictions`, `rmhstudy-streaks`, `watch-parties`,
   `game-updates`, `api-games`, `send-later`, `community-rules`,
   `community-modlog`, `community-insights`, `my-reports`, `ladder-offers`,
   `ladder-insights`, `message-alt-text`, `report-triage` (19 namespaces; 07
   writes into sprint 02's `security-activity`). Create each
   `locales/en/<ns>.json` containing `{}` and a newline. Run
   `pnpm -s exec vitest run lib/__tests__/i18n-catalogs.test.ts` to check the
   registry accepts empty catalogues (sprint 02 did the same).
3. **Anchors** — so that two features of one wave never edit the same lines of
   a shared file. Each anchor is a comment line, separated from the next by
   one blank line; a feature replaces **only its own anchor line** (keeping
   the comment, adding its code below it), and git merges the waves without
   conflicts because the hunks never touch.
   - `lib/account/deletion.server.ts`, inside the `$transaction([...])` of
     `anonymizeAccount`, directly before `// 3. Scrub PII from the profile.`:
     a header comment `// Sprint 03 erasures (docs/autonomous/sprint-03/plan.md
     §Anchors): each feature adds its operations under its own line.` then
     the lines `// s03-04 mod-notes`, `// s03-09 watch-parties`,
     `// s03-10 game-updates`, `// s03-12 send-later`,
     `// s03-14 community-modlog`, `// s03-15 community-insights`,
     `// s03-17 ladder-offers`, each followed by a blank line. (01 adds its
     table to `musicErasureOps` in `lib/rmhmusic/learn/account-data.server.ts`
     instead, which nobody else touches.)
   - `prisma/schema/auth.prisma`, at the end of `model User`'s relation fields
     (before its `@@` lines): `// Sprint 03 back-relations (one block per
     feature)` then `// s03-01 music-history`, `// s03-04 mod-notes`,
     `// s03-09 watch-parties`, `// s03-10 game-updates`,
     `// s03-12 send-later`, `// s03-17 ladder-offers`, each followed by a
     blank line. Run `pnpm -s exec prisma format --check` (or `validate`) to be
     sure comments and blank lines in the model are accepted.
   - `lib/sitemap.ts`, at the end of `EXCLUDED_ROUTES`: `// Sprint 03` then
     `// s03-01 music-history`, `// s03-02 daily-stats`,
     `// s03-09 watch-parties`, `// s03-10 game-updates`,
     `// s03-17 ladder-offers`, `// s03-18 ladder-insights`, each followed by
     a blank line.
4. `.prettierignore` gains `/docs/autonomous/sprint-03/` (done in these
   documents), and `docs/autonomous/README.md` gains the sprint 03 row.
5. No new shared UI primitive is needed: features reuse sprint 02's charts,
   `components/ui/schedule-control.tsx` (05, 09, 12), `selection-bar.tsx`
   (20), `sortable-list.tsx` (13) and the time-zone helpers in
   `lib/calendar/tz.ts` (`isValidTimeZone`, `dayOf`, `wallToUtcMs`) for every
   day-key and zone computation (01, 02, 08, 09, 12, 15, 18).
6. Commit Wave 0 through the gate (`pnpm check:consistency`), with the docs.

## Waves

Three features per wave, chosen so that features built at the same time touch
different shared files (table below; the anchored files are the one
exception, by design). Within a wave the order does not matter; waves are
merged in order.

| Wave | Slot A                   | Slot B              | Slot C              |
| ---- | ------------------------ | ------------------- | ------------------- |
| 1    | 13 community-rules       | 01 music-history    | 17 ladder-offers    |
| 2    | 14 community-modlog      | 16 my-reports       | 12 send-later       |
| 3    | 15 community-insights    | 20 report-triage    | 05 log-drafts       |
| 4    | 19 message-alt-text      | 18 ladder-insights  | 09 watch-parties    |
| 5    | 03 conversation-controls | 06 key-restrictions | 02 daily-stats      |
| 6    | 07 security-hardening    | 11 api-games        | 10 game-updates     |
| 7    | 04 mod-notes             | 08 rmhstudy-streaks | —                   |

Dependencies that fix the order:

- 13 → 14 → 15: all three add a tab to `components/communities/ModPanel.tsx`
  and edit `prisma/schema/communities.prisma`; 14 logs 13's rule citations;
  14 and 15 both write in `communities.$slug.members.$userId.server.ts` and
  the join endpoint.
- 16 → 20: both edit `lib/admin/api/admin.reports.$id.server.ts` and
  `ContentReport`; 20's bulk decisions call 16's `notifyReportersOfOutcome`
  and use its `(reporterId, createdAt)` index. 04 (wave 7) edits the reports
  list after both.
- 12 → 19: 12 extracts `lib/messages/send.server.ts` and changes both
  composers; 19 extends that send path and the same composers.
- 17 → 18: both add a tab to `RmhLadderShell.tsx`; 18 counts 17's offers.
- 05, 09, 10 and 12 each add a row to `server/jobs/index.ts` (waves 3, 4, 6,
  2). 09, 10 and 16 each add a `systemIdentity` label in
  `components/feed/NotificationsColumn.tsx` (waves 4, 6, 2).
- 03 (wave 5) adds an optional `conversationKey` to `createNotification`'s
  input. It is additive, so 16 and 09 (built before) and 10 (after) are
  unaffected; only feed callers about a post pass it.
- 05, 07 and 08 need sprint 02 (precondition).

## Shared files and who touches them

| File                                                    | Kind                          | Who                                                                                                                     |
| ------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `lib/i18n/config.ts` (`NAMESPACES`)                     | registry                      | **Wave 0 only**; nobody edits it again                                                                                  |
| `locales/en/<ns>.json`                                  | generated (extract)           | each feature, **its own file only**; 07 edits `security-activity.json`                                                  |
| `prisma/schema/<domain>.prisma`                         | source                        | the feature named in its brief; never two features on one file in a wave                                                |
| `prisma/schema/auth.prisma` (`User`)                    | source, **anchored**          | 01, 04, 09, 10, 12, 17 — each under its own anchor line                                                                 |
| `lib/account/deletion.server.ts` (`anonymizeAccount`)   | source, **anchored**          | 04, 09, 10, 12, 14, 15, 17 — each under its own anchor line                                                             |
| `lib/sitemap.ts` (`EXCLUDED_ROUTES`)                    | source, **anchored**          | 01, 02, 09, 10, 17, 18 — each under its own anchor line (10 may also need `STATIC_ROUTES`; it is alone in its wave)     |
| `prisma/migrations/<timestamp>_s03_<slug>/`             | source                        | the feature; timestamps fixed below                                                                                     |
| `lib/api/route-table.server.ts`                         | generated (`pnpm api:routes`) | each feature regenerates it; **integration regenerates on every merge** and takes no side in a conflict                 |
| `app/routeTree.gen.ts`                                  | generated (vite)              | **integration only**; implementers never stage it                                                                       |
| `docs/_generated/facts.json`, `docs/site-reference/*`   | generated                     | **integration only** (`pnpm facts:generate`, `pnpm docs:site`, `pnpm docs:api`)                                        |
| `lib/account/api/account.export.server.ts`              | source                        | **integration only**: features export an `export…(userId)` function; integration wires them after wave 7               |
| `server/jobs/index.ts` (`REGISTRATIONS`)                | source                        | 12 (w2), 05 (w3), 09 (w4), 10 (w6)                                                                                       |
| `components/feed/NotificationsColumn.tsx`               | source                        | 16 (w2), 09 (w4), 10 (w6)                                                                                                |
| `lib/notifications.server.ts`                           | source                        | 03 (w5) only                                                                                                             |
| `components/communities/ModPanel.tsx`                   | source                        | 13 (w1), 14 (w2), 15 (w3)                                                                                                |
| `components/moderation/ReportDialog.tsx`                | source                        | 13 (w1), 16 (w2)                                                                                                         |
| `lib/admin/api/admin.reports*.server.ts`                | source                        | 16 (w2), 20 (w3), 04 (w7)                                                                                                |
| `prisma/schema/moderation.prisma`                       | source                        | 16 (w2), 20 (w3), 04 (w7)                                                                                                |
| `prisma/schema/messaging.prisma`, message composers     | source                        | 12 (w2), 19 (w4)                                                                                                         |
| `components/rmhladder/RmhLadderShell.tsx`               | source                        | 17 (w1), 18 (w4)                                                                                                         |
| `lib/api/scopes.ts`, `lib/api/registry.ts`              | source                        | 11 (w6); 06 (w5) only touches `lib/api/openapi.ts` error docs and the wrapper                                          |
| `lib/og/static-cards.ts`                                | source                        | 09 (w4), 10 (w6) if they need a section card                                                                            |
| `lib/catalog/**`                                        | source                        | nobody (no new games or apps)                                                                                           |

Migration timestamps (all additive;
`.github/scripts/check-migrations-additive.mjs` must pass):

| Feature | Migration                                    |
| ------- | -------------------------------------------- |
| 01      | `20261123010000_s03_music_practice_log`      |
| 13      | `20261123010100_s03_community_rules`         |
| 17      | `20261123010200_s03_ladder_offers`           |
| 14      | `20261123020000_s03_community_mod_log`       |
| 16      | `20261123020100_s03_report_outcomes`         |
| 12      | `20261123020200_s03_scheduled_messages`      |
| 15      | `20261123030000_s03_community_member_events` |
| 20      | `20261123030100_s03_report_triage_index`     |
| 05      | `20261123030200_s03_log_drafts`              |
| 19      | `20261123040000_s03_message_alt_text`        |
| 09      | `20261123040200_s03_watch_party_rsvps`       |
| 03      | `20261123050000_s03_pinned_reply`            |
| 06      | `20261123050100_s03_api_key_restrictions`    |
| 07      | `20261123060000_s03_ip_hash_reset`           |
| 10      | `20261123060200_s03_game_follows`            |
| 04      | `20261123070000_s03_moderator_notes`         |
| 08      | `20261123070100_s03_rmhstudy_timezone`       |

02, 11 and 18 have no schema change. Every timestamp sorts after sprint 02's
`20261122…` migrations.

## Branches and worktrees

- Sprint branch: `claude/autonomous-sprint-03`, never pushed until the sprint
  PR.
- Feature branch: `autonomous/s03-<slug>` from the sprint branch **as it is
  when the wave starts** (after the previous wave's merge).
- Worktree: `/home/user/wt/s03-<slug>`. The exact commands are in every brief.
- Implementers commit locally on their feature branch; they never push, merge
  or rebase the sprint branch.

## Per-feature checks (implementer)

1. Targeted vitest: the feature's main-suite files and product files, plus the
   gate tests that cover what they touched (route table, API handler adoption,
   raw-fetch ratchet, i18n catalogs and drift, sitemap and OG coverage, test
   discovery, design consistency and Steel flat when UI changed).
2. `pnpm -s exec eslint <changed .ts/.tsx files>` with no new warnings.
3. Schema features: `prisma validate`, `prisma generate`, the migration diffed
   from the wave's base schema, and the additive-migration check.
4. `pnpm i18n:extract`, keeping only the feature's namespace file.
5. `pnpm api:routes` when an endpoint module was added.
6. `git commit` — the commit gate runs; a failure is fixed, never bypassed.

## Integration (between waves, one owner, nothing else running)

For each finished feature branch of the wave, in slot order:

1. `git merge --no-ff autonomous/s03-<slug>`. On a conflict in a generated
   file, take either side and regenerate; anchored files should not conflict
   (if one does, keep both features' blocks under their anchors).
2. Regenerate: `pnpm api:routes`; the route tree (start
   `pnpm exec vite --port 7999 --strictPort`, wait until `app/routeTree.gen.ts`
   changes, stop it); `pnpm facts:generate`; `pnpm docs:site`; `pnpm docs:api`.
3. `pnpm exec prisma generate`, then `pnpm exec tsc -b --checkers 1` alone.
4. `pnpm test` and `pnpm test:product`.
5. **Raw SQL smoke test** for 01, 05, 15 and 18 (they aggregate with
   `$queryRaw`): apply the migrations to a throwaway Postgres (the
   integration suite's, `docs/testing.md` §8) and run each new query once —
   sprint 02 found a wrong table name only this way.
6. Review the diff against the brief and the specification's acceptance
   criteria; fix or send back.
7. Commit the regenerated files (`pnpm check:consistency` runs as the hook).

After wave 7:

- Wire the export functions into `lib/account/api/account.export.server.ts`
  in one commit: `exportMyReports` (16),
  `exportScheduledMessages` (12), `exportLadderOffers` (17),
  `exportWatchPartyRsvps` (09), `exportGameFollows` (10). (Notes about a
  member, 04, and moderation logs, 14 and 15, are the site's records and are
  not exported. 01 is exported through RMHMusic's existing
  `exportMusicData`.)
- Run 08's `scripts/rmhstudy/recompute-streaks.ts --dry-run` against the
  throwaway database, then document the one-off production run in the PR.
- `pnpm check:consistency --base main`, `pnpm typecheck`,
  `pnpm typecheck:strict`, `pnpm test`, `pnpm test:product`, `pnpm build`
  with `scripts/check-bundle-budget.ts`, and a real-browser pass over every new
  or changed page in Day and Night at 390 px and 1280 px, and once in `ar`.

## Reporting

`summary.md` (written at integration) reports, per feature and in total, code
lines (TypeScript, TSX, SQL, CSS) separately from documentation lines,
measured with `git diff --numstat origin/main...HEAD` filtered by extension,
excluding generated files (`routeTree.gen.ts`, `route-table.server.ts`,
`facts.json`, `docs/site-reference/**`, `locales/**`) and sprint 02's own
lines (measure against the sprint 02 merge commit, not `origin/main`, if
sprint 02 had not landed on `main` when sprint 03 started).
