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
make test                     # Go (Bazel) + the frontend vitest suite
```

`pnpm test <path>` takes any file or directory. It did not always: discovery
used to be a hand-written list of globs and a path outside it answered _"No test
files found."_ See [Discovery](#discovery) — that is now a gate.

**Per-commit:** `pnpm check:consistency` (`scripts/check-consistency.sh`) runs
the subset of the suite that encodes the site's conventions — the design/tab
gate, the game-viewport contract, the filter-cost budget, the theme-token and
colour-vision contracts, the API-handler adoption backlog, the i18n catalog and
namespace integrity, the rAF-loop allowlist, the server-bundle copy check and
the test-discovery gate — plus eslint on the changed files, `tsc`, and the
generated-docs freshness checks. That subset runs in ~3s. It is wired into
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

Ten workflows live in `.github/workflows/`. The ones that touch tests/quality:

| Workflow                   | Runs                                                                                    | Gate?                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `web-ci.yml` (`check` job) | `tsc --noEmit` → `eslint` → docs freshness → `pnpm test`                                | **all block**, tests included (as of 2026-08-08)                                         |
| `web-ci.yml` (`build` job) | `build:frontend:sourcemap` → bundle budget → entry composition                          | build + both size gates block                                                            |
| `web-ci.yml` (`audit` job) | `pnpm audit --prod --audit-level=high`                                                  | blocks on high-severity prod advisories                                                  |
| `epic-tests.yml`           | `playwright install chromium` → `pnpm test:epic`                                        | blocks; **path-filtered** to `scripts/epic/**`                                           |
| `deploy.yml` (`ci` job)    | `tsc --noEmit` → `eslint` → `pnpm test`                                                 | typecheck + lint block; the **test step is advisory** here by owner decision — see below |
| `go-microservices.yml`     | `bazelisk test --build_tests_only //go-services/...`, path-filtered to `go-services/**` | blocks                                                                                   |

**Where enforcement lives.** `main` is reached only through a pull request, and
web-ci's Test step is a hard gate, so a red test stops the change before it
merges. The deploy's own `ci` job re-runs the suite as a second look and stays
advisory by owner decision, so a flake cannot wedge a release.

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
