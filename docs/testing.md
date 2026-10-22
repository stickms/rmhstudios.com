# Testing

How tests are organized, how to run them, and how CI gates them. For the build
and deploy pipeline see [`architecture.md`](./architecture.md) §2–3 and
[`../deploy/README.md`](../deploy/README.md); this doc is about tests.

> Sources of truth: `vitest.config.ts`, `vitest.epic.config.ts`, the `testing/`
> tree, `go-services/**/*_test.go`, and the `.github/workflows/*` files. When a
> doc disagrees with those, the files win.
>
> Last verified against the tree on **2026-08-08** (the testing audit): 258
> `*.test.ts(x)` files — 247 in the main suite, 11 in the epic suite. ~6.0k
> tests; a full main run is ~20s on 4 cores.
> `lib/__tests__/test-discovery.test.ts` keeps that accounting honest.
>
> The suite is deliberately **narrow**: it covers what costs money, data, or
> access if it breaks, and does not cover how the games play. Read
> [What is not tested](#what-is-not-tested) before assuming a green run means
> a working feature.

## TL;DR — run tests locally

```bash
pnpm check:consistency        # the commit gate (guard tests + lint + tsc + docs freshness)
pnpm test                     # main suite (vitest.config.ts) — ~20s
pnpm test lib/slice-it        # one file or directory
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
`tsc`, and the generated-docs freshness checks. That subset runs in ~3s. It is wired into
`git commit` by `.githooks/pre-commit` (`pnpm hooks:install`) and by
`.claude/hooks/commit-gate.sh` in agent sessions. A new guard test belongs in
the `GATE_TESTS` list in `scripts/check-consistency.sh`.

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

- **`lib/__tests__/`** (149 files) — the bulk of the suite and the executable
  conventions: auth and the API-handler contract, the coin economy and the
  ledger, entitlements and membership tiers, media upload/quota/sweep, storage
  keys and compression, SSRF, rate limits, sessions, migration safety, the
  server-bundle copy check, i18n catalog integrity, sitemap/SEO, and the
  design/theme/colour-vision gates. See `lib/CLAUDE.md` §Testing; these are the
  authority for `docs/design-language.md` §13 and 16 of them are in the commit
  gate.
- **`lib/rmhladder/` + `lib/homes/`** (52 files) — the job/listing discovery
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

~20s for 247 files / ~6.0k tests on 4 cores, down from ~50s. What moved it, in
order:

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
| `lib/slice-it/**` (49 of 58) and `lib/slice-it/editor/**`                                                                                                                                                              | judgement windows, note vocabulary, beatmaps, FFT, chart-editor tools        |
| `testing/rmhbox/phase-1…6` (49 of 57)                                                                                                                                                                                  | lobby FSM, voting, per-minigame rules, chat, spectator flow                  |
| `lib/cookgame`, `lib/kowloon-knockout`, `lib/dream-rift`, `lib/temple-of-joy`, `lib/versecraft/gen`, `lib/kaikai-debt`, `lib/laundry-sort`, `lib/massive-march`, `lib/isleworks`, `lib/nightrail`, `lib/daily-puzzles` | whole gameplay suites — simulation, scoring curves, world/content generation |
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

### 6. Frame-budget audit (not in CI)

`testing/e2e/frame-budget.mjs` drives the **built** app and asks the question a
high-refresh display asks of a page: does it go **idle** at rest, and how much
headroom does it have while scrolling? Per route it counts compositor frames
produced with nobody touching the page, browser-wide CPU at rest (every
Chromium process, so compositor/GPU cost is visible — main-thread metrics never
see it), perpetual animations by selector, and rAF cadence idle and scrolling.

```bash
pnpm build && PORT=7005 node .output/server/index.mjs &
BASE_URL=http://localhost:7005 node testing/e2e/frame-budget.mjs              # default route set
BASE_URL=http://localhost:7005 node testing/e2e/frame-budget.mjs --all --gate # every page; fail if a site page never idles
```

Absolute fps here is SwiftShader's, so compare builds and routes, not devices.
Its commit-time half is `lib/__tests__/static-backdrop.test.ts` (in
`GATE_TESTS`). Findings and the measured before/after:
[`performance-audit-2026-10-08.md`](./performance-audit-2026-10-08.md).

**Page switches.** Its sibling `testing/e2e/page-switch.mjs` times the other
half of "does it feel fast": a click in the shell's nav rail, from a settled
page, to the destination painted — plus the longest frame, summed blocking
time, style+layout and layout shift over the switch (Long Animation Frames
API), under CPU throttling and added latency. `--mode hover` lets the router's
intent preload run first; `a>b:c` starts from a page reached within the visit.

```bash
BASE_URL=http://localhost:7005 node testing/e2e/page-switch.mjs                # default switches, 4× CPU, tap
BASE_URL=http://localhost:7005 node testing/e2e/page-switch.mjs --mode hover --cpu 1 --rtt 0
```

Findings and the measured before/after:
[`performance-audit-2026-10-21.md`](./performance-audit-2026-10-21.md) §Navigation commit.

### 7. Globe eversion suites (`lib/eversion/`, `testing/e2e/eversion-*.mjs`)

The hub navigation effect (spec: [`plans/2026-10-17-globe-eversion.md`](./plans/2026-10-17-globe-eversion.md)
§11) is tested in three layers. The first is part of `pnpm test`; the other two
need Chromium and are NOT in the main suite.

**a. Unit (in `pnpm test`).** `lib/eversion/__tests__/` covers spec gates 1-24
(projections, LUT, Thurston oracle, orientation, morph, timeline properties, the
runner's sequence against scripted ports, the BEFORE scheduler, eligibility,
flags) plus `bundle-leaks.test.ts`, which gives the static-closure leak scan in
`scripts/check-bundle-budget.ts` a positive and a negative control and keeps every
module fingerprint true. `pnpm exec vitest run lib/eversion` runs just these
(~30 s).

`settle.test.ts` holds the AFTER readiness gate's decision logic (skeletons, queries, images, fonts, quiet window,
soft/hard bounds, no latency when settled) and `unwrap-end.test.ts` the overlapping crossfade ending.
`testing/e2e/eversion-late-content.mjs` (dev server, Chromium; not in CI) delays the destination's `/api`,
server-fn and image requests by 400-1500 ms, runs the real effect and requires SSIM(AFTER bitmap, settled live page)

> = 0.92 (it scored 0.62 with the gate bypassed, and 0.97-1.00 with it).

**b. Fixture e2e (no server, no build).** Each script bundles its own fixture
page with esbuild around the real modules and serves it from a fake origin, with
WebGL2 from SwiftShader:

```bash
node testing/e2e/eversion-metrics-selftest.mjs   # the measurement helpers, first
node testing/e2e/eversion-host.mjs               # worker/main host, frame pacing
node testing/e2e/eversion-renderer.mjs           # renderer lifecycle
node testing/e2e/eversion-gl.mjs                 # shaders: parity (S#27), two-sidedness (S#28)
node testing/e2e/eversion-wedge.mjs              # the last UNWRAP frame is the flat page; the azimuthal wedge mask is smooth
node testing/e2e/eversion-controller.mjs         # run orchestration against a fake router (~25 s)
```

`CHROMIUM_PATH=/path/to/chrome` overrides the browser. `eversion-gl.mjs` skips
Firefox/WebKit when absent (explicit `SKIP` lines) but asserts a floor on the
number of checks that ran, so a run that skipped its way to green fails.

**c. App e2e (against a running server).** These drive the real app with the
effect forced on by `?eversion`:

```bash
# built app (what CI runs): needs DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
pnpm run build:frontend:sourcemap && PORT=7005 node .output/server/index.mjs &
export BASE_URL=http://localhost:7005

node testing/e2e/eversion-load.mjs               # S#40: nothing before load; LCP/TBT; delayed-load control
PROFILE=desktop THEME=dark node testing/e2e/eversion-hub.mjs   # S#25/26: entry points, dismissals, fallbacks
node testing/e2e/eversion-edge.mjs               # S#34/35: fallbacks, fault injection, router edge cases
node testing/e2e/eversion-capture.mjs            # S#29/46: capture fidelity (SSIM), right-edge parity and lifecycle
```

**Smoothness (S#31/S#32) needs a dev server, not the build.** It does not record the
screen: it scrubs the timeline in the lab (the core's `scrub` debug op, driven through
`window.__eversionLab`, present only with `?eversion-debug`) at a fixed step - every 16 ms,
8 ms within 48 ms of each stage boundary and scripted event - screenshots each still and
runs the jerk detector over consecutive stills. The verdict therefore does not depend on how
fast the rig draws (the old screencast sampled ~1.5 fps on software GL and could neither
pass a clean run nor find an injected cut). The lab route is dev-only, so:

```bash
EVERSION_LAB_OPEN=1 XAI_API_KEY=x OPENAI_API_KEY=x pnpm exec vite dev --port 7371 --strictPort --host 127.0.0.1
BASE_URL=http://127.0.0.1:7371 node testing/e2e/eversion-smoothness.mjs --quick   # ~11 min on a loaded 4-core software-GL box
node testing/e2e/eversion-smoothness.mjs                                          # all themes, 20 seeded fast-forwards
node testing/e2e/eversion-smoothness.mjs --screencast                             # ALSO the optional real-hub screencast variant (needs >= ~10 fps)
```

Scenarios: uninterrupted per theme, seeded fast-forwards, AFTER ready at 4 s, a failing (500)
destination, and a self-proof. A hard cut is a step larger than BOTH its neighbours by 2x (C2
continuity makes every legitimate speed-up a ramp); the run's median is deliberately not the
yardstick, because the change per step varies ~100x across one correct run. The self-proof
injects a 30 % radius step (the `inject-hard-cut` debug op) at 2000 ms and requires the
detector to flag exactly that step while the unmodified run reports none. Luminance (S#32) is
read off the same stills. The stills are of the lab's synthetic pages in the theme's own
background, so what is judged is the effect's motion; the CSS hub and orb fades are not in
them. CI runs `--quick` against a throwaway dev server in its own step (the glob skips it).

For iteration, a dev server works for everything except the load gate's chunk
identification: `EVERSION_LAB_OPEN=1 XAI_API_KEY=x OPENAI_API_KEY=x pnpm exec vite dev --port 7331`
(a git worktree needs its own `pnpm install`; the dummy keys exist because the
homes image module constructs a client at import time).
`eversion-lab.mjs` (the admin-only `/eversion-lab` scrub page) needs the dev-only
`EVERSION_LAB_OPEN` and so is **excluded from CI** - a production build ignores it.

`eversion-load.mjs` (S#40) and `eversion-perf.mjs` (S#43) compare against the
committed `testing/e2e/baselines/eversion-load.json` and `eversion-frames.json`.
**A missing baseline fails both gates on CI** (`CI` set; `eversion-perf` only
informs locally). Neither script ever writes one as a side effect of a run:
a baseline taken from the run under test would make the gate compare a build with
itself and pass for ever. Thresholds and the late-`load` negative control are in
the spec's S#40 amendment. The late-`load` control holds `load` open for 8 s and
fails if ANY eversion request (the prefetch chunk included, not just the bridge)
is seen before it; `lib/eversion/__tests__/hub-load-gating.test.ts` pins the same
rule at source level so a regression fails in `pnpm test` before a browser runs.

**Producing baselines.** They must come from a CI runner on a production build -
SwiftShader numbers from a laptop would fail every run on CI. Start the `web-ci`
workflow with `workflow_dispatch` and `update-baselines` ticked: the
`eversion-e2e` job then runs only `eversion-load.mjs` and `eversion-perf.mjs`
with `--update-baselines` and uploads `testing/e2e/baselines/` as the
`eversion-baselines` artifact (14 days). Download it, commit the two JSON files
in a PR of their own, and say which run produced them. Refresh the same way when a
deliberate change moves the numbers (a Chromium bump, a slower-but-better effect).

**CI.** The `eversion-e2e` job in `web-ci.yml` builds WITH sourcemaps (the
attribution checks read them), serves `.output`, and runs every
`testing/e2e/eversion-*.mjs` except `eversion-lab.mjs` and `eversion-smoothness*.mjs` (own step, above); `eversion-hub.mjs` runs
once per profile x theme (desktop/mobile x dark/light/high-contrast). It does
**not run on PRs** for now: the suite does not finish inside its timeout (22 of 23
PR runs were cancelled in `eversion-behaviour.mjs`), so on PRs it held a runner
for ~40 min and reported nothing. Run it on a branch with
`gh workflow run web-ci.yml --ref <branch>`. When re-enabled on PRs, the job is
path-filtered by `eversion-changes` to what the effect depends on: `lib/eversion`,
`components/radial`, the settings row and its preference API/schema, the theme
store, `lib/perf-tier*` and `lib/render`, the glass layer, the two English
namespaces it uses, `package.json`, the lockfile, the Vite config, the bundle
budget script, the baselines and this workflow - not every route, store or English
string. It runs nightly on `main`. It is `continue-on-error` until T37 makes it
blocking, which hides a red job from the PR's checks, so each script's verdict is
also written to the job summary (`GITHUB_STEP_SUMMARY`) and every failure is an
`::error::` annotation. Open the job summary after a nightly.

### 8. Integration suite (`vitest.integration.config.ts`, `testing/integration/`)

`pnpm test:integration`. Black-box tests of real user flows against a **running,
built** app and a **real** Postgres — the layer the main suite deliberately never
touches. Blocking on every PR (the `integration` job in `web-ci.yml`).

| File | Covers |
| --- | --- |
| `auth.test.ts` | email sign-up → session → handle assigned; sign-out revokes the session; wrong password sets no session; writes need a session |
| `posts.test.ts` | create + read back; invalid body → 400 and nothing written; another user's like (toggle) and comment; only the author can delete (soft delete → tombstone) |
| `coins.test.ts` | a tip moves exactly the amount and writes one ledger row; overdraft and self-tip are refused with every balance unchanged |
| `developer-api.test.ts` | free accounts cannot mint keys; a paid key authenticates `/api/v1/me`; revoked and made-up keys → 401; scopes (read-only key cannot post, `write:posts` can) |
| `public.test.ts` | `/api/ready`, the OpenAPI 3.1 spec, `/` SSR and the sitemap — the deploy smoke probes, run before merge |

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
`lib/auth.ts`); `auth.test.ts` › *a revoked session cookie cannot write* pins it.

Out of scope (each needs external services): Stripe checkout/webhooks, OAuth
providers, the Socket.IO hubs, email delivery.

### Server perf harness (not in CI)

The server-side performance program ([`docs/server-perf-2026-10-21/`](server-perf-2026-10-21/index.md))
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

Ten workflows live in `.github/workflows/`. The ones that touch tests/quality (every web job sets up through `.github/actions/setup-deps`, which restores `node_modules` from a cache keyed on the lockfile + Prisma schema and only installs on a miss):

| Workflow                      | Runs                                                                                    | Gate?                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `web-ci.yml` (`typecheck`)    | `tsc --noEmit` → `eslint` → docs freshness                                              | **all block**                                                                            |
| `web-ci.yml` (`test (1/2)`, `test (2/2)`) | `pnpm test --shard=N/2` — the unit suite split across two parallel jobs     | **blocks**, tests included (as of 2026-08-08)                                            |
| `web-ci.yml` (`build` job)    | `build:frontend:sourcemap` → bundle budget → entry composition                          | build + both size gates block                                                            |
| `web-ci.yml` (`audit` job)    | `pnpm audit --prod --audit-level=high`                                                  | blocks on high-severity prod advisories                                                  |
| `web-ci.yml` (`integration`)  | build → Postgres service → migrate → boot `.output/server` → `pnpm test:integration`    | **blocks**; see §8                                                                       |
| `epic-tests.yml`              | `playwright install chromium` → `pnpm test:epic`                                        | blocks; **path-filtered** to `scripts/epic/**`                                           |
| `deploy.yml` (`ci` job)       | `tsc --noEmit` → `eslint` → `pnpm test`                                                 | blocks — typecheck, lint and test all gate the deploy; see below                         |
| `deploy.yml` (`integration`)  | same as web-ci's `integration`, on the **merged** commit                                | **blocks the deploy**; runs in parallel with the image build                             |
| `web-ci.yml` (`eversion-e2e`) | build with sourcemaps → serve → every `eversion-*.mjs` (hub per profile x theme)        | non-blocking until T37; **nightly + manual dispatch only** (not on PRs); see §7          |
| `go-microservices.yml`        | `bazelisk test --build_tests_only //go-services/...`, path-filtered to `go-services/**` | blocks                                                                                   |

**Where enforcement lives.** web-ci's Test step is a hard gate on the PR, and
the deploy's own `ci` job re-runs the suite on the merge result as a hard gate
too. It used to be advisory on the premise that `main` is reached only through a
PR — but nothing enforced that (no branch protection), so a direct push or a
merge over a red PR could ship untested code. It costs no wall-clock: `ci` runs
in parallel with the image build.

The web-ci test step was advisory for a long stretch, for a reason that no
longer holds: `i18n-catalogs` was permanently red, and the Test step used to sit
_before_ the build in a single job, so a red test meant the build never ran on
PRs and build breakage was discovered during production deploys
(`docs/ci-speed-audit-2026-07-17.md` §2). The build is its own job now and the
suite is green, so an advisory test step bought nothing except a suite nobody
had to keep green — which is how a permanently-red test got to stay that way.

Plus SAST/quality gates that aren't tests but run on PRs: `senior-review.yml`
(an LLM review gate), `synthetic-perf.yml`, `compose-validate`,
`prisma-validate`, `prisma-migrate-status`, `build-vibe-packages`, and
`i18n-translate`.

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
