# Testing

How tests are organized, how to run them, and how CI gates them. For the build
and deploy pipeline see [`architecture.md`](./architecture.md) §2–3 and
[`../deploy/README.md`](../deploy/README.md); this doc is about tests.

> Sources of truth: `vitest.config.ts`, `vitest.epic.config.ts`, the `testing/`
> tree, `go-services/**/*_test.go`, and the `.github/workflows/*` files. When a
> doc disagrees with those, the files win.
>
> Last verified against the tree on **2026-08-08** (the testing audit): 438
> `*.test.ts(x)` files — 426 in the main suite, 11 in the epic suite, and one
> deliberate harness in neither. ~8.9k tests; a full main run is ~37s on 4
> cores. `lib/__tests__/test-discovery.test.ts` keeps that accounting honest.

## TL;DR — run tests locally

```bash
pnpm check:consistency        # the commit gate (guard tests + lint + tsc + docs freshness)
pnpm test                     # main suite (vitest.config.ts) — ~37s
pnpm test testing/rmhbox/phase-6   # one file or directory
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
helpers (`MOCK_USERS`, `createPlayer`, default settings, …), and deterministic
model fixtures in `testing/factories.ts` (fixed epoch, no `Date.now()`, no
`Math.random()` — read its header before writing a fixture).

What's in it:

- **`testing/rmhbox/phase-1…6/`** — the largest single set: match persistence,
  the REST API, game registration, per-minigame logic (Rhyme Time, Undercover
  Editor, Emoji Cinema, Fact or Friction, Wiki-Race, …), security
  state-masking, the design/sound systems, and cross-game integration.
- **Per-feature `__tests__` across `lib/` and `components/`** — `lib/slice-it`
  (50 files), `lib/cookgame`, `lib/rmhladder` (the pipeline contract),
  `lib/dream-rift`, `lib/homes`, `lib/temple-of-joy`, `lib/kowloon-knockout`,
  `lib/versecraft/gen`, `components/motion`, `components/rmhladder`, and the
  rest.
- **`lib/__tests__/`** — the executable conventions. See `lib/CLAUDE.md`
  §Testing; these are the authority for `docs/design-language.md` §13 and most
  of them are in the commit gate.

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
is in no suite. The one deliberate opt-out (`UNCOLLECTED_BY_DESIGN` in that
file) is the Temple of Joy snapshot **harness**, which is not a test.

#### Speed

~37s for 426 files / ~8.9k tests on 4 cores, down from ~50s. What moved it, in
order:

| Change                                         | Why                                                                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pool: 'threads'`                              | Nothing needs a process boundary; a worker thread starts far cheaper than a child process. ~8%.                                                                   |
| `maxWorkers` at 1.5× cores                     | Files are import-bound, so one worker per core leaves cores idle. Measured 3 → 46s, 4 → 41s, **6 → 37s**, 8 → 38s + flakes.                                       |
| `LOG_LEVEL=silent` (`test.env`)                | A green run used to print ~10,000 JSON log lines (1.4 MB). Set via `env`, not `setupFiles` — a setup file is a module load per test file, 4.7s at this size.      |
| Compiling scripts under test once, not per-run | `migration-safety` booted `tsx` 15 times (~350ms each) to check 428 lines. esbuild compiles it once; each run is bare node. 5.5s → 1.4s.                          |
| Asserting once, not 20M times                  | `slice-it/visible-window` called `expect()` inside a triple loop. Recording the first counter-example and asserting once: 2.2s → 0.2s, identical failure message. |
| Simulating to the event, not to a round number | The laundry-sort drops settled in 82 physics ticks and ran a flat 480 "to be sure".                                                                               |

**Isolation stays on**, and that is deliberate. `--no-isolate` runs the suite in
~20s, and it was measured: nine files fail outright (shared `vi.mock`
registry), and `lib/rmhladder/pipeline/{run,process-source}.test.ts` fail
_differently on every seed_ under `--sequence.shuffle`, because their in-memory
Prisma doubles are module state. Order-dependent red is worse than slow green.
Don't re-litigate this without re-running the shuffle.

To get logs back while debugging: `LOG_LEVEL=debug pnpm test <path>`.

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

- **Main suite:** put it in a feature `__tests__/` dir (or next to the module,
  or under `testing/`) and it runs. Keep it environment-agnostic: mock
  DB/network/FS, reuse the `setup.ts` helpers for RMHBox and `testing/factories.ts`
  for model fixtures.
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
