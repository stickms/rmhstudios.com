# Brief 03 — Mute a conversation and pin a reply

You are a fresh implementer with no other context. This brief and the files it
names are everything you need. Build the feature completely — UI, server,
persistence and tests as specified — commit it on your feature branch, and
report back.

| | |
|---|---|
| Specification | `docs/autonomous/sprint-03/features/03-conversation-controls.md` |
| Wave | 5 |
| Branch | `autonomous/s03-conversation-controls` (from `claude/autonomous-sprint-03`) |
| Worktree | `/home/user/wt/s03-conversation-controls` |
| i18n namespace | `conversation-controls` |
| Schema | `prisma/schema/social.prisma`, migration `20261123050000_s03_pinned_reply` |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you find
you need to, stop and report it): 06 API key restrictions: allowed addresses and
a lower rate limit (`key-restrictions`); 02 Daily puzzle statistics
(`daily-stats`).

Already merged into the sprint branch before your wave (their code is in your
worktree; reuse it): 13 community-rules, 01 music-history, 17 ladder-offers, 14
community-modlog, 16 my-reports, 12 send-later, 15 community-insights, 20
report-triage, 05 log-drafts, 19 message-alt-text, 18 ladder-insights, 09
watch-parties. Sprint 02 (`docs/autonomous/sprint-02/`) is merged too: its chart
primitives, product test suite and features are in your worktree.

## Read first (in this order)

1. The specification:
   `docs/autonomous/sprint-03/features/03-conversation-controls.md`. It is the
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
  namespace is **`conversation-controls`**, already registered in
  `lib/i18n/config.ts` with its `locales/en/conversation-controls.json` (Wave
  0): `useTranslation('conversation-controls')`. Never put a `{/* … */}` JSX
  comment immediately before a `t()` call (the extractor skips it). Do not edit
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
git worktree add /home/user/wt/s03-conversation-controls -b autonomous/s03-conversation-controls claude/autonomous-sprint-03
cd /home/user/wt/s03-conversation-controls
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma
client), so nothing you generate affects the other implementers. Work only in
`/home/user/wt/s03-conversation-controls`; never edit
`/home/user/rmhstudios.com`. Every Bash call starts in a fresh shell: use
absolute paths or `cd /home/user/wt/s03-conversation-controls && …`.

## What you are building

Two conversation controls on feed posts: anyone can mute a post's whole
conversation (All / Mentions only / None, with 24 h, 7 day or open-ended mutes)
by extending `ConversationPref` with a `post:<rootId>` scope that
`createNotification` honours; the post's author can pin one reply, shown first
with a label. Settings gains a Muted conversations list.

## Files

Create:

- `lib/feed/conversation-controls.ts` (pure: root resolution, reply ordering
  with the pinned reply first, mute durations).
- `lib/feed/conversation-controls.server.ts`,
  `lib/feed/conversation-controls-schema.ts`,
  `lib/feed/conversation-controls.contract.ts`.
- Modules `lib/feed/api/rmharks.$id.mute.server.ts` (GET, PUT, DELETE),
  `lib/feed/api/rmharks.$id.pin-reply.server.ts` (PUT, DELETE),
  `lib/notify/api/settings.muted-conversations.server.ts` (GET).
- `components/feed/MuteConversationMenu.tsx`,
  `components/settings/MutedConversationsSection.tsx`.
- Tests below.

Modify:

- `lib/notify/conversation-prefs.server.ts`: scope `post` and its regex.
- `lib/notifications.server.ts`: optional `conversationKey` and `addressed` on
  `createNotification`'s input; when present run the same gate as
  `lib/notify/dispatch.server.ts` (`getConversationPref`, `shouldDeliver`). For
  batch callers, a `getConversationPrefs` lookup for many recipients.
- Callers about a post pass the key:
  `lib/feed/api/rmharks.$id.comment.server.ts`, `rmharks.$id.like.server.ts`,
  `rmharks.$id.repost.server.ts`, the quote path (`lib/feed/quotes.server.ts`),
  `rmharks.$id.comment.$commentId.like.server.ts`,
  `lib/feed/notify-mentions.server.ts` (mentions are always `addressed`).
- `prisma/schema/social.prisma`: `RMHark.pinnedCommentId`; the hide and delete
  comment handlers (`rmharks.$id.comment.$commentId.hide.server.ts`,
  `rmharks.$id.comment.$commentId.server.ts`) clear it.
- `components/feed/RMHarkOverflowMenu.tsx` and `FeedRowMenu.tsx` (mute entry),
  `components/feed/CommentItem.tsx` (Pin/Unpin for the author),
  `components/feed/post-detail/ReplyList.tsx` (pinned first, label).
- `app/routes/_site/settings/notifications.tsx` (mount the section).
- `lib/api/serializers.server.ts` (v1 post: `pinnedReplyId`) and the post detail
  loader.

## Patterns to copy

- Scope-keyed prefs and the gate: `lib/notify/conversation-prefs.server.ts`,
  `lib/notify/dispatch.server.ts`.
- Author-only comment action:
  `lib/feed/api/rmharks.$id.comment.$commentId.hide.server.ts`.
- Visibility: `viewerVisiblePostWhere` in `lib/feed/audience.server.ts`.

## Gotchas

- The scope id is the thread root (`threadRootId ?? id`), resolved on the server
  from a post the caller can see; never accept a raw scope key.
- Do not change behaviour for callers that pass no `conversationKey`.
- `createNotification` is called by many features; keep its new fields optional
  and its existing tests green
  (`lib/notify/__tests__/create-notification-push.test.ts`).

## Schema and migration

1. Before editing the schema, snapshot the base schema once:
   ```bash
   cd /home/user/wt/s03-conversation-controls
   rm -rf /home/user/wt/.base-s03-conversation-controls && mkdir -p /home/user/wt/.base-s03-conversation-controls
   git archive HEAD prisma/schema | tar -x -C /home/user/wt/.base-s03-conversation-controls
   ```
2. Edit `prisma/schema/social.prisma` as the specification says (keep the file's
   style; back-relations on `User` only under your anchor in `auth.prisma`).
3. Validate, regenerate the client and write the migration SQL (no database is
   needed; the dummy URL only satisfies `prisma.config.ts`):
   ```bash
   cd /home/user/wt/s03-conversation-controls
   export DATABASE_URL=postgresql://x:x@localhost:5432/x
   pnpm -s exec prisma validate
   pnpm -s exec prisma generate
   mkdir -p prisma/migrations/20261123050000_s03_pinned_reply
   pnpm -s exec prisma migrate diff --from-schema /home/user/wt/.base-s03-conversation-controls/prisma/schema --to-schema prisma/schema --script \
     | grep -v '^Loaded Prisma config' > prisma/migrations/20261123050000_s03_pinned_reply/migration.sql
   ```
   Add any data step the specification asks for (a backfill `UPDATE`) by
   hand at the end of the file.

4. Read the SQL: it must only create tables, add nullable or defaulted
   columns, create indexes and run data `UPDATE`s. Put a two-line `--` comment
   at the top saying what the migration is for (see
   `prisma/migrations/20261121000000_bot_queue/migration.sql`). After you commit
   the migration, run the expand/contract gate (it compares `HEAD` with the
   base, so it only sees committed files):
   ```bash
   cd /home/user/wt/s03-conversation-controls && node .github/scripts/check-migrations-additive.mjs claude/autonomous-sprint-03
   ```
   The directory name is fixed: **`20261123050000_s03_pinned_reply`**.

## Tests to write

- Main suite: `lib/notify/__tests__/post-conversation-mute.test.ts`
- Main suite: `lib/feed/__tests__/pin-reply.test.ts`
- Product suite: `lib/feed/__tests__/reply-order.product.test.ts`

What each must cover is in the specification's "Testing requirements".
Main-suite tests never touch a real database (mock Prisma); product tests are
pure. Test names follow the file names above so the suites' globs pick them up.

## Checks (and only these — memory is shared with two other implementers)

Do **not** run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev` or
`vite`: a cold typecheck alone needs about 10 GB. Integration runs them.

```bash
cd /home/user/wt/s03-conversation-controls
# your tests
pnpm -s exec vitest run lib/notify/__tests__/post-conversation-mute.test.ts lib/feed/__tests__/pin-reply.test.ts
pnpm -s exec vitest run --config vitest.product.config.ts lib/feed/__tests__/reply-order.product.test.ts
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
cd /home/user/wt/s03-conversation-controls
pnpm i18n:extract
# keep only your namespace; the extractor also rewrites unrelated, drifted catalogs
git diff --name-only -- locales | grep -v '^locales/en/conversation-controls.json$' | xargs -r git checkout --
git ls-files --others --exclude-standard locales | xargs -r rm -f
```

Then open `locales/en/conversation-controls.json` and check every key you added
is there with its English text.

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
- Commit only on `autonomous/s03-conversation-controls`. Never push, merge,
  rebase or touch the sprint branch or another worktree. Never commit secrets or
  `.env` files.
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
