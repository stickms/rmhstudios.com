# rmhladder Plan 4/5: Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `/rmhladder` dashboard: 8 routes over the live Postgres data (364 real jobs already seeded by Plan 3's pipeline), per-user actions (save/apply/ignore, applications, prefs, keywords), review-queue resolution, company/source management, and system health — with the "ledger paper & brass" visual identity.

**Architecture:** TanStack Start file routes under `app/routes/rmhladder/` with an auth-gated layout route (mirrors `app/routes/rmhstudy.tsx` exactly: `createServerFn` checkAuth via `auth.api.getSession`, redirect to `/login`). Data access via pure query/mutation helpers in `lib/rmhladder/server/queries.ts` + `actions.ts` (fake-prisma unit-testable), called from route-colocated `createServerFn` handlers. Shell + components in `components/rmhladder/`. Relevance shown to users = `finalRelevance(base, boost)` computed at query time with the user's keywords/watchlist/prefs (Plan 1 contract).

**Tech Stack:** TanStack Start/Router (repo versions), Prisma, Tailwind v4 + hand-rolled CSS tokens file, @fontsource for the three faces, vitest for query/action units. No react-testing-library (repo has none); UI verified by typecheck + dev-server smoke in the final task.

## Global Constraints

- **Design tokens are law** (Task 1 creates `components/rmhladder/rmhladder.css`; every component uses the CSS vars, no raw hex elsewhere): `--ink:#101B2D; --paper:#F4F6F2; --ledger:#1E6B4F; --brass:#A9812F; --signal:#B3372B; --slate:#5A6672;` Fonts: Newsreader (display), IBM Plex Sans (UI), IBM Plex Mono (data/eyebrows). Sanctioned new deps: `@fontsource/newsreader`, `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono` — nothing else.
- Signature element: RungMeter (5-rung ladder glyph, rungs fill bottom-up by relevance quintile; brass rungs, ledger-green when ≥80). Pipeline page renders stages as a climbable ladder (bottom→top: not_applied, planning, applied, networking, interviewing, final_round, then offer at top; rejected/withdrawn rendered OFF the ladder to the side). Restraint everywhere else: no gradients, no numbered section markers, hairlines in `--slate` at 25% opacity max.
- Accessibility floor: visible keyboard focus (`:focus-visible` ring in brass), `prefers-reduced-motion` kills the row-settle animation, all icon-only buttons carry `aria-label`, tables use real `<table>` semantics.
- Every route file: auth comes free from the layout route's `beforeLoad` — child routes NEVER re-check; they read `context.user` (typed via the layout's `beforeLoad` return).
- Server logic testable: `lib/rmhladder/server/queries.ts` and `actions.ts` take a `prisma` argument (PrismaLike structural pattern from Plan 3) — route files pass the real client from `@/lib/prisma.server`; tests pass fakes. No prisma import inside `lib/rmhladder/server/` modules themselves.
- **isUS derivation rule (Plan-3 carry-forward): never filter/derive US-ness from `country` alone** — a job is "US" for display when its LATEST verification status ≠ `non_us_role` AND status ≠ `blocked_or_inaccessible` (the pipeline only persists non-US rows with that status). Default job views EXCLUDE non_us_role.
- Commit per green cycle; suite `pnpm exec vitest run lib/rmhladder`; scoped lint after UI tasks: `pnpm exec eslint lib/rmhladder components/rmhladder app/routes/rmhladder*`; typecheck signal: `pnpm exec tsc --noEmit 2>&1 | grep -E "rmhladder" || true` must print nothing.
- `git status --porcelain` before every commit; only task files.

---

### Task 1: Tokens, fonts, shell, layout route

**Files:**
- Create: `components/rmhladder/rmhladder.css` (tokens + base layer, verbatim block below), `components/rmhladder/RmhLadderShell.tsx`, `components/rmhladder/RungMeter.tsx`, `components/rmhladder/RungMeter.test.tsx` *(pure render-to-string check — see step)*
- Create: `app/routes/rmhladder.tsx` (layout route), `app/routes/rmhladder/index.tsx` (Overview placeholder this task; filled in Task 4)
- Modify: `package.json` (3 @fontsource deps)

**CSS tokens (verbatim start of rmhladder.css):**
```css
.rmhladder {
  --ink: #101B2D; --paper: #F4F6F2; --ledger: #1E6B4F;
  --brass: #A9812F; --signal: #B3372B; --slate: #5A6672;
  --hairline: color-mix(in srgb, var(--slate) 25%, transparent);
  --font-display: 'Newsreader', ui-serif, Georgia, serif;
  --font-ui: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
  --font-data: 'IBM Plex Mono', ui-monospace, monospace;
  background: var(--paper); color: var(--ink); font-family: var(--font-ui);
}
.rmhladder :focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .rmhladder * { animation: none !important; transition: none !important; } }
.rl-eyebrow { font-family: var(--font-data); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--slate); }
.rl-display { font-family: var(--font-display); font-weight: 500; letter-spacing: -0.01em; }
.rl-hairline { border-color: var(--hairline); }
```

**Shell:** left rail 220px — a vertical ladder: two 2px `--ink` rails with rung links between them (nav items: Overview, Jobs, Pipeline, Review, Companies, Alerts, Settings, Health); active rung is brass with the label in `--ink`; collapses to a top bar under 900px. Content area max-width 1200px, 32px gutter. Header per page: `rl-eyebrow` line (e.g. `RMHLADDER · <PAGE>`) above an `rl-display` h1.

**Layout route:** copy `app/routes/rmhstudy.tsx`'s structure exactly (checkAuth server fn → `beforeLoad`, `head` with title `RMH Ladder — Early-Career Tracker`, css `?url` import, shell + `<Outlet/>`). `beforeLoad` returns `{ user }` so children get `context.user`.

**RungMeter:** pure component `({ score: number; size?: 'sm'|'lg' })` — clamps 0–100, fills `Math.ceil(score/20)` of 5 rungs bottom-up; fill color `--brass`, all-5 + score ≥ 80 → `--ledger`; `aria-label={`relevance ${score} of 100`}`. Test: vitest + `renderToString` from `react-dom/server` asserting filled-rung count for scores 0/1/39/80/100 and the aria-label (no DOM library needed).

- [ ] Install fonts (`pnpm add @fontsource/newsreader @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono` — lockfile change sanctioned), import the three in the layout route.
- [ ] RungMeter TDD: renderToString tests RED → implement → GREEN.
- [ ] CSS + Shell + layout route + placeholder index; `pnpm dev` boots and `/rmhladder` renders shell behind login (manual check note in report).
- [ ] Lint + scoped tsc clean → commit `feat(rmhladder): dashboard shell, ledger-paper tokens, RungMeter signature`.

---

### Task 2: Query + action layer (all server logic, fake-prisma tested)

**Files:**
- Create: `lib/rmhladder/server/queries.ts`, `queries.test.ts`, `lib/rmhladder/server/actions.ts`, `actions.test.ts`

**queries.ts exports (each takes `prisma` first arg; each gets ≥1 fake-prisma test):**
```ts
listJobs(prisma, userId, filters: { preset?: 'new'|'finance'|'consulting'|'tech'|'expiring'|'remote'; q?: string; cities?: string[]; programTypes?: string[]; includeNonUS?: boolean; sort?: 'relevance'|'posted'|'deadline'; cursor?: string; take?: number })
  → { rows: JobRow[]; nextCursor: string | null }
  // JobRow: job fields + company name + latestVerification {status, confidence} + userAction + finalRelevance
  // finalRelevance = clamp via finalRelevance(base, computeUserBoost(job→ScorableJob, userCtx).boost); blocked keyword → row EXCLUDED
  // default WHERE: status active, latest verification ∉ {non_us_role, blocked_or_inaccessible} unless includeNonUS
  // presets: new = discoveredAt ≥ now-7d; finance/consulting/tech map to industry/firmType lists (constants in the file); expiring = deadline ≤ now+14d; remote = remoteStatus remote_us
getJobDetail(prisma, userId, jobId) → job + company + ALL verification rows desc + application + alternates
getOverview(prisma, userId) → { newThisWeek, verifiedActive, expiringSoon, openReviewTasks, lastRun: {startedAt, finishedAt, discoveredCount, errorCount} | null, savedCount, appliedCount }
listReviewTasks(prisma, filters {status}) → tasks + job/source/company context
listCompanies(prisma, { q?, enabledOnly? }) → companies + per-platform source status map + activeJobCount
listRuns(prisma, take) → runs desc + their sourceErrors
listStaleSources(prisma, now) → active sources whose lastSuccessAt is null or > 48h old (carry-forward: THE health signal for silently-failing boards)
getSettings(prisma, userId) → prefs (create-default on miss), keywords, watchlist companyIds
listAlerts(prisma, userId) → in-app alert rows desc (Plan 5 populates; empty state now)
```
**actions.ts exports:** `setJobAction(prisma,userId,jobId,'saved'|'applied'|'ignored'|null)` (upsert/delete; 'applied' also upserts a LadderApplication at not_applied→applied w/ appliedDate), `updateApplication(prisma,userId,jobId,patch)` (validated with zod: status enum, dates, strings ≤ 2k), `resolveReviewTask(prisma,userId,taskId,resolution:'verify'|'expire'|'duplicate'|'non_us'|'ignore')` — verify→job status active + verification row (`verified_probable`, 75, 'Manually verified via review queue.'); expire→expired+row; non_us→verification row non_us_role; duplicate/ignore→task-only; ALL set task resolved/resolvedById/resolvedAt, `setCompanyEnabled`, `setCompanyPriority`, `upsertKeyword`/`deleteKeyword`, `updatePrefs` (zod), `toggleWatchlist`.

**Tests:** extend the Plan-3 fake-prisma pattern (new fake supporting findMany w/ simple where subsets used here — keep the fake honest: implement only the query shapes the code uses, listed at top of the fake). Cover: preset filters, non-US exclusion default + includeNonUS, blocked-keyword row exclusion, finalRelevance ordering, cursor pagination (take+1 trick), resolveReviewTask verify-path dual-write, setJobAction applied-creates-application, stale-source 48h boundary.

- [ ] RED (full behavioral test file first) → implement → GREEN → full suite → commit `feat(rmhladder): dashboard query + action layer`.

---

### Task 3: Jobs route — table, filters, drawer, actions

**Files:**
- Create: `app/routes/rmhladder/jobs.tsx`, `components/rmhladder/JobsTable.tsx`, `JobDrawer.tsx`, `FilterChips.tsx`

- Route loader: `createServerFn` wrapping `listJobs(prismaReal, user.id, searchParams)`; filters live in URL search params (validated with zod via Route `validateSearch`) so views are shareable. Server actions: `createServerFn` POST wrappers for `setJobAction`.
- Table (real `<table>`): columns Title (+company under it), Location, Program (eyebrow chip), Posted, Deadline (mono, `--signal` when ≤ 14d with a `⚑` prefix), Verification (badge: ledger-green dot verified_active / slate ring verified_probable / signal non_us when shown), Relevance (RungMeter sm + mono numeral), row actions Save/Apply/Ignore (icon buttons, aria-labels). Row click → drawer. New-since-last-visit rows get the one settle-in animation (`@keyframes rl-settle` 240ms translateY(4px)→0, opacity).
- Drawer (right, 480px): eyebrow `VERIFIED · GREENHOUSE · <ago>`, display title, company + location, RungMeter lg + numeral, **verification evidence sentence verbatim** (spec requirement), description summary, alternates list, buttons: `Open original posting ↗` (originalPostingUrl, `rel="noopener noreferrer"`), Apply link when canonicalApplyUrl differs; Save/Apply/Ignore.
- Filter chips row: the six presets + program-type multi + city multi + `Include non-US` toggle + search box (debounced 300ms → search param).
- Empty state: "No postings match. Loosen a filter, or run the pipeline: `pnpm ladder:run`." (plain, directive).
- [ ] Implement (no UI unit tests — typecheck + lint + manual smoke against live data; queries already tested). Commit `feat(rmhladder): jobs table, filters, detail drawer`.

---

### Task 4: Overview + System Health

**Files:** `app/routes/rmhladder/index.tsx` (replace placeholder), `app/routes/rmhladder/health.tsx`, `components/rmhladder/StatBlock.tsx`

- Overview: display-serif headline stats (Newsreader numerals, eyebrow labels): New this week / Verified active / Expiring soon / Open review; last-run line in mono (`LAST RUN · 2H AGO · 412 FOUND · 0 ERRORS`); quick lists: top-8 by finalRelevance (RungMeter rows linking into Jobs), expiring-soon list. NO charts (recharts exists in repo but a ledger doesn't need pie charts — restraint).
- Health: runs table (started, duration, discovered/new/verified/expired/errors, trigger); **stale-sources panel FIRST** (carry-forward: sources with old/null lastSuccessAt, eyebrow `SILENT ≥ 48H`, brass warning row) — this is the page's thesis; sourceErrors expandable per run; review-queue count link.
- [ ] Implement → typecheck/lint → commit `feat(rmhladder): overview + system health`.

---

### Task 5: Review Queue + Companies

**Files:** `app/routes/rmhladder/review.tsx`, `app/routes/rmhladder/companies.tsx`

- Review: open tasks grouped by reason (eyebrow group headers with counts); each row: job title/company (or source for source-level tasks), reason chip, created ago, context line (evidence or error), one-click resolutions (Verify / Expire / Duplicate / Non-US / Ignore) with optimistic UI + revert on failure; resolved tab (last 50).
- Companies: search + table (name, industry eyebrow, priority stepper 1–5, per-platform source dots: ledger=active, slate=unconfigured, signal=error/blocked, brass=manual, activeJobCount, enabled toggle, watchlist star → toggleWatchlist). Row expand: source list w/ URLs + lastSuccessAt mono.
- [ ] Implement → commit `feat(rmhladder): review queue + companies`.

---

### Task 6: Pipeline (signature page) + Settings + Alerts shell

**Files:** `app/routes/rmhladder/pipeline.tsx`, `components/rmhladder/PipelineLadder.tsx`, `app/routes/rmhladder/settings.tsx`, `app/routes/rmhladder/alerts.tsx`

- **PipelineLadder:** full-height two-rail ladder; stages as rungs bottom→top (not_applied, planning, applied, networking, interviewing, final_round; **offer is the top rung, set in `--ledger` with the only celebratory treatment in the app: small brass serif flourish `※ Offer`**); application cards sit ON their rung (company + title + mono date), click → application editor panel (right column: status select, dates, resume version, referral, contact, notes, follow-up date, interview dates list — updateApplication with zod errors inline); rejected/withdrawn cards rest in a quiet `--slate` side gutter labeled `off the ladder` (honest, not cute — sentence-case eyebrow). Keyboard: cards focusable, arrow-up/down moves status via updateApplication (announce via aria-live).
- Settings: prefs form (relevance threshold slider w/ mono readout, digest frequency, channel toggles incl. discordUserId text, preferred cities multi, program types), keywords manager (boost/block lists, weight steppers, block chips in `--signal` tint), watchlist summary (links to Companies).
- Alerts: list of in-app alert rows (type eyebrow, job link, sent ago) + empty state: "No alerts yet. The worker checks every 6 hours; alert delivery arrives with Plan 5." Mark-read on view (`readAt`).
- [ ] Implement → commit `feat(rmhladder): pipeline ladder, settings, alerts shell`.

---

### Task 7: Wrap — polish pass + full verification + smoke

- [ ] Self-critique pass (Chanel rule): view every page, remove one decoration if any crept in; verify hairlines/eyebrows consistent; check mobile (<900px) shell collapse; keyboard-walk the jobs table and pipeline.
- [ ] `pnpm exec vitest run lib/rmhladder` all green; scoped eslint 0/0; scoped tsc silent; `pnpm dev` smoke with the live 364-job DB: screenshot Overview, Jobs (filtered `finance` preset), a job drawer, Pipeline with ≥1 test application (create via UI), Health. Screenshots to `.superpowers/sdd/p4-smoke/` and summarized in the report.
- [ ] Commit `feat(rmhladder): plan-4 wrap + polish`.

## Deferred to Plan 5
Alert dispatch (email/Discord/digests) populating the Alerts page; CSV import/export; README; "Run now" button on Health (needs a safe trigger path to the worker — decide there); default blocked keywords seeding ('talent acquisition' etc.); prisma migrate.
