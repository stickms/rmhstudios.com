# Brief 04 — Flashcard practice tests

You are a fresh implementer with no other context. This brief and the files it names are everything you need. Build the feature completely — UI, server, persistence and tests as specified — commit it on your feature branch, and report back.

| | |
|---|---|
| Specification | `docs/autonomous/sprint-02/features/04-study-tests.md` |
| Wave | 3 |
| Branch | `autonomous/s02-study-tests` (from `claude/autonomous-sprint-02`) |
| Worktree | `/home/user/wt/s02-study-tests` |
| i18n namespace | `study-tests` |
| Schema | `prisma/schema/rmhstudy.prisma`, migration `20261122030000_s02_flashcard_tests` |

## Who else is working

Built at the same time in other worktrees (do not edit their files; if you find you need to, stop and report it): 09 RMHType daily challenge (`rmhtype-daily`); 15 Audience insights (`audience`).

Already merged into the sprint branch before your wave (their code is in your worktree; reuse it): 03 study-editor, 07 rmhtype-lessons, 01 dev-webhooks, 05 study-stats, 08 rmhtype-progress, 10 security-activity.

## Read first (in this order)

1. The specification: `docs/autonomous/sprint-02/features/04-study-tests.md`. It is
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
  namespace is **`study-tests`**, already registered in `lib/i18n/config.ts` with an
  empty `locales/en/study-tests.json` (wave 0): `useTranslation('study-tests')`. Never put a
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
git worktree add /home/user/wt/s02-study-tests -b autonomous/s02-study-tests claude/autonomous-sprint-02
cd /home/user/wt/s02-study-tests
pnpm install --frozen-lockfile --offline   # ~40 s; hard-links from the pnpm store, runs prisma generate
```

This gives the worktree its own `node_modules` (and its own generated Prisma
client), so nothing you generate affects the other implementers. Work only in
`/home/user/wt/s02-study-tests`; never edit `/home/user/rmhstudios.com`. Every Bash
call starts in a fresh shell: use absolute paths or `cd /home/user/wt/s02-study-tests && …`.

## What you are building

Practice tests generated from a deck at `/study/$deckId/practice`: multiple choice,
written (forgiving grading with an "almost" state), true/false and matching;
a results screen with retake (same seed), new test and "test me on the missed
cards"; signed-in results saved and the last five shown on the deck page. Tests
do not change SM-2 scheduling.

## Files

Create:
- `lib/study/practice-test.ts` (pure): `buildTest(cards, options, seed)`,
  `gradeWritten(expected, given, locale)` → `'correct' | 'almost' | 'wrong'`
  (NFKD + strip combining marks, case-fold with `toLocaleLowerCase(locale)`,
  strip punctuation `\p{P}`, collapse whitespace; Damerau-Levenshtein ≤ 1 →
  `almost` only when the expected answer has ≥ 6 characters), `scoreTest`.
  Seeded randomness only through `mulberry32` / `shuffle` from `lib/core/rng.ts`
  (never `Math.random`, which would break retake-with-the-same-seed; and never a
  local copy of those helpers, which eslint's `no-restricted-syntax` fails).
- `lib/study/tests-schema.ts`, `lib/study/tests.contract.ts`,
  `lib/study/tests.server.ts` (record with bounds checks, list last 20,
  `exportStudyTestData(userId)`), module
  `lib/study/api/study.decks.$id.tests.server.ts` (GET, POST).
- `components/study/PracticeTest.tsx` (setup → questions → results),
  `components/study/questions/{MultipleChoice,Written,TrueFalse,Matching}.tsx`,
  `components/study/TestHistory.tsx` (last five, for the deck page).
- Route `app/routes/_site/study/$deckId_.practice.tsx` (noindex `head()`; loads the
  deck like `$deckId.tsx`; public decks work signed out, results unsaved).
- Tests below.

Modify:
- `prisma/schema/rmhstudy.prisma`: model `FlashcardTestResult` exactly as the
  specification lists (relations to `FlashcardDeck` and `User` with
  `onDelete: Cascade`; add the back-relation fields on `FlashcardDeck` and, in
  `prisma/schema/auth.prisma`, on `User`).
- `components/feed/DeckStudyColumn.tsx`: a "Practice test" link and the
  `TestHistory` block. Keep the change small.
- `lib/sitemap.ts`: `'/study/$deckId/practice': 'personal'` next to
  `'/study/$deckId'`.

## Patterns to copy

- Deck loading and access rules (owner or public): `lib/study/api/study.decks.$id.server.ts`
  and `app/routes/_site/study/$deckId.tsx`.
- Accessible choice UI: native radio inputs inside `fieldset`/`legend`.
- Arrival of the results view: `components/ui/arrive.tsx`.

## Gotchas

- POST bounds: `total` equals the number of questions (1–50), `0 ≤ correct ≤
  total`, every `missedCardIds` entry belongs to the deck (one `count` query),
  `durationMs` clamped to [0, 4 h], `kinds` from the known set.
- A private deck of someone else → 404 for both GET and POST.
- Matching keyboard model: Tab to a column, arrows within it, Enter selects;
  announce each pairing in a polite live region.

## Schema and migration

1. Before editing the schema, snapshot the base schema once:
   ```bash
   cd /home/user/wt/s02-study-tests
   rm -rf /home/user/wt/.base-study-tests && mkdir -p /home/user/wt/.base-study-tests
   git archive HEAD prisma/schema | tar -x -C /home/user/wt/.base-study-tests
   ```
2. Edit `prisma/schema/rmhstudy.prisma` as the specification says (add a relation field on
   `User` in `prisma/schema/auth.prisma` only if your model declares a relation
   to `User`; keep the existing style of the file).
3. Validate, regenerate the client and write the migration SQL (no database is
   needed; the dummy URL only satisfies `prisma.config.ts`):
   ```bash
   cd /home/user/wt/s02-study-tests
   export DATABASE_URL=postgresql://x:x@localhost:5432/x
   pnpm -s exec prisma validate
   pnpm -s exec prisma generate
   mkdir -p prisma/migrations/20261122030000_s02_flashcard_tests
   pnpm -s exec prisma migrate diff --from-schema /home/user/wt/.base-study-tests/prisma/schema --to-schema prisma/schema --script \
     | grep -v '^Loaded Prisma config' > prisma/migrations/20261122030000_s02_flashcard_tests/migration.sql
   ```
   Read the SQL: it must only create tables, add nullable or defaulted columns,
   and create indexes. After you commit the migration, run the expand/contract
   gate (it compares `HEAD` with the base, so it only sees committed files):
   ```bash
   cd /home/user/wt/s02-study-tests && node .github/scripts/check-migrations-additive.mjs claude/autonomous-sprint-02
   ```
   Put a two-line `--` comment at the top of `migration.sql` saying what the
   migration is for (see `prisma/migrations/20261121000000_bot_queue/migration.sql`).
   The migration directory name is fixed: **`20261122030000_s02_flashcard_tests`**.

## Tests to write

- Main suite: `lib/study/__tests__/tests-endpoint.test.ts`
- Product suite: `lib/study/__tests__/practice-test.product.test.ts`

What each must cover is in the specification's "Testing requirements". Keep main-suite tests database-free (mock Prisma); product tests are pure.

## Checks (and only these — memory is shared with two other implementers)

Do **not** run `pnpm typecheck`, `tsc`, `pnpm test`, `pnpm build`, `pnpm dev` or
`vite`: a cold typecheck alone needs about 10 GB. Integration runs them.

```bash
cd /home/user/wt/s02-study-tests
# your tests
pnpm -s exec vitest run lib/study/__tests__/tests-endpoint.test.ts
pnpm -s exec vitest run --config vitest.product.config.ts lib/study/__tests__/practice-test.product.test.ts
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
cd /home/user/wt/s02-study-tests
pnpm i18n:extract
# keep only your namespace; the extractor also rewrites unrelated, drifted catalogs
git diff --name-only -- locales | grep -v '^locales/en/study-tests.json$' | xargs -r git checkout --
git ls-files --others --exclude-standard locales | xargs -r rm -f
```

Then open `locales/en/study-tests.json` and check every key you added is there with
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
- Commit only on `autonomous/s02-study-tests`. Never push, merge, rebase or touch the
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
