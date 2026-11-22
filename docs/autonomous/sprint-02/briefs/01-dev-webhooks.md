# Brief 01 — Webhooks console

You are a fresh implementer with no other context. This brief and the files it names are everything you need. Build the feature completely — UI, server, persistence and tests as specified — commit it on your feature branch, and report back.

| | |
|---|---|
| Specification | `docs/autonomous/sprint-02/features/01-dev-webhooks.md` |
| Wave | 1 |
| Branch | `autonomous/s02-dev-webhooks` (from `claude/autonomous-sprint-02`) |
| Worktree | `/home/user/wt/s02-dev-webhooks` |
| i18n namespace | `dev-webhooks` |
| Schema | `prisma/schema/developer.prisma`, migration `20261122010000_s02_webhook_console` |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you find you need to, stop and report it): 03 Flashcard deck editor with import and export (`study-editor`); 07 RMHType touch-typing lessons (`rmhtype-lessons`).

Yours is in the first wave: the sprint branch holds only wave 0 (namespaces and the product test suite).

## Read first (in this order)

1. The specification: `docs/autonomous/sprint-02/features/01-dev-webhooks.md`. It is
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
  namespace is **`dev-webhooks`**, already registered in `lib/i18n/config.ts` with an
  empty `locales/en/dev-webhooks.json` (wave 0): `useTranslation('dev-webhooks')`. Never put a
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
git worktree add /home/user/wt/s02-dev-webhooks -b autonomous/s02-dev-webhooks claude/autonomous-sprint-02
cd /home/user/wt/s02-dev-webhooks
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the pnpm store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma
client), so nothing you generate affects the other implementers. Work only in
`/home/user/wt/s02-dev-webhooks`; never edit `/home/user/rmhstudios.com`. Every Bash
call starts in a fresh shell: use absolute paths or `cd /home/user/wt/s02-dev-webhooks && …`.

## What you are building

A session-authenticated webhooks console on the developer page: list, create
(secret shown once), edit, enable/disable, delete endpoints; per-endpoint
delivery log with filters and payload view; send a `ping` test event; redeliver
a delivery as a new row; rotate the secret with a 24-hour overlap during which
deliveries carry both signatures. Full detail: the specification.

## Files

Create:
- `lib/webhooks/limits.ts` — `MAX_WEBHOOK_ENDPOINTS = 10`, `SECRET_OVERLAP_MS = 24 * 60 * 60 * 1000`.
- `lib/developer/webhooks-schema.ts` (zod), `lib/developer/webhooks.contract.ts`
  (contracts), `lib/developer/webhooks.server.ts` (all Prisma work; owner
  scoping in every `where`).
- Registered modules in `lib/developer/api/`:
  `developer.webhooks.server.ts` (GET, POST),
  `developer.webhooks.$id.server.ts` (GET with `status`, `event`, `cursor`; PATCH; DELETE),
  `developer.webhooks.$id.rotate.server.ts` (POST),
  `developer.webhooks.$id.test.server.ts` (POST),
  `developer.webhooks.deliveries.$id.redeliver.server.ts` (POST).
- `components/developer/WebhooksConsole.tsx` (list + create dialog),
  `components/developer/WebhookDetail.tsx` (deliveries), small subcomponents as
  needed under `components/developer/webhooks/`.
- Route `app/routes/_site/developer/webhooks.tsx` (`head()` with
  `noindex`; `PageLayout` with `backTo="/developer"`; signed-out state with
  `SignedOutPrompt`, as `app/routes/_site/developer/index.tsx` does).
- Tests listed below.

Modify:
- `prisma/schema/developer.prisma`: `WebhookEndpoint.previousSecret String?
  @db.VarChar(128)`, `previousSecretExpiresAt DateTime?`;
  `WebhookDelivery.durationMs Int?`, `redeliveryOfId String? @db.VarChar(32)`.
- `lib/webhooks/signature.ts`: add pure `signatureHeader(secrets: string[],
  timestamp, body)` → `t=…,v1=…[,v1=…]`; make `verifyWebhookSignature` accept a
  match on any `v1=` part. Keep existing exports working.
- `lib/webhooks/emit.server.ts`: select `previousSecret` and
  `previousSecretExpiresAt`; sign with both while the overlap lasts; record
  `durationMs` (measure around `safeFetch`); export a
  `deliverToEndpoint(endpointId, event, payload, { redeliveryOfId? })` used by
  test ping and redeliver (reuse `attemptDelivery`; do not duplicate the
  claim/CAS logic). `ping` is delivered regardless of the endpoint's event list.
- `lib/webhooks/events.ts`: add a `ping` event definition only if needed for the
  docs list; it must not be subscribable via `normalizeWebhookEvents` unless it
  already is — check, and keep subscription semantics unchanged.
- `app/routes/api/v1/webhooks.ts`: import the cap from `lib/webhooks/limits.ts`
  (delete the local `MAX_ENDPOINTS`). No other v1 change.
- `app/routes/_site/developer/index.tsx`: one link/row to `/developer/webhooks`.
- `lib/sitemap.ts`: `'/developer/webhooks': 'personal'` in `EXCLUDED_ROUTES`
  near the other personal entries.

## Patterns to copy

- Key management UI and its data flow: `components/developer/KeysManager.tsx`,
  `lib/developer/keys.contract.ts`, `lib/developer/api/developer.keys.server.ts`
  (reveal-once secret UX, owner checks).
- Delivery mechanics: `lib/webhooks/emit.server.ts` (`attemptDelivery`, CAS
  claim, `safeFetch`, auto-disable). Never use bare `fetch` for endpoint URLs.
- Event list for the checklist: `WEBHOOK_EVENTS` in `lib/webhooks/events.ts`.
- Pagination: keyset on `(createdAt desc, id desc)` like
  `lib/notifications.server.ts#listNotifications`.

## Gotchas

- A foreign or missing id answers **404** (not 403).
- Never select `secret`/`previousSecret` in list or detail queries; only create
  and rotate responses contain a secret, once.
- Test pings and redeliveries: bespoke rate limit
  `{ limit: 10, windowMs: 60_000, prefix: 'webhook-manual' }`, `scope: 'user'`
  if the option exists (see `lib/playtime/api/games.playtime.server.ts`).
- Re-enabling via PATCH `{ enabled: true }` resets `failureCount` to 0.

## Schema and migration

1. Before editing the schema, snapshot the base schema once:
   ```bash
   cd /home/user/wt/s02-dev-webhooks
   rm -rf /home/user/wt/.base-dev-webhooks && mkdir -p /home/user/wt/.base-dev-webhooks
   git archive HEAD prisma/schema | tar -x -C /home/user/wt/.base-dev-webhooks
   ```
2. Edit `prisma/schema/developer.prisma` as the specification says (add a relation field on
   `User` in `prisma/schema/auth.prisma` only if your model declares a relation
   to `User`; keep the existing style of the file).
3. Validate, regenerate the client and write the migration SQL (no database is
   needed; the dummy URL only satisfies `prisma.config.ts`):
   ```bash
   cd /home/user/wt/s02-dev-webhooks
   export DATABASE_URL=postgresql://x:x@localhost:5432/x
   pnpm -s exec prisma validate
   pnpm -s exec prisma generate
   mkdir -p prisma/migrations/20261122010000_s02_webhook_console
   pnpm -s exec prisma migrate diff --from-schema /home/user/wt/.base-dev-webhooks/prisma/schema --to-schema prisma/schema --script \
     | grep -v '^Loaded Prisma config' > prisma/migrations/20261122010000_s02_webhook_console/migration.sql
   ```
   Read the SQL: it must only create tables, add nullable or defaulted columns,
   and create indexes. After you commit the migration, run the expand/contract
   gate (it compares `HEAD` with the base, so it only sees committed files):
   ```bash
   cd /home/user/wt/s02-dev-webhooks && node .github/scripts/check-migrations-additive.mjs claude/autonomous-sprint-02
   ```
   Put a two-line `--` comment at the top of `migration.sql` saying what the
   migration is for (see `prisma/migrations/20261121000000_bot_queue/migration.sql`).
   The migration directory name is fixed: **`20261122010000_s02_webhook_console`**.

## Tests to write

- Main suite: `lib/developer/__tests__/webhooks.server.test.ts`
- Main suite: `lib/webhooks/__tests__/signature.test.ts`

What each must cover is in the specification's "Testing requirements". Keep main-suite tests database-free (mock Prisma); product tests are pure.

## Checks (and only these — memory is shared with two other implementers)

Do **not** run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev` or
`vite`: a cold typecheck alone needs about 10 GB. Integration runs them.

```bash
cd /home/user/wt/s02-dev-webhooks
# your tests
pnpm -s exec vitest run lib/developer/__tests__/webhooks.server.test.ts lib/webhooks/__tests__/signature.test.ts
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
cd /home/user/wt/s02-dev-webhooks
pnpm i18n:extract
# keep only your namespace; the extractor also rewrites unrelated, drifted catalogs
git diff --name-only -- locales | grep -v '^locales/en/dev-webhooks.json$' | xargs -r git checkout --
git ls-files --others --exclude-standard locales | xargs -r rm -f
```

Then open `locales/en/dev-webhooks.json` and check every key you added is there with
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
- Commit only on `autonomous/s02-dev-webhooks`. Never push, merge, rebase or touch the
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
