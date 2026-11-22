import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so a member id sitting in a feature flag's allow or deny list
 * (a Postgres array) never cascades. The erasure reads the flags that name the member before the transaction and
 * rewrites only those rows, then drops the flag cache.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const h = vi.hoisted(() => ({
  flags: [] as { key: string; allowUserIds: string[]; denyUserIds: string[] }[],
  findManyArgs: [] as unknown[],
  invalidate: vi.fn(),
}));

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get:
          (_t, method: string) =>
          (args: unknown): Op => ({ model: name, method, args }),
      },
    );
  const featureFlag = {
    findMany: async (args: unknown) => {
      h.findManyArgs.push(args);
      return h.flags;
    },
    update: (args: unknown): Op => ({ model: 'featureFlag', method: 'update', args }),
  };
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops), featureFlag } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/flags/flags.server', () => ({ invalidateFlags: h.invalidate }));

import { anonymizeAccount } from '@/lib/account/deletion.server';

const transactions = () => (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as Op[]);

describe('anonymizeAccount (flag targeting)', () => {
  beforeEach(() => {
    h.flags = [];
    h.findManyArgs = [];
    h.invalidate.mockClear();
    (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
  });

  it('removes the member from the allow and deny lists and keeps the other ids', async () => {
    h.flags = [
      { key: 'beta', allowUserIds: ['user-1', 'user-2'], denyUserIds: ['user-3'] },
      { key: 'gamma', allowUserIds: [], denyUserIds: ['user-4', 'user-1'] },
    ];
    await anonymizeAccount('user-1');
    expect(h.findManyArgs[0]).toMatchObject({
      where: { OR: [{ allowUserIds: { has: 'user-1' } }, { denyUserIds: { has: 'user-1' } }] },
    });
    const updates = transactions()
      .flat()
      .filter((o) => o.model === 'featureFlag' && o.method === 'update');
    expect(updates.map((o) => o.args)).toEqual([
      { where: { key: 'beta' }, data: { allowUserIds: ['user-2'], denyUserIds: ['user-3'] } },
      { where: { key: 'gamma' }, data: { allowUserIds: [], denyUserIds: ['user-4'] } },
    ]);
    expect(h.invalidate).toHaveBeenCalledTimes(1);
  });

  it('writes nothing and keeps the cache when no flag names the member', async () => {
    await anonymizeAccount('user-1');
    const updates = transactions()
      .flat()
      .filter((o) => o.model === 'featureFlag');
    expect(updates).toEqual([]);
    expect(h.invalidate).not.toHaveBeenCalled();
  });
});
