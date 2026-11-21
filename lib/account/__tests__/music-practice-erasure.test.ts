import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `MusicPracticeEntry` (which only cascades
 * from the user) must be deleted explicitly, and the account export must carry it. The per-table
 * sweep over every music model is `lib/rmhmusic/learn/account-data.server.test.ts`; this is the
 * practice log's own contract: scoped to the account, in the deletion transaction, and exported
 * as JSON (BigInt ids as strings).
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
        get: (_t, method: string) => (args: unknown) => {
          const op = { model: name, method, args };
          if (name === 'musicPracticeEntry' && method === 'findMany')
            return Promise.resolve([
              {
                id: 12n,
                userId: 'user-1',
                kind: 'song',
                refId: 'ode-to-joy',
                mode: 'wait',
                score: 80,
                durationMs: 60_000,
                createdAt: new Date('2026-11-22T10:00:00Z'),
              },
            ]);
          return method.startsWith('find') ? Promise.resolve(Object.assign([], { op })) : op;
        },
      },
    );
  return new Proxy({ $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>, {
    get: (t, key: string) => (key in t ? t[key] : model(key)),
  });
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { exportMusicData, musicErasureOps } from '@/lib/rmhmusic/learn/account-data.server';

describe('the RMHMusic practice log and account deletion', () => {
  it('musicErasureOps deletes the account’s practice entries and only those', () => {
    const ops = musicErasureOps('user-1') as unknown as Op[];
    const op = ops.find((o) => o.model === 'musicPracticeEntry');
    expect(op).toMatchObject({ method: 'deleteMany', args: { where: { userId: 'user-1' } } });
    expect(ops.filter((o) => o.model === 'musicPracticeEntry')).toHaveLength(1);
  });

  it('anonymizeAccount runs that delete inside its transaction', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const op = tx.find((o) => o.model === 'musicPracticeEntry' && o.method === 'deleteMany');
    expect(op).toBeDefined();
    expect(op!.args).toEqual({ where: { userId: 'user-1' } });
  });

  it('exportMusicData includes the entries, with ids as strings so the export is JSON', async () => {
    const data = await exportMusicData('user-1');
    expect(data.practice).toEqual([
      expect.objectContaining({ id: '12', userId: 'user-1', kind: 'song', refId: 'ode-to-joy', score: 80 }),
    ]);
    expect(() => JSON.stringify(data)).not.toThrow();
  });
});
