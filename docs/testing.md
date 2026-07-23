# Testing

How tests are organized, how to run them, and how CI gates them. For the build
and deploy pipeline see [`architecture.md`](./architecture.md) §2–3 and
[`../deploy/README.md`](../deploy/README.md); this doc is about tests.

> Sources of truth: `vitest.config.ts`, `vitest.epic.config.ts`, the `testing/`
> tree, `go-services/**/*_test.go`, and the `.github/workflows/*` files. When a
> doc disagrees with those, the files win.

## TL;DR — run tests locally

```bash
pnpm exec vitest run                       # main suite (vitest.config.ts)
pnpm exec vitest run testing/rmhbox/phase-6   # one directory
pnpm exec vitest                           # watch mode
pnpm epic:test                             # epic content-build suite
make test                                  # Go (Bazel) + the frontend vitest suite
```

The pre-push checks that actually gate CI are `pnpm exec tsc --noEmit` and
`pnpm lint` (see [CI](#ci) below).

## The suites

### 1. Main Vitest suite (`vitest.config.ts`)

Run with `pnpm exec vitest run`. Node environment, `globals: true`, and `@`
aliased to the repo root. It does **not** glob the whole repo — the config
carries a curated `include` list, so a new test only runs once its path is added
there. Currently covered:

- **`testing/**/*.test.ts`** — the largest set: the **RMHBox** phase tests
  (`testing/rmhbox/phase-4…8/`), covering match persistence, the REST API, game
  registration, per-minigame logic (Rhyme Time, Undercover Editor, Emoji Cinema,
  Fact or Friction, …), security state-masking, the design/sound systems, and
  cross-game integration.
- **Per-feature `__tests__`** across `lib/` and `components/`: `lib/cookgame`,
  `lib/dream-rift`, `lib/rmhark-ai`, `lib/rmhladder`, `lib/homes`,
  `lib/personas`, `lib/predictions`, `lib/tournaments`, `lib/market`,
  `lib/versecraft/gen`, `lib/kowloon-knockout` (render + game), `lib/__tests__`,
  `components/rmhladder`, and `components/motion`.

~227 `*.test.ts(x)` files live in the repo overall (across `testing/` and the
feature `__tests__` dirs). **These tests are environment-agnostic** — no real
Postgres, network, Wikipedia API, or filesystem. External dependencies are
mocked; shared mock helpers live in per-phase `setup.ts` files
(`testing/rmhbox/phase-N/setup.ts`), each building on the previous phase's
helpers (`MOCK_USERS`, `createPlayer`, default settings, …).

### 2. Epic suite (`vitest.epic.config.ts`)

Run with `pnpm epic:test`. Scoped to `scripts/epic/**/*.test.ts` — the epic
(book/textbook) content-build pipeline. Separate from the main suite so its
build-tooling tests don't mix with product tests.

### 3. Go tests (Bazel)

Run with `make test` (from the repo root), which runs
`bazelisk test --build_tests_only //go-services/...` **and** the frontend vitest
suite. Go unit tests live next to their packages as `*_test.go` (e.g.
`go-services/cmd/status/main_test.go`, `internal/doctrine/*_test.go`). Add or
move `.go` files → run `make gazelle` first so BUILD files pick them up.

### Coverage

```bash
npm install --no-save @vitest/coverage-v8@4        # provider isn't a repo dep
pnpm exec vitest run --coverage --coverage.provider=v8 --coverage.reporter=text
```

CI runs this in `vitest-coverage.yml` and writes the text report to the job
**step summary** — it's informational, not a threshold gate.

## CI

~45 workflows live in `.github/workflows/`. The ones that touch tests/quality:

| Workflow                   | Runs                                                                                    | Gate?                                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web-ci.yml` (`check` job) | `tsc --noEmit` → `pnpm lint` → `vitest run`                                             | typecheck + lint **block**; the **vitest step is advisory** (`continue-on-error` — a red test shows in annotations/summary but doesn't fail the job) |
| `web-ci.yml` (`build` job) | `build:frontend`                                                                        | build **blocks**; bundle sizing is reported separately and remains advisory                                                                          |
| `web-ci.yml` (`audit` job) | `pnpm audit --prod --audit-level=high`                                                  | blocks on high-severity prod advisories                                                                                                              |
| `typecheck-server.yml`     | typechecks the Node service tier vs. `tsconfig.server.json`                             | blocks                                                                                                                                               |
| `vitest-coverage.yml`      | vitest with V8 coverage → step summary                                                  | report-only                                                                                                                                          |
| `epic-tests.yml`           | `pnpm epic:test`                                                                        | blocks                                                                                                                                               |
| `go-microservices.yml`     | `bazelisk test --build_tests_only //go-services/...`, path-filtered to `go-services/**` | blocks                                                                                                                                               |

Plus SAST/quality gates that aren't tests but run on PRs: `codeql.yml`,
`semgrep`, `trivy-fs`, `trufflehog`, `checkov`, `zizmor`, `go-gosec`/`go-vuln`/
`go-licenses`, the format/lint linters (`prettier`, `markdownlint`, `yamllint`,
`actionlint`, `shellcheck`, `shfmt`, `hadolint`, `editorconfig-check`), the
`prisma-*` and `i18n-*` checks, and `senior-review.yml` (an LLM review gate).

**Net:** typecheck (web + server), lint, the frontend build, the prod dependency
audit, the epic suite, and the Go Bazel tests are the hard gates; the frontend
vitest run and coverage surface failures but don't block. Read the run — don't
rely on a green check to mean every test passed.

> **Removed:** the old Go **Postgres-backed e2e** suite and the `helm lint`
> jobs went away with the Go realtime/Helm topology (rewrite §5.2). A
> browser-smoke script survives at `testing/e2e/smoke.mjs` (Playwright: drives the
> built app — `node .output/server/index.mjs` — with the pre-installed Chromium
> and asserts public routes render with a `<title>` + `<html lang>`), but it is
> **not wired into CI**; run it manually with
> `BASE_URL=http://localhost:3000 node testing/e2e/smoke.mjs` against a built app.

## Writing a test

- **Main suite:** put it in a feature `__tests__/` dir (or under `testing/`),
  then **add its glob to `vitest.config.ts`'s `include`** — otherwise it won't
  run. Keep it environment-agnostic: mock DB/network/FS, reuse the `setup.ts`
  helpers for RMHBox.
- **Go:** add `*_test.go` beside the code and `make gazelle` before `make test`.
- Node environment and the `@` → repo-root alias are already configured; use
  `@/lib/...` imports as in the app.
