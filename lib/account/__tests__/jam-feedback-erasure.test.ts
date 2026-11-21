import { describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `GameJamFeedback` (which only cascades from the user) must
 * be deleted explicitly: the member's own words go, on whichever entry they were written. Feedback received on the
 * member's entry stays (other people's words). The export holds only what the member wrote.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  return new Proxy(
    { $transaction: vi.fn(async (ops: unknown[]) => ops) } as Record<string, unknown>,
    { get: (t, key: string) => (key in t ? t[key] : model(key)) },
  );
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { exportJamFeedback } from '@/lib/competitive/jam-feedback.server';

describe('anonymizeAccount (jam feedback)', () => {
  it('deletes the feedback the account wrote, by author only', async () => {
    await anonymizeAccount('user-1');
    const tx = (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
    const ops = tx.filter((o) => o.model === 'gameJamFeedback');
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ method: 'deleteMany', args: { where: { authorId: 'user-1' } } });
  });
});

describe('exportJamFeedback', () => {
  it('reads only the feedback the member wrote and shapes title, text and dates', async () => {
    const findMany = vi.fn(async () => [
      {
        entryId: 'e1',
        body: 'Lovely game, the second level crashed.',
        anonymous: true,
        createdAt: new Date('2026-11-20T10:00:00Z'),
        updatedAt: new Date('2026-11-20T11:00:00Z'),
        entry: { build: { title: 'Boat' }, jam: { title: 'Spring jam' } },
      },
    ]);
    (prismaMock as Record<string, unknown>).gameJamFeedback = { findMany };
    const rows = await exportJamFeedback('user-1');
    expect((findMany.mock.calls as unknown[][])[0]![0]).toMatchObject({ where: { authorId: 'user-1' } });
    expect(rows).toEqual([
      {
        entryId: 'e1',
        entryTitle: 'Boat',
        jamTitle: 'Spring jam',
        text: 'Lovely game, the second level crashed.',
        anonymous: true,
        createdAt: '2026-11-20T10:00:00.000Z',
        updatedAt: '2026-11-20T11:00:00.000Z',
      },
    ]);
    // Feedback received is never read for the export.
    expect(JSON.stringify((findMany.mock.calls as unknown[][])[0]![0])).not.toContain('entry:{userId');
  });
});
