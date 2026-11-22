# Brief 18 — Follow Logs and News

You are a fresh implementer with no other context. This brief and the files it names are everything you need. Build the feature completely — UI, server, persistence and tests as specified — commit it on your feature branch, and report back.

| | |
|---|---|
| Specification | `docs/autonomous/sprint-02/features/18-subscriptions.md` |
| Wave | 6 |
| Branch | `autonomous/s02-subscriptions` (from `claude/autonomous-sprint-02`) |
| Worktree | `/home/user/wt/s02-subscriptions` |
| i18n namespace | `subscriptions` |
| Schema | `prisma/schema/library.prisma`, migration `20261122060100_s02_reading_subscriptions` |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you find you need to, stop and report it): 14 Highlights notebook and export (`highlights`); 20 Cloud save manager and snapshots (`cloud-saves`).

Already merged into the sprint branch before your wave (their code is in your worktree; reuse it): 03 study-editor, 07 rmhtype-lessons, 01 dev-webhooks, 05 study-stats, 08 rmhtype-progress, 10 security-activity, 04 study-tests, 09 rmhtype-daily, 15 audience, 06 rmhstudy-focus, 02 dev-explorer, 17 notifications-inbox, 12 read-aloud, 16 follows, 11 keyboard.

## Read first (in this order)

1. The specification: `docs/autonomous/sprint-02/features/18-subscriptions.md`. It is
   the contract; its acceptance criteria are what review checks.
2. `CLAUDE.md` at the repo root (commit gate, conventions), then `app/CLAUDE.md`,
   `lib/CLAUDE.md` and `components/CLAUDE.md`.
3. `design.md` and, for any UI, `docs/page-consistency.md` §3. Values in
   `docs/plans/2026-11-11-steel-design-implementation.md` are exact; do not
   resolve its section-18 open decisions — if your work seems to need one,
   stop and say so in your report.
4. `docs/autonomous/sprint-02/plan.md` (waves, shared files).

## Repo essentials you must follow

- **TanStack Start + Vite + React 19, not Next.js.** Routes are files under
  `app/routes/`; `_site/` pages get the Steel shell and use `PageLayout`
  (`components/feed/PageLayout.tsx`); top-level routes are full-screen and keep
  their own look (L8, `--app-*` in `components/shared/app-theme.css`).
- **Endpoints:** declare each one in a client-safe `*.contract.ts` with
  `endpoint<{ body; res }>()({ method, path })` (`import type` from the zod
  schemas), bind it in a registered module `lib/<domain>/api/<path.with.dots>.server.ts`
  exporting `route = apiRoute('/api/…', { GET: implement(contract, options, handler) })`,
  call it from the client with `api(contract, input)` from `@/lib/contract/client`.
  Worked example: `lib/playtime/playtime.contract.ts` +
  `lib/playtime/api/games.playtime.server.ts`. Never write `fetch('/api/…')`.
  After adding a module run `pnpm api:routes` (regenerates
  `lib/api/route-table.server.ts`; the commit gate's route-table test needs it).
- `implement()` / `defineHandler` options: `auth` (`'required'` default,
  `'optional'`, `'admin'`, `'none'`), `rateLimit` (`'read'`, `'write'`, or
  `{ limit, windowMs, prefix }`), `body` / `query` zod schemas. Never echo a
  caught error to the client.
- **Server-only code** is named `*.server.ts` and never imported from client
  code. Pure logic and zod go in plain files.
- **Prisma** via `import { prisma } from '@/lib/prisma.server'`. New append-only
  tables use `BigInt @id @default(autoincrement())`; every model `@@map`s to
  snake_case; migrations are additive.
- **Design (Steel):** only `--site-*` token utilities (`bg-site-bg`,
  `border-site-border`, `text-site-text-muted`, `rounded-site`, …); type is the
  `t-*` classes (`t-title`, `t-heading`, `t-body`, `t-post`, `t-prose`,
  `t-label`, `t-meta`), weights 400/500/600; flat (no gradient, blur, glow,
  shadow, translucency, `transition-all`); rules before boxes (a list is rows on
  `border-b border-site-border`); one ink primary button per view; overlays
  (menus, dialogs) are the only raised surface; content that arrives after
  paint fades in through `components/ui/arrive.tsx`; nothing moves at rest.
  Use `components/ui/` primitives (button, input, select, switch, tabs,
  dialog, menu, empty-state, skeleton, confirm-dialog, selection-bar,
  sortable-list), lucide icons, `toast` from `@/lib/toast`. Tab strips use
  `components/ui/tabs.tsx` — never hand-roll one.
- **i18n:** every user-facing string is `t('key', { defaultValue: 'English' })`
  with a literal default (interpolate with `{{name}}`, never `${}`). Your
  namespace is **`subscriptions`**, already registered in `lib/i18n/config.ts` with an
  empty `locales/en/subscriptions.json` (wave 0): `useTranslation('subscriptions')`. Never put a
  `{/* … */}` JSX comment immediately before a `t()` call (the extractor skips
  it). Do not edit `lib/i18n/config.ts`. `pnpm i18n:extract` scans only
  `app/**` and `components/**`, so every `t()` call lives there: `lib/` code
  returns data and i18n keys, and components translate them.
- **Accessibility:** native or Radix primitives, labels on every control, focus
  ring is global (do not override it), 4.5:1 text contrast via the tokens,
  controls 36 px high (44 px on touch).
- **Strict island:** if you add a new top-level module directory, read
  `tsconfig.strict.json`; do not add `any`, `@ts-ignore` or `@ts-nocheck`
  (`lib/__tests__/ts-escape-hatch-ratchet.test.ts`).
- **Tests:** mission-critical tests (ownership, secrets, auth, a member's
  data, money) are plain `*.test.ts` in the main suite; pure product logic goes
  in `*.product.test.ts` (the product suite, `vitest.product.config.ts`). Main
  suite tests never touch a real database: mock Prisma the way
  `lib/notify/__tests__/create-notification-push.test.ts` does
  (`vi.mock('@/lib/prisma.server', …)`) or use a fake like
  `lib/economy/__tests__/fake-db.ts`.

## Worktree (run exactly this, once)

```bash
cd /home/user/rmhstudios.com
git worktree add /home/user/wt/s02-subscriptions -b autonomous/s02-subscriptions claude/autonomous-sprint-02
cd /home/user/wt/s02-subscriptions
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the pnpm store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma
client), so nothing you generate affects the other implementers. Work only in
`/home/user/wt/s02-subscriptions`; never edit `/home/user/rmhstudios.com`. Every Bash
call starts in a fresh shell: use absolute paths or `cd /home/user/wt/s02-subscriptions && …`.

## What you are building

Member subscriptions to the Logs, a Log tag, a News category or a News story;
a 15-minute fan-out cron creating one in-site notification per new item per
subscriber (cursor + dedupe, idempotent); a daily email batch with its own
`logs` unsubscribe list; follow buttons on Logs, News categories and stories;
and a management section in `/settings/notifications`.

## Files

Create:
- `lib/reading/subscriptions.ts` (pure): kinds, `validateTarget`,
  `matchingSubscriptions(item, subs)` (one notification per user however many
  match).
- `lib/reading/subscriptions.server.ts`: CRUD (≤ 100 per member; targets checked
  against `lib/news-categories.ts`, `NewsStory`, existing Log tags),
  `fanOutNewItems(now)` (read `ReadingFanoutCursor`, new `BlogPost` by
  `createdAt` and `NewsArticle` with `status: 'PUBLISHED'`, at most 200 items;
  notifications through `createNotification` from `lib/notifications.server.ts`
  with type `SYSTEM`, `entityType` `blog_post` / `news_article`, `link`; dedupe by
  checking existing `(userId, entityType, entityId)` first; advance the cursor
  only after the batch commits), `sendDailySubscriptionEmails(now)` (per member
  with email-on subscriptions and new items since `lastEmailedAt`, ≤ 20 items,
  `sendOnce` + `canEmail` + `List-Unsubscribe` using `signUnsubToken(userId,
  'logs')`), `exportReadingSubscriptions(userId)`.
- `lib/reading/subscriptions-jobs.server.ts`: `registerReadingSubscriptionJobs(boss)`
  (cron `*/15 * * * *` → fan-out; `0 17 * * *` → email).
- `lib/reading/subscriptions-schema.ts`, `lib/reading/subscriptions.contract.ts`,
  modules `lib/reading/api/reading.subscriptions.server.ts` (GET, POST) and
  `lib/reading/api/reading.subscriptions.$id.server.ts` (PATCH, DELETE).
- `components/reading/FollowButton.tsx` (toggle, `aria-pressed`),
  `components/settings/ReadingSubscriptionsSection.tsx`.
- Tests below.

Modify:
- `prisma/schema/library.prisma`: `ReadingSubscription` and
  `ReadingFanoutCursor` as specified (back-relation on `User` in
  `prisma/schema/auth.prisma`).
- `server/jobs/index.ts`: one `REGISTRATIONS` row for the two queues (or two
  rows) — copy an existing cron row's shape.
- `lib/email/unsubscribe.ts`: `UNSUB_LISTS` gains `'logs'`.
- `app/routes/api/email/unsubscribe.ts`: handle `list=logs` by setting
  `email = false` on all the member's `ReadingSubscription` rows (it is a route
  file with its own handler — keep its structure).
- `app/routes/_site/blog/$slug.tsx` (follow button in the byline for the Logs and
  each tag), the News category tabs (`components/news/NewsCategoryTabs.tsx` or
  `NewsPageContent.tsx`), the story page `app/routes/_site/news/stories/$slug.tsx`.
- `app/routes/_site/settings/notifications.tsx` (mount the section).
- `components/feed/NotificationsColumn.tsx`: `systemIdentity` labels for
  `blog_post` ("Logs") and `news_article` ("News").

## Patterns to copy

- Email sending with dedupe and preferences: `lib/streak-reminders.server.ts`,
  `lib/digest/pipeline.server.ts`, `lib/email/deliveries.server.ts`.
- Unsubscribe tokens: `lib/email/unsubscribe.ts`,
  `lib/__tests__/email-unsubscribe-safe-get.test.ts`.

## Gotchas

- Follow buttons are secondary buttons (never the view's ink primary).
- Fan-out must be safe to run twice concurrently: use a transaction-scoped
  advisory lock (`pg_advisory_xact_lock`, as other jobs do — search for it) or
  pg-boss singleton options.
- Signed-out visitors see no follow button (RSS links stay where they are).

## Schema and migration

1. Before editing the schema, snapshot the base schema once:
   ```bash
   cd /home/user/wt/s02-subscriptions
   rm -rf /home/user/wt/.base-subscriptions && mkdir -p /home/user/wt/.base-subscriptions
   git archive HEAD prisma/schema | tar -x -C /home/user/wt/.base-subscriptions
   ```
2. Edit `prisma/schema/library.prisma` as the specification says (add a relation field on
   `User` in `prisma/schema/auth.prisma` only if your model declares a relation
   to `User`; keep the existing style of the file).
3. Validate, regenerate the client and write the migration SQL (no database is
   needed; the dummy URL only satisfies `prisma.config.ts`):
   ```bash
   cd /home/user/wt/s02-subscriptions
   export DATABASE_URL=postgresql://x:x@localhost:5432/x
   pnpm -s exec prisma validate
   pnpm -s exec prisma generate
   mkdir -p prisma/migrations/20261122060100_s02_reading_subscriptions
   pnpm -s exec prisma migrate diff --from-schema /home/user/wt/.base-subscriptions/prisma/schema --to-schema prisma/schema --script \
     | grep -v '^Loaded Prisma config' > prisma/migrations/20261122060100_s02_reading_subscriptions/migration.sql
   ```
   Read the SQL: it must only create tables, add nullable or defaulted columns,
   and create indexes. After you commit the migration, run the expand/contract
   gate (it compares `HEAD` with the base, so it only sees committed files):
   ```bash
   cd /home/user/wt/s02-subscriptions && node .github/scripts/check-migrations-additive.mjs claude/autonomous-sprint-02
   ```
   Put a two-line `--` comment at the top of `migration.sql` saying what the
   migration is for (see `prisma/migrations/20261121000000_bot_queue/migration.sql`).
   The migration directory name is fixed: **`20261122060100_s02_reading_subscriptions`**.

## Tests to write

- Main suite: `lib/reading/__tests__/subscriptions.test.ts`
- Product suite: `lib/reading/__tests__/subscription-match.product.test.ts`

What each must cover is in the specification's "Testing requirements". Keep main-suite tests database-free (mock Prisma); product tests are pure.

## Checks (and only these — memory is shared with two other implementers)

Do **not** run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev` or
`vite`: a cold typecheck alone needs about 10 GB. Integration runs them.

```bash
cd /home/user/wt/s02-subscriptions
# your tests
pnpm -s exec vitest run lib/reading/__tests__/subscriptions.test.ts
pnpm -s exec vitest run --config vitest.product.config.ts lib/reading/__tests__/subscription-match.product.test.ts
# the gate tests that cover what you touched
pnpm -s exec vitest run lib/api/__tests__/route-table.test.ts lib/__tests__/api-handler-adoption.test.ts \
  lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-default-drift.test.ts \
  lib/__tests__/sitemap-coverage.test.ts lib/__tests__/og-page-coverage.test.ts lib/__tests__/test-discovery.test.ts
# eslint on what you changed (no new warnings)
{ git diff --name-only --diff-filter=ACMR claude/autonomous-sprint-02 -- '*.ts' '*.tsx'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx'; } \
  | sort -u | grep -v routeTree.gen.ts | xargs -r pnpm -s exec eslint
```

Strings, after your UI is written:

```bash
cd /home/user/wt/s02-subscriptions
pnpm i18n:extract
# keep only your namespace; the extractor also rewrites unrelated, drifted catalogs
git diff --name-only -- locales | grep -v '^locales/en/subscriptions.json$' | xargs -r git checkout --
git ls-files --others --exclude-standard locales | xargs -r rm -f
```

Then open `locales/en/subscriptions.json` and check every key you added is there with
its English text.

Generated files: run `pnpm api:routes` after adding or renaming an endpoint
module and commit `lib/api/route-table.server.ts`. **Never stage
`app/routeTree.gen.ts`, `docs/_generated/facts.json` or `docs/site-reference/*`**
— integration regenerates them. Do not edit `lib/account/api/account.export.server.ts`;
export functions are wired by integration.

## Committing

- Stage explicitly (`git add <paths>`), then commit in a separate command —
  never `git add -A && git commit` or `git commit -a` (the hook would gate the
  whole tree).
- The commit gate (`pnpm check:consistency --fast`) runs automatically on
  `git commit`. If it fails, fix the cause and commit again. **Never bypass it**
  (`--no-verify`, `RMH_SKIP_COMMIT_GATE=1`). If a step is killed (a `☠` line,
  exit 3), wait for other work to finish and retry; report it if it persists.
- If a rule is genuinely wrong for your change, do not work around it: stop and
  describe it in your report.
- Small, focused commits are welcome (for example: schema + server, then UI,
  then tests); each must pass the gate. The message says *why*, in plain
  sentences, and ends with exactly:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017cuJ2SsWzp7mNxZ4xZCcv3
  ```
- Commit only on `autonomous/s02-subscriptions`. Never push, merge, rebase or touch the
  sprint branch or another worktree. Never commit secrets or `.env` files.
- No model names, personal names or e-mail addresses in code, comments or
  commit messages beyond the trailer above.

## Done means

- Every functional requirement and acceptance criterion in the specification
  is implemented (or explicitly reported as not done, with the reason).
- Loading, empty, error and signed-out states exist for every new view.
- The checks above pass, and `git status` in the worktree is clean.
- Your final report lists: commits (hash and subject), files added and changed,
  tests added and their results, anything not done or uncertain, and anything
  integration must do (export function names, settings entries, follow-ups).
