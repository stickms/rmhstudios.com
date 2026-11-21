# Brief 16 — Message requests

You are a fresh implementer with no other context. This brief and the files it
names are everything you need. Build the feature completely — UI, server,
persistence and tests as specified — commit it on your feature branch, and
report back.

| | |
|---|---|
| Specification | `docs/autonomous/sprint-04/features/16-message-requests.md` |
| Wave | 3 |
| Branch | `autonomous/s04-message-requests` (from `claude/autonomous-sprint-04`) |
| Worktree | `/home/user/wt/s04-message-requests` |
| i18n namespace | `message-requests` |
| Schema | `prisma/schema/messaging.prisma` (`MessageRequest`) and `prisma/schema/profile.prisma` (`UserProfile.dmRequests`), migration `20261124030000_s04_message_requests` |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you
find you need to, stop and report it): 01 Your replays and replay boards
(`replay-library`); 03 Tournament check-in (`tournament-checkin`).

Already merged into the sprint branch before your wave (their code is in
your worktree; reuse it, do not redo it): 06 `coin-adjustments`, 09
`reading-sync`, 02 `event-waitlist`, 07 `spending-budget`, 04 `build-releases`,
18 `follow-list-privacy`.

Sprints 02 and 03 are on `main` (sprint 03 landed in #1769) and so in your
worktree: the chart primitives, the product test suite,
`lib/messages/send.server.ts` (`guardDirect`, `isBlockedPair`,
`sendDirectMessage`, `sendGroupMessage`), the community moderation log
(`lib/communities/modlog*.ts`, `logModAction`), member events
(`recordMemberEvent`), the server-function guards
(`lib/auth/server-fn-guards.server.ts`) and the rest.

## Read first (in this order)

1. The specification:
   `docs/autonomous/sprint-04/features/16-message-requests.md`.
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
  Your namespace is **`message-requests`**, already registered in
  `lib/i18n/config.ts`
  with its `locales/en/message-requests.json` (Wave 0):
  `useTranslation('message-requests')`. Never put a `{/* … */}` JSX comment
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
git worktree add /home/user/wt/s04-message-requests -b autonomous/s04-message-requests claude/autonomous-sprint-04
cd /home/user/wt/s04-message-requests
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma
client), so nothing you generate affects the other implementers. Work only in
`/home/user/wt/s04-message-requests`; never edit `/home/user/rmhstudios.com`.
Every Bash call starts in a
fresh shell: use absolute paths or `cd /home/user/wt/s04-message-requests && …`.

## What you are building

An opt-in "message requests" mode for members with restricted DMs: one
text message from an otherwise-refused sender waits in a Requests folder,
with Accept, Decline (30-day cooldown) and Block, enforced through one gate on
every DM write path.

## Files

Create:

- `lib/messages/requests.ts`, `requests-schema.ts`, `requests.contract.ts`,
  `requests.server.ts` (`requestGate`, create, accept, decline, list).
- Modules `lib/messages/api/messages.requests.server.ts` (GET),
  `messages.requests.$id.server.ts` (POST).
- `app/routes/_site/messages/requests.tsx`,
  `components/messages/RequestsList.tsx`.
- Tests below.

Modify:

- `prisma/schema/messaging.prisma`, `prisma/schema/profile.prisma`;
  back-relations on `User` under `// s04-16 message-requests`.
- Every DM write path calls `requestGate`: `lib/messages/api/messages.server.ts`
  (start); `guardDirect` in `lib/messages/send.server.ts` (sprint 03 — the one
  guard `sendDirectMessage` runs, so the send endpoint and scheduled delivery
  (`runDueScheduledMessages` in `lib/messages/scheduled.server.ts`) are both
  covered); `lib/messages/voice.server.ts`; `lib/chat-plus/dm-privacy.server.ts`
  (`canDirectMessage`, forwards); and `scheduleMessage` in
  `lib/messages/scheduled.server.ts` (refuse scheduling into a pending
  request).
- The conversation list (`lib/messages/api/messages.server.ts` GET and the
  sidebar `/api/messages/sidebar`): hide pending requests from the
  recipient; the sidebar payload carries the requests count.
- `components/feed/MessagesColumn.tsx` (Requests entry), the DM composer
  (`components/feed/conversation/ComposerBar.tsx`) for the sender's states.
- `components/feed/profile-edit/PrivacySection.tsx`,
  `profile-edit-state.ts`, `useProfileSave.ts`, `lib/profile-schema.ts`,
  `lib/api/routes/profile.server.ts`: the switch.
- `lib/account/deletion.server.ts` under `// s04-16 message-requests`;
  `lib/sitemap.ts` `EXCLUDED_ROUTES` under `// s04-16 message-requests`
  (`'/messages/requests': 'personal'`).

## Anchored shared files

Wave 0 put one comment line per feature in these files:

- `lib/account/deletion.server.ts`, inside `anonymizeAccount`'s
  `$transaction([...])` (the Sprint 04 erasures block)
- `prisma/schema/auth.prisma`, the Sprint 04 back-relations block at the end of
  `model User`
- `lib/sitemap.ts`, the Sprint 04 block in `EXCLUDED_ROUTES` (static paths)

In each, find the line `// s04-16 message-requests`, keep it, and add your code
directly below it, before the blank line that separates it from the next
anchor. Do not touch any other line of those files (other features edit
theirs in parallel; this is what keeps the merges clean). If your anchor is
missing, stop and report it — do not invent one.

## Patterns to copy

- DM privacy and blocks: `canDirectMessage`, `isBlockedPair` and the send
  path in sprint 03's `lib/messages/send.server.ts`.
- Hiding a DM: `DirectMessageHide`.
- 18 (wave 2) added `followListVisibility` to the same privacy section and
  update path: follow its pattern.

## Gotchas

- With the switch off, behaviour must be byte-for-byte today's.
- A pending request: no push, no unread count, no receipts, typing or
  presence for the sender.
- Caps and the one-request rule under `lockKey(tx, 'dm-request:' +
  senderId)`.
- The decline cooldown reuses the generic privacy refusal text.

## Schema and migration

1. Before editing the schema, snapshot the base schema once:
   ```bash
   cd /home/user/wt/s04-message-requests
   rm -rf /home/user/wt/.base-s04-message-requests && mkdir -p /home/user/wt/.base-s04-message-requests
   git archive HEAD prisma/schema | tar -x -C /home/user/wt/.base-s04-message-requests
   ```
2. Edit the schema as the specification says (keep each file's style;
   back-relations on `User` only under your anchor in `auth.prisma`).
3. Validate, regenerate the client and write the migration SQL (no database
   is needed; the dummy URL only satisfies `prisma.config.ts`):
   ```bash
   cd /home/user/wt/s04-message-requests
   export DATABASE_URL=postgresql://x:x@localhost:5432/x
   pnpm -s exec prisma validate
   pnpm -s exec prisma generate
   mkdir -p prisma/migrations/20261124030000_s04_message_requests
   pnpm -s exec prisma migrate diff --from-schema /home/user/wt/.base-s04-message-requests/prisma/schema --to-schema prisma/schema --script \
     | grep -v '^Loaded Prisma config' > prisma/migrations/20261124030000_s04_message_requests/migration.sql
   ```
4. Read the SQL: it must only create tables, add nullable or defaulted
   columns, create indexes and run data `UPDATE`s. Put a two-line `--`
   comment at the top saying what the migration is for (see
   `prisma/migrations/20261121000000_bot_queue/migration.sql`). After you
   commit the migration, run the expand/contract gate (it compares `HEAD`
   with the base, so it only sees committed files):
   ```bash
   cd /home/user/wt/s04-message-requests && node .github/scripts/check-migrations-additive.mjs claude/autonomous-sprint-04
   ```
   The directory name is fixed: **`20261124030000_s04_message_requests`**.

## Tests to write

- Main suite: `lib/messages/__tests__/message-requests.test.ts`
- Main suite: `lib/account/__tests__/message-requests-erasure.test.ts`
- Product suite: `lib/messages/__tests__/requests.product.test.ts`

What each must cover is in the specification's "Testing requirements".
Main-suite tests never touch a real database (mock Prisma); product tests
are pure. Test names follow the file names above so the suites' globs pick
them up. Any `$queryRaw`/`$executeRaw` you write gets a test asserting the
real `@@map` table name and the quoted camelCase column names.

Also run the conversation characterization tests
(`components/feed/__tests__/ConversationView.characterization.test.tsx`) and
sprint 03's `lib/messages/__tests__/scheduled-messages.test.ts`.

## Checks (and only these — memory is shared with two other implementers)

Do **not** run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev`
or `vite`: a cold typecheck alone needs about 10 GB. Integration runs them.
Do **not** run prettier (or `pnpm format`) over files that existed before you
started: reformatting unrelated lines causes merge conflicts. New files may be
formatted.

```bash
cd /home/user/wt/s04-message-requests
# your tests
pnpm -s exec vitest run lib/messages/__tests__/message-requests.test.ts lib/account/__tests__/message-requests-erasure.test.ts
pnpm -s exec vitest run --config vitest.product.config.ts lib/messages/__tests__/requests.product.test.ts
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
cd /home/user/wt/s04-message-requests
pnpm i18n:extract
# keep only your namespace; the extractor also rewrites unrelated, drifted catalogs
git diff --name-only -- locales | grep -v '^locales/en/message-requests.json$' | xargs -r git checkout --
git ls-files --others --exclude-standard locales | xargs -r rm -f
```

Then open `locales/en/message-requests.json` and check every key you added is
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
- Commit only on `autonomous/s04-message-requests`. Never push, merge, rebase or
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
- For integration: Export function `exportMessageRequests(userId)`;
  `UserProfile.dmRequests` column (tell integration if the export selects
  profile fields).
