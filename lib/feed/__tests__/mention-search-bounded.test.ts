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

  it('candidate SQL never ORDERs BY a per-row correlated EXISTS (broad needles matched every row)', async () => {
    db.$queryRaw.mockResolvedValue([]);
    await searchMentionUsers('us', 'v');
    const sql = (db.$queryRaw.mock.calls[0][0] as { strings: string[] }).strings.join('?');
    expect(sql).not.toMatch(/EXISTS/i);
    expect(sql).toMatch(/UNION SELECT "id" FROM rel/);
    // Anonymous viewer: no edge lookups at all.
    db.$queryRaw.mockClear();
    await searchMentionUsers('us', undefined);
    const anon = (db.$queryRaw.mock.calls[0][0] as { strings: string[] }).strings.join('?');
    expect(anon).not.toMatch(/follow/i);
  });

  it('empty query reads only the newest 50 edges per direction', async () => {
    db.follow.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
    await searchMentionUsers('', 'v');
    const calls = db.follow.findMany.mock.calls.map((c) => c[0]);
    expect(calls.length).toBe(2);
    for (const c of calls) expect(c.take).toBe(50);
  });

  it('keeps a mutual that sits beyond the first 50 distinct edge ids', async () => {
    const outEdges = [...Array.from({ length: 49 }, (_, i) => `o${i}`), 'm'];
    const incEdges = [...Array.from({ length: 49 }, (_, i) => `i${i}`), 'm'];
    db.follow.findMany
      .mockResolvedValueOnce(outEdges.map((id) => ({ followingId: id })))
      .mockResolvedValueOnce(incEdges.map((id) => ({ followerId: id })));
    db.user.findMany.mockImplementation(async ({ where }) => where.id.in.map(u));
    db.follow.findMany.mockResolvedValueOnce([
      { followerId: 'v', followingId: 'm' },
      { followerId: 'm', followingId: 'v' },
    ]);
    const out = await searchMentionUsers('', 'v');
    const ids: string[] = db.user.findMany.mock.calls[0][0].where.id.in;
    expect(ids.length).toBeLessThanOrEqual(50);
    expect(ids).toContain('m');
    expect(out[0].id).toBe('m');
  });

  it('orders the query-path candidate LIMIT by exact match, relation, handle, id', async () => {
    db.$queryRaw.mockResolvedValue([]);
    await searchMentionUsers('x', 'v');
    const sql = db.$queryRaw.mock.calls[0][0] as { strings: string[] };
    const text = sql.strings.join('?');
    expect(text).toMatch(/ORDER BY[\s\S]*"handle" ASC, "id" ASC\s+LIMIT 50/);
    expect(text).toContain('"follow"');
  });

  it('orders the anonymous default by follower count with an id tie-break', async () => {
    db.user.findMany.mockResolvedValue([]);
    await searchMentionUsers('', undefined);
    expect(db.user.findMany.mock.calls[0][0].orderBy).toEqual([
      { followerCount: 'desc' },
      { id: 'asc' },
    ]);
  });
});
