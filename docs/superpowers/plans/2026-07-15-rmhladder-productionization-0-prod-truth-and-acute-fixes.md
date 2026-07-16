# rmhladder Productionization — Phase 0: Prod Truth + Acute Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two user-visible rmhladder failures die — opaque resume-upload failure and no visibility into a possibly-not-running scraper — and move the scrape cadence to every 12 hours, all shippable on its own ahead of the deeper hardening phases.

**Architecture:** Add a single source of truth for resume-subsystem readiness (object storage + encryption key), wire it into the upload route (clean user-facing 503 + actionable operator log), the admin health page, and the worker startup banner. Add a `pnpm ladder:status` diagnostic that prints the exact prod-truth numbers (last completed run + age, active/expired job counts, source-status distribution, resume readiness). Change the cron/staleness defaults to 12h. Document all of it in an operations runbook.

**Tech Stack:** TanStack Start + React 19 + Nitro SSR, TypeScript (strict), Prisma 7 (`@prisma/adapter-pg`), Node `ladder-worker` + `node-cron`, Vitest, pnpm. Spec: `docs/superpowers/specs/2026-07-15-rmhladder-productionization-design.md`.

## Global Constraints

- **Server-only code MUST use the `*.server.ts` suffix.** Anything importing Prisma, `node:*`, S3, or secrets is server-only; the Vite plugin stubs `*.server` out of the client bundle. Import specifier must literally contain `.server`.
- **Resume storage stays object-storage-required (PII).** Do NOT add a local-FS fallback for resumes in production. The Phase 0 fix is fail-loud provisioning guardrails, not loosening storage.
- **The web tier never scrapes.** The manual "run now" trigger in Phase 0 is the existing `pnpm ladder:run` CLI. Do NOT add a web/API route that runs the pipeline. (A worker-polled dashboard button is deferred to Phase 3.)
- **User-facing error responses must not name internal env vars.** Detailed, capability-naming messages go to server logs and the admin-only health page; end users get a generic "temporarily unavailable" 503.
- **No new type or lint warnings** relative to the branch base: `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc --noEmit` and `pnpm lint` must stay clean. (The repo is large — the default Node heap OOMs on a full typecheck; the 8 GB flag is what the repo's own `vite build` uses. Always include it when running `tsc`.)
- **Tests are colocated `.test.ts`** and run under `pnpm exec vitest run`. Follow TDD: failing test first.
- **Ladder enums (exact values):** `LadderJobStatus = active | expired | unknown`. `LadderSourceStatus = active | unconfigured | blocked | error | disabled`. `LadderRunTrigger = cron | manual`.
- **Resume env var names (exact):** object storage = `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; encryption = `LADDER_RESUME_ENCRYPTION_KEY` (dev-only fallback: `BETTER_AUTH_SECRET` when `NODE_ENV !== 'production'`).
- **12h target values (exact):** cron `0 */12 * * *`; staleness window `43_200_000` ms (12h).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/rmhladder/resume/crypto.server.ts` (modify) | add non-throwing `resumeEncryptionConfigured()` | 1 |
| `lib/rmhladder/resume/readiness.server.ts` (create) | single source of truth: `resumeSubsystemReadiness()`, `resumeReadinessError()` | 1 |
| `lib/rmhladder/resume/readiness.server.test.ts` (create) | unit tests for readiness + error message | 1 |
| `app/routes/api/rmhladder/resume/index.ts` (modify) | fail-loud upload gate using readiness | 2 |
| `app/routes/_site/rmhladder/health.tsx` (modify) | surface resume readiness to admins | 2 |
| `server/ladder-worker/index.ts` (modify) | log resume readiness at startup | 2 |
| `lib/rmhladder/scheduler.ts` (modify) | 12h cron + staleness defaults | 3 |
| `lib/rmhladder/scheduler.test.ts` (modify) | update default/boundary expectations | 3 |
| `.env.example` (modify) | document 12h default | 3 |
| `docker-compose.yml` (modify) | correct the "default every 4h" comment | 3 |
| `server/CLAUDE.md` (modify) | correct the "default every 4h" note | 3 |
| `lib/rmhladder/status.ts` (create) | pure `formatLadderStatus()` report builder | 4 |
| `lib/rmhladder/status.test.ts` (create) | unit tests for the formatter | 4 |
| `scripts/ladder-status.ts` (create) | prisma-backed `pnpm ladder:status` CLI | 4 |
| `package.json` (modify) | add `ladder:status` script | 4 |
| `docs/rmhladder-operations.md` (create) | operations runbook (prod truth, provisioning, schedule, manual run) | 5 |

---

## Task 1: Resume-subsystem readiness helpers

**Files:**
- Modify: `lib/rmhladder/resume/crypto.server.ts` (add one exported function at end)
- Create: `lib/rmhladder/resume/readiness.server.ts`
- Test: `lib/rmhladder/resume/readiness.server.test.ts`

**Interfaces:**
- Consumes: `s3Configured()` from `@/lib/storage/s3.server`; `encryptionKey()` (module-private in `crypto.server.ts`).
- Produces:
  - `resumeEncryptionConfigured(): boolean` — never throws.
  - `interface ResumeReadiness { ready: boolean; objectStorageConfigured: boolean; encryptionKeyConfigured: boolean; missing: string[] }`
  - `resumeSubsystemReadiness(): ResumeReadiness`
  - `resumeReadinessError(readiness: ResumeReadiness): string` — empty string when ready; otherwise a capability-naming operator message.

- [ ] **Step 1: Write the failing test**

Create `lib/rmhladder/resume/readiness.server.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resumeReadinessError, resumeSubsystemReadiness } from './readiness.server';

const S3_VARS = ['S3_BUCKET', 'S3_ENDPOINT', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const;

function setS3(): void {
  for (const v of S3_VARS) vi.stubEnv(v, 'configured');
}
function clearS3(): void {
  for (const v of S3_VARS) vi.stubEnv(v, '');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resumeSubsystemReadiness', () => {
  it('is ready when object storage and encryption key are configured', () => {
    setS3();
    vi.stubEnv('LADDER_RESUME_ENCRYPTION_KEY', 'a'.repeat(32));
    const r = resumeSubsystemReadiness();
    expect(r.ready).toBe(true);
    expect(r.objectStorageConfigured).toBe(true);
    expect(r.encryptionKeyConfigured).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('reports object storage missing', () => {
    clearS3();
    vi.stubEnv('LADDER_RESUME_ENCRYPTION_KEY', 'a'.repeat(32));
    const r = resumeSubsystemReadiness();
    expect(r.objectStorageConfigured).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.missing.some((m) => m.includes('object storage'))).toBe(true);
  });

  it('reports encryption key missing (production, no fallback)', () => {
    setS3();
    vi.stubEnv('LADDER_RESUME_ENCRYPTION_KEY', '');
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    vi.stubEnv('NODE_ENV', 'production');
    const r = resumeSubsystemReadiness();
    expect(r.encryptionKeyConfigured).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.missing.some((m) => m.includes('LADDER_RESUME_ENCRYPTION_KEY'))).toBe(true);
  });
});

describe('resumeReadinessError', () => {
  it('is empty when ready', () => {
    expect(
      resumeReadinessError({ ready: true, objectStorageConfigured: true, encryptionKeyConfigured: true, missing: [] }),
    ).toBe('');
  });

  it('names missing capabilities', () => {
    const msg = resumeReadinessError({
      ready: false,
      objectStorageConfigured: false,
      encryptionKeyConfigured: true,
      missing: ['object storage (S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)'],
    });
    expect(msg).toContain('object storage');
    expect(msg.toLowerCase()).toContain('not configured');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/rmhladder/resume/readiness.server.test.ts`
Expected: FAIL — `Failed to resolve import "./readiness.server"` (module does not exist yet).

- [ ] **Step 3: Add `resumeEncryptionConfigured` to `crypto.server.ts`**

Append to `lib/rmhladder/resume/crypto.server.ts` (after the last function, line 58):

```ts

/**
 * True when a usable resume-encryption secret is configured — the dedicated
 * LADDER_RESUME_ENCRYPTION_KEY, or (dev only) the BETTER_AUTH_SECRET fallback.
 * Never throws; mirrors the resolution order in configuredSecret()/encryptionKey().
 */
export function resumeEncryptionConfigured(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Create `readiness.server.ts`**

Create `lib/rmhladder/resume/readiness.server.ts`:

```ts
import { s3Configured } from '@/lib/storage/s3.server';
import { resumeEncryptionConfigured } from './crypto.server';

export interface ResumeReadiness {
  ready: boolean;
  objectStorageConfigured: boolean;
  encryptionKeyConfigured: boolean;
  /** Operator-facing capability descriptions that are missing (never secret values). */
  missing: string[];
}

const OBJECT_STORAGE_LABEL =
  'object storage (S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)';
const ENCRYPTION_LABEL = 'resume encryption key (LADDER_RESUME_ENCRYPTION_KEY)';

/**
 * Single source of truth for whether resumes can be stored. Resumes are PII and
 * require object storage (no local-FS fallback in production) plus an encryption
 * key. Read fresh each call so operators can fix env without a rebuild.
 */
export function resumeSubsystemReadiness(): ResumeReadiness {
  const objectStorageConfigured = s3Configured();
  const encryptionKeyConfigured = resumeEncryptionConfigured();
  const missing: string[] = [];
  if (!objectStorageConfigured) missing.push(OBJECT_STORAGE_LABEL);
  if (!encryptionKeyConfigured) missing.push(ENCRYPTION_LABEL);
  return {
    ready: missing.length === 0,
    objectStorageConfigured,
    encryptionKeyConfigured,
    missing,
  };
}

/** Operator-facing message for logs / admin surfaces. Empty when ready. */
export function resumeReadinessError(readiness: ResumeReadiness): string {
  if (readiness.ready) return '';
  return `Resume storage is not configured — missing: ${readiness.missing.join('; ')}.`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run lib/rmhladder/resume/readiness.server.test.ts`
Expected: PASS — 5 tests passing.

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/rmhladder/resume/crypto.server.ts lib/rmhladder/resume/readiness.server.ts lib/rmhladder/resume/readiness.server.test.ts
git commit -m "feat(rmhladder): resume-subsystem readiness check"
```

---

## Task 2: Fail-loud wiring — upload route, health page, worker startup

**Files:**
- Modify: `app/routes/api/rmhladder/resume/index.ts` (replace the production 503 gate; drop now-unused `s3Configured` import)
- Modify: `app/routes/_site/rmhladder/health.tsx` (surface readiness to admins)
- Modify: `server/ladder-worker/index.ts` (startup readiness log)

**Interfaces:**
- Consumes: `resumeSubsystemReadiness`, `resumeReadinessError` from `@/lib/rmhladder/resume/readiness.server` (Task 1). The worker uses the relative path `../../lib/rmhladder/resume/readiness.server`.
- Produces: no new exports. Behavior change only.

> **Verification note:** the decision logic lives in the Task 1 helper (already unit-tested). These route/page/worker edits are integration wiring with no unit-test harness, so this task is verified by `pnpm exec tsc --noEmit`, `pnpm lint`, the existing resume tests staying green, and the manual curl in the runbook (Task 5). No fake unit test is added.

- [ ] **Step 1: Update the upload route gate**

In `app/routes/api/rmhladder/resume/index.ts`:

Remove the `s3Configured` import (line 5):
```ts
import { s3Configured } from '@/lib/storage/s3.server';
```
Add the readiness import beside the other resume imports (after line 7):
```ts
import { resumeSubsystemReadiness } from '@/lib/rmhladder/resume/readiness.server';
```

Replace the production storage gate (current lines 34-37):
```ts
          if (process.env.NODE_ENV === 'production' && !s3Configured()) {
            console.error('[rmhladder-resume] upload blocked: private object storage is not configured');
            return Response.json({ error: 'Resume storage is unavailable.' }, { status: 503 });
          }
```
with:
```ts
          if (process.env.NODE_ENV === 'production') {
            const readiness = resumeSubsystemReadiness();
            if (!readiness.ready) {
              // Operators get the actionable detail in logs / on /rmhladder/health;
              // end users get a generic message (never leak internal env var names).
              console.error(
                `[rmhladder-resume] upload blocked — resume subsystem not ready: missing ${readiness.missing.join('; ')}`,
              );
              return Response.json(
                { error: 'Resume uploads are temporarily unavailable. Please try again later.' },
                { status: 503 },
              );
            }
          }
```

- [ ] **Step 2: Surface readiness on the admin health page**

In `app/routes/_site/rmhladder/health.tsx`:

Add the import after line 19 (`... from '@/lib/rmhladder/server/queries';`):
```ts
import { resumeSubsystemReadiness } from '@/lib/rmhladder/resume/readiness.server';
```

In the `fetchHealth` handler, change the return (current lines 30-35) to include readiness:
```ts
  const [stale, runs, overview] = await Promise.all([
    listStaleSources(queriesPrisma),
    listRuns(queriesPrisma, 20),
    getOverview(queriesPrisma, session.user.id, { includeAdminStats: true }),
  ]);
  return { stale, runs, openReviewTasks: overview.openReviewTasks, resumeReadiness: resumeSubsystemReadiness() };
```

Update the destructure in `HealthPage` (current line 52):
```ts
  const { stale, runs, openReviewTasks, resumeReadiness } = Route.useLoaderData();
```

Insert this panel immediately after the review-queue `<Link>` (current lines 57-59), before the silent-sources `<section>`:
```tsx
      <section className="rl-stale-panel">
        <h2 className="rl-eyebrow">Resume subsystem</h2>
        {resumeReadiness.ready ? (
          <p className="rl-quicklist__empty">Object storage and encryption key are configured.</p>
        ) : (
          <ul>
            {resumeReadiness.missing.map((item) => (
              <li key={item} className="rl-stale-row">
                <span className="rl-mono">missing: {item}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
```

- [ ] **Step 3: Log readiness at worker startup**

In `server/ladder-worker/index.ts`:

Add the import beside the other resume import (after the block ending line 29, `... from '../../lib/rmhladder/resume/schemas';`):
```ts
import {
  resumeSubsystemReadiness,
  resumeReadinessError,
} from '../../lib/rmhladder/resume/readiness.server';
```

Immediately after the existing startup banner `console.log('[ladder-worker] Started ...')` (current lines 242-244), add:
```ts
const resumeReady = resumeSubsystemReadiness();
if (resumeReady.ready) {
  console.log('[ladder-worker] Resume subsystem ready — object storage + encryption key configured');
} else {
  console.error(`[ladder-worker] ${resumeReadinessError(resumeReady)}`);
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (in particular, no "s3Configured is declared but never read").

Run: `pnpm lint`
Expected: no new warnings/errors.

- [ ] **Step 5: Confirm existing resume tests still pass**

Run: `pnpm exec vitest run lib/rmhladder/resume`
Expected: PASS — existing resume suite green, plus Task 1's readiness tests.

- [ ] **Step 6: Commit**

```bash
git add app/routes/api/rmhladder/resume/index.ts app/routes/_site/rmhladder/health.tsx server/ladder-worker/index.ts
git commit -m "feat(rmhladder): fail loud when resume storage is unconfigured"
```

---

## Task 3: 12-hour cadence

**Files:**
- Modify: `lib/rmhladder/scheduler.ts`
- Modify: `lib/rmhladder/scheduler.test.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `server/CLAUDE.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DEFAULT_LADDER_CRON = '0 */12 * * *'`, `DEFAULT_STALE_AFTER_MS = 43_200_000` (unchanged names/signatures for `resolveLadderCron`, `isScrapeStale`).

- [ ] **Step 1: Update the failing test expectations first**

In `lib/rmhladder/scheduler.test.ts`, replace the `'defaults to every four hours'` test and the `'becomes stale at the four-hour boundary'` test with:

```ts
  it('defaults to every twelve hours', () => {
    expect(resolveLadderCron(undefined)).toBe('0 */12 * * *');
    expect(DEFAULT_LADDER_CRON).toBe('0 */12 * * *');
  });
```

```ts
  it('becomes stale at the twelve-hour boundary', () => {
    expect(isScrapeStale(new Date('2026-07-12T00:00:00.001Z'), now)).toBe(false);
    expect(isScrapeStale(new Date('2026-07-12T00:00:00.000Z'), now)).toBe(true);
    expect(DEFAULT_STALE_AFTER_MS).toBe(43_200_000);
  });
```

(The `now` constant in that describe block is `2026-07-12T12:00:00.000Z`; 12h earlier is `2026-07-12T00:00:00.000Z`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/rmhladder/scheduler.test.ts`
Expected: FAIL — default still `'0 */4 * * *'`, `DEFAULT_STALE_AFTER_MS` still `14_400_000`.

- [ ] **Step 3: Update the defaults in `scheduler.ts`**

In `lib/rmhladder/scheduler.ts`, change lines 3-4:
```ts
export const DEFAULT_LADDER_CRON = '0 */4 * * *';
export const DEFAULT_STALE_AFTER_MS = 4 * 60 * 60 * 1_000;
```
to:
```ts
export const DEFAULT_LADDER_CRON = '0 */12 * * *';
export const DEFAULT_STALE_AFTER_MS = 12 * 60 * 60 * 1_000;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/rmhladder/scheduler.test.ts`
Expected: PASS.

- [ ] **Step 5: Update docs/config references to 12h**

In `.env.example`, change the `LADDER_CRON_SCHEDULE` comment (currently `# LADDER_CRON_SCHEDULE=0 */4 * * *`) to:
```
# LADDER_CRON_SCHEDULE=0 */12 * * *   # default: every 12h
```

In `docker-compose.yml`, the `ladder-worker` comment currently reads `... on LADDER_CRON_SCHEDULE (default every 4h). No port.` — change `every 4h` to `every 12h`.

In `server/CLAUDE.md`, the `ladder-worker/` bullet currently says `node-cron` schedule `LADDER_CRON_SCHEDULE` (default every 4h) — change `every 4h` to `every 12h`.

- [ ] **Step 6: Commit**

```bash
git add lib/rmhladder/scheduler.ts lib/rmhladder/scheduler.test.ts .env.example docker-compose.yml server/CLAUDE.md
git commit -m "feat(rmhladder): scrape every 12h (cron + staleness window)"
```

---

## Task 4: `pnpm ladder:status` diagnostic

**Files:**
- Create: `lib/rmhladder/status.ts`
- Test: `lib/rmhladder/status.test.ts`
- Create: `scripts/ladder-status.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `isScrapeStale`, `DEFAULT_STALE_AFTER_MS` from `./scheduler`; at runtime the script uses `prisma` and `resumeSubsystemReadiness`.
- Produces:
  - `interface LadderStatusData { now: Date; lastCompletedRun: { finishedAt: Date; discoveredCount: number; newCount: number; expiredCount: number; errorCount: number } | null; activeJobs: number; expiredJobs: number; sourcesByStatus: Record<string, number>; resume: { ready: boolean; missing: string[] }; staleAfterMs: number }`
  - `formatLadderStatus(data: LadderStatusData): string`

- [ ] **Step 1: Write the failing test**

Create `lib/rmhladder/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatLadderStatus, type LadderStatusData } from './status';

const BASE: LadderStatusData = {
  now: new Date('2026-07-15T12:00:00.000Z'),
  lastCompletedRun: {
    finishedAt: new Date('2026-07-15T06:00:00.000Z'),
    discoveredCount: 120,
    newCount: 8,
    expiredCount: 3,
    errorCount: 1,
  },
  activeJobs: 412,
  expiredJobs: 57,
  sourcesByStatus: { active: 200, unconfigured: 40, error: 5, blocked: 2 },
  resume: { ready: true, missing: [] },
  staleAfterMs: 43_200_000,
};

describe('formatLadderStatus', () => {
  it('reports active/expired job counts and source distribution', () => {
    const out = formatLadderStatus(BASE);
    expect(out).toContain('active jobs: 412');
    expect(out).toContain('expired jobs: 57');
    expect(out).toContain('active: 200');
    expect(out).toContain('unconfigured: 40');
  });

  it('flags a fresh scrape as NOT stale', () => {
    const out = formatLadderStatus(BASE);
    expect(out).toContain('last completed run:');
    expect(out).not.toContain('STALE');
  });

  it('flags a stale scrape (older than the window)', () => {
    const out = formatLadderStatus({
      ...BASE,
      lastCompletedRun: { ...BASE.lastCompletedRun!, finishedAt: new Date('2026-07-14T00:00:00.000Z') },
    });
    expect(out).toContain('STALE');
  });

  it('flags a never-run scraper', () => {
    const out = formatLadderStatus({ ...BASE, lastCompletedRun: null });
    expect(out).toContain('no completed run');
    expect(out).toContain('STALE');
  });

  it('flags a not-ready resume subsystem', () => {
    const out = formatLadderStatus({
      ...BASE,
      resume: { ready: false, missing: ['resume encryption key (LADDER_RESUME_ENCRYPTION_KEY)'] },
    });
    expect(out).toContain('resume subsystem: NOT READY');
    expect(out).toContain('LADDER_RESUME_ENCRYPTION_KEY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/rmhladder/status.test.ts`
Expected: FAIL — cannot resolve `./status`.

- [ ] **Step 3: Implement the formatter**

Create `lib/rmhladder/status.ts`:

```ts
import { DEFAULT_STALE_AFTER_MS, isScrapeStale } from './scheduler';

export interface LadderStatusData {
  now: Date;
  lastCompletedRun: {
    finishedAt: Date;
    discoveredCount: number;
    newCount: number;
    expiredCount: number;
    errorCount: number;
  } | null;
  activeJobs: number;
  expiredJobs: number;
  sourcesByStatus: Record<string, number>;
  resume: { ready: boolean; missing: string[] };
  staleAfterMs: number;
}

function ageLabel(from: Date, to: Date): string {
  const mins = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round((mins / 60) * 10) / 10;
  return `${hours}h ago`;
}

/** Human-readable prod-truth report. Pure — the CLI supplies the data. */
export function formatLadderStatus(d: LadderStatusData): string {
  const lines: string[] = [];
  lines.push('rmhladder status');
  lines.push('================');

  const run = d.lastCompletedRun;
  const stale = isScrapeStale(run?.finishedAt ?? null, d.now, d.staleAfterMs || DEFAULT_STALE_AFTER_MS);
  if (!run) {
    lines.push(`last completed run: none (no completed run) ${stale ? '[STALE]' : ''}`.trimEnd());
  } else {
    lines.push(
      `last completed run: ${run.finishedAt.toISOString()} (${ageLabel(run.finishedAt, d.now)})${stale ? ' [STALE]' : ''}`,
    );
    lines.push(
      `  discovered=${run.discoveredCount} new=${run.newCount} expired=${run.expiredCount} errors=${run.errorCount}`,
    );
  }

  lines.push(`active jobs: ${d.activeJobs}`);
  lines.push(`expired jobs: ${d.expiredJobs}`);

  const statuses = Object.keys(d.sourcesByStatus).sort();
  lines.push('sources by status:');
  if (statuses.length === 0) {
    lines.push('  (none)');
  } else {
    for (const s of statuses) lines.push(`  ${s}: ${d.sourcesByStatus[s]}`);
  }

  if (d.resume.ready) {
    lines.push('resume subsystem: READY');
  } else {
    lines.push(`resume subsystem: NOT READY — missing: ${d.resume.missing.join('; ')}`);
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/rmhladder/status.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Create the CLI script**

Create `scripts/ladder-status.ts`:

```ts
/* eslint-disable no-console */
import 'dotenv/config';
import { prisma } from '@/lib/prisma.server';
import { resumeSubsystemReadiness } from '@/lib/rmhladder/resume/readiness.server';
import { DEFAULT_STALE_AFTER_MS } from '@/lib/rmhladder/scheduler';
import { formatLadderStatus, type LadderStatusData } from '@/lib/rmhladder/status';

async function main(): Promise<void> {
  const [lastRun, activeJobs, expiredJobs, sourceGroups] = await Promise.all([
    prisma.ladderScrapeRun.findFirst({
      where: { finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      select: {
        finishedAt: true,
        discoveredCount: true,
        newCount: true,
        expiredCount: true,
        errorCount: true,
      },
    }),
    prisma.ladderJob.count({ where: { status: 'active' } }),
    prisma.ladderJob.count({ where: { status: 'expired' } }),
    prisma.ladderSource.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const sourcesByStatus: Record<string, number> = {};
  for (const row of sourceGroups) sourcesByStatus[row.status] = row._count._all;

  const readiness = resumeSubsystemReadiness();

  const data: LadderStatusData = {
    now: new Date(),
    lastCompletedRun:
      lastRun && lastRun.finishedAt
        ? {
            finishedAt: lastRun.finishedAt,
            discoveredCount: lastRun.discoveredCount ?? 0,
            newCount: lastRun.newCount ?? 0,
            expiredCount: lastRun.expiredCount ?? 0,
            errorCount: lastRun.errorCount ?? 0,
          }
        : null,
    activeJobs,
    expiredJobs,
    sourcesByStatus,
    resume: { ready: readiness.ready, missing: readiness.missing },
    staleAfterMs: DEFAULT_STALE_AFTER_MS,
  };

  console.log(formatLadderStatus(data));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
```

- [ ] **Step 6: Register the script**

In `package.json`, beside the other ladder scripts (`ladder:seed`, `ladder:probe`, `ladder:run`), add:
```json
    "ladder:status": "pnpm exec tsx scripts/ladder-status.ts",
```

- [ ] **Step 7: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (If the Prisma types reject `groupBy` field names, confirm the model is `ladderSource` with a `status` scalar — it is per the schema; the `_count: { _all: true }` shape is standard Prisma groupBy.)

- [ ] **Step 8: Commit**

```bash
git add lib/rmhladder/status.ts lib/rmhladder/status.test.ts scripts/ladder-status.ts package.json
git commit -m "feat(rmhladder): pnpm ladder:status diagnostic report"
```

---

## Task 5: Operations runbook

**Files:**
- Create: `docs/rmhladder-operations.md`

**Interfaces:** none (documentation). No test — verification is that the commands referenced exist (`pnpm ladder:status`, `pnpm ladder:run`) and the env var names match Global Constraints.

- [ ] **Step 1: Write the runbook**

Create `docs/rmhladder-operations.md` with exactly this content:

````markdown
# RMHLadder — Operations Runbook

Operating the job-discovery pipeline (`server/ladder-worker`) and the resume
subsystem in production. Companion to the design spec
`docs/superpowers/specs/2026-07-15-rmhladder-productionization-design.md`.

## Is it actually running? (prod truth)

The worker is the Docker Compose service `ladder-worker`
(`command: node dist-server/server/ladder-worker/index.cjs`). It runs the
pipeline on `LADDER_CRON_SCHEDULE` (default **every 12h**) and self-bootstraps
an empty database on startup.

Checklist:

1. **Worker process:** `docker compose ps ladder-worker` → should be `Up`.
2. **Worker logs:** `docker compose logs --tail=100 ladder-worker` → look for
   `[ladder-worker] Started`, a resume-readiness line, and periodic
   `[ladder-worker] Run complete [...] discovered=... created=...`.
3. **One-shot status report:** run inside the worker (or web) container:
   ```bash
   pnpm ladder:status
   ```
   Prints last completed run + age (flagged `[STALE]` if older than the 12h
   window), active/expired job counts, sources by status
   (`active/unconfigured/blocked/error/disabled`), and resume-subsystem
   readiness.
4. **Admin dashboard:** `/rmhladder/health` shows the resume subsystem,
   silent sources, and the scrape-run ledger.

If there is no completed run and no `Run complete` log line, the worker is not
running or is crash-looping — check `docker compose logs ladder-worker` for the
stack trace (commonly a missing `DATABASE_URL`).

## Resume uploads fail (503 "temporarily unavailable")

Resumes are PII: production requires **object storage** (no local-disk
fallback) **and** an **encryption key**. If either is missing, uploads return a
generic 503 to users, and the specific missing capability is logged
(`[rmhladder-resume] upload blocked — ...`) and shown on `/rmhladder/health`.

Required env (all four for storage):

| Var | Purpose |
|---|---|
| `S3_BUCKET` | bucket name |
| `S3_ENDPOINT` | S3/R2 endpoint (account host; bucket appended by the SDK) |
| `S3_ACCESS_KEY_ID` | credential |
| `S3_SECRET_ACCESS_KEY` | credential |
| `S3_REGION` | optional (default `us-east-1`) |
| `LADDER_RESUME_ENCRYPTION_KEY` | AES-256-GCM key for resume text + files |

Generate the encryption key (32-byte hex):
```bash
openssl rand -hex 32
```
Set it as `LADDER_RESUME_ENCRYPTION_KEY` in the production env file, then
restart the `web` and `ladder-worker` services so they pick it up.

Verify after provisioning:
```bash
pnpm ladder:status   # resume subsystem: READY
```
Then upload a PDF/DOCX at `/rmhladder/resume` — expect `201`, not `503`.

> Rotating `LADDER_RESUME_ENCRYPTION_KEY` invalidates previously encrypted
> resumes (they can no longer be decrypted). Rotate only with intent.

## Scrape schedule

- Default: **every 12 hours** (`0 */12 * * *`).
- Override without a rebuild: set `LADDER_CRON_SCHEDULE` (standard 5-field
  cron, UTC) in the production env file and restart `ladder-worker`. An invalid
  value fails fast at startup with `Invalid LADDER_CRON_SCHEDULE`.

## Force a run now

The web tier never scrapes. Trigger a manual run from the worker/web container:
```bash
pnpm ladder:run                 # full pipeline, trigger=manual
pnpm ladder:run --limit 20      # cap sources (smoke test)
pnpm ladder:run --platform greenhouse
```
Each run writes a `LadderScrapeRun` row visible on `/rmhladder/health`.

(An in-dashboard "Run now" button that signals the worker is planned for a
later phase; until then use the CLI.)

## Reading review tasks & a tripped circuit breaker

- `/rmhladder/review` lists open review tasks. A `mass_expiry_suspected` task
  with the source set to `error` means the mass-expiry circuit breaker tripped
  (a source's board looked empty for many active jobs at once — usually a fetch
  problem, not real mass-expiry). Investigate the source before clearing.
- `/rmhladder/health` "silent sources" lists sources with a stale
  `lastSuccessAt` — the earliest signal of a quietly-failing board.

## Env var reference (ladder)

See `.env.example` (search `LADDER_`): `LADDER_CRON_SCHEDULE`,
`LADDER_USER_AGENT`, `LADDER_DOMAIN_RATE_LIMIT_MS`, `LADDER_PROBE_BATCH_SIZE`,
`LADDER_RESUME_ENCRYPTION_KEY`, `LADDER_AI_*`, `LADDER_LEASE_*`.
````

- [ ] **Step 2: Verify referenced commands exist**

Run: `grep -E '"ladder:(status|run)"' package.json`
Expected: both `ladder:status` (added in Task 4) and `ladder:run` are present.

- [ ] **Step 3: Commit**

```bash
git add docs/rmhladder-operations.md
git commit -m "docs(rmhladder): operations runbook (prod truth, provisioning, schedule)"
```

---

## Self-Review

**Spec coverage (Phase 0 of the spec):**
- 0.1 Establish prod truth → Task 4 (`ladder:status`), Task 2 (health readiness surface), Task 5 (prod-truth checklist). ✅
- 0.2 Resume fail-loud + provisioning → Task 1 (readiness), Task 2 (route/health/worker wiring), Task 5 (provisioning runbook). ✅
- 0.3 Schedule → 12h + manual run → Task 3 (cron + staleness), Task 5 (manual run via `pnpm ladder:run`; dashboard button explicitly deferred). ✅

**Type consistency:** `ResumeReadiness` shape (`ready/objectStorageConfigured/encryptionKeyConfigured/missing`) is defined in Task 1 and consumed unchanged in Tasks 2 & 4. `LadderStatusData`/`formatLadderStatus` defined in Task 4 and used by the same task's CLI. Enum literals (`active`, `expired`, source statuses) match Global Constraints and the schema.

**Placeholder scan:** every code/step block contains complete code and exact commands; no TBD/TODO.

**Deferred to later phase plans (not Phase 0):** empty-board expiry fix (Phase 1), Workday coverage (Phase 2), staleness/failure alerting + run-history metrics + dashboard "Run now" (Phase 3). These get their own plans written after Phase 0's prod-truth findings are in.
