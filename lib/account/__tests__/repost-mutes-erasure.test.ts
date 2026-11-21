import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `RepostMute` (which only cascades from the user) must be
 * deleted explicitly, on both sides: the member's own list and the rows where others turned their reposts off.
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

describe('anonymizeAccount (repost mutes)', () => {
  it('deletes the rows where the account is either side, as a Prisma operation in the transaction', async () => {
    await anonymizeAccount('user-1');
    const calls = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls;
    const tx = calls[calls.length - 1]![0] as Op[];
    const op = tx.find((o) => o.model === 'repostMute' && o.method === 'deleteMany');
    expect(op).toBeDefined();
    expect(op!.args).toEqual({
      where: {
        OR: [
          {
            userId: 'user-1',
          },
          {
            targetId: 'user-1',
          },
        ],
      },
    });
    // No raw SQL rides in the array: the stub cannot record it.
    expect(tx.every((o) => o.model !== '$executeRaw')).toBe(true);
  });
});
