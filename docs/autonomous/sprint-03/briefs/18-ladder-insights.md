# Brief 18 — RMHLadder search insights

You are a fresh implementer with no other context. This brief and the files it
names are everything you need. Build the feature completely — UI, server,
persistence and tests as specified — commit it on your feature branch, and
report back.

| | |
|---|---|
| Specification | `docs/autonomous/sprint-03/features/18-ladder-insights.md` |
| Wave | 4 |
| Branch | `autonomous/s03-ladder-insights` (from `claude/autonomous-sprint-03`) |
| Worktree | `/home/user/wt/s03-ladder-insights` |
| i18n namespace | `ladder-insights` |
| Schema | none |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you find
you need to, stop and report it): 19 Image descriptions in messages
(`message-alt-text`); 09 Scheduled watch parties with reminders
(`watch-parties`).

Already merged into the sprint branch before your wave (their code is in your
worktree; reuse it): 13 community-rules, 01 music-history, 17 ladder-offers, 14
community-modlog, 16 my-reports, 12 send-later, 15 community-insights, 20
report-triage, 05 log-drafts. Sprint 02 (`docs/autonomous/sprint-02/`) is merged
too: its chart primitives, product test suite and features are in your worktree.

## Read first (in this order)

1. The specification:
   `docs/autonomous/sprint-03/features/18-ladder-insights.md`. It is the
   contract; its acceptance criteria are what review checks.
2. `CLAUDE.md` at the repo root (commit gate, conventions), then
   `app/CLAUDE.md`, `lib/CLAUDE.md` and `components/CLAUDE.md`.
3. `design.md` and, for any UI, `docs/page-consistency.md` §3. Values in
   `docs/plans/2026-11-11-steel-design-implementation.md` are exact; do not
   resolve its section-18 open decisions — if your work seems to need one,
   stop and say so in your report.
4. `docs/autonomous/sprint-03/plan.md` (waves, shared and anchored files).

## Repo essentials you must follow

- **TanStack Start + Vite + React 19, not Next.js.** Routes are files under
  `app/routes/`; `_site/` pages get the Steel shell and use `PageLayout`
  (`components/feed/PageLayout.tsx`); top-level routes are full-screen and
  keep their own look (L8, `--app-*` in `components/shared/app-theme.css`).
- **Endpoints:** declare each one in a client-safe `*.contract.ts` with
  `endpoint<{ body; res }>()({ method, path })` (`import type` from the zod
  schemas), bind it in a registered module
  `lib/<domain>/api/<path.with.dots>.server.ts` exporting
  `route = apiRoute('/api/…', { GET: implement(contract, options, handler) })`,
  and call it from the client with `api(contract, input)` from
  `@/lib/contract/client`. Worked example: `lib/playtime/playtime.contract.ts`
  + `lib/playtime/api/games.playtime.server.ts`. Never write `fetch('/api/…')`
  (`lib/__tests__/raw-api-fetch-ratchet.test.ts`). After adding a module run
  `pnpm api:routes`. `/api/v1/**` stays route files with `withDeveloperApi`.
- `implement()` / `defineHandler` options: `auth` (`'required'` default,
  `'optional'`, `'admin'`, `'none'`), `rateLimit` (`'read'`, `'write'`, or
  `{ limit, windowMs, prefix }`), `body` / `query` zod schemas. **Validate every
  query parameter with the `query` schema** — repeated parameters do not
  survive, so a list is one comma-separated parameter. Never echo a caught
  error to the client.
- **Server-only code** is named `*.server.ts` and never imported from client
  code. Pure logic and zod go in plain files.
- **Prisma** via `import { prisma } from '@/lib/prisma.server'`. Append-only
  tables use `BigInt @id @default(autoincrement())`; every model `@@map`s to
  snake_case; migrations are additive. **Raw SQL (`$queryRaw`) must use the
  real `@@map` table and column names** — read them in the schema, and assert
  them in a test; integration smoke-tests raw SQL against Postgres.
- **Account deletion anonymises in place**, so `onDelete: Cascade` never fires
  for a deleted member: every new per-user table must be deleted (or
  de-identified) explicitly in `anonymizeAccount`
  (`lib/account/deletion.server.ts`, under your anchor) with a test in
  `lib/account/__tests__/<thing>-erasure.test.ts` (copy
  `lib/account/__tests__/study-erasure.test.ts`, from sprint 02). Personal data
  a member owns also gets an `export…(userId)` function for the account export
  (integration wires it).
- **Design (Steel):** only `--site-*` token utilities on the site tier
  (`bg-site-bg`, `border-site-border`, `text-site-text-muted`,
  `rounded-site`, …); type is the `t-*` classes (`t-title`, `t-heading`,
  `t-body`, `t-post`, `t-prose`, `t-label`, `t-meta`), weights 400/500/600;
  flat (no gradient, blur, glow, shadow, translucency, `transition-all`);
  rules before boxes (a list is rows on `border-b border-site-border`); one
  ink primary button per view; overlays (menus, dialogs) are the only raised
  surface; content that arrives after paint fades in through
  `components/ui/arrive.tsx`; nothing moves at rest. Use `components/ui/`
  primitives (button, input, select, switch, tabs, dialog, menu, empty-state,
  skeleton, confirm-dialog, selection-bar, sortable-list, schedule-control),
  lucide icons, `toast` from `@/lib/toast`. Tab strips use
  `components/ui/tabs.tsx` — never hand-roll one. **`components/ui/`
  primitives take translated strings as props**; never read a feature
  namespace from inside `components/ui/`.
- **Focus:** never use `requestAnimationFrame` to move focus (the rAF allowlist
  gate, `lib/__tests__/raf-loop-allowlist.test.ts`, fails it); use the dialog's
  `onCloseAutoFocus` or a direct `.focus()` in the event handler.
- **i18n:** every user-facing string is `t('key', { defaultValue: 'English' })`
  with a literal default (interpolate with `{{name}}`, never `${}`). Your
  namespace is **`ladder-insights`**, already registered in `lib/i18n/config.ts`
  with its `locales/en/ladder-insights.json` (Wave 0):
  `useTranslation('ladder-insights')`. Never put a `{/* … */}` JSX comment
  immediately before a `t()` call (the extractor skips it). Do not edit
  `lib/i18n/config.ts`. `pnpm i18n:extract` scans only `app/**` and
  `components/**`, so every `t()` call lives there: `lib/` code returns data and
  i18n keys, and components translate them.
- **Accessibility:** native or Radix primitives, labels on every control,
  focus ring is global (do not override it), 4.5:1 text contrast via the
  tokens, controls 36 px high (44 px on touch).
- **Time zones and day keys:** use `lib/calendar/tz.ts` (`isValidTimeZone`,
  `dayOf`, `wallToUtcMs`, …); do not write another time-zone helper.
- **Strict island:** if you add a new top-level module directory, read
  `tsconfig.strict.json`; do not add `any`, `@ts-ignore` or `@ts-nocheck`
  (`lib/__tests__/ts-escape-hatch-ratchet.test.ts`).
- **Tests:** mission-critical tests (ownership, secrets, auth, a member's
  data, erasure, money) are plain `*.test.ts` in the main suite; pure product
  logic goes in `*.product.test.ts` (the product suite,
  `vitest.product.config.ts`). Main-suite tests never touch a real database:
  mock Prisma the way `lib/notify/__tests__/create-notification-push.test.ts`
  does (`vi.mock('@/lib/prisma.server', …)`) or use a fake like
  `lib/economy/__tests__/fake-db.ts`.

## Worktree (run exactly this, once)

```bash
cd /home/user/rmhstudios.com
git worktree add /home/user/wt/s03-ladder-insights -b autonomous/s03-ladder-insights claude/autonomous-sprint-03
cd /home/user/wt/s03-ladder-insights
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma
client), so nothing you generate affects the other implementers. Work only in
`/home/user/wt/s03-ladder-insights`; never edit `/home/user/rmhstudios.com`.
Every Bash call starts in a fresh shell: use absolute paths or `cd
/home/user/wt/s03-ladder-insights && …`.

## What you are building

A `/rmhladder/insights` tab computed from the member's applications and status
events: a funnel with conversions, time to first response, applications and
responses per week, breakdowns with a minimum group size, quiet applications
with follow-up and reject actions, and outcomes including 17's offers.

## Files

Create:

- `lib/rmhladder/insights.ts` (pure), `insights.server.ts`,
  `insights-schema.ts`, `insights.contract.ts`.
- Module `lib/rmhladder/api/rmhladder.insights.server.ts` (GET).
- `app/routes/_site/rmhladder/insights.tsx`,
  `components/rmhladder/InsightsView.tsx`.
- Tests below.

Modify:

- `components/rmhladder/RmhLadderShell.tsx`: the Insights tab.
- `lib/sitemap.ts` under `// s03-18 ladder-insights`.

## Anchored shared files

Wave 0 put one comment line per feature in `lib/sitemap.ts` (`EXCLUDED_ROUTES`).
In each, find the line `// s03-18 ladder-insights`, keep it, and add your code
directly below it, before the blank line that separates it from the next anchor.
Do not touch any other line of those files (other features edit theirs in
parallel; this is what keeps the merges clean).

## Patterns to copy

- Status events: `lib/rmhladder/server/actions.ts`; follow-up and reject actions
  to reuse from the pipeline page.
- Charts: `components/ui/bar-chart.tsx` with translated labels.

## Gotchas

- A stage counts as reached if the event history ever entered it.
- Suppress groups with fewer than 5 applications.
- No new write endpoint: quiet-application actions call the existing ones.

## Tests to write

- Main suite: `lib/rmhladder/__tests__/insights-endpoint.test.ts`
- Product suite: `lib/rmhladder/__tests__/insights.product.test.ts`

What each must cover is in the specification's "Testing requirements".
Main-suite tests never touch a real database (mock Prisma); product tests are
pure. Test names follow the file names above so the suites' globs pick them up.

## Checks (and only these — memory is shared with two other implementers)

Do **not** run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev` or
`vite`: a cold typecheck alone needs about 10 GB. Integration runs them.

```bash
cd /home/user/wt/s03-ladder-insights
# your tests
pnpm -s exec vitest run lib/rmhladder/__tests__/insights-endpoint.test.ts
pnpm -s exec vitest run --config vitest.product.config.ts lib/rmhladder/__tests__/insights.product.test.ts
# the gate tests that cover what you touched
pnpm -s exec vitest run lib/api/__tests__/route-table.test.ts lib/__tests__/api-handler-adoption.test.ts \
  lib/__tests__/raw-api-fetch-ratchet.test.ts lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-default-drift.test.ts \
  lib/__tests__/sitemap-coverage.test.ts lib/__tests__/og-page-coverage.test.ts lib/__tests__/test-discovery.test.ts \
  lib/__tests__/design-consistency.test.ts lib/__tests__/steel-flat.test.ts lib/__tests__/ts-escape-hatch-ratchet.test.ts \
  lib/__tests__/raf-loop-allowlist.test.ts
# eslint on what you changed (no new warnings)
{ git diff --name-only --diff-filter=ACMR claude/autonomous-sprint-03 -- '*.ts' '*.tsx'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx'; } \
  | sort -u | grep -v routeTree.gen.ts | xargs -r pnpm -s exec eslint
```

If a gate test file named above does not exist under that name, find its current
name with `ls lib/__tests__` and run that; do not skip it.

Strings, after your UI is written:

```bash
cd /home/user/wt/s03-ladder-insights
pnpm i18n:extract
# keep only your namespace; the extractor also rewrites unrelated, drifted catalogs
git diff --name-only -- locales | grep -v '^locales/en/ladder-insights.json$' | xargs -r git checkout --
git ls-files --others --exclude-standard locales | xargs -r rm -f
```

Then open `locales/en/ladder-insights.json` and check every key you added is
there with its English text.

Generated files: run `pnpm api:routes` after adding or renaming an endpoint
module and commit `lib/api/route-table.server.ts`. **Never stage
`app/routeTree.gen.ts`, `docs/_generated/facts.json` or
`docs/site-reference/*`** — integration regenerates them. Do not edit
`lib/account/api/account.export.server.ts`; export functions are wired by
integration.

## Committing

- Stage explicitly (`git add <paths>`), then commit in a separate command —
  never `git add -A && git commit` or `git commit -a` (the hook would gate the
  whole tree).
- The commit gate (`pnpm check:consistency --fast`) runs automatically on
  `git commit`. If it fails, fix the cause and commit again. **Never bypass
  it** (`--no-verify`, `RMH_SKIP_COMMIT_GATE=1`). If a step is killed (a `☠`
  line, exit 3), wait for other work to finish and retry; report it if it
  persists. The hook runs the fast gate only (no `tsc`); that is expected.
- If a rule is genuinely wrong for your change, do not work around it: stop
  and describe it in your report.
- Small, focused commits are welcome (for example: schema + server, then UI,
  then tests); each must pass the gate. The message says *why*, in plain
  sentences, and ends with exactly:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017cuJ2SsWzp7mNxZ4xZCcv3
  ```
- Commit only on `autonomous/s03-ladder-insights`. Never push, merge, rebase or
  touch the sprint branch or another worktree. Never commit secrets or `.env`
  files.
- No model names, personal names or e-mail addresses in code, comments or
  commit messages beyond the trailer above.

## Done means

- Every functional requirement and acceptance criterion in the specification is
  implemented (or explicitly reported as not done, with the reason).
- Loading, empty, error and signed-out states exist for every new view.
- The checks above pass, and `git status` in the worktree is clean.
- Your final report lists: commits (hash and subject), files added and changed,
  tests added and their results, anything not done or uncertain, and anything
  integration must do.
