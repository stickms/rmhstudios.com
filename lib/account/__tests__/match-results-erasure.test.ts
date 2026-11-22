import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place. Match rows are tournament
 * records and stay, so where the member was the claimant or the disputer the
 * reference (and their dispute note) is nulled explicitly.
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

describe('anonymizeAccount (match results)', () => {
  it('nulls the claimant and the disputer (and the dispute note) without deleting match rows', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'tournamentMatch');
    expect(ops.some((o) => o.method === 'deleteMany' || o.method === 'delete')).toBe(false);
    expect(
      ops.find(
        (o) =>
          'claimedById' in
          (
            o.args as {
              where: object;
            }
          ).where,
      )!.args,
    ).toEqual({
      where: {
        claimedById: 'user-1',
      },
      data: {
        claimedById: null,
      },
    });
    expect(
      ops.find(
        (o) =>
          'disputedById' in
          (
            o.args as {
              where: object;
            }
          ).where,
      )!.args,
    ).toEqual({
      where: {
        disputedById: 'user-1',
      },
      data: {
        disputedById: null,
        disputeNote: null,
      },
    });
  });
});
