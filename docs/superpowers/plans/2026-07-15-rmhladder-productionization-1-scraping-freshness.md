# rmhladder Productionization — Phase 1: Scraping Freshness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dead job postings actually expire — fix the empty-board blind spot where a company that pulls all its early-career reqs leaves its jobs `active` forever — with a time-based age backstop as defense in depth.

**Architecture:** The root cause is that `SourceAdapter.discoverJobs()` returns `Promise<NormalizedJob[]>`, collapsing "fetch failed" and "board is genuinely empty" both to `[]`. Each adapter already computes the distinction internally (its `fetchBoard` returns `jobs: null` on failure vs. an array on success) but throws it away. We surface that signal by changing `discoverJobs` to return `{ jobs, fetchSucceeded }`, then teach `recheck.ts` (empty-but-successful board → strike/expire) and `process-source.ts` (empty-but-alive board → success, not a failure) to use it. Independently, an age backstop expires any `active` job unseen for a long, cadence-safe window (default 30 days = 60 missed 12h cycles), covering chronically-ambiguous sources.

**Tech Stack:** TypeScript (strict), Prisma 7, Vitest, pnpm. Spec: `docs/superpowers/specs/2026-07-15-rmhladder-productionization-design.md` (Phase 1). Builds on Phase 0 (merged/PR #484).

## Global Constraints

- **Preserve the mass-expiry circuit breaker** in `recheck.ts` (`circuitBreaker()`): an empty-but-successful board for a source with many active jobs must still trip the breaker (source → `error` + `mass_expiry_suspected` review task), NOT nuke inventory. The fetch-success fix must not weaken this.
- **Fetch failure is never expiry evidence.** `fetchSucceeded === false` → skip (no strikes), unchanged 3-strike semantics on genuine absence.
- **`discoverJobs` new contract:** returns `DiscoverResult = { jobs: NormalizedJob[]; fetchSucceeded: boolean }`. `fetchSucceeded` is true iff the board was fetched and parsed successfully (even when it yields zero jobs); false on HTTP error, network error, parse failure, or partial/truncated fetch.
- **Age-backstop window is env-tunable:** `LADDER_JOB_MAX_AGE_MS`, default `2_592_000_000` (30 days). A job's age is measured from `lastSeenAt`, falling back to `discoveredAt` when `lastSeenAt` is null.
- **No new type or lint warnings.** Repo `tsc` needs the heap flag: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit` (default heap OOMs). `pnpm lint` clean.
- **Tests colocated `.test.ts`**, TDD (failing test first). Pipeline decision cores are pure and injected with in-memory fakes — follow the existing `recheck.ts`/`run.ts` style.
- **No schema change** — `lastSeenAt`, `discoveredAt`, `status`, `failedCheckCount` already exist on `LadderJob`.
- **Enum values:** `LadderJobStatus = active | expired | unknown`; `LadderVerificationStatus` includes `expired`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/rmhladder/adapters/types.ts` (modify) | add `DiscoverResult`; change `discoverJobs` signature | 1 |
| `lib/rmhladder/adapters/{greenhouse,lever,ashby,smartrecruiters,workday}.ts` (modify) | `discoverJobs` returns `{ jobs, fetchSucceeded }`; smartrecruiters stops collapsing empty→null | 1 |
| `lib/rmhladder/adapters/*.test.ts` (modify) | update to new return shape + assert `fetchSucceeded` | 1 |
| `lib/rmhladder/pipeline/recheck.ts` (modify) | consume `fetchSucceeded`; drop `boardJobs.length > 0` heuristic | 2 |
| `lib/rmhladder/pipeline/recheck.test.ts` (modify) | empty-but-successful board strikes/expires; breaker still trips | 2 |
| `lib/rmhladder/pipeline/process-source.ts` (modify) | empty-but-alive board → success (stamp lastSuccessAt), not failure | 3 |
| `lib/rmhladder/pipeline/process-source.test.ts` (modify) | empty-success vs fetch-failure branch behavior | 3 |
| `lib/rmhladder/pipeline/run.test.ts` (modify) | adjust any fakes to the new `discoverJobs` shape | 1/3 |
| `lib/rmhladder/pipeline/expire-stale.ts` (create) | pure `decideAgeExpiry` + `expireStaleJobs` sweep | 4 |
| `lib/rmhladder/pipeline/expire-stale.test.ts` (create) | age-cutoff decisions + sweep behavior | 4 |
| `lib/rmhladder/pipeline/run.ts` (modify) | call `expireStaleJobs` as a run step; count in `RunResult` | 4 |
| `.env.example` (modify) | document `LADDER_JOB_MAX_AGE_MS` | 4 |

---

## Task 1: `DiscoverResult` contract — surface `fetchSucceeded` across all adapters

**Files:**
- Modify: `lib/rmhladder/adapters/types.ts`
- Modify: `lib/rmhladder/adapters/greenhouse.ts`, `lever.ts`, `ashby.ts`, `smartrecruiters.ts`, `workday.ts`
- Modify: each adapter's `*.test.ts`, and `lib/rmhladder/pipeline/run.test.ts` / any fake adapter used by pipeline tests

**Interfaces:**
- Produces: `interface DiscoverResult { jobs: NormalizedJob[]; fetchSucceeded: boolean }`; `SourceAdapter.discoverJobs(ctx): Promise<DiscoverResult>`.
- Consumed by Tasks 2 (recheck) and 3 (process-source).

This is the atomic contract change — `tsc` will not pass until all five adapters and every caller conform. Do it in one commit.

- [ ] **Step 1: Change the type (write the new contract first)**

In `lib/rmhladder/adapters/types.ts`, add after `NormalizedJob` and change the `discoverJobs` line:

```ts
export interface DiscoverResult {
  jobs: NormalizedJob[];
  /** True iff the board was fetched AND parsed successfully — including a successful empty board. False on HTTP/network/parse failure or a partial fetch. */
  fetchSucceeded: boolean;
}
```
Change the method signature in `SourceAdapter`:
```ts
  discoverJobs(ctx: AdapterContext): Promise<DiscoverResult>;
```

- [ ] **Step 2: Run tsc to see the breakage surface**

Run: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit`
Expected: FAIL — every adapter's `discoverJobs` (returns `NormalizedJob[]`) and every caller (`process-source.ts:120`, `recheck.ts:127`, pipeline tests) now mismatches the type. This error list is your checklist.

- [ ] **Step 3: greenhouse, lever, ashby — the uniform case**

Each already has `const { jobs } = await fetchBoard(ctx)` where `fetchBoard` returns `jobs: X[] | null` (null only on failure). Change each `discoverJobs` to return the struct with `fetchSucceeded: jobs !== null`:

greenhouse (`greenhouse.ts:66-69`):
```ts
  async discoverJobs(ctx) {
    const { jobs } = await fetchBoard(ctx);
    return { jobs: (jobs ?? []).map(normalize), fetchSucceeded: jobs !== null };
  },
```
lever (`lever.ts:51-54`):
```ts
  async discoverJobs(ctx) {
    const { jobs } = await fetchBoard(ctx);
    return { jobs: (jobs ?? []).map(normalize), fetchSucceeded: jobs !== null };
  },
```
ashby (`ashby.ts:65-68`):
```ts
  async discoverJobs(ctx) {
    const { jobs } = await fetchBoard(ctx);
    return { jobs: (jobs ?? []).filter((j) => j.isListed).map(normalize), fetchSucceeded: jobs !== null };
  },
```

- [ ] **Step 4: workday — same signal + the config guard**

`workday.ts` `fetchBoard` returns `jobs: X[] | null` (null on config-missing, HTTP error, parse error, or partial `jobs.length < total`), and an empty successful board returns `[]`. The `discoverJobs` config-missing early return must report failure. Change `workday.ts:210-215` region:
```ts
  async discoverJobs(ctx) {
    const config = resolveConfig(ctx);
    if (!config) return { jobs: [], fetchSucceeded: false };
    const { jobs } = await fetchBoard(ctx);
    return { jobs: (jobs ?? []).filter(validPosting).map((job) => normalize(job, config)), fetchSucceeded: jobs !== null };
  },
```

- [ ] **Step 5: smartrecruiters — stop collapsing empty→null (the special case)**

Read `smartrecruiters.ts` `fetchBoard` (around lines 35-106). It currently returns `jobs: aggregated.length > 0 ? aggregated : null` (line ~106), which makes a **successful but empty** board indistinguishable from failure. Fix the signal so an empty successful fetch is reported as success:

1. Change `fetchBoard`'s return type to add an explicit ok flag: `Promise<{ jobs: SrJob[] | null; status: number; totalFound: number; ok: boolean }>`.
2. In every existing failure `return` (the `return { jobs: null, ... }` branches on non-ok HTTP / parse failure), add `ok: false`.
3. In the final success `return` (line ~106), return the array as-is (may be empty) with `ok: true`: `return { jobs: aggregated, status, totalFound, ok: true };` — do NOT map empty to null.
4. `verifyJob` and `detectExpired` currently key off `jobs === null` / `jobs !== null`; with `jobs` now `SrJob[]` on success they still behave correctly (`jobs !== null` stays true on success; `[].some(...)` is false, matching "not found"). Verify these two methods still read correctly after the change; if any relied on empty→null, switch them to use `ok`.
5. `discoverJobs` (`smartrecruiters.ts:133-136`):
```ts
  async discoverJobs(ctx) {
    const { jobs, ok } = await fetchBoard(ctx);
    return { jobs: (jobs ?? []).map((job) => normalize(job, ctx)), fetchSucceeded: ok };
  },
```

- [ ] **Step 6: Update every caller and fake to the new shape**

`tsc` from Step 2 lists them. In pipeline tests (`run.test.ts`, and any test constructing a fake `SourceAdapter` or calling `adapter.discoverJobs`), the fake's `discoverJobs` must return `{ jobs: [...], fetchSucceeded: true|false }`, and any assertion reading the array must read `.jobs`. Do NOT change `recheck.ts`/`process-source.ts` production logic here (Tasks 2 and 3 own those) beyond the minimal type-level destructure needed to compile — if a purely type-driven edit is unavoidable to reach green tsc, keep it minimal and note it for those tasks. (In practice recheck/process-source read `discoverJobs` and will be updated in Tasks 2/3; to keep Task 1 committable, apply the minimal `.jobs` destructure in those two files now and let Tasks 2/3 build the behavior on top.)

- [ ] **Step 7: Update adapter tests**

For each `adapters/*.test.ts`: existing tests that call `adapter.discoverJobs(ctx)` and read the array must read `result.jobs`. ADD one assertion per adapter that pins the new behavior:
- A **successful empty board** (mock the board endpoint returning HTTP 200 with an empty job list) → `result.fetchSucceeded === true` and `result.jobs.length === 0`.
- A **fetch failure** (mock HTTP 500/404) → `result.fetchSucceeded === false` and `result.jobs.length === 0`.

Use each test file's existing fetch-mock harness (they already mock `fetchImpl` via `ctx`). For smartrecruiters specifically, assert the empty-but-200 case is `fetchSucceeded === true` (this is the behavior that was broken).

- [ ] **Step 8: Green tsc + tests**

Run: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit` → no errors.
Run: `pnpm exec vitest run lib/rmhladder/adapters lib/rmhladder/pipeline` → all pass.

- [ ] **Step 9: Commit**

```bash
git add lib/rmhladder/adapters lib/rmhladder/pipeline/run.test.ts lib/rmhladder/pipeline/recheck.ts lib/rmhladder/pipeline/process-source.ts
git commit -m "feat(rmhladder): discoverJobs reports fetchSucceeded (empty vs failed board)"
```

---

## Task 2: recheck uses `fetchSucceeded` — empty boards expire dead jobs

**Files:**
- Modify: `lib/rmhladder/pipeline/recheck.ts`
- Modify: `lib/rmhladder/pipeline/recheck.test.ts`

**Interfaces:**
- Consumes: `DiscoverResult` from Task 1.

- [ ] **Step 1: Write the failing test first**

In `recheck.test.ts`, ADD a test: an adapter whose `discoverJobs` returns `{ jobs: [], fetchSucceeded: true }` (successful empty board), a source with 3 active jobs each at `failedCheckCount: 2`. Expected: all 3 → `expire` (3rd strike), because absence on a successfully-fetched board is real evidence. And a companion test: `{ jobs: [], fetchSucceeded: false }` (fetch failure) → all `skip`, no strikes. (Circuit-breaker interaction is covered in Step 4.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run lib/rmhladder/pipeline/recheck.test.ts`
Expected: FAIL — current code sets `fetchSucceeded = boardJobs.length > 0`, so an empty successful board is treated as fetch failure → skip, not expire.

- [ ] **Step 3: Change recheck to use the reported signal**

In `recheck.ts`, replace the memoized discovery block (currently ~lines 124-134):
```ts
  let boardJobs: Awaited<ReturnType<typeof adapter.discoverJobs>>;
  try {
    boardJobs = await adapter.discoverJobs(ctx);
  } catch {
    boardJobs = [];
  }

  // [] is ambiguous (empty board vs. fetch failure) → skip all, no strikes.
  const fetchSucceeded = boardJobs.length > 0;
  const presentIds = new Set(boardJobs.map((j) => j.externalId));
```
with:
```ts
  let discovered: Awaited<ReturnType<typeof adapter.discoverJobs>>;
  try {
    discovered = await adapter.discoverJobs(ctx);
  } catch {
    discovered = { jobs: [], fetchSucceeded: false };
  }

  // A successfully-fetched board that is empty IS evidence of absence; only a
  // failed fetch is ambiguous. This is the empty-board expiry fix (Phase 1).
  const fetchSucceeded = discovered.fetchSucceeded;
  const presentIds = new Set(discovered.jobs.map((j) => j.externalId));
```
The downstream `decideRecheck`/circuit-breaker logic is unchanged — it already keys off `fetchSucceeded` and `presentOnBoard`.

- [ ] **Step 4: Confirm the circuit breaker still protects**

Ensure `recheck.test.ts` still has (or add) a test: `{ jobs: [], fetchSucceeded: true }` for a source with ≥4 active jobs where >50% would strike/expire → `tripped === true`, source set to `error`, `mass_expiry_suspected` task created, and NO job rows expired. This proves the empty-board fix doesn't bypass the breaker.

- [ ] **Step 5: Green**

Run: `pnpm exec vitest run lib/rmhladder/pipeline/recheck.test.ts`
Expected: PASS — new empty-success-expires test, fetch-failure-skips test, and breaker test all green.

- [ ] **Step 6: Commit**

```bash
git add lib/rmhladder/pipeline/recheck.ts lib/rmhladder/pipeline/recheck.test.ts
git commit -m "feat(rmhladder): expire dead jobs on empty-but-successful boards"
```

---

## Task 3: process-source treats empty-but-alive boards as success

**Files:**
- Modify: `lib/rmhladder/pipeline/process-source.ts`
- Modify: `lib/rmhladder/pipeline/process-source.test.ts`

**Interfaces:**
- Consumes: `DiscoverResult` from Task 1.

Currently (`process-source.ts:120-130`) a zero-length discovery always increments `consecutiveFailures` and skips `lastSuccessAt` — so a healthy company with no current early-career reqs is wrongly marked as failing and shows up as a "silent source". Fix: distinguish empty-success from fetch failure.

- [ ] **Step 1: Write the failing tests first**

In `process-source.test.ts`, ADD two tests:
- Adapter returns `{ jobs: [], fetchSucceeded: true }` → source is updated with `lastSuccessAt` set and `consecutiveFailures` reset to 0 (alive, just empty); stats `discovered === 0`, `errored === false`.
- Adapter returns `{ jobs: [], fetchSucceeded: false }` → source `consecutiveFailures` incremented, `lastSuccessAt` NOT set; `errored` reflects a failure. (This preserves today's behavior for genuine fetch failures.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run lib/rmhladder/pipeline/process-source.test.ts`
Expected: FAIL — current code increments failures for both cases.

- [ ] **Step 3: Implement the split**

In `process-source.ts`, change the discovery + zero-branch (currently lines 120-130):
```ts
    // 3. Discover jobs.
    const normalizedJobs = await adapter.discoverJobs(ctx);
    stats.discovered = normalizedJobs.length;

    // Zero discoveries carry no success evidence (empty board or fetch failure); skip lastSuccessAt.
    if (stats.discovered === 0) {
      await deps.prisma.ladderSource.update({
        where: { id: source.id },
        data: { lastAttemptAt: now, consecutiveFailures: { increment: 1 } },
      });
      return { ...stats, errorMessage: 'no jobs discovered (empty board or fetch failure)' };
    }
```
to:
```ts
    // 3. Discover jobs.
    const { jobs: normalizedJobs, fetchSucceeded } = await adapter.discoverJobs(ctx);
    stats.discovered = normalizedJobs.length;

    // Zero discoveries: a successfully-fetched empty board means the source is
    // alive but has no current reqs (stamp success); a failed fetch is a real
    // failure (increment). Conflating them wrongly flagged healthy firms silent.
    if (stats.discovered === 0) {
      if (fetchSucceeded) {
        await deps.prisma.ladderSource.update({
          where: { id: source.id },
          data: { status: 'active', lastAttemptAt: now, lastSuccessAt: now, nextProbeAt: null, consecutiveFailures: 0 },
        });
        return { ...stats };
      }
      await deps.prisma.ladderSource.update({
        where: { id: source.id },
        data: { lastAttemptAt: now, consecutiveFailures: { increment: 1 } },
      });
      return { ...stats, errored: true, errorMessage: 'board fetch failed (no jobs discovered)' };
    }
```
(The non-empty path below is unchanged and still stamps `lastSuccessAt` on success.)

- [ ] **Step 4: Green**

Run: `pnpm exec vitest run lib/rmhladder/pipeline/process-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rmhladder/pipeline/process-source.ts lib/rmhladder/pipeline/process-source.test.ts
git commit -m "feat(rmhladder): empty-but-alive board counts as source success"
```

---

## Task 4: Age backstop — expire jobs unseen for a cadence-safe window

**Files:**
- Create: `lib/rmhladder/pipeline/expire-stale.ts`
- Test: `lib/rmhladder/pipeline/expire-stale.test.ts`
- Modify: `lib/rmhladder/pipeline/run.ts`
- Modify: `lib/rmhladder/pipeline/run.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `DEFAULT_JOB_MAX_AGE_MS`, `resolveJobMaxAgeMs(env)`, `decideAgeExpiry({ lastSeenAt, discoveredAt, now, maxAgeMs }): boolean`, `expireStaleJobs(prisma, { now, maxAgeMs }): Promise<{ expired: number }>`.
- Consumed by: `run.ts`.

- [ ] **Step 1: Write the failing test (pure decision + sweep)**

Create `expire-stale.test.ts`:
```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { decideAgeExpiry, resolveJobMaxAgeMs, DEFAULT_JOB_MAX_AGE_MS, expireStaleJobs, type ExpireStalePrisma } from './expire-stale';

const now = new Date('2026-07-15T12:00:00.000Z');
const dayMs = 24 * 60 * 60 * 1_000;

describe('decideAgeExpiry', () => {
  it('expires a job last seen beyond the window', () => {
    expect(decideAgeExpiry({ lastSeenAt: new Date(now.getTime() - 31 * dayMs), discoveredAt: new Date(0), now, maxAgeMs: DEFAULT_JOB_MAX_AGE_MS })).toBe(true);
  });
  it('keeps a job seen within the window', () => {
    expect(decideAgeExpiry({ lastSeenAt: new Date(now.getTime() - 5 * dayMs), discoveredAt: new Date(0), now, maxAgeMs: DEFAULT_JOB_MAX_AGE_MS })).toBe(false);
  });
  it('falls back to discoveredAt when lastSeenAt is null', () => {
    expect(decideAgeExpiry({ lastSeenAt: null, discoveredAt: new Date(now.getTime() - 31 * dayMs), now, maxAgeMs: DEFAULT_JOB_MAX_AGE_MS })).toBe(true);
    expect(decideAgeExpiry({ lastSeenAt: null, discoveredAt: new Date(now.getTime() - 1 * dayMs), now, maxAgeMs: DEFAULT_JOB_MAX_AGE_MS })).toBe(false);
  });
});

describe('resolveJobMaxAgeMs', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('defaults to 30 days', () => {
    expect(resolveJobMaxAgeMs({})).toBe(DEFAULT_JOB_MAX_AGE_MS);
    expect(DEFAULT_JOB_MAX_AGE_MS).toBe(2_592_000_000);
  });
  it('honors a valid override', () => {
    expect(resolveJobMaxAgeMs({ LADDER_JOB_MAX_AGE_MS: '86400000' })).toBe(86_400_000);
  });
  it('ignores a non-positive or non-numeric override', () => {
    expect(resolveJobMaxAgeMs({ LADDER_JOB_MAX_AGE_MS: '0' })).toBe(DEFAULT_JOB_MAX_AGE_MS);
    expect(resolveJobMaxAgeMs({ LADDER_JOB_MAX_AGE_MS: 'abc' })).toBe(DEFAULT_JOB_MAX_AGE_MS);
  });
});

describe('expireStaleJobs', () => {
  it('expires only stale active jobs and writes a verification row for each', async () => {
    const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
    const verifications: Array<Record<string, unknown>> = [];
    const stale = [{ id: 'a', lastSeenAt: new Date(now.getTime() - 40 * dayMs), discoveredAt: new Date(0) }];
    const prisma: ExpireStalePrisma = {
      ladderJob: {
        findMany: async () => stale,
        update: async ({ where, data }) => { updates.push({ id: where.id, data }); return { id: where.id }; },
      },
      ladderVerification: { create: async ({ data }) => { verifications.push(data); return { id: 'v' }; } },
    };
    const result = await expireStaleJobs(prisma, { now, maxAgeMs: DEFAULT_JOB_MAX_AGE_MS });
    expect(result.expired).toBe(1);
    expect(updates[0].data.status).toBe('expired');
    expect(verifications[0].status).toBe('expired');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run lib/rmhladder/pipeline/expire-stale.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `expire-stale.ts`**

Create `lib/rmhladder/pipeline/expire-stale.ts`:
```ts
export const DEFAULT_JOB_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days

export function resolveJobMaxAgeMs(env: { LADDER_JOB_MAX_AGE_MS?: string } = process.env): number {
  const parsed = Number(env.LADDER_JOB_MAX_AGE_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_JOB_MAX_AGE_MS;
}

/** A job is stale when its last sighting (lastSeenAt, else discoveredAt) is older than the window. */
export function decideAgeExpiry(args: {
  lastSeenAt: Date | null;
  discoveredAt: Date;
  now: Date;
  maxAgeMs: number;
}): boolean {
  const seen = args.lastSeenAt ?? args.discoveredAt;
  return args.now.getTime() - seen.getTime() > args.maxAgeMs;
}

export interface ExpireStalePrisma {
  ladderJob: {
    findMany(args: { where: Record<string, unknown>; select?: Record<string, unknown> }): Promise<Array<{ id: string; lastSeenAt: Date | null; discoveredAt: Date }>>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  ladderVerification: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

/**
 * Source-independent backstop: expire active jobs unseen for maxAgeMs. The
 * window is deliberately long (default 30d = 60 missed 12h cycles) so this
 * only fires on genuinely-dead postings, independent of any single source's
 * health — no circuit breaker needed at this horizon.
 */
export async function expireStaleJobs(
  prisma: ExpireStalePrisma,
  opts: { now: Date; maxAgeMs: number },
): Promise<{ expired: number }> {
  const cutoff = new Date(opts.now.getTime() - opts.maxAgeMs);
  const candidates = await prisma.ladderJob.findMany({
    where: {
      status: 'active',
      OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null, discoveredAt: { lt: cutoff } }],
    },
    select: { id: true, lastSeenAt: true, discoveredAt: true },
  });

  let expired = 0;
  for (const job of candidates) {
    if (!decideAgeExpiry({ lastSeenAt: job.lastSeenAt, discoveredAt: job.discoveredAt, now: opts.now, maxAgeMs: opts.maxAgeMs })) continue;
    await prisma.ladderJob.update({
      where: { id: job.id },
      data: { status: 'expired', lastCheckedAt: opts.now },
    });
    await prisma.ladderVerification.create({
      data: {
        jobId: job.id,
        status: 'expired',
        confidence: 80,
        evidence: `Age backstop: not seen on any board for over ${Math.round(opts.maxAgeMs / (24 * 60 * 60 * 1_000))} days.`,
      },
    });
    expired++;
  }
  return { expired };
}
```

- [ ] **Step 4: Green the unit tests**

Run: `pnpm exec vitest run lib/rmhladder/pipeline/expire-stale.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `run.ts`**

In `run.ts`: import at top:
```ts
import { expireStaleJobs, resolveJobMaxAgeMs } from './expire-stale';
```
Add `expired` is already in `RunResult`/`totals`. Extend the `ExpireStalePrisma` shape into `RunPrisma` — `ladderJob.findMany` already exists on `RunPrisma`; confirm its return type is compatible (it returns `{ id; externalId; failedCheckCount }` today — widen the `RunPrisma.ladderJob.findMany` signature to also allow the `{ id; lastSeenAt; discoveredAt }` select used here, or add a second `findMany` overload; keep it minimal and type-correct). Then, after Step 4 (recheck loop) and before Step 5 (manual sources), add a new step:
```ts
  // Step 4.5: Age backstop — expire jobs unseen for the max-age window,
  // independent of per-source recheck. Bounded, long horizon (default 30d).
  try {
    const ageResult = await expireStaleJobs(deps.prisma as unknown as import('./expire-stale').ExpireStalePrisma, {
      now: deps.now ?? new Date(),
      maxAgeMs: resolveJobMaxAgeMs(),
    });
    totals.expired += ageResult.expired;
  } catch (err) {
    totals.errors++;
    statsSummary.push({ step: 'age_backstop', errored: true, errorMessage: err instanceof Error ? err.message : String(err) });
  }
```

- [ ] **Step 6: Add a run-level test**

In `run.test.ts`, ADD a test: seed the in-memory fake with an `active` job whose `lastSeenAt` is 40 days before the injected `now`, run `runPipeline` with no sources (or sources that don't touch it), and assert the returned `RunResult.expired` includes the age-backstop expiry and the job's status became `expired`. (Follow the file's existing fake-prisma construction.)

- [ ] **Step 7: Document the env var**

In `.env.example`, near the other `LADDER_` vars, add:
```
# LADDER_JOB_MAX_AGE_MS=2592000000   # age backstop: expire active jobs unseen this long (default 30d)
```

- [ ] **Step 8: Green everything + typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit` → clean.
Run: `pnpm exec vitest run lib/rmhladder/pipeline` → all pass.

- [ ] **Step 9: Commit**

```bash
git add lib/rmhladder/pipeline/expire-stale.ts lib/rmhladder/pipeline/expire-stale.test.ts lib/rmhladder/pipeline/run.ts lib/rmhladder/pipeline/run.test.ts .env.example
git commit -m "feat(rmhladder): age backstop expires long-unseen active jobs"
```

---

## Self-Review

**Spec coverage (Phase 1):**
- 1.1 Explicit fetch-success signal → Tasks 1 (contract + adapters) & 2 (recheck consumes it). ✅
- 1.2 Last-seen age backstop → Task 4. ✅
- 1.3 Freshness visibility → Task 3 makes empty-but-alive boards stamp `lastSuccessAt`, so the existing `/rmhladder/health` "silent sources" signal stops false-flagging healthy empty boards. Deeper per-source freshness surfacing is Phase 3. ✅
- Circuit-breaker preservation → Task 2 Step 4 explicitly re-verifies. ✅

**Type consistency:** `DiscoverResult { jobs; fetchSucceeded }` defined in Task 1, consumed identically in Tasks 2 & 3. `expireStaleJobs`/`decideAgeExpiry`/`resolveJobMaxAgeMs` defined and consumed within Task 4.

**Placeholder scan:** exact code for types, greenhouse/lever/ashby/workday, recheck, process-source, and the whole expire-stale module. The two areas that instruct "read then adapt" — smartrecruiters' `fetchBoard` internals and the existing test files' mock harnesses — are genuine per-file specifics a fresh implementer must read; the transformation intent and the exact `discoverJobs` result shape are fully specified.

**Known risk to flag at review:** Task 1 is a wide atomic change (5 adapters + tests). If an implementer reports it too large, split by committing the type change with a temporary adapter shim is NOT allowed (breaks the contract); instead keep it one task and, if needed, dispatch with a more capable model.
