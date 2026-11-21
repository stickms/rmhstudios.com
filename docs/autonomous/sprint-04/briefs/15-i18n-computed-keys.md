# Brief 15 — Every computed translation key reaches the catalogs

You are a fresh implementer with no other context. This brief and the files it
names are everything you need. Build the feature completely — UI, server,
persistence and tests as specified — commit it on your feature branch, and
report back.

| | |
|---|---|
| Specification | `docs/autonomous/sprint-04/features/15-i18n-computed-keys.md` |
| Wave | 7 |
| Branch | `autonomous/s04-i18n-computed-keys` (from `claude/autonomous-sprint-04`) |
| Worktree | `/home/user/wt/s04-i18n-computed-keys` |
| i18n namespace | none of its own (see the specification) |
| Schema | none (no migration) |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you
find you need to, stop and report it): 19 Real dialogs instead of the browser's
(`native-dialogs`).

Already merged into the sprint branch before your wave (their code is in
your worktree; reuse it, do not redo it): 06 `coin-adjustments`, 09
`reading-sync`, 02 `event-waitlist`, 07 `spending-budget`, 04 `build-releases`,
18 `follow-list-privacy`, 16 `message-requests`, 01 `replay-library`, 03
`tournament-checkin`, 10 `group-chat-admin`, 05 `build-insights`, 14
`quiet-counts`, 08 `poll-lifecycle`, 12 `rmhbox-stats`, 17 `community-handover`,
13 `rmhbox-presets`, 11 `achievement-compare`, 20 `flag-targeting`.

Sprints 02 and 03 are on `main` (sprint 03 landed in #1769) and so in your
worktree: the chart primitives, the product test suite,
`lib/messages/send.server.ts` (`guardDirect`, `isBlockedPair`,
`sendDirectMessage`, `sendGroupMessage`), the community moderation log
(`lib/communities/modlog*.ts`, `logModAction`), member events
(`recordMemberEvent`), the server-function guards
(`lib/auth/server-fn-guards.server.ts`) and the rest.

## Read first (in this order)

1. The specification:
   `docs/autonomous/sprint-04/features/15-i18n-computed-keys.md`.
   It is the contract; its acceptance criteria are what review checks.
2. `CLAUDE.md` at the repo root (commit gate, conventions), then
   `app/CLAUDE.md`, `lib/CLAUDE.md` and `components/CLAUDE.md`
   (and `features/CLAUDE.md` if you touch `features/`).
3. `design.md` and, for any UI, `docs/page-consistency.md` §3. Values in
   `docs/plans/2026-11-11-steel-design-implementation.md` are exact; do not
   resolve its section-18 open decisions — if your work seems to need one,
   stop and say so in your report. Also do not decide any of the open owner
   decisions from sprint 03 (moderator notes in the subject's export, the
   deletion grace period, unlisted tournament or listing meta, Apache
   `CF-Connecting-IP` stripping).
4. `docs/autonomous/sprint-04/plan.md` (waves, shared and anchored files).

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
  input with zod, query parameters included** — repeated parameters do not
  survive, so a list is one comma-separated parameter. Never echo a caught
  error to the client.
- **Server functions:** any `createServerFn` you add (route loaders) guards
  **inside its handler** with `requireSessionServerFn` / `requireAdminServerFn`
  from `lib/auth/server-fn-guards.server.ts`; a route's `beforeLoad` does not
  protect a server function.
- **Server-only code** is named `*.server.ts` and never imported from client
  code. Pure logic and zod go in plain files.
- **Prisma** via `import { prisma } from '@/lib/prisma.server'`. Every model
  `@@map`s to snake_case; migrations are additive. **Raw SQL
  (`$queryRaw`/`$executeRaw`) must use the real `@@map` table name and quoted
  camelCase column names** (`"userId"`, `"createdAt"`) — read them in the
  schema and assert them in a test; integration smoke-tests raw SQL against
  Postgres.
- **Caps and races:** a check-then-insert cap (at most N rows, one pending
  offer, one seat left) runs in a transaction that first takes
  `lockKey(tx, '<feature>:<id>')` from `lib/db/advisory-lock.server.ts`
  (Wave 0). A job that must act once claims its rows with a conditional
  `updateMany` (compare-and-set) before acting.
- **Account deletion anonymises in place**, so `onDelete: Cascade` never fires
  for a deleted member: every new per-user table must be deleted (or
  de-identified) explicitly in `anonymizeAccount`
  (`lib/account/deletion.server.ts`, under your anchor) with a test in
  `lib/account/__tests__/<thing>-erasure.test.ts` (copy
  `lib/account/__tests__/study-erasure.test.ts`). Personal data a member owns
  also gets an `export…(userId)` function for the account export (integration
  wires it).
- **Blocked and banned members** are refused wherever members interact
  (blocks in either direction: `UserBlock`; bans: `User.bannedUntil` in the
  future). **Anything that shows content must check every read path** — feed,
  post page, profile, search, embeds, RSS, OG images, admin server functions
  and `/api/v1/**`; sprint 03 leaked drafts through paths it forgot.
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
  skeleton, confirm-dialog, bar-chart, line-chart), lucide icons, `toast` from
  `@/lib/toast`. Tab strips and segmented filters use
  `components/ui/tabs.tsx` — never hand-roll one. **`components/ui/`
  primitives take translated strings as props**; never read a feature
  namespace from inside `components/ui/`. Never use `window.prompt`,
  `window.confirm` or `alert`.
- **Focus:** never use `requestAnimationFrame` to move focus (the rAF allowlist
  gate, `lib/__tests__/raf-loop-allowlist.test.ts`, fails it); use the dialog's
  `onCloseAutoFocus` or a direct `.focus()` in the event handler.
- **i18n:** every user-facing string is `t('key', { defaultValue: 'English' })`
  with a literal key and a literal default (interpolate with `{{name}}`, never
  `${}`; never build a key at run time — feature 15 exists because of that).
  You have no namespace of your own: every string stays in the namespace
  its component already uses. Never put a `{/* … */}` JSX comment
  immediately before a `t()` call (the extractor skips it). Do not edit
  `lib/i18n/config.ts`. `pnpm i18n:extract` scans only `app/**` and
  `components/**`, so every `t()` call lives there: `lib/` code returns data
  and i18n keys, and components translate them. Changing the wording of a
  shipped string needs a new key.
- **Accessibility:** native or Radix primitives, labels on every control,
  focus ring is global (do not override it), 4.5:1 text contrast via the
  tokens, controls 36 px high (44 px on touch).
- **Time zones and day keys:** use `lib/calendar/tz.ts` (`isValidTimeZone`,
  `dayOf`, `wallToUtcMs`, …); do not write another time-zone helper.
- **Strict island:** if you add a new top-level module directory, read
  `tsconfig.strict.json`; do not add `any`, `@ts-ignore` or `@ts-nocheck`
  (`lib/__tests__/ts-escape-hatch-ratchet.test.ts`). A new `*.server.ts`
  inside an engine directory belongs to `tsconfig.site.json` (root
  `CLAUDE.md` §12).
- **Tests:** mission-critical tests (ownership, secrets, auth, money, a
  member's data, erasure) are plain `*.test.ts` in the main suite; pure
  product logic goes in `*.product.test.ts` (the product suite,
  `vitest.product.config.ts`). Main-suite tests never touch a real database:
  mock Prisma the way `lib/notify/__tests__/create-notification-push.test.ts`
  does (`vi.mock('@/lib/prisma.server', …)`) or use a fake like
  `lib/economy/__tests__/fake-db.ts`.

## Worktree (run exactly this, once)

```bash
cd /home/user/rmhstudios.com
git worktree add /home/user/wt/s04-i18n-computed-keys -b autonomous/s04-i18n-computed-keys claude/autonomous-sprint-04
cd /home/user/wt/s04-i18n-computed-keys
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma
client), so nothing you generate affects the other implementers. Work only in
`/home/user/wt/s04-i18n-computed-keys`; never edit `/home/user/rmhstudios.com`.
Every Bash call starts in a
fresh shell: use absolute paths or `cd /home/user/wt/s04-i18n-computed-keys &&
…`.

## What you are building

Literal label maps (the `settings-nav-labels.ts` pattern) for every
computed `t()` key under `app/`, `components/` and `features/`, each with a
test holding it equal to its source list, the keys extracted into the English
catalogs with unchanged text, and a ratchet test that forbids new computed
keys.

## Files

Create:

- One `*-labels.ts` per site (names in the specification) and a
  `*-labels.test.ts` beside each (or under the directory's `__tests__/`).
- `lib/__tests__/i18n-computed-key-ratchet.test.ts`.

Modify:

- The components listed in the specification. Re-run the search first (the
  list may have grown in waves 1–6, including the system labels other
  features added under the `s04-*` anchors in `NotificationsColumn.tsx`):

  ```bash
  grep -rnE '\bt\(\s*`[^`]*\$\{' app components features
  ```
- `locales/en/<ns>.json` for each namespace touched (via `pnpm
  i18n:extract`).

## Patterns to copy

- `components/settings/settings-nav-labels.ts` and
  `components/settings/__tests__/settings-nav-labels.test.ts`: exactly this
  shape.
- Source-scanning ratchets: `lib/__tests__/raw-api-fetch-ratchet.test.ts`,
  `ts-escape-hatch-ratchet.test.ts`.

## Gotchas

- Keep every key name and English default exactly as they are (changing
  wording needs a new key; you are not changing wording).
- English output must not change: characterization snapshots stay green
  **without** updates.
- After `pnpm i18n:extract`, keep the catalogs of the namespaces you touched
  and revert every other catalog the extractor rewrote.
- An open-ended value (server-provided label) maps known values and shows
  the raw text otherwise — never a computed key.

## Tests to write

- Main suite: `lib/__tests__/i18n-computed-key-ratchet.test.ts`

What each must cover is in the specification's "Testing requirements".
Main-suite tests never touch a real database (mock Prisma); product tests
are pure. Test names follow the file names above so the suites' globs pick
them up. Any `$queryRaw`/`$executeRaw` you write gets a test asserting the
real `@@map` table name and the quoted camelCase column names.

Plus every `*-labels.test.ts` you add, and the characterization tests of every
component you touched.

## Checks (and only these — memory is shared with two other implementers)

Do **not** run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev`
or `vite`: a cold typecheck alone needs about 10 GB. Integration runs them.
Do **not** run prettier (or `pnpm format`) over files that existed before you
started: reformatting unrelated lines causes merge conflicts. New files may be
formatted.

```bash
cd /home/user/wt/s04-i18n-computed-keys
# your tests
pnpm -s exec vitest run lib/__tests__/i18n-computed-key-ratchet.test.ts
# the gate tests that cover what you touched
pnpm -s exec vitest run lib/api/__tests__/route-table.test.ts lib/__tests__/api-handler-adoption.test.ts \
  lib/__tests__/raw-api-fetch-ratchet.test.ts lib/__tests__/i18n-catalogs.test.ts lib/__tests__/i18n-default-drift.test.ts \
  lib/__tests__/sitemap-coverage.test.ts lib/__tests__/og-page-coverage.test.ts lib/__tests__/test-discovery.test.ts \
  lib/__tests__/design-consistency.test.ts lib/__tests__/steel-flat.test.ts lib/__tests__/ts-escape-hatch-ratchet.test.ts \
  lib/__tests__/raf-loop-allowlist.test.ts lib/__tests__/tsconfig-projects.test.ts lib/__tests__/queries-server-fn-ratchet.test.ts
# eslint on what you changed (no new warnings)
{ git diff --name-only --diff-filter=ACMR claude/autonomous-sprint-04 -- '*.ts' '*.tsx'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx'; } \
  | sort -u | grep -v routeTree.gen.ts | xargs -r pnpm -s exec eslint
```

If a gate test file named above does not exist under that name, find its
current name with `ls lib/__tests__ lib/api/__tests__` and run that; do not
skip it.

Strings: run `pnpm i18n:extract`, keep the changes to the catalogs of the
namespaces your call sites use, and revert every other catalog the extractor
rewrote (`git checkout -- <file>`). Check each key you touched is present
with unchanged English.

Generated files: run `pnpm api:routes` after adding, moving or removing an
endpoint module and commit `lib/api/route-table.server.ts`. **Never stage
`app/routeTree.gen.ts`, `docs/_generated/facts.json` or
`docs/site-reference/*`** — integration regenerates them. Do not edit
`lib/account/api/account.export.server.ts` or `lib/i18n/config.ts`.

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
- Commit only on `autonomous/s04-i18n-computed-keys`. Never push, merge, rebase
  or touch the sprint branch
  or another worktree. Never commit secrets or `.env` files.
- No model names, personal names or e-mail addresses in code, comments or
  commit messages beyond the trailer above.

## Done means

- Every functional requirement and acceptance criterion in the specification
  is implemented (or explicitly reported as not done, with the reason).
- Loading, empty, error and signed-out states exist for every new view.
- The checks above pass, and `git status` in the worktree is clean.
- Your final report lists: commits (hash and subject), files added and
  changed, tests added and their results, code lines added (TS/TSX/SQL/CSS)
  separately from docs, anything not done or uncertain, and anything
  integration must do.
- For integration: List the catalogs you changed and the key counts added to
  each.
