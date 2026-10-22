/** mention-search must never read a viewer's whole follow graph: every follow read is bounded, and ranking still
 *  puts mutuals first, then people the viewer follows, then followers. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  follow: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: db }));
vi.mock('@/lib/search/db.server', () => ({ norm: (x: unknown) => x }));

import { searchMentionUsers } from '../mention-search.server';

const u = (id: string) => ({ id, handle: id, username: id, name: id, image: null });

beforeEach(() => {
  db.follow.findMany.mockReset();
  db.user.findMany.mockReset();
  db.$queryRaw.mockReset();
});

describe('searchMentionUsers', () => {
  it('ranks by the relation to the candidates only, reading no unbounded follow set', async () => {
    db.$queryRaw.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
    db.user.findMany.mockResolvedValue(['a', 'b', 'c', 'd'].map(u));
    db.follow.findMany.mockResolvedValue([
      { followerId: 'v', followingId: 'b' }, // viewer follows b
      { followerId: 'c', followingId: 'v' }, // c follows viewer
      { followerId: 'v', followingId: 'd' },
      { followerId: 'd', followingId: 'v' }, // d mutual
    ]);
    const out = await searchMentionUsers('x', 'v');
    expect(out.map((o) => o.id)).toEqual(['d', 'b', 'c', 'a']);
    expect(db.follow.findMany).toHaveBeenCalledTimes(1);
    const where = JSON.stringify(db.follow.findMany.mock.calls[0][0].where);
    expect(where).toContain('"in":["a","b","c","d"]');
  });

  it('empty query reads only the newest 50 edges per direction', async () => {
    db.follow.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
    await searchMentionUsers('', 'v');
    const calls = db.follow.findMany.mock.calls.map((c) => c[0]);
    expect(calls.length).toBe(2);
    for (const c of calls) expect(c.take).toBe(50);
  });
});
