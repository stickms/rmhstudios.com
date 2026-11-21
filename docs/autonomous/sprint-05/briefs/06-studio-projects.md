# Brief 06 — Studio projects: save, open, sync

You are a fresh implementer with no other context. This brief and the files it
names are everything you need. Build the feature completely — UI, server,
persistence and tests as specified — commit it on your feature branch, and
report back.

| | |
|---|---|
| Specification | `docs/autonomous/sprint-05/features/06-studio-projects.md` |
| Wave | 1 |
| Branch | `autonomous/s05-studio-projects` (from `claude/autonomous-sprint-05`) |
| Worktree | `/home/user/wt/s05-studio-projects` |
| i18n namespace | `studio-projects` |
| Schema | new file `prisma/schema/studio.prisma` with `StudioProject`, migration `20261125010100_s05_studio_projects` |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you find
you need to, stop and report it): 01 Leaderboard privacy
(`leaderboard-privacy`); 08 Double-elimination tournaments
(`double-elimination`).

Sprints 02 and 03 are on `main`; sprint 04 was merged into the sprint branch
before Wave 0, so all of it is in your worktree: `lockKey`
(`lib/db/advisory-lock.server.ts`), `useConfirm` / `usePrompt`
(`components/ui/confirm-dialog.tsx`, `components/ui/prompt-dialog.tsx`), the
literal notification labels (`components/feed/notification-labels.ts`), quiet
counts (`QUIET_COUNT_READ_PATHS`), follow-list privacy
(`FOLLOW_LIST_READ_PATHS`), message requests (`requestGate`), the event
waitlist, tournament check-in, the computed-key and native-dialog ratchets, and
sprint 03's `guardDirect`, `isBlockedPair`, the community moderation log and the
server-function guards (`lib/auth/server-fn-guards.server.ts`).

## Read first (in this order)

1. The specification:
   `docs/autonomous/sprint-05/features/06-studio-projects.md`. It is the
   contract; its acceptance criteria are what review checks.
2. `CLAUDE.md` at the repo root (commit gate, conventions), then
   `app/CLAUDE.md`, `lib/CLAUDE.md` and `components/CLAUDE.md` (and
   `features/CLAUDE.md` if you touch `features/`).
3. `design.md` and, for any UI, `docs/page-consistency.md` §3. Values in
   `docs/plans/2026-11-11-steel-design-implementation.md` are exact; do not
   resolve its section-18 open decisions — if your work seems to need one, stop
   and say so in your report. Also do not decide any open owner decision:
   moderator notes in the data export, the deletion grace period, unlisted
   tournament or listing meta, Apache `CF-Connecting-IP` stripping, blocked
   members RSVPing to a blocker's events, RMHBox per-minigame history privacy,
   ownership transfer in the public mod log, emoji reactions under quiet counts.
4. `docs/autonomous/sprint-05/plan.md` (waves, shared and anchored files).

## Repo essentials you must follow

- **TanStack Start + Vite + React 19, not Next.js.** Routes are files under
  `app/routes/`; `_site/` pages get the Steel shell and use `PageLayout`
  (`components/feed/PageLayout.tsx`); top-level routes are full-screen and keep
  their own look (L8, `--app-*` in `components/shared/app-theme.css`).
- **Endpoints:** declare each one in a client-safe `*.contract.ts` with
  `endpoint<{ body; res }>()({ method, path })` (`import type` from the zod
  schemas), bind it in a registered module
  `lib/<domain>/api/<path.with.dots>.server.ts` exporting `route =
  apiRoute('/api/…', { GET: implement(contract, options, handler) })`, and call
  it from the client with `api(contract, input)` from `@/lib/contract/client`.
  Worked example: `lib/playtime/playtime.contract.ts` +
  `lib/playtime/api/games.playtime.server.ts`. Never write `fetch('/api/…')`
  (`lib/__tests__/raw-api-fetch-ratchet.test.ts`). After adding a module run
  `pnpm api:routes`. `/api/v1/**` stays route files with `withDeveloperApi`.
- `implement()` / `defineHandler` options: `auth` (`'required'` default,
  `'optional'`, `'admin'`, `'none'`), `rateLimit` (`'read'`, `'write'`, or
  `{ limit, windowMs, prefix }`), `body` / `query` zod schemas. **Validate every
  input with zod, query parameters included** — repeated parameters do not
  survive, so a list is one comma-separated parameter. Never echo a caught error
  to the client.
- **Server functions:** any `createServerFn` you add (route loaders) guards
  **inside its handler** with `requireSessionServerFn` / `requireAdminServerFn`
  from `lib/auth/server-fn-guards.server.ts`; a route's `beforeLoad` does not
  protect a server function.
- **Server-only code** is named `*.server.ts` and never imported from client
  code. Pure logic and zod go in plain files.
- **Prisma** via `import { prisma } from '@/lib/prisma.server'`. Every model
  `@@map`s to snake_case; migrations are additive. **Raw SQL
  (`$queryRaw`/`$executeRaw`) must use the real `@@map` table name and quoted
  camelCase column names** (`"userId"`, `"createdAt"`) — read them in the schema
  and assert them in a test; integration smoke-tests raw SQL against Postgres.
- **Caps and races:** a check-then-insert cap (at most N rows, one pending
  offer, one seat left) runs in a transaction that first takes
  `lockKey(tx, '<feature>:<id>')` from `lib/db/advisory-lock.server.ts` (sprint
  04). A job that must act once claims its rows with a conditional `updateMany`
  (compare-and-set) before acting.
- **Account deletion anonymises in place**, so `onDelete: Cascade` never fires
  for a deleted member: every new per-user table must be deleted (or
  de-identified) explicitly in `anonymizeAccount`
  (`lib/account/deletion.server.ts`, under your anchor) with a test in
  `lib/account/__tests__/<thing>-erasure.test.ts` (copy
  `lib/account/__tests__/study-erasure.test.ts`). Personal data a member owns
  also gets an `export…(userId)` function for the account export (integration
  wires it).
- **Blocked and banned members** are refused wherever members interact (blocks
  in either direction: `UserBlock`; bans: `User.bannedUntil` in the future).
  **Anything that shows content must check every read path** — feed, post page,
  profile, search, embeds, RSS, OG images, admin server functions and
  `/api/v1/**`; sprint 03 leaked drafts through paths it forgot.
- **Design (Steel):** only `--site-*` token utilities on the site tier
  (`bg-site-bg`, `border-site-border`, `text-site-text-muted`, `rounded-site`,
  …); type is the `t-*` classes (`t-title`, `t-heading`, `t-body`, `t-post`,
  `t-prose`, `t-label`, `t-meta`), weights 400/500/600; flat (no gradient, blur,
  glow, shadow, translucency, `transition-all`); rules before boxes (a list is
  rows on `border-b border-site-border`); one ink primary button per view;
  overlays (menus, dialogs) are the only raised surface; content that arrives
  after paint fades in through `components/ui/arrive.tsx`; nothing moves at
  rest. Use `components/ui/` primitives (button, input, select, switch, tabs,
  dialog, menu, empty-state, skeleton, confirm-dialog, bar-chart, line-chart),
  lucide icons, `toast` from `@/lib/toast`. Tab strips and segmented filters use
  `components/ui/tabs.tsx` — never hand-roll one. **`components/ui/` primitives
  take translated strings as props**; never read a feature namespace from inside
  `components/ui/`. Never use `window.prompt`, `window.confirm` or `alert`.
- **Focus:** never use `requestAnimationFrame` to move focus (the rAF allowlist
  gate, `lib/__tests__/raf-loop-allowlist.test.ts`, fails it); use the dialog's
  `onCloseAutoFocus` or a direct `.focus()` in the event handler.
- **i18n:** every user-facing string is `t('key', { defaultValue: 'English' })`
  with a literal key and a literal default (interpolate with `{{name}}`, never
  `${}`; never build a key at run time — sprint 04's computed-key ratchet fails
  it). Your namespace is **`studio-projects`**, already registered in
  `lib/i18n/config.ts` with its `locales/en/studio-projects.json` (Wave 0):
  `useTranslation('studio-projects')`. Never put a `{/* … */}` JSX comment
  immediately before a `t()` call (the extractor skips it). Do not edit
  `lib/i18n/config.ts`. `pnpm i18n:extract` scans only `app/**` and
  `components/**`, so every `t()` call lives there: `lib/` code returns data and
  i18n keys, and components translate them. Changing the wording of a shipped
  string needs a new key.
- **Accessibility:** native or Radix primitives, labels on every control, focus
  ring is global (do not override it), 4.5:1 text contrast via the tokens,
  controls 36 px high (44 px on touch).
- **Time zones and day keys:** use `lib/calendar/tz.ts` (`isValidTimeZone`,
  `dayOf`, `wallToUtcMs`, …); do not write another time-zone helper.
- **Strict island:** if you add a new top-level module directory, read
  `tsconfig.strict.json`; do not add `any`, `@ts-ignore` or `@ts-nocheck`
  (`lib/__tests__/ts-escape-hatch-ratchet.test.ts`). A new `*.server.ts` inside
  an engine directory belongs to `tsconfig.site.json` (root `CLAUDE.md` §12).
- **Erasure tests use recording Proxies.** The stubs in
  `lib/account/__tests__/*-erasure.test.ts` record calls through a Proxy, so a
  read that runs **before** the transaction (anything you `await` outside the
  `$transaction([...])` array) gets a Proxy back, not rows: guard it with
  `Array.isArray(rows) ? rows : []`. Never put `$executeRaw` inside the
  transaction array (the stub cannot record it and production ordering is
  unclear); use Prisma operations there, or a pre-step before the transaction.
- **Counts and lists other members can see:** like, reply, repost and view
  counts go through quiet counts (`QUIET_COUNT_READ_PATHS`, sprint 04 14);
  anything that lists who follows whom goes through follow-list privacy
  (`FOLLOW_LIST_READ_PATHS`, sprint 04 18). Direct messages are only ever sent
  through `sendDirectMessage` (`requestGate`, `guardDirect`), never by writing
  rows. Blocks (either direction) and bans are refused wherever members
  interact.
- **Notifications:** a `SYSTEM` notification's label is a literal
  `t('system-label-<entityType>', { ns: 'feed', defaultValue: '…' })` in
  `components/feed/notification-labels.ts` (under your anchor, with its line in
  the test); never a computed key or a ternary choosing keys (the computed-key
  ratchet, `lib/__tests__/i18n-computed-key-ratchet.test.ts`). Create
  notifications with `createNotification` (`lib/notifications.server.ts`) so
  preferences, quiet hours and push apply.
- **Public developer API (`/api/v1/**`, `lib/api/openapi.ts`) changes are
  additive only:** add fields, never remove or rename documented ones.
- **Sitemap:** a new param-less page goes in `EXCLUDED_ROUTES` (or the public
  map, with an OG card), never `DYNAMIC_ROUTES` (that map is for `$param`
  paths); `lib/__tests__/sitemap-coverage.test.ts` checks it.
- **No native dialogs:** never `window.prompt`, `window.confirm` or `alert`
  (`lib/__tests__/native-dialog-ratchet.test.ts`); use `useConfirm`
  (`components/ui/confirm-dialog.tsx`) and `usePrompt`
  (`components/ui/prompt-dialog.tsx`).
- **Tests:** mission-critical tests (ownership, secrets, auth, money, a member's
  data, erasure) are plain `*.test.ts` in the main suite; pure product logic
  goes in `*.product.test.ts` (the product suite, `vitest.product.config.ts`).
  Main-suite tests never touch a real database: mock Prisma the way
  `lib/notify/__tests__/create-notification-push.test.ts` does
  (`vi.mock('@/lib/prisma.server', …)`) or use a fake like
  `lib/economy/__tests__/fake-db.ts`.

## Worktree (run exactly this, once)

```bash
cd /home/user/rmhstudios.com
git worktree add /home/user/wt/s05-studio-projects -b autonomous/s05-studio-projects claude/autonomous-sprint-05
cd /home/user/wt/s05-studio-projects
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma
client), so nothing you generate affects the other implementers. Work only in
`/home/user/wt/s05-studio-projects`; never edit `/home/user/rmhstudios.com`.
Every Bash call starts in a fresh shell: use absolute paths or
`cd /home/user/wt/s05-studio-projects && …`.

## What you are building

A Projects menu in the RMH Studio toolbar (New, Open, Save, Save as, Rename,
Delete, Save to account, Open from account), local autosave to IndexedDB, cloud
projects for signed-in members (25 × 1 MB, revision-checked saves),
missing-sample notices, erasure and export.

## Files

Create:

- `prisma/schema/studio.prisma`.
- `lib/studio/project-schema.ts` (zod), `lib/studio/project-session.ts` (pure),
  `lib/studio/cloud-projects.server.ts`, `lib/studio/projects.contract.ts`.
- Modules `lib/studio/api/studio.projects.server.ts` (GET, POST),
  `studio.projects.$id.server.ts` (GET, PUT, DELETE).
- `components/studio/ProjectsMenu.tsx`,
  `components/studio/OpenProjectDialog.tsx`,
  `components/studio/useProjectSession.ts`.
- Tests below.

Modify:

- `components/studio/StudioShell.tsx`: the menu and save state in `Toolbar`.
- `lib/studio/store.ts`: a `dirty` flag / change counter (do not change what
  `persist` saves); `lib/studio/keybinds.ts`: Ctrl/Cmd+S.
- `lib/studio/project-store.ts`: keep its API; add only what the menu needs.
- Back-relation under the auth anchor; `lib/account/deletion.server.ts`.

## Anchored shared files

Wave 0 put one comment line per feature in these files:

- `lib/account/deletion.server.ts`, inside `anonymizeAccount`'s
  `$transaction([...])` (the Sprint 05 erasures block, after sprint 04's)
- `prisma/schema/auth.prisma`, the Sprint 05 back-relations block at the end of
  `model User`

In each, find the line `// s05-06 studio-projects`, keep it, and add your code
directly below it, before the blank line that separates it from the next anchor.
Do not touch any other line of those files (other features edit theirs in
parallel; this is what keeps the merges clean). If your anchor is missing, stop
and report it — do not invent one.

## Patterns to copy

- The existing IndexedDB helpers in `lib/studio/project-store.ts`.
- Revision-checked saves: sprint 02 cloud saves (`lib/game-saves/`,
  `components/settings/CloudSaves.tsx`,
  `components/shared/SaveConflictDialog.tsx`).
- Prompt for a name: `usePrompt` from `components/ui/prompt-dialog.tsx` (sprint
  04; never `window.prompt`).

## Gotchas

- The Studio is the app tier (L8): use its existing toolbar classes and
  `--app-*` tokens; do not add site-tier CSS or `--site-*` utilities.
- Validate the body length before parsing (1 MB) and the project shape after
  (`project-schema.ts`); keep `newProject()`'s output valid (test it).
- An id already owned by another member is a 409, never an overwrite.
- Autosave uses `setTimeout`, never `requestAnimationFrame`; `pagehide` saves
  locally only.

## Schema and migration

1. Before editing the schema, snapshot the base schema once:
   ```bash
   cd /home/user/wt/s05-studio-projects
   rm -rf /home/user/wt/.base-s05-studio-projects && mkdir -p /home/user/wt/.base-s05-studio-projects
   git archive HEAD prisma/schema | tar -x -C /home/user/wt/.base-s05-studio-projects
   ```
2. Edit the schema as the specification says (keep each file's style;
   back-relations on `User` only under your anchor in `auth.prisma`).
3. Validate, regenerate the client and write the migration SQL (no database is
   needed; the dummy URL only satisfies `prisma.config.ts`):
   ```bash
   cd /home/user/wt/s05-studio-projects
   export DATABASE_URL=postgresql://x:x@localhost:5432/x
   pnpm -s exec prisma validate
   pnpm -s exec prisma generate
   mkdir -p prisma/migrations/20261125010100_s05_studio_projects
   pnpm -s exec prisma migrate diff --from-schema /home/user/wt/.base-s05-studio-projects/prisma/schema --to-schema prisma/schema --script \
     | grep -v '^Loaded Prisma config' > prisma/migrations/20261125010100_s05_studio_projects/migration.sql
   ```
4. Read the SQL: it must only create tables, add nullable or defaulted columns,
   create indexes and run data `UPDATE`s. Put a two-line `--` comment at the top
   saying what the migration is for (see
   `prisma/migrations/20261121000000_bot_queue/migration.sql`). After you commit
   the migration, run the expand/contract gate (it compares `HEAD` with the
   base, so it only sees committed files):
   ```bash
   cd /home/user/wt/s05-studio-projects && node .github/scripts/check-migrations-additive.mjs claude/autonomous-sprint-05
   ```
   The directory name is fixed: **`20261125010100_s05_studio_projects`**.

## Tests to write

- Main suite: `lib/studio/__tests__/cloud-projects.test.ts`
- Main suite: `lib/account/__tests__/studio-projects-erasure.test.ts`
- Product suite: `lib/studio/__tests__/project-session.product.test.ts`

What each must cover is in the specification's "Testing requirements".
Main-suite tests never touch a real database (mock Prisma); product tests are
pure. Test names follow the file names above so the suites' globs pick them up.
Any `$queryRaw`/`$executeRaw` you write gets a test asserting the real `@@map`
table name and the quoted camelCase column names.

## Checks (and only these — memory is shared with two other implementers)

Do **not** run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev` or
`vite`: a cold typecheck alone needs about 10 GB. Integration runs them. Do
**not** run prettier (or `pnpm format`) over files that existed before you
started: reformatting unrelated lines causes merge conflicts. New files may be
formatted.

```bash
cd /home/user/wt/s05-studio-projects
# your tests
pnpm -s exec vitest run lib/studio/__tests__/cloud-projects.test.ts lib/account/__tests__/studio-projects-erasure.test.ts
pnpm -s exec vitest run --config vitest.product.config.ts lib/studio/__tests__/project-session.product.test.ts
# the gate tests that cover what you touched
pnpm -s exec vitest run lib/api/__tests__/route-table.test.ts lib/__tests__/api-handler-adoption.test.ts \
  lib/__tests__/raw-api-fetch-ratchet.test.ts lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-default-drift.test.ts \
  lib/__tests__/sitemap-coverage.test.ts lib/__tests__/og-page-coverage.test.ts lib/__tests__/test-discovery.test.ts \
  lib/__tests__/design-consistency.test.ts lib/__tests__/steel-flat.test.ts lib/__tests__/ts-escape-hatch-ratchet.test.ts \
  lib/__tests__/raf-loop-allowlist.test.ts lib/__tests__/tsconfig-projects.test.ts lib/__tests__/queries-server-fn-ratchet.test.ts \
  lib/__tests__/i18n-computed-key-ratchet.test.ts lib/__tests__/native-dialog-ratchet.test.ts lib/__tests__/migration-safety.test.ts
# eslint on what you changed (no new warnings)
{ git diff --name-only --diff-filter=ACMR claude/autonomous-sprint-05 -- '*.ts' '*.tsx'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx'; } \
  | sort -u | grep -v routeTree.gen.ts | xargs -r pnpm -s exec eslint
```

If a gate test file named above does not exist under that name, find its current
name with `ls lib/__tests__ lib/api/__tests__` and run that; do not skip it.

Strings, after your UI is written:

```bash
cd /home/user/wt/s05-studio-projects
pnpm i18n:extract
# keep only your namespace; the extractor also rewrites unrelated, drifted catalogs
git diff --name-only -- locales | grep -v '^locales/en/studio-projects.json$' | xargs -r git checkout --
git ls-files --others --exclude-standard locales | xargs -r rm -f
```

Then open `locales/en/studio-projects.json` and check every key you added is
there with its English text.

Generated files: run `pnpm api:routes` after adding, moving or removing an
endpoint module and commit `lib/api/route-table.server.ts` (it is generated in
chunks of 200; never hand-edit it — on any conflict, regenerate). **Never stage
`app/routeTree.gen.ts`, `docs/_generated/facts.json` or
`docs/site-reference/*`** — integration regenerates them. Do not edit
`lib/account/api/account.export.server.ts` or `lib/i18n/config.ts`.

## Committing

- Stage explicitly (`git add <paths>`), then commit in a separate command —
  never `git add -A && git commit` or `git commit -a` (the hook would gate the
  whole tree).
- The commit gate (`pnpm check:consistency --fast`) runs automatically on
  `git commit`. If it fails, fix the cause and commit again. **Never bypass it**
  (`--no-verify`, `RMH_SKIP_COMMIT_GATE=1`). If a step is killed (a `☠` line,
  exit 3), wait for other work to finish and retry; report it if it persists.
  The hook runs the fast gate only (no `tsc`); that is expected.
- If a rule is genuinely wrong for your change, do not work around it: stop and
  describe it in your report.
- Small, focused commits are welcome (for example: schema + server, then UI,
  then tests); each must pass the gate. The message says *why*, in plain
  sentences, and ends with exactly:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017cuJ2SsWzp7mNxZ4xZCcv3
  ```
- Commit only on `autonomous/s05-studio-projects`. Never push, merge, rebase or
  touch the sprint branch or another worktree. Never commit secrets or `.env`
  files.
- No model names, personal names or e-mail addresses in code, comments or commit
  messages beyond the trailer above.

## Done means

- Every functional requirement and acceptance criterion in the specification is
  implemented (or explicitly reported as not done, with the reason).
- Loading, empty, error and signed-out states exist for every new view.
- The checks above pass, and `git status` in the worktree is clean.
- Your final report lists: commits (hash and subject), files added and changed,
  tests added and their results, code lines added (TS/TSX/SQL/CSS) separately
  from docs, anything not done or uncertain, and anything integration must do.
- For integration: integration wires `exportStudioProjects`; the new schema file
  must be picked up by `prisma.config.ts` (check it globs `prisma/schema`).
