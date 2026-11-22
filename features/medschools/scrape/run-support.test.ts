import { describe, expect, it } from 'vitest';
import { createFakePrisma } from './test-support';
import { lastRealRunWithin, pickWalkTargets } from './run-support';

describe('pickWalkTargets', () => {
  it('keeps the first key per school and lists duplicates', () => {
    const aliases = [
      {
        schoolId: 'b',
        sourceKey: 'Beta',
      },
      {
        schoolId: 'a',
        sourceKey: 'Alpha 2',
      },
      {
        schoolId: 'a',
        sourceKey: 'Alpha',
      },
      {
        schoolId: 'x',
        sourceKey: 'Inactive',
      },
    ];
    const { targets, duplicates } = pickWalkTargets(aliases, new Set(['a', 'b']));
    expect(targets.map((t) => t.sourceKey)).toEqual(['Alpha', 'Beta']);
    expect(duplicates).toEqual(['Alpha 2']);
  });
});

describe('lastRealRunWithin', () => {
  const NOW = new Date('2026-11-20T18:00:00Z');
  const H = 3_600_000;
  const MS = 20 * H;
  const row = (over: Record<string, unknown>) => ({
    source: 'SDN',
    job: 'sdn-live',
    trigger: 'CRON',
    status: 'OK',
    startedAt: new Date(NOW.getTime() - 5 * H),
    stats: {},
    ...over,
  });
  const check = async (rows: Array<Record<string, unknown>>, job = 'sdn-live') => {
    const fake = createFakePrisma();
    for (const r of rows) await fake.prisma.medSourceRun.create({ data: r as never });
    return lastRealRunWithin(fake.prisma, 'SDN', job, MS, NOW);
  };

  it('true for a recent non-manual OK or PARTIAL run', async () => {
    expect(await check([row({})])).toBe(true);
    expect(await check([row({ status: 'PARTIAL' })])).toBe(true);
  });
  it('false for none, old, manual, other job, FAILED or RUNNING', async () => {
    expect(await check([])).toBe(false);
    expect(await check([row({ startedAt: new Date(NOW.getTime() - 21 * H) })])).toBe(false);
    expect(await check([row({ trigger: 'MANUAL' })])).toBe(false);
    expect(await check([row({ job: 'sdn-backfill' })])).toBe(false);
    expect(await check([row({ status: 'FAILED' })])).toBe(false);
    expect(await check([row({ status: 'RUNNING' })])).toBe(false);
  });
  it('ignores zero-work outcomes so they do not extend the window', async () => {
    expect(await check([row({ stats: { outcome: 'paused-peak' } })])).toBe(false);
    expect(await check([row({ stats: { outcome: 'skipped-min-interval' } })])).toBe(false);
    expect(await check([row({ status: 'PARTIAL', stats: { peakPaused: true, requests: 0 } })])).toBe(false);
    expect(await check([row({ stats: { peakPaused: true, requests: 7 } })])).toBe(true);
  });
});
