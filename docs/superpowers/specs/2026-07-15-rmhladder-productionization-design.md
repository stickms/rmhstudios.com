# rmhladder — Productionization & Hardening (Design)

**Date:** 2026-07-15
**Status:** Approved design, pending implementation plan
**Location:** Inside rmhstudios.com (TanStack Start), extending the existing `rmhladder` mini-app + `ladder-worker`
**Predecessor:** [2026-07-05 rmhladder design](./2026-07-05-rmhladder-design.md) — foundation, adapters, pipeline, dashboard, alerts (Plans 1–4, merged to `main`)

## Goal

Take the already-built rmhladder job tracker from "works on paper" to **reliably running unattended in production**. Concretely: fix the two user-visible failures (stale/under-refreshed jobs; broken resume upload), move the scrape to a **12-hour** cadence that actually runs, and raise the whole system to an enterprise bar across four pillars the owner selected — **reliability & observability, data quality & freshness, coverage & scale, ops & scheduling** — without changing the core architecture.

**Scope decision (locked with owner):** keep **direct per-company ATS crawling** (the right model for the finance/consulting/tech early-career domain, where aggregators have poor and stale coverage). We *harden and broaden* it — we do **not** add a third-party aggregator API, and we do **not** add new ATS engine types this pass.

## Decisions Made

| Decision | Choice |
|---|---|
| Scrape strategy | **Harden + broaden existing per-company ATS crawling.** No aggregator API. No new ATS engine types this pass. |
| Where symptoms live | **Production.** Phase 0 establishes prod truth before code changes. |
| Enterprise scope | **All four pillars:** reliability/observability, data quality/freshness, coverage/scale, ops/scheduling. |
| Coverage depth | **Deepen existing.** Max out Workday coverage + tighten auto-discovery. No iCIMS/Phenom/Eightfold/SuccessFactors/Taleo this pass. |
| Resume storage | **S3/R2 object storage (PII-safe).** Fix is fail-loud provisioning guardrails, not loosening the storage requirement. |
| Cadence | **Every 12 hours** (`0 */12 * * *`), staleness threshold aligned to cadence. |
| Implementation style | Subagent-driven development, phased; Phase 0 ships first. |
| Runtime | Unchanged: Node `ladder-worker` + `node-cron`, wired into `docker-compose.yml` / `pnpm build`/`start`. No Redis/queue introduced. |

## Root-Cause Diagnosis (evidence from current `main`)

These are the concrete defects the design targets. Each cites the file that establishes it.

1. **Resume upload fails in production — unprovisioned env surfaced as an opaque 503.**
   `app/routes/api/rmhladder/resume/index.ts:34-37` returns `503 "Resume storage is unavailable."` in production whenever `s3Configured()` is false. `s3Configured()` (`lib/storage/s3.server.ts`) requires **all** of `S3_BUCKET / S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY`. Resumes are PII, so the route deliberately refuses the local-FS fallback other uploads use. A second prerequisite, `LADDER_RESUME_ENCRYPTION_KEY` (`lib/rmhladder/resume/crypto.server.ts`), must also be verified. Net: if prod env is incomplete, **every** upload fails silently to the user.

2. **Stale jobs never expire — the empty-board blind spot.**
   `lib/rmhladder/pipeline/recheck.ts` sets `fetchSucceeded = boardJobs.length > 0` and issues **no strikes when a board returns `[]`** (documented MVP tradeoff in the file header: "A genuinely-emptied board will not auto-expire via recheck"). When a company pulls all early-career reqs — routine in finance's seasonal cycle — its jobs stay `active` indefinitely. This is the primary "doesn't properly refresh jobs" cause.

3. **The flagship finance firms yield ~no jobs — manual sources are aliveness-only.**
   `lib/rmhladder/pipeline/run.ts` Step 5 treats `manual` sources (Goldman, JPMorgan, Morgan Stanley, the bulge brackets, big consultancies — seeded via `MANUAL_EARLY_CAREER_URLS` in `lib/rmhladder/seed/companies.ts`) with only a landing-page **aliveness ping** plus opportunistic Workday-tenant sniffing. Priority-1 companies therefore contribute little real inventory.

4. **Cadence is 4h by default and the staleness constant is decoupled.**
   `lib/rmhladder/scheduler.ts`: `DEFAULT_LADDER_CRON = '0 */4 * * *'`, `DEFAULT_STALE_AFTER_MS = 4h`. Changing cadence to 12h without aligning the staleness threshold makes `isScrapeStale` (used by the worker bootstrap) misjudge freshness.

5. **Deploy uncertainty.** The `ladder-worker` service is present in `docker-compose.yml` and built by `pnpm build`, but whether it is *actually running and provisioned in prod* is unconfirmed (owner has dashboard/log access; prior notes suggest the deploy Action may be dormant). If the worker isn't running, that alone explains symptoms 1–3. **Phase 0 resolves this before any code lands.**

## Non-Goals (this pass)

- No aggregator/third-party jobs API; no scraping strategy change.
- No new ATS engine types (iCIMS, Phenom, Eightfold, SuccessFactors, Taleo).
- No Redis/BullMQ/queue; keep the single-process `node-cron` model.
- No changes to scoring, classifiers, alert channels, or the resume AI-review flow beyond what's needed to unbreak upload.
- No horizontal scaling of the worker (the DB lease already guards single-owner execution).

---

## Phase 0 — Prod truth + acute fixes (ship first)

**Intent:** make the two visible bugs die and put the schedule where the owner wants it, on confirmed-running infrastructure.

### 0.1 Establish prod truth (owner-assisted, read-only)
Before code, capture the current production state from `/rmhladder/health`, `/rmhladder/pipeline`, and `ladder-worker` logs:
- Timestamp of the last **completed** `LadderScrapeRun` (and whether the worker logs `[ladder-worker] Run complete` at all).
- Active vs. expired `LadderJob` counts; source counts by status (`active`/`unconfigured`/`error`/`blocked`).
- The exact status/error returned by a real resume-upload attempt (confirms the 503-storage theory).
- Which prod env vars are set: `S3_*`, `LADDER_RESUME_ENCRYPTION_KEY`, `LADDER_CRON_SCHEDULE`, AI provider key.

Output: a short findings note recorded in the plan's progress ledger. This gates whether Phase 0 is "provision + guardrail" or also "the worker was never running."

### 0.2 Resume upload — fail loud, provision correctly
- Add a **startup self-check** in the web tier (and a check surfaced on `/rmhladder/health`) that reports resume-subsystem readiness: object storage configured + encryption key present. Missing config becomes a named, visible error — not a per-request silent 503.
- Improve the upload route's error payload so a misconfigured backend returns an operator-actionable message (still 503, but naming the missing capability) while never leaking secret values.
- Deliver a **provisioning runbook** (`docs/`): exact env vars, how to point at R2/S3, how to generate `LADDER_RESUME_ENCRYPTION_KEY`, and a verification curl. Keep object-storage-required for PII (no local-FS fallback in prod).
- Tests: readiness check returns correct verdicts for (all set) / (storage missing) / (key missing); route returns the actionable error when unconfigured and `201` when configured (existing upload test path).

### 0.3 Schedule → 12 hours
- Change `DEFAULT_LADDER_CRON` to `'0 */12 * * *'` and set `DEFAULT_STALE_AFTER_MS` to track cadence (12h) so `isScrapeStale` and the bootstrap stay coherent. `LADDER_CRON_SCHEDULE` still overrides.
- Document the 12h default in `.env.example` and `server/CLAUDE.md`.
- Add/confirm a manual **"Run now"** trigger usable from the dashboard (admin-gated) so operators aren't forced to wait a cycle. (If a manual-trigger path already exists via `pnpm ladder:run`, expose/verify it; do not duplicate.)
- Tests: `resolveLadderCron` accepts the new default; `isScrapeStale` boundary at 12h.

---

## Phase 1 — Scraping correctness & freshness (data-quality pillar)

**Intent:** eliminate the empty-board blind spot so dead postings actually expire, with a defense-in-depth age backstop, without regressing the mass-expiry protection.

### 1.1 Explicit fetch-success signal
- Adapters' discovery return an explicit **fetch-success** indicator distinct from "zero jobs found," so recheck can tell *"board fetched OK and is genuinely empty"* (→ jobs should strike/expire) from *"fetch failed/ambiguous"* (→ skip, no strikes). This removes the `boardJobs.length > 0` heuristic in `recheck.ts`.
- Preserve the **mass-expiry circuit breaker** (`circuitBreaker` in `recheck.ts`): a fetch that legitimately returns empty for a source with many active jobs still trips the breaker → source `error` + `mass_expiry_suspected` review task, rather than nuking inventory.
- Tests: empty-but-successful board issues strikes and expires at the 3-strike threshold; failed fetch still skips; breaker still trips on mass disappearance.

### 1.2 Last-seen age backstop
- Add a time-based backstop: `active` jobs whose `lastSeenAt` exceeds a configurable freshness window (env-tunable, default aligned to cadence × a safety multiple) are expired even if a source is chronically ambiguous. This bounds worst-case staleness.
- The backstop respects the circuit breaker's intent (does not mass-expire when a whole source is failing).
- Tests: a job past the age window expires; a recently-seen job does not; interaction with the breaker is covered.

### 1.3 Freshness visibility
- Surface per-source freshness (last successful discovery, last job seen) so Phase 3's dashboard/alerting can consume it. (Schema likely already carries `lastSuccessAt`/`lastSeenAt`; confirm and fill gaps rather than duplicating.)

---

## Phase 2 — Coverage & scale, by deepening (coverage pillar)

**Intent:** convert the priority-1 manual finance/consulting firms into real job-yielding sources by maximizing the ATS engines we already support — chiefly Workday — and by strengthening auto-discovery. No new ATS engine types.

### 2.1 Maximize Workday coverage
- Strengthen Workday tenant/site auto-discovery from company career landing pages (extend the existing `discoverWorkdaySourceUrls` path in `run.ts` Step 5 and the Workday adapter/prober): find the correct CXS endpoint(s) for firms that use Workday but weren't detected, validate against the official endpoint, and activate them as normal API sources.
- Handle multi-site Workday tenants (a firm may split campus/experienced sites).
- Tests: discovery picks the right CXS endpoint(s) from representative landing-page fixtures; a firm known to be Workday flips from `manual` to an active `workday` source.

### 2.2 Auto-discovery robustness
- Make the slug prober / source-configuration path self-healing across runs: unconfigured and error sources are retried with bounded backoff (`nextProbeAt` already exists), and successful discovery is idempotent (no duplicate sources — `companyId_platform_slug` uniqueness already enforced).
- Ensure the worker's `probeUnconfiguredSources` batch continues making bounded progress every run (already wired in `server/ladder-worker/index.ts`; verify batch sizing and coverage math against the seed size).
- Tests: repeated runs converge unconfigured→active without duplication; error sources back off and retry.

### 2.3 Coverage reporting
- Emit a coverage snapshot per run (companies with ≥1 active source, companies still manual/unconfigured, jobs per firm-type) for the dashboard and for tracking progress toward "the flagship firms actually produce inventory."

---

## Phase 3 — Reliability & observability (reliability + ops pillars)

**Intent:** make it obvious, automatically, when scraping degrades — and make recovery routine.

### 3.1 Run metrics & history
- Ensure every run persists the counts it already computes (`LadderScrapeRun`: discovered/new/verified/expired/errors, duration, trigger) and expose a **run history** view (extend existing `/rmhladder/pipeline`). Add derived health: success rate, error-rate per source, jobs added/expired trend.

### 3.2 Staleness & failure alerting
- Operator alerting (reusing existing alert-dispatch infra where possible) when: no **completed** run in > threshold (worker down/stuck); a run's error count or per-source error-rate exceeds a threshold; the mass-expiry breaker trips; resume subsystem reports not-ready. Channel: at minimum in-app/health surface + the existing notification path; email/Discord if cheap to reuse.
- Distinguish *worker-down* (no run rows appearing) from *runs-failing* (rows with high errors).

### 3.3 Resilience
- Per-source retry/backoff already partially present (`nextProbeAt`, `consecutiveFailures`); make policy explicit and bounded, and ensure one bad source never blocks a run (already per-source try/catch — verify and cover).
- Harden `/rmhladder/health`: a single at-a-glance operator page — worker liveness (last run age vs. cadence), source health distribution, freshness SLA, resume-subsystem readiness.

### 3.4 Runbook
- `docs/` runbook: how to read the health page, how to force a run, how to interpret/clear review tasks and a tripped breaker, resume-storage provisioning (cross-link Phase 0), and the env-var reference.

---

## Data Model

Prefer reusing existing `Ladder*` fields; introduce new columns only where a signal genuinely has nowhere to live (candidate: a per-source `lastSuccessfulDiscoveryAt` if not already derivable; a freshness/age marker if `lastSeenAt` is insufficient). Any schema change is additive and ships via `pnpm db:migrate` (prod runs `db:migrate:prod` on deploy). The implementation plan enumerates exact fields after confirming the current schema; **no field is added speculatively.**

## Testing

Follow the existing rmhladder discipline: **colocated `.test.ts`**, pure decision cores unit-tested with injected fakes (as `recheck.ts`/`run.ts` already do), fixtures for adapter/discovery parsing. Every phase's task lands with tests green (`pnpm exec vitest run`), no new type/lint warnings (`pnpm exec tsc --noEmit`, `pnpm lint`). TDD per task (subagent-driven-development default).

## Rollout & Ops

- Phased merge: Phase 0 first (unblocks users), then 1 → 2 → 3, each behind green CI.
- Env additions documented in `.env.example`; prod provisioning via the Phase 0 runbook.
- Cadence and thresholds are env-tunable so ops can adjust without a deploy.
- Deploy path unchanged (`main` → Actions → `deploy.sh` → docker-compose); if the deploy Action is dormant, Phase 0 surfaces it and the runbook covers a manual deploy.

## Compliance (unchanged, restated)

Honor `robots.txt` for all non-API fetches, custom User-Agent (`LADDER_USER_AGENT`), 1 req/sec/domain politeness (`LADDER_DOMAIN_RATE_LIMIT_MS`), no CAPTCHA/login-wall/anti-bot bypass. Broadening coverage must not weaken these guarantees.

## Open Questions (resolve during Phase 0)

- Is `ladder-worker` actually running in prod, and is its env complete? (0.1 answers this; it may reduce Phases 1–3 to "hardening on already-working infra" or reveal a dead worker.)
- Alerting fan-out: reuse the user-facing alert channels for *operator* alerts, or a lighter in-app/health-only surface? (Default: start with health surface + existing notification path; expand only if cheap.)
