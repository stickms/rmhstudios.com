import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `CommunityBan` rows about the member never cascade: they are
 * deleted explicitly, and where the member was the moderator the reference is nulled (s06-01).
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => ({
          model: name,
          method,
          args,
        }),
      },
    );
  return new Proxy(
    {
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    } as Record<string, unknown>,
    {
      get: (t, key: string) => (key in t ? t[key] : model(key)),
    },
  );
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: prismaMock,
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';

describe('anonymizeAccount (community sanctions)', () => {
  it('deletes sanctions about the member and nulls the moderator references', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'communityBan');
    expect(ops).toContainEqual({
      model: 'communityBan',
      method: 'deleteMany',
      args: {
        where: {
          userId: 'user-1',
        },
      },
    });
    expect(ops).toContainEqual({
      model: 'communityBan',
      method: 'updateMany',
      args: {
        where: {
          createdById: 'user-1',
        },
        data: {
          createdById: null,
        },
      },
    });
    expect(ops).toContainEqual({
      model: 'communityBan',
      method: 'updateMany',
      args: {
        where: {
          liftedById: 'user-1',
        },
        data: {
          liftedById: null,
        },
      },
    });
  });
});
