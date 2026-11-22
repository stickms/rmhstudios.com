# Brief 03 — What this site keeps on your device, and clearing it

You are a fresh implementer with no other context. This brief and the files it
names are everything you need. Build the feature completely — UI, server,
persistence and tests as specified — commit it on your feature branch, and
report back.

| | |
|---|---|
| Specification | `docs/autonomous/sprint-07/features/03-device-data.md` |
| Wave | 5 |
| Branch | `autonomous/s07-device-data` (from `claude/autonomous-sprint-07`) |
| Worktree | `/home/user/wt/s07-device-data` |
| i18n namespace | `device-data` |
| Schema | none |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you find
you need to, stop and report it): 11 Communities in the developer API (`api-communities`), 06 Match times and deadlines in tournaments (`match-scheduling`).

Already merged into the sprint branch before your wave (their code is in your
worktree; reuse it, do not redo it): 01 `slice-it-clipboard`, 08 `study-queue`, 04 `group-admins`, 16 `community-alt-text`, 07 `jam-themes`, 14 `studio-history`, 02 `game-assists`, 10 `api-events`, 13 `admin-batch-lookup`, 05 `group-mentions`, 09 `deck-folders`, 17 `build-screenshots`.

## Read first (in this order)

1. The specification: `docs/autonomous/sprint-07/features/03-device-data.md`.
   It is the contract; its acceptance criteria are what review checks.
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
   ownership transfer in the public mod log, emoji reactions under quiet counts,
   recovery codes and trusted contacts having no product, a deleted member's
   follows, game reviews, guides and jam entries, uploading Studio samples.
4. `docs/autonomous/sprint-07/plan.md` (waves, shared and anchored files), and
   `docs/autonomous/sprint-07/README.md` for what the sprint does and rejects.

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
  it). Your namespace is **`device-data`**, already registered in
  `lib/i18n/config.ts` with its `locales/en/device-data.json` (Wave 0):
  `useTranslation('device-data')`. Never put a `{/* … */}` JSX comment
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

## Sprint 06 and 07 additions

- **Sprint 06 is in your worktree** (merged before Wave 0), including 15 GIF
  descriptions, 16 content warnings and 18 away message: community bans and
  timeouts in the gate, moderator notes, Studio undo/redo and export, the
  feedback inbox, jam feedback, deck updates, group invite links and
  `ChatRemoval`, event occurrences and updates, game webhooks, flashcards in
  the API (`externalId`), build comments, read receipts, ranked polls and
  match result claims. Reuse them; do not redo them.
- **Exports:** if your feature owns personal data, write an
  `export…(userId)` function and add one property under your anchor in
  `lib/account/export-sprint-07.server.ts` (created in Wave 0). Never edit
  `lib/account/api/account.export.server.ts`.
- **Admin actions** are audited with `recordAdminActionIn(tx, …)`
  (`lib/admin-audit.server.ts`) inside the same transaction as the change.
- **Indexes on existing tables** are `CREATE INDEX CONCURRENTLY` in a migration
  of their own (one statement), followed by an `_ensure_valid` migration (copy
  `prisma/migrations/20261126060101_s06_flashcard_external_id_index` and
  `20261126060102_s06_flashcard_external_id_index_ensure_valid`). Declare the
  index in the schema with `@@index` and use **Prisma's default name**
  (`<table>_<columns>_idx`) in the SQL, so the schema and the database never
  drift.
- **Read-path registries:** a feature that changes what some readers see lists
  every server path that must apply it in an exported constant and holds that
  list with a source-scan test, the way `QUIET_COUNT_READ_PATHS` and
  `FOLLOW_LIST_READ_PATHS` do.
- **Client code and zod:** a client module must not import `zod` statically on
  a hot route (`lib/__tests__/zod-off-hot-routes.test.ts`); lazy-load a dialog
  that needs a schema, and import contract types with `import type`.
- **No `/api` fetch inside `useEffect`** (`lib/__tests__/useeffect-fetch-ratchet.test.ts`):
  reads go through React Query (`useQuery` with `api(contract, input)`), writes
  through mutations or event handlers.
- **i18n keys:** use the plain `t` from `useTranslation` (never an alias such as
  `const { t: tx }`), with literal keys; changed wording means a new key.
- **Fixtures:** never put credential-shaped strings (anything that looks like
  an API key, token or private key) in tests or fixtures; GitHub push
  protection rejects them. Use obviously fake values such as `test-key-1`.
- **Developer API** changes are additive only; after any change run
  `pnpm sdk:generate` and `pnpm docs:api` and commit their output; every new
  field must have a non-`unknown` SDK type (add a `NULLABLE` entry in
  `scripts/generate-sdk.ts` for fields whose example is `null`).
- **Steel defaults for open decisions:** inline notices are a line of text on a
  rule, never a tinted box (D8 is open); admin and data views are rows on rules
  with `t-meta` figures (D10 is open).

## Worktree (run exactly this, once)

```bash
cd /home/user/rmhstudios.com
git worktree add /home/user/wt/s07-device-data -b autonomous/s07-device-data claude/autonomous-sprint-07
cd /home/user/wt/s07-device-data
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma
client), so nothing you generate affects the other implementers. Work only in
`/home/user/wt/s07-device-data`; never edit `/home/user/rmhstudios.com`. Every Bash call starts in a
fresh shell: use absolute paths or `cd /home/user/wt/s07-device-data && …`.

## What you are building

A client-only registry of every IndexedDB database, localStorage key prefix and cache the site writes (held by a source-scan test); `/settings/device` listing what is present with sizes and Clear; an opt-in "clear on sign-out" through one sign-out helper used by all four sign-out call sites; deletion always clears this device.

## Files

Create:

- `lib/device-data/registry.ts`, `inspect.ts`, `clear.ts`, `sign-out.ts`
- `app/routes/_site/settings/device.tsx`, `components/settings/DeviceDataPanel.tsx`
- Tests below

Modify:

- `components/shell/AccountMenu.tsx`, `components/shell/GlobeBar.tsx`, `components/site/CommandPalette.tsx`, `components/settings/SignInMethodsPanel.tsx` (sign-out through the helper)
- `components/site/DeleteAccountPanel.tsx`

## Anchored shared files

Wave 0 put one comment line per feature in these files:

- `lib/sitemap.ts`, `EXCLUDED_ROUTES`, the Sprint 07 static personal paths block
- `lib/settings-nav.ts`, `components/settings/settings-nav-labels.ts` and `components/settings/__tests__/settings-nav-labels.product.test.ts` (the Sprint 07 lines)

In each, find the line that starts with `s07-03 device-data` (as `// s07-03 device-data`
or `{/* s07-03 device-data */}`), keep it, and add your code directly below it,
before the blank line that separates it from the next anchor. Do not touch any
other line of those files (other features edit theirs in parallel; this is what
keeps the merges clean). If your anchor is missing, stop and report it — do not
invent one.

## Patterns to copy

- The stores themselves: `lib/studio/project-store.ts`, `lib/library/reader-store.ts`, `hooks/useDraft.ts`, `public/sw.js` cache names.
- Read-path registry tests: `lib/feed/quiet-counts.ts` `QUIET_COUNT_READ_PATHS` and its test.

## Gotchas

- No server change; nothing found is sent anywhere.
- Read storage only in the browser; render the frame on the server.
- A blocked `deleteDatabase` must be reported per row.
- Personal-only clear keeps theme, language and remembered tabs.
- **Never delete Studio projects, samples or `useDraft` drafts without the
  keep-or-delete confirm** (sign-out and account deletion alike); the default
  focus is "keep". The Studio store has no sync flag, so treat every local
  project as possibly unsynced.

## Schema and migration

None. Do not edit `prisma/schema/**`; if you find you need to, stop and report it.

## Tests to write

- Main suite: `lib/device-data/__tests__/device-registry.test.ts`
- Main suite: `lib/device-data/__tests__/clear.test.ts`
- A component test for the sign-out helper and the deletion panel.

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
cd /home/user/wt/s07-device-data
# your tests
pnpm -s exec vitest run lib/device-data/__tests__/device-registry.test.ts lib/device-data/__tests__/clear.test.ts
# the gate tests that cover what you touched
pnpm -s exec vitest run lib/api/__tests__/route-table.test.ts lib/__tests__/api-handler-adoption.test.ts \
  lib/__tests__/raw-api-fetch-ratchet.test.ts lib/__tests__/useeffect-fetch-ratchet.test.ts lib/__tests__/zod-off-hot-routes.test.ts \
  lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-default-drift.test.ts lib/__tests__/i18n-computed-key-ratchet.test.ts \
  lib/__tests__/sitemap-coverage.test.ts lib/__tests__/og-page-coverage.test.ts lib/__tests__/test-discovery.test.ts \
  lib/__tests__/design-consistency.test.ts lib/__tests__/steel-flat.test.ts lib/__tests__/arrival-coverage.test.ts \
  lib/__tests__/ts-escape-hatch-ratchet.test.ts lib/__tests__/raf-loop-allowlist.test.ts lib/__tests__/tsconfig-projects.test.ts \
  lib/__tests__/queries-server-fn-ratchet.test.ts lib/__tests__/server-fn-guard-ratchet.test.ts \
  lib/__tests__/native-dialog-ratchet.test.ts lib/__tests__/migration-safety.test.ts lib/__tests__/ios-edge-contract.test.ts
# eslint on what you changed (no new warnings)
{ git diff --name-only --diff-filter=ACMR claude/autonomous-sprint-07 -- '*.ts' '*.tsx'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx'; } \
  | sort -u | grep -v routeTree.gen.ts | xargs -r pnpm -s exec eslint
```

Also run (existing tests that must stay green): the existing tests of the four sign-out components and `DeleteAccountPanel`, if any (find them with `ls components/*/__tests__`).

If a gate test file named above does not exist under that name, find its current
name with `ls lib/__tests__ lib/api/__tests__` and run that; do not skip it.

Strings, after your UI is written:

```bash
cd /home/user/wt/s07-device-data
pnpm i18n:extract
# keep only your namespace (and feed.json if you add a notification label); the extractor also rewrites unrelated, drifted catalogs
git diff --name-only -- locales | grep -v '^locales/en/device-data.json$' | grep -v '^locales/en/feed.json$' | xargs -r git checkout --
git ls-files --others --exclude-standard locales | xargs -r rm -f
```

Then open `locales/en/device-data.json` and check every key you added is there with
its English text. If you added no label, also `git checkout -- locales/en/feed.json`.

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
  sentences, and ends with exactly the commit attribution lines your session's
  instructions give.
- Commit only on `autonomous/s07-device-data`. Never push, merge, rebase or touch the sprint branch or
  another worktree. Never commit secrets or `.env` files.
- No model names, personal names or e-mail addresses in code, comments or commit
  messages beyond those attribution lines.

## Done means

- Every functional requirement and acceptance criterion in the specification is
  implemented (or explicitly reported as not done, with the reason).
- Loading, empty, error and signed-out states exist for every new view.
- The checks above pass, and `git status` in the worktree is clean.
- Your final report lists: commits (hash and subject), files added and changed,
  tests added and their results, code lines added (TS/TSX/SQL/CSS) separately
  from docs, anything not done or uncertain, and anything integration must do.
- For integration: One new page (route tree).
