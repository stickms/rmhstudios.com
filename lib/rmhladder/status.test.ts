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
      lastCompletedRun: {
        ...BASE.lastCompletedRun!,
        finishedAt: new Date('2026-07-14T00:00:00.000Z'),
      },
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
