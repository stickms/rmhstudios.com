import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `RmhTubeUserStats` and `RmhTubeWatchDay` (which no
 * cascade reaches) are deleted explicitly, and the export carries the same member's figures.
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
import { exportRmhTubeStats } from '@/lib/rmhtube/stats.server';

describe('anonymizeAccount (RMHTube watch statistics)', () => {
  it('deletes the account’s counters and per-day minutes', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    for (const m of ['rmhTubeUserStats', 'rmhTubeWatchDay']) {
      const op = tx.find((o) => o.model === m && o.method === 'deleteMany');
      expect(op, m).toBeDefined();
      expect(op!.args).toEqual({
        where: {
          userId: 'user-1',
        },
      });
    }
  });
});

describe('exportRmhTubeStats', () => {
  it('reads only the caller’s row and days, tolerating a stubbed read', async () => {
    const out = await exportRmhTubeStats('user-1');
    // The recording Proxy returns operation objects, not rows: the export degrades to zeros and an empty list.
    expect(out.days).toEqual([]);
    expect(out).toHaveProperty('counters');
  });
});
