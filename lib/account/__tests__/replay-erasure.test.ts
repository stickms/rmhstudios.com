import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `GameReplay` (which only cascades from the user) must be
 * deleted explicitly. A replay that backs a speedrun entry stays, as board history under the tombstone like the
 * entry itself.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const state = vi.hoisted(() => ({ mine: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }], proofs: ['r2'] }));

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => {
          if (name === 'gameReplay' && method === 'findMany') return Promise.resolve(state.mine);
          if (name === 'speedrunEntry' && method === 'findMany') {
            const ids = (args as { where: { replayId: { in: string[] } } }).where.replayId.in;
            return Promise.resolve(state.proofs.filter((id) => ids.includes(id)).map((replayId) => ({ replayId })));
          }
          return { model: name, method, args };
        },
      },
    );
  return new Proxy(
    { $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>,
    { get: (t, key: string) => (key in t ? t[key] : model(key)) },
  );
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { replayErasureOps } from '@/lib/replays.server';

describe('anonymizeAccount (replays)', () => {
  it('deletes the member’s replays except the proofs behind speedrun entries', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'gameReplay');
    expect(ops).toEqual([
      { model: 'gameReplay', method: 'deleteMany', args: { where: { userId: 'user-1', id: { notIn: ['r2'] } } } },
    ]);
  });

  it('deletes every replay when none backs a speedrun entry', async () => {
    state.proofs = [];
    const ops = (await replayErasureOps('user-2')) as unknown as Op[];
    expect(ops).toEqual([{ model: 'gameReplay', method: 'deleteMany', args: { where: { userId: 'user-2' } } }]);
  });
});
