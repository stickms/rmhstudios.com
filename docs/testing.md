# Testing

How tests are organized, how to run them, and how CI gates them. For the build
and deploy pipeline see [`architecture.md`](./architecture.md) §2–3 and
[`../deploy/README.md`](../deploy/README.md); this doc is about tests.

> Sources of truth: `vitest.config.ts`, `vitest.epic.config.ts`, the `testing/`
> tree, `go-services/**/*_test.go`, and the `.github/workflows/*` files. When a
> doc disagrees with those, the files win.
>
> File counts are generated, not hand-written: see `testFiles` in
> [`_generated/facts.json`](./_generated/facts.json) (`pnpm facts:check` keeps it
> honest). Timings are not recorded here; measure with `time pnpm test`.
> `lib/__tests__/test-discovery.test.ts` keeps that accounting honest.
>
> The suite is deliberately **narrow**: it covers what costs money, data, or
> access if it breaks, and does not cover how the games play. Read
> [What is not tested](#what-is-not-tested) before assuming a green run means
> a working feature.

## TL;DR — run tests locally

```bash
pnpm check:consistency        # the commit gate (guard tests + lint + tsc + docs freshness)
pnpm check:consistency --fast # what the hooks run: no tsc, no docs freshness (about 10 s, under 1 GB)
pnpm test                     # main suite (vitest.config.ts); measure with `time pnpm test`
pnpm test features/slice-it/engine        # one file or directory
pnpm test:watch               # watch mode
pnpm test:coverage            # V8 coverage → text + coverage/index.html + lcov
pnpm test:epic                # epic content-build suite (needs Chromium)
pnpm test:integration         # real flows against a running app + throwaway Postgres (see §8)
make test                     # Go (Bazel) + the frontend vitest suite
```

`pnpm test <path>` takes any file or directory. It did not always: discovery
used to be a hand-written list of globs and a path outside it answered _"No test
files found."_ See [Discovery](#discovery) — that is now a gate.

**Per-commit:** `pnpm check:consistency` (`scripts/check-consistency.sh`) runs
the subset of the suite that encodes the site's conventions — the design/tab
gate, the game-viewport contract, the filter-cost budget, the theme-token and
colour-vision contracts, the API-handler adoption backlog, the i18n catalog and
namespace integrity, the rAF-loop allowlist, the server-bundle copy check, the
FOUC contract and the test-discovery gate — plus eslint on the changed files,
`tsc`, and the generated-docs freshness checks. The class-string conventions (raw palette colours, hardcoded radii, `transition-all`, dead `tailwindcss-animate` classes) are not tests: they are eslint `local/no-raw-palette-color`, `local/no-hardcoded-radius`, `local/no-transition-all` and `local/no-dead-animate-classes`, scoped by `eslint-local-rules/design-scope.js`. That subset is deliberately the fast one (measure with `time pnpm check:consistency --fast`). It is wired into
`git commit` by `.githooks/pre-commit` (`pnpm hooks:install`) and by
`.claude/hooks/commit-gate.sh` in agent sessions. A new guard test belongs in
the `GATE_TESTS` list in `scripts/check-consistency.sh`.

### The commit gate's budget

The fast gate (`pnpm check:consistency --fast`, what both hooks run) has a
budget: **under 60 s and under 3 GB peak** on a 4-core / 15 GB cloud container.
It was already inside it before audit OP1 touched it, which is the finding: the
fast gate was never the step that ran out of memory. Measured 2026-11-12 on that box, wall time and peak
resident memory summed over the step's whole process tree:

| Staged change                 | Step                    | Before (time · peak) | After (time · peak) |
| ----------------------------- | ----------------------- | -------------------- | ------------------- |
| 3 components (`.tsx`)         | whole gate              | 10.2 s · 907 MB      | 10.2 s · 643 MB     |
|                               | vitest, 28 gate files   | 7.9 s · 1010 MB      | 8.1 s · 656 MB      |
|                               | eslint, cold cache      | 2.1 s · 464 MB       | 1.7 s · 395 MB      |
|                               | eslint, warm cache      | 1.4 s · 334 MB       | 1.1 s · 227 MB      |
| 1 stylesheet                  | whole gate              | 9.9 s · 916 MB       | 8.8 s · 742 MB      |
|                               | vitest, 28 gate files   | 10.9 s · 985 MB      | 7.6 s · 664 MB      |
|                               | eslint                  | not started          | not started         |
| 40 files (`.tsx` and `.ts`)   | whole gate              | 13.1 s · 962 MB      | 11.4 s · 676 MB     |
|                               | vitest, 28 gate files   | 7.1 s · 913 MB       | 7.1 s · 647 MB      |
|                               | eslint, cold cache      | 3.8 s · 602 MB       | 3.4 s · 499 MB      |
|                               | eslint, warm cache      | 1.5 s · 342 MB       | 1.1 s · 227 MB      |
| 1 Markdown file               | whole gate              | 9.8 s · 1031 MB      | 8.2 s · 659 MB      |
|                               | vitest, 28 gate files   | 8.9 s · 893 MB       | 8.6 s · 723 MB      |
|                               | eslint                  | not started          | not started         |
| any `.ts` (not in `--fast`)   | `tsc`, cold             | over 10 GB at 33 s   | unchanged           |
|                               | `tsc`, warm buildinfo   | 9.9 s · 2942 MB      | unchanged           |

"Before" is the gate as it stood at `a2892d634`, run back to back with "after" on
the same staged change with no other heavy job on the box. The added-line scans
(steps 1 to 3) are under half a second and are inside the whole-gate rows. Time
did not need fixing and barely moved; the cap on workers took about 300 MB off
the peak.

Three things follow from the numbers.

**Every gate runs on every commit; nothing is scoped to the staged paths.** The
28 gate files cost the same 7–9 s whatever is staged, so a path-to-gate map would
save a few seconds and add a hand-maintained list that must be right for every
gate that reads the tree by glob. The fast path caps vitest at 3 workers
(`FAST_GATE_WORKERS`) so the step's memory does not grow with the core count, and
starts `node <bin>` instead of `pnpm exec <bin>`.

**The step that does not fit is a cold `tsc`, and the fast gate never starts
it.** The whole-repo typecheck is incremental, and what it costs depends on
whether its `.tsbuildinfo` exists. Cold (a fresh clone, a new worktree, a new
container), `pnpm run typecheck` was past 10 GB after 33 s when the measurement
stopped it; single-threaded with `GOMEMLIMIT=4GiB GOGC=25` it finishes at a
10.0 GB peak, which only fits if nothing else heavy is running. Warm, the same
check is 10 to 13 s and 2.9 GB. So the full `pnpm check:consistency` is a pre-PR
run on a box with nothing else going on, and its first run in a checkout is the
expensive one; it is not a per-commit step here (audit AR1 is the fix).

**A killed step says so.** `scripts/gate-step.sh` runs every tool and tells a
rule failure from a step that never finished: exit 129–192 (`137` SIGKILL, `143`
SIGTERM, `134` SIGABRT), the `Command was killed with SIG…` line `pnpm exec`
prints while exiting 1, and a JavaScript heap-limit abort. The step gets a `☠`
line with its name and the signal, and the gate exits **3** ("incomplete"), not 1
— a killed step proves nothing about the change. Before this, an
out-of-memory-killed `tsc` printed `✗ tsc --noEmit`, which read as "the gate
cannot run here" and was skipped on every commit of five phases.

The agent hook had its own reason for not gating: it ran the gate in
`$CLAUDE_PROJECT_DIR` whatever the command said, so a commit made in a git
worktree was checked against the main checkout's tree (usually clean: an instant
pass) and `git -C <dir> commit` was not seen at all. `.claude/hooks/commit-gate-parse.mjs`
now reads the command for where each commit happens, whether the command stages
for itself (then the working tree is gated, untracked files included), and
whether it carries `RMH_SKIP_COMMIT_GATE=1`. `lib/__tests__/commit-gate-hook.test.ts`
pins the hook, the parser and the kill classification against a stub gate.

To re-measure, stage a change and run `time pnpm check:consistency --fast`; each
`✓` line carries its step's wall time.

## The suites

### 1. Main Vitest suite (`vitest.config.ts`)

`pnpm test`. Node environment, `globals: true`, `@` aliased to the repo root,
`pool: 'threads'`.

**These tests are environment-agnostic** — no real Postgres, network, Wikipedia
API, or filesystem writes outside a temp dir. External dependencies are mocked;
shared mock helpers live in per-phase `setup.ts` files
(`testing/rmhbox/phase-N/setup.ts`), each building on the previous phase's
helpers (`MOCK_USERS`, `createPlayer`, default settings, …).

What's in it:

- **`lib/__tests__/`** (`ls lib/__tests__ | wc -l`; total test files in `testFiles` of `_generated/facts.json`) — the bulk of the suite and the executable
  conventions: auth and the API-handler contract, the coin economy and the
  ledger, entitlements and membership tiers, media upload/quota/sweep, storage
  keys and compression, SSRF, rate limits, sessions, migration safety, the
  server-bundle copy check, i18n catalog integrity, sitemap/SEO, and the
  design/theme/colour-vision gates. See `lib/CLAUDE.md` §Testing; these are the
  authority for `docs/design-language.md` §13 and a subset of them are in the commit
  gate (the list in `scripts/check-consistency.sh` is authoritative).
- **`lib/rmhladder/` + `lib/homes/`** — the job/listing discovery
  pipelines. Kept whole: they fetch third-party sites (robots compliance, URL
  allowlists) and write to the database, and `lib/CLAUDE.md` calls this suite
  the contract for the pipeline.
- **A short list of game-tier files that guard something real** — Slice It's
  coin cap and idempotency, its anti-cheat and run-token forgery checks, its
  ranked-pool state machine, the guest-submission "persists nothing" property;
  RMHBox's cross-player state masking (all six phases), match persistence and
  REST surface; game-save conflict resolution; market creator earnings; the
  prediction-market pricing math. These survive the trim below because a bug in
  them costs coins, data or privacy.

#### Discovery

`include` is `**/*.test.{ts,tsx}` — everything, minus a short, commented
`exclude`. A new test file runs the moment it exists; there is nothing to
register.

It used to be a curated list, one glob per feature directory, and it failed the
way curated lists fail. `lib/liquid-gl/` was renamed `lib/liquid/` and its glob
silently matched nothing; `lib/http-body.server.test.ts` was written at the top
of `lib/` where no glob reached. Both files passed, both were committed, and
neither had ever run. `lib/__tests__/test-discovery.test.ts` now asks vitest
itself which files each config collects and fails if any `*.test.ts(x)` on disk
is in no suite. Its opt-out list is empty and two of its assertions keep it that
way: a file that should not run should not be named `*.test.ts`.

#### Speed

Historically (2026-08-08 audit: 247 files / ~6.0k tests on 4 cores) this came
down from ~50s to ~20s; the suite has since grown several-fold and the figure is
not re-measured here (`time pnpm test`). What moved it, in order:

| Change                                         | Why                                                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deleting 180 gameplay test files               | The single biggest lever, and the only one that trades something away. 37s → 20s. See [What is not tested](#what-is-not-tested).                                  |
| `maxWorkers` at 1.5× cores                     | Files are import-bound, so one worker per core leaves cores idle. Measured on the pre-trim suite: 3 → 46s, 4 → 41s, **6 → 37s**, 8 → 38s + flakes.                |
| `pool: 'threads'`                              | Nothing needs a process boundary; a worker thread starts far cheaper than a child process. ~8%.                                                                   |
| `LOG_LEVEL=silent` (`test.env`)                | A green run used to print ~10,000 JSON log lines (1.4 MB). Set via `env`, not `setupFiles` — a setup file is a module load per test file, 4.7s at this size.      |
| Compiling scripts under test once, not per-run | `migration-safety` booted `tsx` 15 times (~350ms each) to check 428 lines. esbuild compiles it once; each run is bare node. 5.5s → 1.4s.                          |
| Asserting once, not 20M times                  | `slice-it/visible-window` called `expect()` inside a triple loop. Recording the first counter-example and asserting once: 2.2s → 0.2s, identical failure message. |

Per-file overhead (transform + module graph) dominates, which is why deleting
whole files moved the needle and micro-optimising the slowest ones did not:
after the six fastest-file fixes the suite was still 37s, and it was file
_count_ that took it to 20s.

**Isolation stays on**, and that is deliberate. Measured on the pre-trim suite,
`--no-isolate` took it from ~37s to ~20s — and nine files failed outright
(shared `vi.mock` registry), while `lib/rmhladder/pipeline/{run,process-source}.test.ts`
failed _on a different set of seeds every_ `--sequence.shuffle`, because their
in-memory Prisma doubles are module state. Order-dependent red is worse than
slow green, and the trim bought that time without the flakes. Don't
re-litigate this without re-running the shuffle.

To get logs back while debugging: `LOG_LEVEL=debug pnpm test <path>`.

#### What is not tested

On **2026-08-08** the suite was deliberately narrowed to what is mission
critical, to cut the run from ~37s to ~20s. 180 test files were deleted. This
section is the record of what that bought and what it cost; a green run does
**not** mean the games work.

The line, applied file by file. A test was kept if the bug it catches would:

1. move coins, real money or entitlements;
2. lose or corrupt a user's saved data;
3. leak one user's private state to another;
4. break auth/authz, or let a forged score reach a public leaderboard;
5. take a service down, or break a deploy or migration.

Everything whose worst case is **"the game plays wrong"** went. In full:

| Gone                                                                                                                                                                                                                   | Was                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `features/slice-it/engine/**` (49 of 58) and `features/slice-it/engine/editor/**`                                                                                                                                                              | judgement windows, note vocabulary, beatmaps, FFT, chart-editor tools        |
| `testing/rmhbox/phase-1…6` (49 of 57)                                                                                                                                                                                  | lobby FSM, voting, per-minigame rules, chat, spectator flow                  |
| `lib/cookgame`, `lib/kowloon-knockout`, `features/dream-rift/engine`, `lib/temple-of-joy`, `lib/versecraft/gen`, `lib/kaikai-debt`, `features/laundry-sort/engine`, `lib/massive-march`, `lib/isleworks`, `features/nightrail/engine`, `lib/daily-puzzles` | whole gameplay suites — simulation, scoring curves, world/content generation |
| `lib/__tests__/void-breaker-*` (7), `altair-enemy-navigation`, `desk-*` (3), `speedrun`                                                                                                                                | per-game logic that happened to live in the shared directory                 |
| `lib/__tests__/whats-new`                                                                                                                                                                                              | the release-announcement modal's copy and grid layout                        |
| `testing/factories.ts`                                                                                                                                                                                                 | deterministic model fixtures — **already had zero importers** at HEAD        |

**What this means in practice.** A regression in how any of the 18 games plays
— wrong score, broken physics, a minigame that never advances a round — now
reaches production unless a human plays it. Games are the majority of this
site's surface area, so that is not a small exposure; it is a deliberate trade
of coverage for a suite fast enough to run on every commit.

Everything deleted is one `git revert` away (see the commit that references this
section), and a file can come back on its own if it earns one of the five
criteria. If a game grows a coin payout, a leaderboard, or anything that reads
another player's state, it needs a test again.

### 2. Epic suite (`vitest.epic.config.ts`)

`pnpm test:epic`. Scoped to `scripts/epic/**/*.test.ts` — the epic
(book/textbook) content-build pipeline: manuscript validation, ornament
rendering, typesetting, and the paginator.

Separate from the main suite for one reason: `scripts/epic/paginate.ts` measures
real layout by launching Chromium through Playwright, so three of its tests need
a browser and a 60s timeout while every test in the main suite is deliberately
environment-agnostic. Without a browser those three fail at launch rather than
skipping, on purpose — a silent skip is how a content pipeline rots unnoticed.

```bash
pnpm exec playwright install chromium && pnpm test:epic
# or, against a Chromium the machine already has:
CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm test:epic
```

`CHROME_PATH` exists because a provisioned container Chromium usually carries a
different build number than the pinned Playwright version, and
`chromium.launch()` then fails hunting for a build that will never be there. It
is the same variable `scripts/perf/canvas2d-probe.mjs` reads; both epic launch
sites go through `scripts/epic/browser.ts`.

#### Game suites (`vitest.tf2.config.ts`, `vitest.balatro.config.ts`)

Gameplay tests for the browser games run in their own suites, which the main
config excludes glob for glob: `pnpm test:tf2` (TF2, HL2, Portal) and
`pnpm test:balatro` (multiplayer Balatro, including its Lua specs, which need
`lua5.1` and fail without it). `pnpm test:balatro:e2e` is the Balatro browser
suite. Their workflows (`tf2-game-tests.yml`, `balatro-mp-tests.yml`) are
path-filtered.

### 3. Go tests (Bazel)

`make test` from the repo root runs `bazelisk test --build_tests_only
//go-services/...` **and** the frontend vitest suite. 27 `*_test.go` files live
next to their packages (`go-services/cmd/status/main_test.go`,
`internal/doctrine/*_test.go`, …). Add or move `.go` files → run `make gazelle`
first so BUILD files pick them up.

### 4. Browser smoke (not in CI)

`testing/e2e/smoke.mjs` drives the **built** app with the pre-installed Chromium
and asserts public routes render with a `<title>` and an `<html lang>`. It is
not wired into any workflow; run it by hand against a built app:

```bash
pnpm build && node .output/server/index.mjs &
BASE_URL=http://localhost:3000 node testing/e2e/smoke.mjs
```

### 5. FOUC audit (not in CI)

`testing/e2e/fouc.mjs` drives the **built** app and measures what every page
looked like frame by frame, across nine stored-preference profiles, to prove no
page flashes. It is the only check in this repo that can answer that question —
every mechanism that prevents a flash is correct in isolation and only provably
correct together, in a browser, in the order the browser does things.

```bash
pnpm build && node .output/server/index.mjs &
node testing/e2e/fouc.mjs --self-test    # prove the detectors fire, FIRST
node testing/e2e/fouc.mjs                # every page, every profile (~60 min)
node testing/e2e/fouc.mjs --quick        # two profiles, the CI shape
```

Dev mode injects CSS through JS and always flashes, so the audit is meaningless
against `pnpm dev` — it must run against `.output`. Its commit-time half,
`lib/__tests__/fouc-contract.test.ts`, is in `GATE_TESTS` and needs no browser.
Full detail, including why each detector asks its question when it does:
[`fouc.md`](./fouc.md).

### 6. Steel rest and globe check (CI: `steel-rest`, nightly and manual)

`testing/e2e/steel-rest.mjs` drives the **built** app in Chromium and pins the Steel rules a unit test cannot see
(plan section 17, B3 and V9). For `/`, `/terms` and `/settings`, over a 1.5 s window once the page has settled: no
`requestAnimationFrame` callback is pending and none is requested (with motion reduced; the globe's idle drift is the
one ambient motion and is bounded separately), at most one WebGL context is created, and no `Worker` is constructed.
Then, at 390 x 844 on `/`: the docked globe is a button with `aria-expanded=false` that controls a nav, a tap opens it
(pins visible and inside the viewport), Escape closes it and returns focus, and frames stop once the 360 ms move is over.

```bash
pnpm build && PORT=7005 node .output/server/index.mjs
BASE_URL=http://localhost:7005 node testing/e2e/steel-rest.mjs
CHROMIUM_PATH=/path/to/chrome ...     # optional: a specific browser
```

The `steel-rest` job in `web-ci.yml` runs it against the checked build on the nightly and manual runs (it needs the
`checked-frontend` artifact, which pull requests do not retain), with a Postgres service and `playwright install
chromium`. The frame-budget audit, the eversion suites and their baselines were deleted with the material they measured
(Steel phase 6).

### 8. Integration suite (`vitest.integration.config.ts`, `testing/integration/`)

`pnpm test:integration`. Black-box tests of real user flows against a **running,
built** app and a **real** Postgres — the layer the main suite deliberately never
touches. Blocking on every PR (the `integration` job in `web-ci.yml`).

| File                     | Covers                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.test.ts`           | email sign-up → session → handle assigned; sign-out revokes the session; wrong password sets no session; writes need a session                                                                                                                                                                                                        |
| `posts.test.ts`          | create + read back; invalid body → 400 and nothing written; another user's like (toggle) and comment; only the author can delete (soft delete → tombstone)                                                                                                                                                                            |
| `coins.test.ts`          | a tip moves exactly the amount and writes one ledger row; overdraft and self-tip are refused with every balance unchanged                                                                                                                                                                                                             |
| `developer-api.test.ts`  | free accounts cannot mint keys; a paid key authenticates `/api/v1/me`; revoked and made-up keys → 401; scopes (read-only key cannot post, `write:posts` can)                                                                                                                                                                          |
| `stripe-webhook.test.ts` | signed `customer.subscription.created/updated/deleted` events POSTed to `/api/auth/stripe/webhook`: bad/forged/missing signature gives 4xx and no row; created grants the tier (visible in the session's `tier`); replays are idempotent (one row); updated changes plan; deleted downgrades to free; unknown customer grants nothing |
| `public.test.ts`         | `/api/ready`, the OpenAPI 3.1 spec, `/` SSR and the sitemap — the deploy smoke probes, run before merge                                                                                                                                                                                                                               |

How it works: `global-setup.ts` waits for `/api/ready`, then signs up the shared
cast (`alice`, `bob`, `carol`) once and hands their cookies to the files via
`inject()`. `lib/client.ts` is a cookie-jar `fetch` client (it sends the
`Origin` Better Auth's CSRF check wants) plus a `pg` pool on the **same**
database, used only to seed what no endpoint can (a paid subscription, a starting
coin balance) and to assert on what a response cannot prove (the ledger row, the
`deletedAt` stamp). Files run one at a time and the app's per-IP rate limits stay
on (10 sign-ups / posts per minute); the suite budgets its requests under them.

Locally — never against a database you care about:

```bash
pnpm build:frontend
DATABASE_URL=postgresql://…/scratch pnpm exec prisma migrate deploy
DATABASE_URL=… BETTER_AUTH_SECRET=local-secret-at-least-32-chars-long BETTER_AUTH_URL=http://localhost:7005 PORT=7005 \
  node .output/server/index.mjs &
INTEGRATION_BASE_URL=http://localhost:7005 DATABASE_URL=… pnpm test:integration
```

(`INTEGRATION_BASE_URL`, not `BASE_URL`: Vite reserves that name and vitest
overwrites it.) Restart the server between back-to-back runs — the rate-limit
counters are in memory.

**Found by this suite:** a session's cookies copied before sign-out kept writing
for up to 5 minutes, because `session.cookieCache` let `getSession` trust the
signed cookie without reading the (deleted) session row. Fixed by forcing
`disableCookieCache` on non-GET requests (the wrapper at the bottom of
`lib/auth.ts`); `auth.test.ts` › _a revoked session cookie cannot write_ pins it.

**Stripe is simulated, not mocked.** The CI `integration` job sets placeholder
`STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID` and `STRIPE_PRO_PRICE_ID` (no
`STRIPE_SECRET_KEY`, so nothing can reach api.stripe.com). The test signs payloads
with `stripe.webhooks.generateTestHeaderString` and the server verifies them as in
production. Only events the Better Auth plugin handles from the payload alone are
covered; `checkout.session.completed` (the plugin calls `subscriptions.retrieve`) and
checkout-session creation need a live or mocked Stripe API and are not. Locally, export
the same three variables for both the server and the test run. The tip endpoint has no
`Idempotency-Key` support, so replay protection is covered for the webhook only.

Out of scope (each needs external services): live Stripe checkout, OAuth
providers, the Socket.IO hubs, email delivery.

### 9. Hearthworks real-WebRTC e2e (not in CI)

`testing/hearthworks-e2e/` runs real Chromium pages with real `RTCPeerConnection`s against a Node socket.io
harness that hosts the production Hearthworks hub handler (fake session lookup, no DB). Host crash/freeze,
migration, late join, flood, password and hub-restart scenarios. Opt-in:

```bash
pnpm test:hearthworks:e2e                  # default scenarios
pnpm exec tsx testing/hearthworks-e2e/run.ts --list
```

Details, what it proved and what loopback cannot prove: [`hearthworks-multiplayer.md`](./hearthworks-multiplayer.md).

### Server perf harness (not in CI)

The server-side performance program ([`docs/archive/2026/server-perf-2026-10-21/`](./archive/2026/server-perf-2026-10-21/index.md))
measures the production build against a seeded dataset. Like the integration suite above it boots the built app (`.output/server/index.mjs`) against a real Postgres, but it measures latency and query counts rather than asserting behaviour, and it is never run in CI. Method, budgets and the
agent procedure are in that folder; the instruments live in `scripts/perf/`:

```bash
pnpm tsx scripts/perf/seed-perf-db.ts --db rmh_perf_build   # ~2 min: 20k users, 200k posts, 1.2M likes, ...
createdb -T rmh_perf_template rmh_ws<N>                     # a private copy of the seeded database
flock /tmp/rmh-perf-build.lock pnpm build                   # latency is only ever measured on the prod build
NODE_ENV=production PORT=71<N>5 RMH_PERF_HEADERS=1 node .output/server/index.mjs &
node scripts/perf/server-bench.mjs --base http://localhost:71<N>5 --auth both --out out.json
node scripts/perf/server-bench.mjs --compare before.json after.json    # markdown diff, flags regressions
node scripts/perf/server-bench.mjs --summary baseline.json             # the P0 summary tables
node scripts/perf/cold-start.mjs --port 71<N>5                          # restart + first request to /
```

Raw bench output (`--out *.json`, ~9k lines per run) stays out of the repo: `--compare` and `--summary` take any paths, so
no checked-in baseline is needed. Commit the derived table (`--compare … > compare.md`) and the report instead. The program's
own raw runs are in git history at `1b437552d` (`docs/archive/2026/server-perf-2026-10-21/results/{baseline,after,after-run2}.json`).

`RMH_PERF_HEADERS=1` adds `x-rmh-queries: <n>` to every response (off by
default; `lib/__tests__/perf-headers.test.ts` pins that). `Server-Timing` is
always on and carries `dur`-only `sess` / `cache` / `db` / `total` phases. The
tests for the instrumentation itself are `lib/__tests__/otel-server-timing.test.ts`
and `perf-headers.test.ts`, and they run in the main suite; the harness does not.

### Coverage

```bash
pnpm test:coverage          # text summary + coverage/index.html + lcov.info
```

`@vitest/coverage-v8` is a devDependency, so this just works — it used to
require an ad-hoc `npm install --no-save`. Scoped to `lib/`, `server/`,
`components/`, `hooks/`, `stores/` (extensions pinned: an extensionless glob
hands the provider every `CLAUDE.md` in the tree and it tries to parse them as
source). It is **informational, not a gate**, and it is not run in CI. The
number today is ~18% of statements; treat it as a map of what is untested, not
a target to farm.

## CI

Quality workflows live in `.github/workflows/`. The release graph and operator activation are documented in [deployment-speed-implementation-2026-10-24.md](./archive/2026/deployment-speed-implementation-2026-10-24.md). The ones that touch tests/quality (every web job sets up through `.github/actions/setup-deps`, which restores `node_modules` from a cache keyed on the lockfile + Prisma schema and only installs on a miss):

| Workflow                                  | Runs                                                                                    | Gate?                                                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `web-ci.yml` (`typecheck`)                | `tsc --noEmit` → `eslint` → docs freshness                                              | **all block**                                                                                                                         |
| `web-ci.yml` (`test (1/2)`, `test (2/2)`) | `pnpm test --shard=N/2` — the unit suite split across two parallel jobs                 | **blocks**, tests included (as of 2026-08-08)                                                                                         |
| `web-ci.yml` (`build` job)                | `build:frontend:sourcemap` → bundle budget → entry composition                          | build + both size gates block                                                                                                         |
| `web-ci.yml` (`audit` job)                | `pnpm audit --prod --audit-level=high`                                                  | blocks on high-severity prod advisories                                                                                               |
| `web-ci.yml` (`integration`)              | build → Postgres service → migrate → boot `.output/server` → `pnpm test:integration`    | **blocks**; see §8                                                                                                                    |
| `epic-tests.yml`                          | `playwright install chromium` → `pnpm test:epic`                                        | blocks; **path-filtered** to `scripts/epic/**`                                                                                        |
| `deploy.yml` (`ci` job)                   | typecheck → lint → production dependency audit                                          | all block the deployment                                                                                                              |
| `deploy.yml` (`integration`)              | same as web-ci's `integration`, on the **merged** commit                                | **verifies after the deploy**: a failure triggers `post-deploy-verify`, which rolls production back via the webhook `rollback` action |
| `web-ci.yml` (`steel-rest`)               | checked build → serve → `testing/e2e/steel-rest.mjs` (zero frames at rest, one GL context, the globe) | non-blocking; **nightly + manual dispatch only** (not on PRs); see §6                                                                 |
| `go-microservices.yml`                    | `bazelisk test --build_tests_only //go-services/...`, path-filtered to `go-services/**` | blocks                                                                                                                                |

The deploy `test` job runs two isolated unit-suite shards in parallel with `ci`. The ARM64 `build` job enforces critical JS/CSS budgets and smoke-tests both production image digests. `candidate-image.yml` checks production-shaped containers on PRs; `required-checks` aggregates every applicable web check. `build-cache.yml` maintains reusable stages outside the trigger prerequisites.

**Where enforcement lives.** web-ci's Test step is a hard gate on the PR, and
the deploy's own `test` matrix re-runs the suite on the merge result as a hard gate
too. It used to be advisory on the premise that `main` is reached only through a
PR — but nothing enforced that (no branch protection), so a direct push or a
merge over a red PR could ship untested code. It costs no wall-clock: `ci` runs
in parallel with the image build.

The web-ci test step was advisory for a long stretch, for a reason that no
longer holds: `i18n-catalogs` was permanently red, and the Test step used to sit
_before_ the build in a single job, so a red test meant the build never ran on
PRs and build breakage was discovered during production deploys
(`docs/archive/2026/ci-speed-audit-2026-07-17.md` §2). The build is its own job now and the
suite is green, so an advisory test step bought nothing except a suite nobody
had to keep green — which is how a permanently-red test got to stay that way.

Plus SAST/quality gates that aren't tests but run on PRs: `senior-review.yml`
(an LLM review gate), `synthetic-perf.yml`, `compose-validate`,
`prisma` (validate + migrate-status jobs), and `build-vibe-packages`.

## Writing a test

- **First: does it need to exist?** Since 2026-08-08 this suite is scoped to the
  five criteria in [What is not tested](#what-is-not-tested). A test of how a
  game plays will be correct, will pass, and will still be the wrong thing to
  add — that coverage was deliberately traded for a suite fast enough to run on
  every commit. Adding one back means arguing that it meets a criterion.
- **Main suite:** put it in a feature `__tests__/` dir (or next to the module,
  or under `testing/`) and it runs. Keep it environment-agnostic: mock
  DB/network/FS, reuse the `setup.ts` helpers for RMHBox.
- **Assert what the code must do, not that it exists.** A test that checks a
  file is present and has a default export is a slower restatement of
  `tsc --noEmit`; one of those (28 assertions over 14 rmhbox components, ~1s of
  every run) was deleted in the audit. If deleting the module would break the
  typecheck, the typechecker already covers it.
- **`expect()` is not free.** It builds an assertion context per call. Inside a
  property-style sweep, record the first counter-example and assert once.
- **Assert what you mean.** `expect(true).toBe(true)` after calling a function
  passes whether or not the function did anything. `expect(fn).not.toThrow()`
  plus a check on the observable effect says the same thing honestly.
- **Driving a script under test?** Compile it once with esbuild in `beforeAll`
  and run the bundle with plain `node` — `tsx` costs ~350ms of loader boot per
  spawn, and under CPU contention those spawns are also where the suite's
  timeout flakes came from. `lib/__tests__/migration-safety.test.ts` is the
  pattern.
- **`vi.mock` is hoisted**, always, even written inside a test body. Put it at
  the top of the file where it actually runs; vitest warns about the nested form
  today and will make it an error. Shared factories belong in a sibling module
  imported _inside_ the factory (`testing/rmhbox/phase-5/wiki-race-mocks.ts`).
- **Go:** add `*_test.go` beside the code and `make gazelle` before `make test`.

### Migration rollback-compatibility gate

`web-ci.yml` job `migrations` runs `.github/scripts/check-migrations-additive.mjs` over migrations **added** in the PR. Production rollbacks (post-deploy guard, `post-deploy-verify`) redeploy the previous image on the already-migrated database, so a new migration must not drop, rename, retype or tighten (`SET NOT NULL`, `NOT NULL` without `DEFAULT`, `DROP DEFAULT`) anything the previous release uses. Do it as expand → ship → contract. A deliberate contract step opts in with `-- rmh:contract-ok <why it is safe>` in the migration file.

### Merge queue and delivery metrics

`web-ci.yml` also runs on `merge_group`, treated exactly like a PR (same classifier, same `required-checks`, no nightly-only jobs), so GitHub's merge queue tests the real merge result before it reaches `main`. **Turning it on is a repo setting** (Settings → Rules → branch protection for `main` → "Require merge queue"); the workflow is ready either way.

`dora-metrics.yml` posts deploy frequency, merge→deployed lead time, change-failure rate and time-to-restore to the run summary every Monday (and on demand), computed from the deploy workflow's own run history.
