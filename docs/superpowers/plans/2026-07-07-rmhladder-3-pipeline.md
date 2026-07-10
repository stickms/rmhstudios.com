# rmhladder Plan 3/5: Pipeline + Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The every-6-hours pipeline: adapter hardening from the Plan-2 review backlog, then discover → dedupe → classify → score → verify → persist, recheck with 3-strike expiry and a mass-expiry circuit breaker, scrape-run logging, review-task creation, a `ladder:run` CLI, and the `ladder-worker` cron process.

**Architecture:** Pure decision logic lives in `lib/rmhladder/pipeline/*` (unit-tested, no DB); thin prisma glue composes it; the worker (`server/ladder-worker/`) and `scripts/run-ladder-pipeline.ts` both call one `runPipeline()`. Board fetches are memoized per run via a caching `fetchImpl` wrapper so verify never refetches what discover just fetched. End-to-end correctness is proven by a live smoke run against the seeded dev DB in the final task.

**Tech Stack:** TypeScript strict, Prisma 7, vitest, node-cron (**the one permitted new dependency** — named by the spec), existing adapters/classifiers/scoring/verification from Plans 1–2.

## Global Constraints

- No network in unit tests (injectable `fetchImpl` everywhere). Live network + dev-DB writes are allowed ONLY in Task 8's smoke run and are explicitly authorized there.
- Only new dependency allowed: `node-cron` (+ `@types/node-cron` dev). Nothing else.
- Do not modify Plan 1 exports except the one addition named in Task 4 (a `VerificationStatus` union type added to `lib/rmhladder/verification.ts` — additive only).
- Pipeline code in `lib/rmhladder/pipeline/`; worker in `server/ladder-worker/`; scripts follow `scripts/seed-ladder.ts` conventions (prisma import from `@/lib/prisma.server`, `import 'dotenv/config'`, `main().catch(...).finally(...)`, file-level `/* eslint-disable no-console */` for CLI output).
- Commit per green test cycle; suite: `pnpm exec vitest run lib/rmhladder`; commit-scope discipline: `git status --porcelain` before every commit, add only the task's files.
- Politeness unchanged: `politeFetch` everywhere, 300ms between live requests in scripts, robots rules from Plan 2.
- Expiry policy (spec): a job expires only after **3 consecutive** failed checks OR explicit closed language. Fetch failures are never expiry evidence.

---

### Task 1: Memoized fetch + real HTTP status through the adapters

**Files:**
- Create: `lib/rmhladder/pipeline/memo-fetch.ts`, `memo-fetch.test.ts`
- Modify: `lib/rmhladder/adapters/greenhouse.ts`, `lever.ts`, `ashby.ts`, `smartrecruiters.ts` (+ their tests)

**Interfaces:**
- Produces: `memoFetch(fetchImpl?: typeof fetch): typeof fetch` — returns a fetch that caches responses by URL string for GET requests within its lifetime (per source-run). Cached `Response` bodies must be replayable: cache `{ status, body }` and manufacture a fresh `Response` per call.
- Modifies (all four adapters, same mechanical pattern): the internal `fetchBoard` returns `{ jobs: T[] | null; status: number }` (SR: `{ postings, status, totalFound }` — see Task 2); `verifyJob` evidence uses the REAL status: `httpStatus: status`, and adds API-adapter blocked semantics: `blocked: status === 403 || status === 429`. `fetched: jobs !== null`. detectExpired/discoverJobs behavior unchanged (null jobs → [] / false).

**Steps (TDD):**
- [ ] memo-fetch tests first: same URL fetched twice → underlying impl called once, both callers get the body; different URLs → two calls; non-ok responses are cached too. RED → implement → GREEN → commit `feat(rmhladder): memoized per-run fetch`.
- [ ] Adapter status propagation, one adapter at a time, tests first per adapter: extend each adapter's verifyJob test to assert `httpStatus` matches the stubbed status (e.g. stub 500 → evidence `fetched:false, httpStatus:500`; stub 403 → `blocked:true`). Existing synthetic-404 assertions get updated to the real-status behavior — this is the sanctioned replacement of the Plan-2 synthetic sentinel. GREEN per adapter → single commit `fix(rmhladder): adapters propagate real HTTP status; 403/429 marks blocked`.

---

### Task 2: Greenhouse entity decoding + SmartRecruiters pagination & expiry guard

**Files:**
- Modify: `lib/rmhladder/adapters/greenhouse.ts` + test + `__fixtures__/greenhouse-board.json`
- Modify: `lib/rmhladder/adapters/smartrecruiters.ts` + test + `__fixtures__/smartrecruiters-postings.json` (add a page-2 fixture file)

**Requirements:**
- Greenhouse `content` arrives HTML-entity-escaped (recorded API shape). Add `decodeEntities(s)` (module-local, the five standard entities `&lt; &gt; &amp; &quot; &#39;` plus numeric `&#\d+;`) applied in `normalize()` to `descriptionHtml`. Update the fixture to carry escaped content (`"&lt;p&gt;Join our payments team as a PM intern.&lt;/p&gt;"`) and the existing full-object test to expect the DECODED string — this proves the decode path.
- SR pagination: postings URL gains `&offset=${offset}`; `fetchBoard` loops pages of 100 until `content.length` reaches `totalFound` or a hard cap of 500 postings (politeness), aggregating postings; returns `{ postings, status, totalFound }`.
- SR expiry guard (review finding: empty board is ambiguous on SR because the endpoint 200s for any slug): `detectExpired` returns `false` whenever `totalFound === 0` — an SR board with zero postings is treated as insufficient evidence, never as expiry.
- Tests: pagination test with two stubbed pages (totalFound 150 → two fetch calls, 150 postings aggregated — use a counting stub keyed on the offset param); totalFound-0 guard test; entity-decode via updated fixture test.

**Steps:** RED (new/updated tests) → implement → GREEN → commit `fix(rmhladder): greenhouse entity decoding, SR pagination + empty-board expiry guard`.

---

### Task 3: Robots fail-closed wildcards, scheme allowlist, probe flag validation

**Files:**
- Modify: `lib/rmhladder/adapters/robots.ts` + test; `lib/rmhladder/adapters/generic.ts` + test; `scripts/probe-ladder-sources.ts`

**Requirements:**
- robots: rules whose prefix contains `*` or `$` currently never match (fail-open). Change `isPathAllowed` to match such rules on the literal prefix up to the first special character (e.g. `Disallow: /jobs/*/apply` matches any path starting `/jobs/`). Tests: `Disallow: /careers/*` blocks `/careers/x`; `Allow` with wildcard still wins by (literal) prefix length; plain rules unaffected.
- generic: `verifyGenericUrl` rejects non-http(s) URLs up front — `data:`, `file:`, `javascript:` → return base evidence (`fetched:false, blocked:false`) without any fetch (test: fetchImpl never called — use a throwing stub).
- probe script: `--limit abc` currently yields `slice(0, NaN)` → silently does nothing. Validate: non-numeric or < 1 → print error + `process.exit(1)` (mirror the `--platform` validation style).
- [ ] RED → implement → GREEN (`pnpm exec vitest run lib/rmhladder/adapters`) → commit `fix(rmhladder): robots wildcard fail-closed, URL scheme allowlist, probe flag validation`.

---

### Task 4: Persistence decision logic + `VerificationStatus` union

**Files:**
- Create: `lib/rmhladder/pipeline/ingest.ts`, `ingest.test.ts`
- Modify: `lib/rmhladder/verification.ts` (additive only)

**Interfaces:**
- verification.ts adds (and `computeVerification`/`passesAlertGate` signatures switch their `status: string` fields to it — call-compatible, additive):
  ```ts
  export type VerificationStatus = 'verified_active' | 'verified_probable' | 'unverified' | 'expired' | 'broken_link' | 'duplicate' | 'non_us_role' | 'blocked_or_inaccessible' | 'needs_manual_review';
  ```
- ingest.ts produces PURE functions (no prisma — the glue in Task 5 applies their output):
  ```ts
  interface JobAssessment {
    dedupeHash: string;
    fields: { /* every LadderJob column derivable from a NormalizedJob */ };
    verificationInput: VerificationEvidence;      // evidence enriched with US confirmation
    reviewReasons: Array<'ambiguous_us_location' | 'ambiguous_early_career' | 'low_confidence'>;
  }
  function assessJob(args: { normalized: NormalizedJob; companyName: string; companyId: string; companyPriority: number; platform: string; evidence: VerificationEvidence }): JobAssessment
  function summarizeDescription(html: string | null): { summary: string | null; text: string }  // node-html-parser textContent, summary = first 500 chars, collapsed whitespace
  ```
  Rules encoded in `assessJob` (each gets a test):
  - location: `classifyUSLocation({ locationRaw, country })`; `country` field from result or normalized input; `isUS === null` → reviewReasons includes `ambiguous_us_location`; **non-US jobs keep flowing** (they persist with `non_us_role` verification status — the alert gate already excludes them).
  - early-career: `classifyEarlyCareer(title, text)`; classification `unclear` → `ambiguous_early_career`; **`schoolYearTarget` and `graduationYearTarget` are nulled when classification is `no`** (deferred Plan-1 review item).
  - scoring: `computeBaseScore` on the assembled ScorableJob (companyIsTarget = priority ≤ 2); store base + urgencyFlag.
  - evidence enrichment: `usConfirmed` set from the location result (adapters already set it, but assessJob is authoritative — it overwrites with its own classification); after `computeVerification`, confidence < 60 → `low_confidence` review reason; non-US location result → verification status is overridden to `non_us_role` (confidence from location classifier).
  - dedupe: `dedupeHash(companyName, title, locationBucket(...))` — bucket from classified city/state/remoteStatus (only `remote_us` when `isUS === true`).
- [ ] RED (test each rule with hand-built NormalizedJobs: US intern verified_active; London analyst → non_us_role; 'Main Campus' → ambiguous review; senior title → grad-year nulled; low-evidence HTML page → low_confidence) → implement → GREEN → commit `feat(rmhladder): job assessment pipeline logic + VerificationStatus union`.

---

### Task 5: processSource glue

**Files:**
- Create: `lib/rmhladder/pipeline/process-source.ts`, `process-source.test.ts`

**Interfaces:**
```ts
interface SourceRunStats { discovered: number; created: number; updated: number; verified: number; reviewTasks: number; errored: boolean }
async function processSource(deps: { prisma: PrismaLike; fetchImpl?: typeof fetch }, source: { id; platform; slug; company: { id; name; priorityLevel } }): Promise<SourceRunStats>
```
- Flow: `getAdapter(platform)` (null → errored stat, no throw) → one `memoFetch` per call → `discoverJobs` → per job: `verifyJob` (memoized — no extra network) → `assessJob` → upsert `LadderJob` by dedupeHash (create full row | update: lastCheckedAt, failedCheckCount 0, refreshed scores/status, merge `alternateUrls` when originalPostingUrl differs) → insert `LadderVerification` row → create `LadderReviewTask` per reviewReason (skip when an OPEN task with same jobId+reason exists) → `alert_eligible` is NOT computed here (Plan 5).
- `PrismaLike` is a structural type of just the model methods used (`ladderJob.upsert`, `ladderVerification.create`, `ladderReviewTask.findFirst/create`, `ladderSource.update`) so tests inject an in-memory fake WITHOUT mocking the prisma package — the fake is ~40 lines, asserted on real behavior (rows accumulated, upsert-by-hash semantics).
- Per-source try/catch: any throw → `errored: true` + rethrow-safe error object returned in stats (caller logs `LadderSourceError`); success updates `lastSuccessAt`.
- [ ] RED (fake-prisma tests: fixture board → 2 discovered/2 created/verification rows; re-run same board → 0 created 2 updated, no duplicate review tasks; adapter-null platform; throwing fetch → errored, no partial corruption) → implement → GREEN → commit `feat(rmhladder): per-source pipeline processing`.

---

### Task 6: Recheck + 3-strike expiry + circuit breaker

**Files:**
- Create: `lib/rmhladder/pipeline/recheck.ts`, `recheck.test.ts`

**Interfaces:**
```ts
// pure decision core — exhaustively tested:
interface RecheckDecision { action: 'skip' | 'reset' | 'strike' | 'expire'; }
function decideRecheck(args: { presentOnBoard: boolean; fetchSucceeded: boolean; failedCheckCount: number }): RecheckDecision
// exact contract:
//   fetchSucceeded false → 'skip'  (fetch failure is no evidence: no counter change)
//   presentOnBoard true  → 'reset' (counter → 0, status stays active)
//   absent && failedCheckCount + 1 >= 3 → 'expire'; otherwise 'strike' (counter + 1)
function circuitBreaker(args: { activeCount: number; wouldStrikeOrExpire: number }): boolean // true = trip: activeCount >= 4 && ratio > 0.5
async function recheckSource(deps, source, activeJobs): Promise<{ struck: number; expired: number; reset: number; skipped: number; tripped: boolean }>
```
- `recheckSource`: one memoized board fetch; compute decisions for all active jobs FIRST; if `circuitBreaker` trips → NO strikes/expiries applied; instead: source `status: 'error'` + one `LadderReviewTask` with reason `mass_expiry_suspected`. That reason doesn't exist yet: **`LadderReviewReason` gains the additive enum value `mass_expiry_suspected`** (+ validate/generate/db push) — this is the plan's one sanctioned schema change.
- Expiry application: `expire` → job status `expired`, verification row `{ status: 'expired', confidence: 90, evidence: '3 consecutive checks found the posting absent from the <platform> board.' }`.
- SR note: adapters' `detectExpired` already guards totalFound===0 (Task 2), so recheck trusts `detectExpired`.
- [ ] RED — decideRecheck table-test all arms (including boundary failedCheckCount 2 → expire on 3rd), circuitBreaker boundaries (3 active never trips; 4 active 3 absent trips; exactly 50% doesn't trip), recheckSource fake-prisma tests (trip applies nothing; normal path strikes/expires/resets) → schema enum addition + `pnpm exec prisma validate && pnpm db:generate && pnpm db:push` → implement → GREEN → commit `feat(rmhladder): recheck with 3-strike expiry and mass-expiry circuit breaker`.

---

### Task 7: runPipeline orchestrator + manual-source aliveness + CLI

**Files:**
- Create: `lib/rmhladder/pipeline/run.ts`, `run.test.ts`, `scripts/run-ladder-pipeline.ts`
- Modify: `package.json` (`"ladder:run": "pnpm exec tsx scripts/run-ladder-pipeline.ts"`)

**Interfaces:**
```ts
async function runPipeline(deps: { prisma; fetchImpl?: typeof fetch }, opts: { trigger: 'cron' | 'manual'; limitSources?: number; platforms?: string[] }): Promise<{ runId: string; discovered: number; created: number; verified: number; expired: number; errors: number; reviewTasks: number; durationMs: number }>
```
- Lifecycle: create `LadderScrapeRun` (trigger) → load `active` sources (optionally filtered/limited) → API sources through `processSource` sequentially with 300ms spacing between sources → `recheckSource` for sources with active jobs → manual sources are program PAGES, not postings, so their check is aliveness only: `checkRobots` then `politeFetch` expecting `ok`; fetch failure → source `status: 'error'` + review task `broken_link`; robots-disallowed → source `status: 'blocked'` + review task `blocked` → per-source errors recorded to `LadderSourceError` (never abort the run) → finalize run row (counts, finishedAt, stats JSON of per-source lines).
- `run.test.ts` with the fake prisma + stub fetch: two API sources (one healthy fixture board, one 500) + one manual (200) → run row counts correct, error row for the 500, healthy source stats intact.
- CLI script: flags `--trigger manual` (default), `--limit N` (validated), `--platform X`; prints the summary line; conventions per Global Constraints.
- [ ] RED → implement → GREEN → commit `feat(rmhladder): pipeline orchestrator + ladder:run CLI`.

---

### Task 8: ladder-worker + wiring + live smoke + wrap

**Files:**
- Create: `server/ladder-worker/index.ts`
- Modify: `package.json` (add `node-cron` dep + `@types/node-cron`; scripts: `ladder-worker:dev` following the existing `*-worker:dev` pattern; append the worker to the `dev` concurrently list, the `build` esbuild entry list, and the `start` list — mirror `doctrine-worker` exactly in all three)

**Requirements:**
- Worker: `import 'dotenv/config'`; `cron.schedule(process.env.LADDER_CRON_SCHEDULE ?? '0 */6 * * *', ...)` calling `runPipeline({ prisma }, { trigger: 'cron' })`; overlap guard (skip tick if previous run still in flight — a simple boolean); startup log line; graceful SIGTERM (finish current run, stop cron, disconnect prisma). Structural mirror of the smallest existing worker in `server/` — read one before writing.
- Install: `pnpm add node-cron && pnpm add -D @types/node-cron` (lockfile change IS expected in this commit — the one place it's legitimate; commit package.json + pnpm-lock.yaml together).
- **Live smoke (authorized network + dev-DB writes):** `pnpm ladder:run --limit 3 --platform greenhouse` against the real dev DB (6 active greenhouse sources exist). Capture full output; then query and report: `select count(*) from ladder_job`, `select status, count(*) from ladder_verification group by 1`, scrape-run row contents. Discovered jobs from real boards (Adyen/Affirm/Airbnb…) should appear with classifications and scores. Zero unhandled errors required; empty boards are fine.
- Full wrap: `pnpm exec vitest run lib/rmhladder` all green; `pnpm exec eslint lib/rmhladder scripts server/ladder-worker` 0/0; `pnpm exec prisma validate`.
- [ ] Worker + wiring → smoke → wrap checks → commit `feat(rmhladder): ladder-worker cron process + plan-3 wrap`.

---

## Deferred to Plans 4–5 (recorded, not lost)

Dashboard "Run now" button wiring to `runPipeline` (Plan 4); alert dispatch reading new verified jobs via `passesAlertGate` (Plan 5); `prisma migrate` before any deploy; indexes for LadderSourceError(runId), LadderReviewTask(status), LadderJob(discoveredAt, relevanceScoreBase) once dashboard query patterns exist (Plan 4); Playwright JS-rendering fallback for generic verification (only if manual-source aliveness proves insufficient in practice).
