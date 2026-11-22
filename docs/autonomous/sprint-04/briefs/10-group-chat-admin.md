# Brief 10 — Manage a group chat

You are a fresh implementer with no other context. This brief and the files it
names are everything you need. Build the feature completely — UI, server,
persistence and tests as specified — commit it on your feature branch, and
report back.

| | |
|---|---|
| Specification | `docs/autonomous/sprint-04/features/10-group-chat-admin.md` |
| Wave | 4 |
| Branch | `autonomous/s04-group-chat-admin` (from `claude/autonomous-sprint-04`) |
| Worktree | `/home/user/wt/s04-group-chat-admin` |
| i18n namespace | `group-chat-admin` |
| Schema | none (no migration) |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you
find you need to, stop and report it): 05 Build insights for creators
(`build-insights`); 14 Hide counts (`quiet-counts`).

Already merged into the sprint branch before your wave (their code is in
your worktree; reuse it, do not redo it): 06 `coin-adjustments`, 09
`reading-sync`, 02 `event-waitlist`, 07 `spending-budget`, 04 `build-releases`,
18 `follow-list-privacy`, 16 `message-requests`, 01 `replay-library`, 03
`tournament-checkin`.

Sprints 02 and 03 are on `main` (sprint 03 landed in #1769) and so in your
worktree: the chart primitives, the product test suite,
`lib/messages/send.server.ts` (`guardDirect`, `isBlockedPair`,
`sendDirectMessage`, `sendGroupMessage`), the community moderation log
(`lib/communities/modlog*.ts`, `logModAction`), member events
(`recordMemberEvent`), the server-function guards
(`lib/auth/server-fn-guards.server.ts`) and the rest.

## Read first (in this order)

1. The specification:
   `docs/autonomous/sprint-04/features/10-group-chat-admin.md`.
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
  Your namespace is **`group-chat-admin`**, already registered in
  `lib/i18n/config.ts`
  with its `locales/en/group-chat-admin.json` (Wave 0):
  `useTranslation('group-chat-admin')`. Never put a `{/* … */}` JSX comment
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
git worktree add /home/user/wt/s04-group-chat-admin -b autonomous/s04-group-chat-admin claude/autonomous-sprint-04
cd /home/user/wt/s04-group-chat-admin
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma
client), so nothing you generate affects the other implementers. Work only in
`/home/user/wt/s04-group-chat-admin`; never edit `/home/user/rmhstudios.com`.
Every Bash call starts in a
fresh shell: use absolute paths or `cd /home/user/wt/s04-group-chat-admin && …`.

## What you are building

Owner management of group chats — rename, add (with block, ban and cap
checks), remove, transfer ownership — a Group info dialog with the member list
for everyone, system lines for each change, a notification for added
members, block checks at creation, and leaving every group on erasure.

## Files

Create:

- `lib/group-chat/manage.ts`, `manage-schema.ts`, `manage.contract.ts`,
  `manage.server.ts`.
- Modules `lib/group-chat/api/group-chats.$id.manage.server.ts` (PATCH),
  `group-chats.$id.members.server.ts` (POST),
  `group-chats.$id.members.$userId.server.ts` (DELETE),
  `group-chats.$id.owner.server.ts` (PUT).
- `components/feed/group-chat/GroupInfoDialog.tsx`.
- Tests below.

Modify:

- `lib/group-chat/api/group-chats.$id.leave.server.ts`: call the extracted
  `leaveGroup`.
- `lib/group-chat/api/group-chats.server.ts` (POST): `refusedForGroup` at
  creation.
- `lib/chat-plus/post.server.ts`: new `SystemAction`s and fallbacks; the
  group message row renders them translated
  (`components/feed/group-chat/GroupMessageRow.tsx`).
- `components/feed/group-chat/GroupHeader.tsx`: open the dialog.
- `lib/account/deletion.server.ts` pre-step `// s04-10 group-chat-admin`:
  `await leaveAllGroups(userId)`.
- `components/feed/NotificationsColumn.tsx` under `// s04-10
  group-chat-admin`: `case 'group_chat': return { label: 'Group chats' };`.

## Anchored shared files

Wave 0 put one comment line per feature in these files:

- `lib/account/deletion.server.ts`, in `anonymizeAccount` before the transaction
  (the Sprint 04 pre-erasure steps block)
- `components/feed/NotificationsColumn.tsx`, the Sprint 04 system labels in
  `systemIdentity`'s `switch`, before `default:`

In each, find the line `// s04-10 group-chat-admin`, keep it, and add your code
directly below it, before the blank line that separates it from the next
anchor. Do not touch any other line of those files (other features edit
theirs in parallel; this is what keeps the merges clean). If your anchor is
missing, stop and report it — do not invent one.

## Patterns to copy

- System lines: `postSystemLine` and `systemFallback` in
  `lib/chat-plus/post.server.ts`, and how timer/theme lines render.
- Realtime: `publishChatUpdate` / `publishGroupMessage` (same file); find how
  a client drops a chat it can no longer read.
- Blocks: `isBlockedPair` in sprint 03's `lib/messages/send.server.ts`; group
  membership guards `guardGroupMembership`/`guardGroup` in the same file
  (scheduled
  group messages re-run them at delivery).
- User search: `searchUsersApi` (`lib/discovery/explore.contract.ts`).

## Gotchas

- Owner checks re-read `Chat.ownerId` inside the transaction.
- Cap 51 under `lockKey(tx, 'group-members:' + chatId)`.
- Refusals never say why ("1 person could not be added").
- Do not change DM behaviour.

## Tests to write

- Main suite: `lib/group-chat/__tests__/group-manage.test.ts`
- Main suite: `lib/account/__tests__/group-chat-erasure.test.ts`
- Product suite: `lib/group-chat/__tests__/manage.product.test.ts`

What each must cover is in the specification's "Testing requirements".
Main-suite tests never touch a real database (mock Prisma); product tests
are pure. Test names follow the file names above so the suites' globs pick
them up. Any `$queryRaw`/`$executeRaw` you write gets a test asserting the
real `@@map` table name and the quoted camelCase column names.

Also run `components/feed/__tests__/GroupChatView.characterization.test.tsx`
(update its snapshot only for the header button, and say so in the commit).

## Checks (and only these — memory is shared with two other implementers)

Do **not** run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev`
or `vite`: a cold typecheck alone needs about 10 GB. Integration runs them.
Do **not** run prettier (or `pnpm format`) over files that existed before you
started: reformatting unrelated lines causes merge conflicts. New files may be
formatted.

```bash
cd /home/user/wt/s04-group-chat-admin
# your tests
pnpm -s exec vitest run lib/group-chat/__tests__/group-manage.test.ts lib/account/__tests__/group-chat-erasure.test.ts
pnpm -s exec vitest run --config vitest.product.config.ts lib/group-chat/__tests__/manage.product.test.ts
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

Strings, after your UI is written:

```bash
cd /home/user/wt/s04-group-chat-admin
pnpm i18n:extract
# keep only your namespace; the extractor also rewrites unrelated, drifted catalogs
git diff --name-only -- locales | grep -v '^locales/en/group-chat-admin.json$' | xargs -r git checkout --
git ls-files --others --exclude-standard locales | xargs -r rm -f
```

Then open `locales/en/group-chat-admin.json` and check every key you added is
there
with its English text.

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
- Commit only on `autonomous/s04-group-chat-admin`. Never push, merge, rebase or
  touch the sprint branch
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
- For integration: No export function (membership is already exported with
  messages; check and report).
