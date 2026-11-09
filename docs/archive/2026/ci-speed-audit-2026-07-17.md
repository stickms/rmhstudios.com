# CI/CD speed audit — 2026-07-17

An audit of the `.github/workflows/` fleet (79 workflow files) focused on one
question: **how do we make builds and deploys faster?** Findings are grounded
in the actual workflow YAML, the Dockerfile/deploy.sh build graph, and measured
timings pulled from recent Actions runs (2026-07-16 → 2026-07-17).

**TL;DR — the four biggest wins, in order:**

1. **Parallelize the deploy pipeline** — the CI gate runs _serially before_
   the image build today (~4 min of pure latency), and the full image build
   serially _after_ the slim one (~1.5–2.5 min tail for seconds of real
   work). Run the gate concurrently with the build and gate only the webhook
   trigger; build both images from one shared `buildx bake` graph. Frontend
   vs Go parallelism _inside_ the build is already handled — BuildKit runs
   the Go and esbuild stages alongside the ~5 min Vite stage. (~40% faster
   deploys, low-risk changes.)
2. **Fix the permanently-red `i18n-catalogs` test** — every `web-ci` run on
   every PR currently fails at the Test step, which means the Build step
   _never runs on PRs_. Build breakage is discovered only during the
   production deploy (this happened today: the 13:42 deploy passed its CI gate
   and then died in the Docker build). Red-by-default CI is also pure noise.
3. **Consolidate the PR workflow fan-out** — a typical frontend PR fires
   ~17–25 independent workflows (≈26+ runner-minutes per push measured), 15 of
   which each run their own full `pnpm install`, and two of which
   (`e2e-smoke`, `lighthouse`) each do a **full production build + Postgres +
   browser boot on every PR**. The GitHub Free-plan cap is 20 _concurrent jobs
   account-wide_, so a single push can saturate the pool and everything queues.
4. **Move Docker layer cache from `type=gha` to a GHCR registry cache** — the
   GHA cache backend has a 10 GB/repo eviction limit that our `mode=max`
   exports (multi-GB per build, two scopes) plus ~15 pnpm-store caches churn
   through, which is why some builds are inexplicably cold/slow.

Estimated end state if the recommendations land: **push-to-main → deploy
trigger drops from ~12–13 min to ~6–7 min** (gate parallelized, one shared
build graph for both images), and a typical PR gets its meaningful signal in
**~4–5 min** with single-digit workflow runs instead of ~20.

---

## 0. Implementation status (this PR)

The bulk of the audit is implemented in this PR. Summary of changes:

| Rec | Change                                                                                                                                                                                                                              | Files                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Deploy CI gate now runs **concurrently** with the image build; only the webhook trigger (`deploy-gate` job) waits on both. Red CI ⇒ no webhook ⇒ nothing ships (unchanged safety).                                                  | `.github/workflows/deploy.yml`                                                                                                                                       |
| R1b | Both images build from **one `docker buildx bake` graph** (`web` + `full`); the Vite stage is shared → built once, Go build + Chromium run alongside it. No more serial second `docker build`.                                      | `docker-bake.hcl`, `deploy.yml`                                                                                                                                      |
| R4  | Docker layer cache moved from `type=gha` (10 GB evicting) to **registry cache on GHCR** (`:buildcache` tags).                                                                                                                       | `docker-bake.hcl`                                                                                                                                                    |
| R2  | `i18n-catalogs` drift **healed durably** — a targeted allowlist tolerates the two known-untranslated `feed` keys while still failing on any _other_ orphan/missing key. Test is a hard gate again (`continue-on-error` dropped).    | `lib/__tests__/i18n-catalogs.test.ts`, `deploy.yml`                                                                                                                  |
| R2  | `web-ci` split into **parallel `check` / `build` / `audit` jobs** so the production Build runs on every PR regardless of the test result.                                                                                           | `.github/workflows/web-ci.yml`                                                                                                                                       |
| R3  | Eight report-only JS checks merged into one `pr-reports` job (one checkout, one install).                                                                                                                                           | new `pr-reports.yml`; deleted `knip`, `type-coverage`, `madge-circular`, `todo-scan`, `no-hardcoded-hex`, `server-import-guard`, `large-file-guard`, `i18n-coverage` |
| R3  | `vitest-coverage` demoted to **nightly**; `lighthouse` demoted to **push-to-main + nightly** (both were warn-only / redundant on PRs).                                                                                              | `vitest-coverage.yml`, `lighthouse.yml`                                                                                                                              |
| R3  | Go linters consolidated under the golangci umbrella (`.golangci.yml` enables gofmt; vet/staticcheck are default-on). Retired `go-vet`, `go-fmt`, `go-staticcheck`, `go-cyclo`, `go-build`, `go-test` (build/test covered by Bazel). | new `go-services/.golangci.yml`; `go-lint.yml`; deleted 6 Go workflows                                                                                               |
| R3  | Trivy `secret` scanner dropped (gitleaks + trufflehog already cover secrets); `dependency-review` scoped to manifest paths.                                                                                                         | `trivy-fs.yml`, `dependency-review.yml`                                                                                                                              |
| R5  | Playwright browser cached in `e2e-smoke`.                                                                                                                                                                                           | `e2e-smoke.yml`                                                                                                                                                      |

Net: **78 → 65 workflow files** (−14 deleted, +1 added). A typical frontend PR
drops from ~20 fired workflows to a handful. Each changed workflow was
YAML-validated, the bake file resolves via `docker buildx bake --print`, and the
healed i18n test was verified to be green **and** to still catch a newly-injected
orphan or untranslated key.

### ⚠️ Required manual follow-up — branch protection

Splitting/renaming jobs and deleting workflows changes the set of **status-check
names** GitHub knows about. If any of these were marked _required_ in branch
protection (Settings → Branches), update the rule after merge or PRs will wedge
(a required check that never runs blocks merge):

- **Remove** required checks for the deleted workflows: `go-vet`, `go-fmt`,
  `go-staticcheck`, `go-cyclo`, `go-build`, `go-test`, `knip`, `type-coverage`,
  `madge-circular`, `todo-scan`, `no-hardcoded-hex`, `server-import-guard`,
  `large-file-guard`, `i18n-coverage`, `vitest-coverage` (no longer on PRs),
  `lighthouse` (no longer on PRs).
- **Add** the new gate names you want required: `web-ci / build`,
  `web-ci / audit` (the old single `web-ci / check` still exists and now covers
  only typecheck+lint+test — add `build` to keep build breakage blocking).
- Everything else keeps its name (`web-ci / check`, `go-lint`,
  `go-microservices`, `codeql`, `senior-review`, `e2e-smoke`, …).

### Not done (deliberately deferred)

- **Security-scanner cadence** (moving `semgrep`/`trufflehog` off PRs): left as-is
  — reducing SAST/secret coverage cadence is a security-posture call for the
  maintainer, and the PR-time saving is small (they run in parallel, ~40–80s).
  The safe dedup (Trivy secret mode, since two dedicated secret scanners remain)
  is done.
- **Prebuilt-binary swaps** for the `go install …@latest` tool bootstraps
  (`editorconfig-check`, `shfmt`, `kube-linter`, `kubeconform`): path-scoped and
  low-value; each needs its release URL verified before pinning. Follow-up.
- **`buildkit-cache-dance`** to persist the `.vinxi` mount across runs (makes the
  Vite build incremental in CI): measure the registry-cache win from R4 first.

---

## 1. Measured baseline

### 1.1 Deploy pipeline (push to `main` → VPS webhook trigger)

From recent successful runs of `deploy.yml`:

| Phase                                                     | Measured          | Notes                                                                                                                   |
| --------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ci` gate job (new)                                       | **~3m30s**        | install 11s (warm pnpm cache) → tsc 1m17s → eslint 1m6s → vitest 30s. Runs **serially before** the build job.           |
| `build-and-deploy`: setup (checkout, buildx, login)       | ~45s              |                                                                                                                         |
| Slim web image build + push (`runner`)                    | **~6m00s**        | warm GHA layer cache; vite/nitro build dominates, then export + push to GHCR                                            |
| Full image build + push (`runner-full`)                   | 1m15s–2m30s       | FROM the pushed web image; Go build ~12–14s, Chromium apk ~10s, rest is layer push                                      |
| Webhook trigger                                           | ~2s               |                                                                                                                         |
| **Total in Actions**                                      | **~12–13 min**    | was ~8–9 min before the serial `ci` gate was added                                                                      |
| VPS side (`deploy.sh`: pull → migrate → hotswap → health) | not measured here | already well-optimized: background R2/avatar sync, parallel health checks, hotswap skip when the web image is unchanged |

### 1.2 PR feedback loop

- One recent PR commit (`2144c35`) fired **17 workflows** within the sampled
  window alone; the full trigger analysis (appendix) says a typical frontend
  PR fires **~20–25**.
- Measured per-run durations (pull_request event): lighthouse **4m37s**,
  type-coverage **3m57s**, web-ci 3m32s (fails early — would be ~10 min green,
  since it ends with a full production build), codeql 2m38s–3m33s,
  vitest-coverage 2m06s, trufflehog 1m19s, checkov 1m02s, knip 1m04s,
  editorconfig-check 51s, gitleaks 48s, trivy-fs 45s, prettier 44s, semgrep
  39s, dependency-review 24s, plus e2e-smoke (5m27s on push; also PR-triggered).
- Summed: **≈26+ runner-minutes per PR push** in the sample, excluding several
  workflows that didn't appear in the window (madge, todo-scan, i18n-*,
  typecheck-server, senior-review, epic-tests…). Realistic total: **30–45
  runner-minutes per push**.
- **Every single `web-ci` run in the last two days is red** — all fail at the
  Test step on the known `lib/__tests__/i18n-catalogs.test.ts` drift (an
  English string added without translations). The `Production dependency
audit` and `Build` steps are therefore _skipped on every PR_.

### 1.3 Where the slim-image ~6 minutes go

From the BuildKit log of a successful run: the `vite-builder` stage (i18n
freshen + vibe-packages + `vite build` + CSS-hash fix) is the long pole
(~4–5 min), followed by image export/push and GHA cache export (~1.5–2 min
combined). `server-builder` (esbuild, ~6s), `go-builder` (~14s), and
`prod-deps` (~35s) all run in parallel under it and are effectively free.

---

## 2. Findings

### F1 — The deploy's CI gate is serial, doubling deploy latency (HIGH)

`deploy.yml` runs `ci` (typecheck/lint/test, ~3.5 min) and only then starts
`build-and-deploy` (~8–9 min) via `needs: ci`. The gate exists so a red build
can't ship — but nothing about that requires _serialization_. The thing that
must be gated is the **webhook trigger** (and arguably the `:latest` tag), not
the image build: pushing a SHA-tagged image to GHCR is harmless if the deploy
is never triggered, since the VPS only pulls the SHA it's told to.

Also note the `ci` job's vitest step is `continue-on-error` (because of F2),
so today the gate is really only typecheck + lint.

### F2 — web-ci is permanently red; the PR build canary never fires (HIGH)

The known-red `i18n-catalogs` test is report-only in `deploy.yml` but a hard
gate in `web-ci.yml`. Consequences:

- Every PR shows a failed required-ish check → alert fatigue; real failures
  are indistinguishable from the ambient red.
- `web-ci`'s **Build step is skipped on every PR** (it comes after Test), so
  Docker/Vite build breakage isn't caught pre-merge. Observed today: deploy
  run at 13:42 passed the CI gate, then failed in the slim-image build — a
  category of failure a green web-ci would have caught on the PR.
- `pnpm audit` (also after Test) is skipped on every PR too.

The fix (per the note already in `deploy.yml`) is to run the i18n translate
pipeline to heal the catalog drift, then make tests blocking again — or, until
then, `it.skip` / quarantine that one test rather than letting it poison the
entire suite's signal.

### F3 — Duplicate CI on every push to main (MEDIUM)

On every push to `main`, `web-ci.yml` (push trigger) and `deploy.yml`'s `ci`
job run the _same_ install/typecheck/lint/test on the same commit at the same
time on two runners. That's ~4 duplicated runner-minutes per push and one more
job occupying the 20-slot concurrency pool. One of the two should go — either
drop `web-ci`'s push trigger (deploy's gate covers main), or turn `web-ci`
into a reusable workflow (`workflow_call`) that `deploy.yml` invokes.

### F4 — Docker layer caching: GHA backend limits + dead cache mounts (MEDIUM-HIGH)

Three separate issues compound:

1. **`RUN --mount=type=cache` mounts do not persist on hosted runners.** The
   Dockerfile's pnpm-store, `.vinxi`, and vibe-packages cache mounts were
   designed for the old persistent-VPS builder. `cache-from/to: type=gha` only
   restores _layers_, never mount contents — and each hosted runner starts
   empty. So the Vite build runs **fully cold every deploy** (the `.vinxi`
   incremental cache never helps), and any lockfile change re-downloads the
   entire store.
2. **`mode=max` exports are huge and the GHA cache caps at 10 GB/repo.** Every
   build exports all intermediate stages (deps, prisma-generate, prod-deps,
   vite-builder incl. the ~1.5 GB `.output` tree and 276 MB `public/` copy
   layer) across two scopes — plus ~15 other workflows' pnpm caches share the
   same 10 GB. Eviction churn silently degrades "cached" builds to cold ones,
   which matches the observed variance (some deploys ~8 min, some much
   longer).
3. **The weekly `docker-build.yml` scan builds on amd64** (no `platforms:`)
   with a _different_ cache scope, so it neither warms nor reuses the deploy's
   arm64 cache, and it scans a different architecture than production runs.

### F5 — PR fan-out: ~20+ workflows, 15 full installs, 2 full prod builds (HIGH)

From the full inventory (appendix):

- **15 workflows run a full `pnpm install --frozen-lockfile`** in PR-triggered
  jobs. Five of them fire on effectively every PR (`e2e-smoke`, `knip`,
  `lighthouse`, `type-coverage`, `vitest-coverage`) — plus `web-ci`.
- **Two workflows do a full production build + `db:push` + app boot on every
  PR**: `e2e-smoke` (plus a Playwright Chromium download, uncached) and
  `lighthouse`. That's two ~5-minute jobs duplicating the same build.
- Several _report-only_ workflows pay a full install just to print a summary:
  `knip`, `type-coverage`, `vitest-coverage` (re-runs the exact vitest suite
  `web-ci` already ran), `i18n-coverage`, `license-check-js`, `prisma-format`.
- GitHub Free plan allows **20 concurrent jobs account-wide**. A single PR
  push can occupy the entire pool, so _wall-clock to all-green_ is set by
  queueing, not by the slowest check.

### F6 — Redundant workflow families (MEDIUM)

Same ground covered by multiple independent workflows, each with its own
checkout/setup:

| Domain          | Workflows                                                                        | Redundancy                                                       |
| --------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Go lint         | `go-lint` (golangci-lint) **+** `go-vet`, `go-fmt`, `go-staticcheck`, `go-gosec` | golangci-lint already bundles vet, gofmt, staticcheck, and gosec |
| Go build/test   | `go-build`, `go-test` **+** `go-microservices` (Bazel build+test)                | Bazel already builds and tests everything                        |
| Secret scanning | `gitleaks`, `trufflehog`, `trivy-fs` (secret mode), `secret-file-guard`          | 4 scanners on every PR                                           |
| SAST            | `codeql` (js+go, 3–4 min) **+** `semgrep --config auto`                          | overlapping general SAST                                         |
| npm dep vulns   | `dependency-review`, `pnpm-audit-full`, `trivy-fs`, web-ci's `pnpm audit`        | 4 overlapping                                                    |
| Helm/K8s        | `helm-lint`, `kube-linter`, `kubeconform`, `checkov`                             | 4 linters on `deploy/helm/**`                                    |
| Dockerfile      | `hadolint`, `checkov`, `trivy-fs`                                                | 3                                                                |
| Workflow YAML   | `actionlint`, `yamllint`, `zizmor`                                               | 3                                                                |
| Markdown        | `markdownlint`, `link-check`, `spell-check`                                      | 3                                                                |
| Prettier        | `prettier` (changed files) + `prettier-full` (scheduled)                         | acceptable split, but two files                                  |

### F7 — Wasteful tool bootstrap in small workflows (LOW-MEDIUM each, adds up)

- `editorconfig-check`, `shfmt`, `kube-linter`, `kubeconform`, `go-cyclo`
  install a **full Go toolchain (`cache: false`) and `go install
<tool>@latest` from source** on every run — up to a minute of setup for a
  seconds-long check, and `@latest` is also non-reproducible. All five tools
  ship prebuilt release binaries.
- `checkov`, `semgrep`, `yamllint`, `codespell`, `zizmor` do fresh `pip
install`s each run (no pip cache).
- `e2e-smoke` downloads the Playwright Chromium build every run
  (`ms-playwright` cache is not persisted).
- `editorconfig-check` and `dependency-review` have **no meaningful paths
  filter** — the former runs its Go bootstrap on nearly every PR for a
  whitespace check; the latter runs on doc-only PRs despite only acting on
  dependency-manifest changes.

### F8 — Unused speed infrastructure (LOW)

- `go-microservices.yml` already supports a **remote Bazel cache**
  (`BAZEL_REMOTE_CACHE` secret) but it's unset — every CI run rebuilds from
  the actions/cache disk-cache only, and dev machines share nothing.
- `senior-review.yml` runs an LLM review on every PR event
  (opened/synchronize/…) even though it only gates one author.

---

## 3. Recommendations

Ordered by impact ÷ effort. Times are estimates against the measured baseline.

### R1 — Restructure `deploy.yml`: gate the _trigger_, not the _build_ (saves ~4 min/deploy)

```
        ┌─ ci (typecheck/lint/test, ~3.5m) ─┐
push ──►│                                   ├─► trigger-deploy (needs: [ci, build], ~5s)
        └─ build (images → GHCR :sha, ~8m) ─┘
```

- `build` pushes **SHA tags only**. `trigger-deploy` (needs both) fires the
  HMAC webhook — and, if we want to keep `:latest` meaning "passed CI", moves
  the `:latest` tag there too (a manifest-only `docker buildx imagetools
create -t …:latest …:sha`, ~2s, no rebuild).
- Failure semantics are identical to today: red CI → no webhook → nothing
  ships. An orphaned SHA image in GHCR is inert.
- Deploy latency returns to the build's own ~8–9 min; the CI gate becomes
  free (it's ~3.5 min inside an 8-min shadow).

### R1b — Parallelize the two image builds: bake both targets in one invocation (saves ~1.5–2.5 min/deploy)

Where the frontend/backend build parallelism actually stands today:

- **Within** the slim-image build, BuildKit already parallelizes the frontend
  against the backend: `server-builder` (esbuild, ~6s) and `go-builder`
  (~14s) run alongside the ~4–5 min `vite-builder` stage, so they're free.
  The Go services are _not_ what makes the build slow — Vite is.
- **Between** the two images, however, we serialize: `runner-full` is built
  in a second `build-push-action` invocation `FROM` the just-pushed web
  image, adding a ~1.5–2.5 min tail whose actual new work (Go build ~14s +
  Chromium apk ~10s) is seconds — the rest is invocation overhead and layer
  push.

The `WEB_IMAGE` indirection exists to stop the vite stage building twice
across two _separate_ invocations (per the Dockerfile's own comment). A
single **`docker buildx bake`** invocation with both targets sidesteps the
whole problem: one shared build graph, vite builds once, `go-builder` and the
Chromium apk layer proceed in parallel with it, and both images are derived
and pushed together:

```yaml
- uses: docker/bake-action@v6
  with:
    push: true
    targets: web,full # runner / runner-full via a small docker-bake.hcl
```

with `runner-full` left at its default `FROM runner` (the in-graph path, which
is exactly the case where the stage IS shared). This removes the serial tail
_and_ deletes the WEB_IMAGE plumbing from the workflow. Combined with R1, the
deploy critical path becomes just the slim build: **~6 min of build + setup**.

If we later want the full image fully independent of the Node base, audit
what `supervisor`/`status` actually use from it — if the Go binaries +
Chromium don't need `.output`/node_modules, a standalone Go+Chromium image
builds in under a minute and could ship on its own cadence (compose/deploy.sh
would need the new image name; deploy.sh's helper scripts already run in the
_web_ image, not the full one). Treat as optional follow-up, not phase 1.

### R2 — Heal web-ci: fix the i18n catalog, restore hard gates (signal, and pre-merge build coverage)

1. Run the translate pipeline (`pnpm i18n:translate` + `i18n:resources`) to
   clear the `i18n-catalogs` drift — or quarantine that single test.
2. Drop `continue-on-error` from the deploy `ci` test step (as its own comment
   already plans).
3. Reorder `web-ci` so cheap, independent signal isn't hidden behind the
   red test: run Build regardless (`if: always()` on the step), or better,
   split typecheck / lint / test / build into **four parallel jobs** sharing
   the warm pnpm store cache (install is only ~11s warm, so the fan-out is
   nearly free and wall-clock drops to the build's own time). PR-side build
   coverage is what would have caught today's 13:42 deploy build failure
   before merge.

### R3 — Collapse the PR fleet into a small number of orchestrated workflows (halves per-PR compute; fixes queueing)

The pattern most larger monorepos converge on: **one `ci.yml` with a
change-detection job** (`dorny/paths-filter`) whose outputs conditionally
enable downstream jobs — instead of 79 files each doing trigger logic,
checkout, and setup independently. Concretely:

1. **Merge the report-only JS checks into one job** (single install):
   `knip`, `type-coverage`, `madge-circular`, `todo-scan`, `no-hardcoded-hex`,
   `server-import-guard`, `large-file-guard`, `i18n-coverage` → one
   "pr-reports" job with one `pnpm install`, steps `continue-on-error`,
   emitting one combined summary. Saves ~8–10 runner-minutes/PR and ~7 queue
   slots.
2. **Delete `vitest-coverage` from PRs** — it re-runs the identical suite
   `web-ci` gates, just with `--coverage`. Either add `--coverage` to web-ci's
   test step or run coverage nightly.
3. **Demote heavyweight page-quality checks off the PR path**: `lighthouse` →
   push-to-main + nightly (it's warn-only anyway); it duplicates `e2e-smoke`'s
   entire build+boot. If PR-time Lighthouse is genuinely wanted, fold it into
   `e2e-smoke` as an extra step against the already-booted server —
   **build once, probe many** (smoke + LH + pa11y share one server).
4. **Go: keep two workflows** — `go-microservices` (Bazel build+test+e2e+helm)
   and `go-lint` (golangci-lint with vet/gofmt/staticcheck/gosec enabled in
   `.golangci.yml`); retire `go-vet`, `go-fmt`, `go-staticcheck`, `go-gosec`,
   `go-build`, `go-test` as standalone PR workflows. Same coverage, −6 jobs.
5. **Security scanners: one per domain on PRs, the rest on schedule.**
   Suggested: keep `gitleaks` (+ GitHub push protection) and
   `secret-file-guard` on PRs; move `trufflehog` to nightly; disable
   `trivy-fs` secret scanning (`scanners: vuln,misconfig`). Keep CodeQL on
   PRs; move `semgrep` to its weekly schedule only. Keep `dependency-review`
   but add `paths: [package.json, pnpm-lock.yaml, go-services/go.mod,
go-services/go.sum, cli/**]`.
6. **Helm/K8s and Dockerfile linters**: `helm-lint` + `kubeconform` on PRs
   (correctness), `kube-linter`/`checkov` weekly (best-practices). `hadolint`
   stays (it's 26s); drop the Dockerfile overlap from checkov's PR runs.
7. Keep required-status-check count small and stable (web-ci, go-lint,
   go-microservices, codeql) so the merge signal is legible.

### R4 — Registry-backed Docker layer cache; persist the hot mounts (steadies build at warm-cache speed)

1. Switch `deploy.yml` cache to GHCR:
   ```yaml
   cache-from: type=registry,ref=ghcr.io/stickms/rmhstudios-app:buildcache
   cache-to: type=registry,ref=ghcr.io/stickms/rmhstudios-app:buildcache,mode=max,image-manifest=true,oci-mediatypes=true
   ```
   No 10 GB eviction, no cross-workflow contention, arm64-native, and the VPS
   (or a future self-hosted builder) can share it. Keep `type=gha` only for
   the weekly `docker-build.yml` scan — and give that workflow
   `platforms: linux/arm64` so it scans what production actually runs (or
   simply have it scan the already-pushed `:latest` image and build nothing).
2. If more is needed after (1), persist the two hot `RUN --mount=type=cache`
   mounts (`.vinxi`, vibe-packages) across runs with
   `reproducible-containers/buildkit-cache-dance` — this is what makes the
   Vite build _incremental_ in CI rather than cold. Measure before/after; the
   `fix-ssr-css-hash.mjs` safety net already exists for exactly this cache.
3. Longer-term option (bigger change, only if 1–2 disappoint): build
   `.output` + `dist-server` **on the runner** (native pnpm + actions/cache,
   shared with the `ci` job's install) and reduce the Dockerfile to a thin
   assemble/COPY stage. This is the common "build artifacts in CI, Docker
   only packages" pattern; it dedupes the double `pnpm install` (runner +
   image) but forks the build path from local `docker build`, so treat it as
   a deliberate trade.

### R5 — Cheap hygiene wins (minutes of work each)

- Prebuilt binaries instead of `go install …@latest` + full toolchain:
  `editorconfig-checker`, `shfmt`, `kube-linter`, `kubeconform`, `gocyclo`
  all publish releases (curl + checksum, pin the version). Add
  `cache: pip` (or `uv`) to the Python tool workflows.
- Cache the Playwright browser in `e2e-smoke`
  (`~/.cache/ms-playwright`, keyed on the `playwright` version from the
  lockfile).
- Add `paths` to `dependency-review` (manifests) and `editorconfig-check`
  (or fold editorconfig into the pr-reports job).
- Set the `BAZEL_REMOTE_CACHE` secret (BuildBuddy free tier or a small
  self-hosted `bazel-remote`) — the workflow already supports it; today's
  actions/cache disk cache restores less and uploads more than a real remote
  cache.
- Gate `senior-review`'s job on the author condition _before_ spinning the
  LLM step, if not already, and consider `types: [opened, ready_for_review]`
  instead of every synchronize.
- Once F2/R2 land, `web-ci`'s `pnpm audit --prod` step can also move to the
  scheduled lane — `dependency-review` already gates PR-introduced vulns.

### R6 — Structural patterns worth adopting from elsewhere (context for the above)

- **Fast lane / deep lane.** PRs run only what decides mergeability
  (typecheck, lint, unit, build, one secret scanner, CodeQL); everything
  advisory (coverage %, knip, type-coverage, audits, SBOM, lighthouse, pa11y,
  link/spell/markdown) runs nightly or weekly against `main`, filing issues
  instead of PR checks. Roughly half of the current fleet already has cron
  triggers — this direction is started; finish it by removing those
  workflows' PR triggers.
- **Build once, promote the artifact.** The SHA-tagged image _is_ the
  artifact; CI green _promotes_ it (tag/`:latest` + webhook) rather than
  preceding the build (R1 implements this).
- **Change-detection orchestration** (R3) rather than per-file `paths:` in 79
  files — one place to reason about "what runs when", one checkout, shared
  caches, far fewer queue slots.
- **Merge queue.** If merge volume keeps growing, GitHub's merge queue plus
  the slimmed required-check set batches verification and stops
  main-breakage races between concurrently-green PRs.
- **Remote caches everywhere it's already supported**: Bazel remote cache
  (R5), registry BuildKit cache (R4), pnpm store via setup-node (already in
  place and effective — installs measured at 11s warm).

---

## 4. Suggested phasing

| Phase       | Items                                                                                                                                                                   | Expected effect                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Day 1**   | R2 (fix i18n test / quarantine), R1 (parallel deploy gate), R5 paths filters + `vitest-coverage` removal                                                                | Deploys ~12–13 → ~8–9 min; PRs get real signal again; −3 jobs/PR                                                                                                 |
| **Day 2**   | R1b (single `buildx bake` graph for both images)                                                                                                                        | Deploys ~8–9 → ~6–7 min; workflow loses the WEB_IMAGE plumbing                                                                                                   |
| **Week 1**  | R3 (pr-reports consolidation, Go fleet consolidation, scanner rationalization, lighthouse demotion), R5 remaining (binaries, pip/playwright caches, Bazel remote cache) | Per-PR compute roughly halves (≈30–45 → ≈15–20 runner-min); queueing under the 20-job cap mostly disappears; time-to-all-green ≈ slowest single check (~4–5 min) |
| **Week 2+** | R4 (registry cache, then cache-dance if needed; fix docker-build arch), R6 (merge queue when volume warrants)                                                           | Deploy builds stay at warm-cache speed consistently; slim-image step ~6 → ~4 min plausible with a persistent `.vinxi` cache                                      |

**Measure as you go:** the Discord "images pushed in Xm Ys" embed already
tracks deploy build time; add the same one-liner to `web-ci` (job summary with
elapsed) so the PR-lane numbers in §1 can be re-baselined after each phase.

---

## Appendix A — Workflow inventory (79 files)

Compressed inventory; per-file details (triggers, caching, gate vs report-only)
verified 2026-07-17. Runner is `ubuntu-latest` everywhere except
`deploy.yml`'s build job (`ubuntu-24.04-arm`); every workflow has a
`concurrency` group with cancel-in-progress except `stale`.

**Core pipeline (4):** `deploy` (push→main: serial ci gate + arm64 image
build + webhook), `web-ci` (PR/push: install→tsc→eslint→vitest→audit→full
frontend build; currently always red at vitest), `go-microservices` (Bazel
build+test, Postgres e2e, helm lint; disk-cache + optional unused remote
cache), `docker-build` (weekly amd64 image build + Trivy scan + SBOM).

**PR-triggered, effectively every PR (broad or no paths):** codeql,
dependency-review*, editorconfig-check*, e2e-smoke (full build+boot),
gitleaks, knip*, large-file-guard*, lighthouse (full build+boot), prettier,
secret-file-guard, semgrep, trivy-fs, trufflehog, type-coverage*,
vitest-coverage*, web-ci, senior-review, pr-title, labeler.
(* = report-only.)

**PR-triggered, path-scoped:** actionlint, build-vibe-packages, checkov,
compose-validate, epic-tests, go-build, go-cyclo*, go-fmt, go-gosec,
go-licenses*, go-lint, go-mod-tidy, go-staticcheck*, go-test*, go-vet,
go-vuln, hadolint, helm-lint, i18n-coverage*, i18n-extract-check*,
i18n-json-valid, kube-linter, kubeconform, license-check-js*, link-check,
madge-circular*, markdownlint*, manifest-check, no-hardcoded-hex*,
prisma-db-push, prisma-format*, prisma-migrate-status*, prisma-validate,
robots-check, security-headers, server-import-guard*, shellcheck, shfmt*,
spell-check*, terraform-fmt, terraform-validate*, todo-scan*,
typecheck-server, yamllint*, zizmor*.

**Scheduled-only:** bundle-size, lighthouse-mobile, pa11y, pnpm-outdated,
prettier-full, stale. **Push(main)/schedule, no PR:** sbom-fs, sitemap-check,
structured-data, scorecard.

**Full-`pnpm install` PR workflows (15):** build-vibe-packages, e2e-smoke,
epic-tests, i18n-coverage, i18n-extract-check, knip, license-check-js,
lighthouse, prisma-db-push, prisma-format, prisma-migrate-status,
prisma-validate, type-coverage, typecheck-server, vitest-coverage
(+ web-ci, + deploy's ci job).

**Full production builds:** per-PR — e2e-smoke, lighthouse; scheduled/push —
bundle-size, lighthouse-mobile, pa11y, sitemap-check, structured-data,
docker-build, deploy.

## Appendix B — Measured run durations (sample, 2026-07-16 → 07-17)

| Workflow                                                            | Event     | Duration                  |
| ------------------------------------------------------------------- | --------- | ------------------------- |
| deploy (pre-gate, full success)                                     | push      | 8m14s / 9m11s             |
| deploy `ci` job alone                                               | push      | 3m30s                     |
| e2e-smoke                                                           | push      | 5m27s                     |
| lighthouse                                                          | PR        | 4m37s                     |
| type-coverage                                                       | PR        | 3m57s                     |
| codeql                                                              | PR / push | 2m38s–3m33s / 3m25s–4m12s |
| web-ci (fails at Test)                                              | PR        | 2m36s–4m01s               |
| vitest-coverage                                                     | PR        | 2m06s                     |
| trufflehog                                                          | PR        | 1m19s                     |
| knip                                                                | PR        | 1m04s                     |
| checkov                                                             | PR        | 1m02s                     |
| gitleaks / editorconfig / trivy-fs / prettier / semgrep             | PR        | 39s–51s                   |
| large-file-guard / hadolint / dependency-review / secret-file-guard | PR        | 19s–27s                   |

Within web-ci (warm pnpm cache): install 10–11s, typecheck ~1m17s, lint
~1m6s, vitest ~30s (fails). The skipped Build step runs ~4–6 min when it
executes (per the deploy image build's vite stage).
