import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s15-18 (S13-06): once the erasure transaction has committed, `anonymizeAccount` tells running RMHTube rooms
 * (`rmhtube:member:erased`, `{ userId }`). The publish is a post-commit step: it runs after the transaction and a
 * publish that throws, or a transaction that fails, never turns the other into a failure.
 */

const h = vi.hoisted(() => ({
  order: [] as string[],
  published: [] as Array<{ channel: string; data: unknown }>,
  failPublish: false,
  failTransaction: false,
}));

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  return new Proxy(
    {
      $transaction: vi.fn(async (ops: unknown[]) => {
        if (h.failTransaction) throw new Error('rolled back');
        h.order.push('transaction');
        return ops;
      }),
    } as Record<string, unknown>,
    { get: (t, key: string) => (key in t ? t[key] : model(key)) },
  );
});
vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked(prismaMock),
}));
vi.mock('@/lib/redis.server', () => ({
  redisPublish: (channel: string, data: unknown) => {
    h.order.push('publish');
    if (h.failPublish) throw new Error('redis down');
    h.published.push({ channel, data });
    return true;
  },
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { MEMBER_ERASED_CHANNEL } from '@/lib/rmhtube/events';

beforeEach(() => {
  h.order = [];
  h.published = [];
  h.failPublish = false;
  h.failTransaction = false;
});

describe('anonymizeAccount (RMHTube erased publish)', () => {
  it('publishes the member id on the erased channel after the transaction commits', async () => {
    await anonymizeAccount('user-1');
    expect(MEMBER_ERASED_CHANNEL).toBe('rmhtube:member:erased');
    expect(h.published).toEqual([{ channel: 'rmhtube:member:erased', data: { userId: 'user-1' } }]);
    expect(h.order.indexOf('transaction')).toBeGreaterThanOrEqual(0);
    expect(h.order.indexOf('publish')).toBeGreaterThan(h.order.indexOf('transaction'));
  });

  it('does not fail the erasure when the publish throws', async () => {
    h.failPublish = true;
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(anonymizeAccount('user-1')).resolves.toBeUndefined();
    expect(h.order).toContain('transaction');
    expect(logged.mock.calls.some(([m]) => String(m).includes('could not tell RMHTube rooms'))).toBe(true);
    logged.mockRestore();
  });

  it('publishes nothing when the transaction fails, so a retry publishes once it commits', async () => {
    h.failTransaction = true;
    await expect(anonymizeAccount('user-1')).rejects.toThrow('rolled back');
    expect(h.order).not.toContain('publish');
  });
});
