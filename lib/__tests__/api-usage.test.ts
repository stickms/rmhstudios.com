import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    apiUsageDaily: {
      upsert: vi.fn().mockResolvedValue({ id: 'u1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { prisma } from '@/lib/prisma.server';
import { recordUsage, flushUsage, getKeyUsage, utcDayKey } from '@/lib/api/usage.server';

const upsert = vi.mocked(prisma.apiUsageDaily.upsert);
const findMany = vi.mocked(prisma.apiUsageDaily.findMany);

/**
 * Usage accounting is buffered so it adds no write to the API's hot path. That
 * buffering is the part worth testing: it must aggregate rather than overwrite,
 * split error classes correctly, and never lose counts to a concurrent flush.
 */
describe('developer API usage accounting', () => {
  beforeEach(async () => {
    // Drain anything a previous test left buffered so counts don't leak across.
    await flushUsage();
    upsert.mockClear();
    findMany.mockClear();
  });

  it('aggregates many requests into a single write', async () => {
    for (let i = 0; i < 50; i++) recordUsage('key-1', 1, 200);
    await flushUsage();

    // The whole point: 50 requests, one row written.
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0] as unknown as {
      update: { requests: { increment: number }; units: { increment: number } };
    };
    expect(arg.update.requests.increment).toBe(50);
    expect(arg.update.units.increment).toBe(50);
  });

  it('sums cost weights rather than counting requests', async () => {
    recordUsage('key-1', 1, 200);
    recordUsage('key-1', 10, 200); // a heavy endpoint
    await flushUsage();

    const arg = upsert.mock.calls[0][0] as unknown as {
      update: { requests: { increment: number }; units: { increment: number } };
    };
    expect(arg.update.requests.increment).toBe(2);
    expect(arg.update.units.increment).toBe(11);
  });

  it('keeps 4xx and 5xx apart', async () => {
    recordUsage('key-1', 1, 200);
    recordUsage('key-1', 1, 404);
    recordUsage('key-1', 1, 403);
    recordUsage('key-1', 1, 500);
    await flushUsage();

    const arg = upsert.mock.calls[0][0] as unknown as {
      update: {
        requests: { increment: number };
        clientErrors: { increment: number };
        serverErrors: { increment: number };
      };
    };
    // A client integrating badly and a server failing are different problems.
    expect(arg.update.requests.increment).toBe(4);
    expect(arg.update.clientErrors.increment).toBe(2);
    expect(arg.update.serverErrors.increment).toBe(1);
  });

  it('writes one row per key', async () => {
    recordUsage('key-1', 1, 200);
    recordUsage('key-2', 1, 200);
    await flushUsage();

    expect(upsert).toHaveBeenCalledTimes(2);
    const keyIds = upsert.mock.calls
      .map((c) => (c[0] as unknown as { where: { keyId_day: { keyId: string } } }).where.keyId_day.keyId)
      .sort();
    expect(keyIds).toEqual(['key-1', 'key-2']);
  });

  it('is a no-op when nothing is buffered', async () => {
    await flushUsage();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does not double-write on a second flush', async () => {
    recordUsage('key-1', 1, 200);
    await flushUsage();
    await flushUsage();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('survives a write failure without throwing at the caller', async () => {
    // Usage reporting must never break the API it reports on.
    upsert.mockRejectedValueOnce(new Error('FK violation: key deleted mid-flush'));
    recordUsage('key-gone', 1, 200);
    await expect(flushUsage()).resolves.toBeUndefined();
  });

  it('buckets by UTC day in the rate limiter’s format', () => {
    expect(utcDayKey(new Date('2026-07-31T23:59:59Z'))).toBe('20260731');
    expect(utcDayKey(new Date('2026-08-01T00:00:00Z'))).toBe('20260801');
  });

  it('zero-fills quiet days so a chart keeps its shape', async () => {
    findMany.mockResolvedValueOnce([] as never);
    const usage = await getKeyUsage('key-1', 7);
    expect(usage).toHaveLength(7);
    expect(usage.every((d) => d.requests === 0)).toBe(true);
    // Oldest first, so a chart reads left-to-right in time order.
    expect(usage[0].date < usage[6].date).toBe(true);
  });

  it('clamps the requested window to a sane range', async () => {
    findMany.mockResolvedValue([] as never);
    expect(await getKeyUsage('key-1', 1000)).toHaveLength(90);
    expect(await getKeyUsage('key-1', 0)).toHaveLength(1);
  });
});
