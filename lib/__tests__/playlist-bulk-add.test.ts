import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(),
    playlist: { findUnique: vi.fn(), update: vi.fn() },
    playlistItem: { findMany: vi.fn(), createMany: vi.fn() },
  };
  return {
    tx,
    playlist: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: m }));

import { addItems, MAX_ITEMS } from '@/lib/playlists.server';

const item = (n: number) => ({ externalId: `https://v/${n}`, title: `T${n}`, url: `https://v/${n}`, durationMs: 1000 });

beforeEach(() => {
  vi.clearAllMocks();
  m.playlist.findFirst.mockResolvedValue({ id: 'p1' });
  m.tx.playlist.findUnique.mockResolvedValue({ itemCount: 2 });
  m.tx.playlistItem.findMany.mockResolvedValue([{ externalId: 'https://v/1' }]);
});

describe('addItems (bulk)', () => {
  it('answers 404 for a playlist the caller cannot edit and writes nothing', async () => {
    m.playlist.findFirst.mockResolvedValue(null);
    const res = await addItems('p1', 'eve', [item(1)]);
    expect(res).toMatchObject({ ok: false, status: 404 });
    expect(m.$transaction).not.toHaveBeenCalled();
  });

  it('checks edit rights with the owner-or-collaborator clause', async () => {
    await addItems('p1', 'dana', [item(2)]);
    const where = m.playlist.findFirst.mock.calls[0]?.[0].where;
    expect(where.OR).toEqual([{ userId: 'dana' }, { collaborators: { some: { userId: 'dana' } } }]);
  });

  it('takes the advisory lock, appends in order after the existing items and de-dupes', async () => {
    const res = await addItems('p1', 'dana', [item(1), item(2), item(3), item(2)]);
    expect(m.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: true, added: 2, duplicates: 2, skipped: 0 });
    const data = m.tx.playlistItem.createMany.mock.calls[0]?.[0].data as Array<{
      position: number;
      externalId: string;
    }>;
    expect(data.map((d) => [d.position, d.externalId])).toEqual([
      [2, 'https://v/2'],
      [3, 'https://v/3'],
    ]);
    expect(m.tx.playlist.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { itemCount: { increment: 2 } },
    });
  });

  it('stops at the item cap and reports the rest as skipped', async () => {
    m.tx.playlist.findUnique.mockResolvedValue({ itemCount: MAX_ITEMS - 1 });
    m.tx.playlistItem.findMany.mockResolvedValue([]);
    const res = await addItems('p1', 'dana', [item(1), item(2), item(3)]);
    expect(res).toEqual({ ok: true, added: 1, duplicates: 0, skipped: 2 });
  });
});
