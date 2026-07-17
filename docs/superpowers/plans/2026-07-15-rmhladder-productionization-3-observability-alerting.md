# rmhladder Productionization — Phase 3: Observability & Alerting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it automatically obvious when scraping degrades — a single health-alert detector that fires on "worker hasn't completed a run in too long," "the latest run's error rate spiked," "the mass-expiry circuit breaker tripped," and "the resume subsystem isn't ready" — surfaced in `pnpm ladder:status`, the worker log, and the admin `/rmhladder/health` page.

**Architecture:** One pure function, `detectLadderHealthAlerts(input): LadderHealthAlert[]`, computes the active alerts from already-available signals. Three thin consumers feed it and render its output: the `ladder:status` CLI, the `ladder-worker` tick, and the health-page loader. No notification fan-out (email/Discord) is built — the health surface + worker log are the delivery, matching the spec's "start with the health surface + existing notification path; expand only if cheap." Thresholds are env-tunable.

**Tech Stack:** TypeScript (strict), Prisma 7, TanStack Start, Vitest, pnpm. Spec: `docs/superpowers/specs/2026-07-15-rmhladder-productionization-design.md` (Phase 3). Builds on Phases 0–2. Reuses Phase 0's `resumeSubsystemReadiness` and `ladder:status`, and the existing `/rmhladder/health` page + `LadderScrapeRun`/`LadderReviewTask` models.

## Global Constraints

- **No new notification channels** (no email/Discord fan-out) this phase. Delivery = `ladder:status` output + a worker-tick warning log + the admin health page. (The spec allows expanding later only if cheap.)
- **The detector is pure** — no I/O, no env reads, no `Date.now()` inside; `now` and all inputs are passed in. This keeps it unit-testable and lets every consumer supply the same shape.
- **Reuse, don't rebuild:** run history already renders on `/rmhladder/health` (the runs table) and the ops runbook already exists (`docs/rmhladder-operations.md`). This phase ADDS the alert layer on top; it does not re-implement run history or the runbook.
- **Thresholds are env-tunable:** `LADDER_ALERT_STALE_RUN_MS` (default `86_400_000` = 24h ≈ 2× the 12h cadence), `LADDER_ALERT_ERROR_RATE` (default `0.5`), `LADDER_ALERT_MIN_RUN_FOR_RATE` (default `10`).
- **No schema change** — alerts are derived from existing `LadderScrapeRun` (finishedAt, errorCount, discoveredCount), `LadderReviewTask` (reason `mass_expiry_suspected`, status `open`), and `resumeSubsystemReadiness()`.
- **No new type or lint warnings.** Repo `tsc` needs `NODE_OPTIONS=--max-old-space-size=8192`. `pnpm lint` clean.
- **Admin-only on the web:** the `/rmhladder/health` page is already admin-gated — the alerts banner inherits that; do not expose alert internals to non-admins.
- **Tests colocated `.test.ts`**, TDD.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/rmhladder/health-alerts.ts` (create) | pure `detectLadderHealthAlerts` + `resolveAlertThresholds` + types | 1 |
| `lib/rmhladder/health-alerts.test.ts` (create) | detector unit tests (every alert code + clean case) | 1 |
| `scripts/ladder-status.ts` (modify) | gather inputs, print an ALERTS section | 1 |
| `server/ladder-worker/index.ts` (modify) | after each tick, warn-log active alerts | 1 |
| `docs/rmhladder-operations.md` (modify) | add an "Alerts" section (codes + what to do) | 1 |
| `lib/rmhladder/server/queries.ts` (modify, if needed) | a small query for open mass-expiry tasks + last completed run (or reuse existing) | 2 |
| `app/routes/_site/rmhladder/health.tsx` (modify) | gather + render an alerts banner (reuse the detector) | 2 |

---

## Task 1: The health-alert detector + CLI + worker + runbook

**Files:**
- Create: `lib/rmhladder/health-alerts.ts`, `lib/rmhladder/health-alerts.test.ts`
- Modify: `scripts/ladder-status.ts`, `server/ladder-worker/index.ts`, `docs/rmhladder-operations.md`

**Interfaces:**
- Produces:
  - `type LadderAlertCode = 'worker_stale' | 'high_error_run' | 'breaker_tripped' | 'resume_not_ready'`
  - `interface LadderHealthAlert { code: LadderAlertCode; severity: 'high' | 'medium'; message: string }`
  - `interface AlertThresholds { staleRunMs: number; errorRate: number; minRunForRate: number }`
  - `resolveAlertThresholds(env?): AlertThresholds`
  - `interface AlertInput { now: Date; lastCompletedRunAt: Date | null; latestRun: { errorCount: number; discoveredCount: number } | null; openMassExpiryTasks: number; resumeReady: boolean; thresholds: AlertThresholds }`
  - `detectLadderHealthAlerts(input: AlertInput): LadderHealthAlert[]`
- Consumed by: `ladder-status.ts`, `ladder-worker`, and (Task 2) the health page.

- [ ] **Step 1: Write the failing test**

Create `lib/rmhladder/health-alerts.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectLadderHealthAlerts, resolveAlertThresholds, DEFAULT_ALERT_THRESHOLDS,
  type AlertInput,
} from './health-alerts';

const now = new Date('2026-07-16T12:00:00.000Z');
const base: AlertInput = {
  now,
  lastCompletedRunAt: new Date(now.getTime() - 60 * 60_000), // 1h ago
  latestRun: { errorCount: 0, discoveredCount: 100 },
  openMassExpiryTasks: 0,
  resumeReady: true,
  thresholds: DEFAULT_ALERT_THRESHOLDS,
};
const codes = (i: AlertInput) => detectLadderHealthAlerts(i).map((a) => a.code);

describe('detectLadderHealthAlerts', () => {
  it('returns no alerts when everything is healthy', () => {
    expect(detectLadderHealthAlerts(base)).toEqual([]);
  });
  it('flags worker_stale when no completed run is within the window', () => {
    expect(codes({ ...base, lastCompletedRunAt: new Date(now.getTime() - 25 * 60 * 60_000) })).toContain('worker_stale');
    expect(codes({ ...base, lastCompletedRunAt: null })).toContain('worker_stale');
  });
  it('flags high_error_run when the latest run error rate exceeds the threshold', () => {
    expect(codes({ ...base, latestRun: { errorCount: 60, discoveredCount: 100 } })).toContain('high_error_run');
  });
  it('does NOT flag high_error_run for a tiny run below minRunForRate', () => {
    expect(codes({ ...base, latestRun: { errorCount: 3, discoveredCount: 3 } })).not.toContain('high_error_run');
  });
  it('flags breaker_tripped when open mass-expiry tasks exist', () => {
    expect(codes({ ...base, openMassExpiryTasks: 2 })).toContain('breaker_tripped');
  });
  it('flags resume_not_ready when resume subsystem is not ready', () => {
    expect(codes({ ...base, resumeReady: false })).toContain('resume_not_ready');
  });
  it('assigns severities (worker_stale/breaker/resume = high, error rate = medium)', () => {
    const alerts = detectLadderHealthAlerts({
      ...base, lastCompletedRunAt: null, openMassExpiryTasks: 1, resumeReady: false,
      latestRun: { errorCount: 60, discoveredCount: 100 },
    });
    const bySeverity = Object.fromEntries(alerts.map((a) => [a.code, a.severity]));
    expect(bySeverity.worker_stale).toBe('high');
    expect(bySeverity.breaker_tripped).toBe('high');
    expect(bySeverity.resume_not_ready).toBe('high');
    expect(bySeverity.high_error_run).toBe('medium');
  });
});

describe('resolveAlertThresholds', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('defaults sanely', () => {
    expect(resolveAlertThresholds({})).toEqual(DEFAULT_ALERT_THRESHOLDS);
    expect(DEFAULT_ALERT_THRESHOLDS.staleRunMs).toBe(86_400_000);
  });
  it('honors valid overrides and ignores junk', () => {
    expect(resolveAlertThresholds({ LADDER_ALERT_ERROR_RATE: '0.25' }).errorRate).toBe(0.25);
    expect(resolveAlertThresholds({ LADDER_ALERT_ERROR_RATE: 'abc' }).errorRate).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run lib/rmhladder/health-alerts.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `health-alerts.ts`**

Create `lib/rmhladder/health-alerts.ts`:
```ts
export type LadderAlertCode = 'worker_stale' | 'high_error_run' | 'breaker_tripped' | 'resume_not_ready';

export interface LadderHealthAlert {
  code: LadderAlertCode;
  severity: 'high' | 'medium';
  message: string;
}

export interface AlertThresholds {
  staleRunMs: number;
  errorRate: number;
  minRunForRate: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  staleRunMs: 86_400_000, // 24h ≈ 2× the 12h cadence
  errorRate: 0.5,
  minRunForRate: 10,
};

function num(value: string | undefined, fallback: number, predicate: (n: number) => boolean): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && predicate(parsed) ? parsed : fallback;
}

export function resolveAlertThresholds(
  env: { LADDER_ALERT_STALE_RUN_MS?: string; LADDER_ALERT_ERROR_RATE?: string; LADDER_ALERT_MIN_RUN_FOR_RATE?: string } = process.env,
): AlertThresholds {
  return {
    staleRunMs: num(env.LADDER_ALERT_STALE_RUN_MS, DEFAULT_ALERT_THRESHOLDS.staleRunMs, (n) => n > 0),
    errorRate: num(env.LADDER_ALERT_ERROR_RATE, DEFAULT_ALERT_THRESHOLDS.errorRate, (n) => n > 0 && n <= 1),
    minRunForRate: num(env.LADDER_ALERT_MIN_RUN_FOR_RATE, DEFAULT_ALERT_THRESHOLDS.minRunForRate, (n) => n >= 0),
  };
}

export interface AlertInput {
  now: Date;
  lastCompletedRunAt: Date | null;
  latestRun: { errorCount: number; discoveredCount: number } | null;
  openMassExpiryTasks: number;
  resumeReady: boolean;
  thresholds: AlertThresholds;
}

/** Pure: compute active health alerts from already-gathered signals. */
export function detectLadderHealthAlerts(input: AlertInput): LadderHealthAlert[] {
  const alerts: LadderHealthAlert[] = [];
  const { thresholds: t } = input;

  const runAgeMs = input.lastCompletedRunAt ? input.now.getTime() - input.lastCompletedRunAt.getTime() : Infinity;
  if (runAgeMs >= t.staleRunMs) {
    alerts.push({
      code: 'worker_stale',
      severity: 'high',
      message: input.lastCompletedRunAt
        ? `No completed scrape run in ${Math.round(runAgeMs / 3_600_000)}h (threshold ${Math.round(t.staleRunMs / 3_600_000)}h).`
        : 'No completed scrape run on record — the worker may not be running.',
    });
  }

  if (input.openMassExpiryTasks > 0) {
    alerts.push({
      code: 'breaker_tripped',
      severity: 'high',
      message: `${input.openMassExpiryTasks} open mass-expiry review task(s) — the circuit breaker tripped on a source.`,
    });
  }

  if (!input.resumeReady) {
    alerts.push({
      code: 'resume_not_ready',
      severity: 'high',
      message: 'Resume subsystem is not ready (object storage or encryption key unconfigured).',
    });
  }

  const r = input.latestRun;
  if (r && r.discoveredCount >= t.minRunForRate) {
    const rate = r.errorCount / Math.max(1, r.discoveredCount);
    if (rate > t.errorRate) {
      alerts.push({
        code: 'high_error_run',
        severity: 'medium',
        message: `Latest run error rate ${Math.round(rate * 100)}% (${r.errorCount}/${r.discoveredCount}) exceeds ${Math.round(t.errorRate * 100)}%.`,
      });
    }
  }

  return alerts;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run lib/rmhladder/health-alerts.test.ts`
Expected: PASS.

- [ ] **Step 5: Surface alerts in `ladder:status`**

In `scripts/ladder-status.ts`, gather the alert inputs (reusing what's already fetched — `lastRun` gives `finishedAt`/`errorCount`/`discoveredCount`; `resumeSubsystemReadiness()` is already called; add a count of open mass-expiry tasks) and print an ALERTS section. Add:
```ts
import { detectLadderHealthAlerts, resolveAlertThresholds } from '@/lib/rmhladder/health-alerts';
```
After the coverage print, add:
```ts
  const openMassExpiryTasks = await prisma.ladderReviewTask.count({
    where: { reason: 'mass_expiry_suspected', status: 'open' },
  });
  const alerts = detectLadderHealthAlerts({
    now: new Date(),
    lastCompletedRunAt: lastRun?.finishedAt ?? null,
    latestRun: lastRun ? { errorCount: lastRun.errorCount ?? 0, discoveredCount: lastRun.discoveredCount ?? 0 } : null,
    openMassExpiryTasks,
    resumeReady: readiness.ready,
    thresholds: resolveAlertThresholds(),
  });
  console.log('\nalerts');
  console.log('------');
  if (alerts.length === 0) {
    console.log('  none — all healthy');
  } else {
    for (const a of alerts) console.log(`  [${a.severity.toUpperCase()}] ${a.code}: ${a.message}`);
  }
```
(Reuse the existing `lastRun` and `readiness` variables from the Phase 0/2 code; do not re-query them. If `lastRun`'s select does not already include `errorCount`/`discoveredCount`, add those fields to its `select`.)

- [ ] **Step 6: Warn-log active alerts after each worker tick**

In `server/ladder-worker/index.ts`, at the end of `tick()` (after `refreshMatchingAndAlerts()` in the try block, before the finally), gather the same inputs and log a warning line per active alert so operators watching worker logs see degradation immediately:
```ts
import { detectLadderHealthAlerts, resolveAlertThresholds } from '../../lib/rmhladder/health-alerts';
import { resumeSubsystemReadiness } from '../../lib/rmhladder/resume/readiness.server';
```
(the resume import may already exist from Phase 0 — do not duplicate). After the run + refresh:
```ts
    try {
      const lastRun = await prisma.ladderScrapeRun.findFirst({
        where: { finishedAt: { not: null } }, orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true, errorCount: true, discoveredCount: true },
      });
      const openMassExpiryTasks = await prisma.ladderReviewTask.count({
        where: { reason: 'mass_expiry_suspected', status: 'open' },
      });
      const alerts = detectLadderHealthAlerts({
        now: new Date(),
        lastCompletedRunAt: lastRun?.finishedAt ?? null,
        latestRun: lastRun ? { errorCount: lastRun.errorCount ?? 0, discoveredCount: lastRun.discoveredCount ?? 0 } : null,
        openMassExpiryTasks,
        resumeReady: resumeSubsystemReadiness().ready,
        thresholds: resolveAlertThresholds(),
      });
      for (const a of alerts) console.error(`[ladder-worker] HEALTH ALERT [${a.severity}] ${a.code}: ${a.message}`);
    } catch (error) {
      console.error('[ladder-worker] Alert detection failed:', error);
    }
```

- [ ] **Step 7: Add an "Alerts" section to the runbook**

In `docs/rmhladder-operations.md`, add a section documenting the four alert codes and the operator response for each:
- `worker_stale` — worker down/stuck; check `docker compose logs ladder-worker`, restart if crash-looping.
- `breaker_tripped` — a source's board looked empty for many active jobs; investigate the source at `/rmhladder/review` before clearing the `mass_expiry_suspected` task.
- `resume_not_ready` — provision `S3_*` + `LADDER_RESUME_ENCRYPTION_KEY` (see the resume section).
- `high_error_run` — many sources failed this run; check the run's error rows on `/rmhladder/health`.
Mention the tunable env vars (`LADDER_ALERT_*`).

- [ ] **Step 8: Typecheck + tests**

Run: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit` → clean.
Run: `pnpm exec vitest run lib/rmhladder/health-alerts.test.ts` → pass.

- [ ] **Step 9: Commit**

```bash
git add lib/rmhladder/health-alerts.ts lib/rmhladder/health-alerts.test.ts scripts/ladder-status.ts server/ladder-worker/index.ts docs/rmhladder-operations.md
git commit -m "feat(rmhladder): health-alert detection in ladder:status + worker log"
```

---

## Task 2: Alerts banner on `/rmhladder/health`

**Files:**
- Modify: `app/routes/_site/rmhladder/health.tsx`
- Modify (only if a needed query is absent): `lib/rmhladder/server/queries.ts`

**Interfaces:**
- Consumes: `detectLadderHealthAlerts` / `resolveAlertThresholds` (Task 1); `resumeSubsystemReadiness` (Phase 0, already imported on this page).

- [ ] **Step 1: Gather alerts in the health loader**

In `health.tsx`'s `fetchHealth` server fn, add the alert inputs and compute alerts. It already fetches `runs` (via `listRuns`) and `resumeReadiness` (Phase 0). Add: the last completed run's `finishedAt`/`errorCount`/`discoveredCount` (the first element of `runs` where `finishedAt` is set, or a small dedicated query), and a count of open `mass_expiry_suspected` tasks. Then:
```ts
import { detectLadderHealthAlerts, resolveAlertThresholds } from '@/lib/rmhladder/health-alerts';
```
Compute `const alerts = detectLadderHealthAlerts({ now: new Date(), lastCompletedRunAt, latestRun, openMassExpiryTasks, resumeReady: resumeReadiness.ready, thresholds: resolveAlertThresholds() });` and add `alerts` to the loader's return object.

- [ ] **Step 2: Render the banner**

Destructure `alerts` from `Route.useLoaderData()` and render a banner at the TOP of `HealthPage` (before the resume-subsystem panel), reusing existing CSS classes (`rl-stale-panel`, `rl-eyebrow`, `rl-mono`, `rl-quicklist__empty`):
```tsx
      <section className="rl-stale-panel">
        <h2 className="rl-eyebrow">Health alerts</h2>
        {alerts.length === 0 ? (
          <p className="rl-quicklist__empty">No active alerts — the pipeline is healthy.</p>
        ) : (
          <ul>
            {alerts.map((a) => (
              <li key={a.code} className="rl-stale-row">
                <span className="rl-program-chip">{a.severity}</span>
                <span className="rl-mono">{a.code}</span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
```

- [ ] **Step 3: Typecheck + lint**

Run: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit` → clean.
Run: `pnpm lint` → no new warnings.

- [ ] **Step 4: Verify the detector unit tests still pass (no logic changed here)**

Run: `pnpm exec vitest run lib/rmhladder/health-alerts.test.ts` → pass.

- [ ] **Step 5: Commit**

```bash
git add app/routes/_site/rmhladder/health.tsx lib/rmhladder/server/queries.ts
git commit -m "feat(rmhladder): health-alerts banner on the admin dashboard"
```

---

## Self-Review

**Spec coverage (Phase 3):**
- 3.1 Run metrics & history → already present (runs table on `/rmhladder/health`); this phase adds derived health (latest-run error-rate alert). ✅
- 3.2 Staleness & failure alerting → Task 1 (detector + `ladder:status` + worker log) & Task 2 (health banner): worker-down (`worker_stale`), runs-failing (`high_error_run`), breaker (`breaker_tripped`), resume readiness (`resume_not_ready`). ✅
- 3.3 Resilience → per-source retry/backoff already explicit (`probe-sources.ts`, `process-source.ts` `nextProbeAt`); health page hardened with the alerts banner. Not rebuilt (YAGNI). ✅
- 3.4 Runbook → Task 1 Step 7 adds the Alerts section to the existing `docs/rmhladder-operations.md`. ✅

**Type consistency:** `AlertInput`/`LadderHealthAlert`/`AlertThresholds`/`detectLadderHealthAlerts`/`resolveAlertThresholds` defined in Task 1 and consumed identically by the CLI, worker, and (Task 2) health page.

**Placeholder scan:** exact code for the detector, its tests, the CLI section, and the worker block. The health-page loader wiring (Task 2) points at the existing `fetchHealth` server fn and names the exact inputs to gather; the "reuse existing `lastRun`/`readiness` variables" notes are deliberate (avoid re-querying) and the shapes are fully specified.

**Delivery scope:** deliberately no email/Discord fan-out (Global Constraints) — the detector output is a stable, serializable contract, so a future phase can add a channel by feeding the same alerts to `notifications.server.ts` without touching detection.
