# Deployment speed and release safety — implementation and rollout

Implements the repository changes identified by the
[October 23 audit](./build-deploy-audit-2026-10-23.md). Production keeps minification,
tree shaking, gzip assets, AVIF/WebP variants, optimized WASM, lazy-route boundaries,
the cluster primary, connection budgets, and the full web smoke/bake window.

## Delivery graph

The deploy workflow runs typecheck/lint/dependency audit, two isolated unit-test
shards, integration and native ARM64 image production concurrently. The exact
published web/full digests are smoke-tested before the signed webhook is allowed
to fire. The candidate database starts while compilation runs. A failed check,
image build, migration, readiness probe or cluster-worker check blocks the trigger.
Manual dispatch on another branch cannot publish production image tags.

Image publication no longer exports the reusable registry cache. The separate
`cache-maintenance` job calls `build-cache.yml` without being a dependency of
`deploy-gate`. It exports only dependency, Prisma, production dependency, media,
vibe and Go stages, each into its own registry reference. There is no second Vite
build. BuildKit fingerprints complete inputs, so an older cancelled run cannot
permanently suppress cache refresh. A scheduled/manual refresh covers cancellation
and cold-start recovery. The old `:buildcache` remains a read-only migration source.

The media stage installs only frozen sharp/tsx dependencies. An unrelated root
lockfile update no longer re-encodes all variants or restores the full application
dependency tree just to obtain them. CI variant caches include the encoder's
lockfile, generator, platform and master-image content; fallback restores cannot
reuse variants from a different encoder. A test checks that the root and isolated
encoder versions agree. Migration-only changes no longer regenerate Prisma's
client unless its schema/configuration actually changes.

The image build stops its checklist observer immediately after publication. The
release gate already waits for the real checks. Whole-site advisory Brotli
accounting moves to a nightly diagnostic job. The mandatory candidate budget
continues to measure the transitive critical JavaScript closure and now enforces
a site CSS ceiling as well.

The new **48 KB Brotli CSS ceiling** freezes the observed October baseline with
headroom for build variance; the existing **40 KB advisory** remains visible in
the whole-site report. This introduces enforcement where deployment previously
only warned. It does not claim that the pre-existing 40 KB target has been met,
raise any existing required JavaScript budget, or remove jelly material layers.

## Release identity and rollback

Each request carries an exact source SHA, unique release ID and both approved image
digests inside the HMAC-authenticated payload. The upgraded listener rejects
missing identities and malformed payloads. Duplicate requests are idempotent,
including after listener restart when the request is already journaled.

`deploy/release-state.mjs` writes atomic, synced, private JSON records under
`.deploy/releases/`. Records contain timestamps, public configuration hash, image
digests, serving identity and the prior release. They contain no environment
secrets. SHA identity cannot change during a request. Queue progress, checkout
progress, verified traffic movement and successful validation are distinct events.
The prior-serving snapshot is captured again after acquiring the deploy lock.

The deployment script preserves its approved SHA when restarting after a script
update. An unreachable approved commit is fetched explicitly or rejected; it never
silently selects a newer branch tip. The alarm guard compares release IDs rather
than checkout `HEAD` and repeats that check after acquiring the deployment lock.
Its rollback starts a new request using the previous recorded image digests.

On initial adoption, an old container may lack recorded source identity. If the
first new release rolls back, the journal explicitly records unknown identity
instead of falsely claiming the failed candidate is still serving. The existing
container-based smoke/bake rollback remains available throughout adoption.

Failed migrations are reported for deliberate recovery. P3009 text no longer
causes automatic `resolve --rolled-back` and DDL replay, and baseline application
is not silently marked complete on a fresh database. Follow Prisma's
[version-specific recovery procedure](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/patching-and-hotfixing)
after inspecting any partially executed migration.

Non-web health checking and the worker settle window begin as soon as services
start and overlap the web smoke/bake. The deployment joins the same health
verdicts afterwards. The web observation duration and serialized two-color swap
are retained; there is no detached bake racing the next release.

## Asset publication

Heavy media URLs use `/static/<directory-content-hash>/<original-path>` when a CDN
is configured. The three directory hashes are compile-time constants; no large
manifest or runtime hashing is added to the browser. Local development and
app-managed library/upload paths retain their existing URL behavior.

CI computes versions from the checked-out masters and bakes them into both the
client configuration and an image label. Host publication verifies its checkout's
bytes against that label, uploads the immutable namespace while migrations run,
and must finish before services/traffic move. Failed or mismatched publication
blocks the release. Old namespaces are retained for open tabs and rollback images;
normal deploys do not delete previous assets. Garbage collection is a separate
operator decision after the chosen retention period, not a side effect of rollout.

Legacy avatar/song backfills retain their existing behavior because the audit
could not verify which host records still need them. They are not disabled on an
unverified assumption that migration is complete. Operators can retire those
one-time jobs once their production completion has been checked.

## PR checks and artifact reuse

`web-ci.yml` reports `required-checks` on every PR. Its change classifier takes a
full path for missing history, unknown inputs and mixed changes. Documentation can
skip application checks; test-only changes still run tests; deployment/Go changes
still receive candidate-image validation. Applicable failures, timeouts and
cancellations cannot become a green aggregate through an accidental skip.

`candidate-image.yml` builds ARM64 Alpine images locally on the PR runner and never
pushes a PR image to production tags. It starts the production cluster primary,
migrates a throwaway Postgres, verifies readiness and all configured listening
workers, and probes the application's real smoke endpoints. Full-image binaries
and Chromium are also checked. Main repeats this against its actual published
digests, which protects the merged result.

The deterministic jelly interaction fixture is separated from the long advisory
frame scan. The full scan runs nightly/manually. Sequential browser and payload
diagnostic jobs reuse the checked frontend tar artifact, preserving symlinks and
permissions. Parallel integration keeps its independent build to avoid adding
artifact-transfer serialization to the release path.

## Post-merge activation

These are explicit deployment/operator steps. Creating this PR does not restart
host services, mutate repository settings, provision runners, or change image
compression.

1. Let the existing listener accept the first merged deployment and update the
   checkout. It still understands the signed request's `ref` and `after`; SHA
   preservation is enforced by the new script. Then restart the host's webhook
   listener service so it loads the new digest-aware protocol. Confirm the actual
   systemd unit name on that host before restarting it. The legacy listener cannot
   supply release-status responses or pass approved digests to the child process.
2. Once the upgraded listener is running, set repository variable
   `DEPLOY_WAIT_FOR_RELEASE=true`. The new completion job polls authenticated
   status requests and reports the host journal in the Actions summary. Before
   activation, green `deploy-gate` means webhook acceptance, not validated host
   completion. Do not enable the variable while the listener is still old.
3. After this PR is merged and its two checks exist on `main`, review the rule:

   ```bash
   node scripts/ci/apply-release-checks.mjs
   node scripts/ci/apply-release-checks.mjs --apply
   ```

   The first command prints the policy. The second needs repository-admin access,
   verifies the check definitions are on `main`, and creates/updates only the
   dedicated `Release checks` ruleset. It preserves the existing PR-required rule
   and requires `required-checks` plus `candidate-image`, with an up-to-date base
   and no bypass actors. The pre-merge guard prevents missing checks from wedging
   unrelated PRs. Existing PRs may need an update to obtain the new check reports.

4. Confirm one changed-media release publishes its immutable namespace before
   traffic moves, then exercise rollback using the previous retained namespace.
   Inspect `.deploy/releases/live.json` and the individual release journal.

The first legacy-transport rollout is an adoption step, not proof of the new
digest-aware handoff. Validate a subsequent release after restarting the listener.

## Infrastructure experiments and measurement

`ARM64_BUILD_RUNNER` optionally selects a dedicated, isolated ARM64 builder for
main builds/cache maintenance. Its absence keeps the native hosted runner.
Provisioning and verifying a persistent builder is an operator task; the production
VPS is not repurposed as a build host. Required PR image tests keep the hosted
runner so untrusted PRs do not execute on a privileged persistent production builder.

`DEPLOY_IMAGE_COMPRESSION` defaults to `gzip`. To compare alternatives, explicitly
provide a separate benchmark repository prefix and run:

```bash
BENCH_REGISTRY=ghcr.io/example/rmh-bench bash scripts/ci/benchmark-images.sh
```

The tool records three gzip/zstd build+push and pull trials plus the Docker version
under `.cache/image-benchmark/`. It does not prune a shared daemon. Results are
explicitly labeled as retaining daemon cache; cold-pull comparisons require a
dedicated clean test daemon. Verify the real VPS's zstd support and total
export/push/pull/unpack cost before changing the production variable.

Measure ordinary source changes, dependency changes, new art, migration-only,
Go-only, no-op and cold-cache scenarios separately. Compare queue-to-serving and
queue-to-validated timestamps, not the duration of a single convenient build
stage or the overall workflow, which now includes independent maintenance.
No post-deployment speedup is claimed before the new pipeline is measured.

## Validation

Local validation uses Node 24.21.0 and pnpm 10.34.6. Tests exercise the real shell
orchestrator with hermetic Git/Docker/HTTP boundaries, including script
self-update while main advances, unreachable target, partial migration failure,
optional monitoring configuration and stale alarm fencing. A loopback listener
tests HMAC validation, exact identities, duplicate requests and durable status.
Asset tests verify content identity, URL behavior and encoder-version agreement.

Workflow validation, Buildx graph parsing, shell syntax, typechecking, lint,
production build, entry composition and payload budgets passed locally. The full
Windows suite exposed path, shell, CRLF and process-signal portability failures;
the affected deployment harnesses were corrected and their focused suite passes.
The complete Linux suite and native container startup are checked by the PR's
Actions jobs. The local Windows workspace has no Docker daemon. Actual host
rollout, zstd trials and real-user performance comparisons remain post-merge
operational validation.

Main's existing production audit also reports newly published high-severity
[Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) and
[Undici](https://github.com/advisories/GHSA-xjj6-f33q-929c) advisories. The follow-up
raises the direct dependency minimums to patched versions and bounds the Undici
override to major 8. The frozen lockfile resolves Zod 4.6.7 and Undici 8.12.3.
One high finding remains through `@discord/embedded-app-sdk@2.5.0 → zod@3.25.76`:
the published SDK still requires Zod 3, and no patched Zod 3 release is available.
The SDK also vendors Zod code, so forcing a major-version override would neither
prove compatibility nor repair that bundled code. The audit gate remains enforced;
this upstream finding must be resolved before a green release is possible.
