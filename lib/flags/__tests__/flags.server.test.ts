import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
vi.mock('@/lib/prisma.server', () => ({ prisma: { featureFlag: { findMany } } }));

const { isFeatureEnabled, evaluateAllFlags, invalidateFlags } = await import('../flags.server');

beforeEach(() => {
  invalidateFlags();
  findMany.mockReset();
});

describe('flag lookup', () => {
  it('reads the table once per TTL, not per call', async () => {
    findMany.mockResolvedValue([{ key: 'a', enabled: true, rolloutPercent: 100 }]);
    expect(await isFeatureEnabled('a')).toBe(true);
    expect(await isFeatureEnabled('a', 'u1')).toBe(true);
    expect(await isFeatureEnabled('missing')).toBe(false);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
  it('sees a write at once after invalidation', async () => {
    findMany.mockResolvedValueOnce([{ key: 'a', enabled: false, rolloutPercent: 100 }]);
    expect(await isFeatureEnabled('a')).toBe(false);
    findMany.mockResolvedValueOnce([{ key: 'a', enabled: true, rolloutPercent: 100 }]);
    invalidateFlags();
    expect(await isFeatureEnabled('a')).toBe(true);
  });
  it('fails closed when the database is down and nothing was cached', async () => {
    findMany.mockRejectedValue(new Error('down'));
    expect(await isFeatureEnabled('a')).toBe(false);
    expect(await evaluateAllFlags()).toEqual({});
  });
  it('evaluates every flag for one caller', async () => {
    findMany.mockResolvedValue([
      { key: 'on', enabled: true, rolloutPercent: 100 },
      { key: 'off', enabled: false, rolloutPercent: 100 },
    ]);
    expect(await evaluateAllFlags('u1')).toEqual({ on: true, off: false });
  });
});
