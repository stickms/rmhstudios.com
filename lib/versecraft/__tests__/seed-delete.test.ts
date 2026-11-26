import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

/**
 * s15-04: the author of a Versecraft story takes it down with `DELETE /api/versecraft/seeds/:id`. The listing and its
 * ratings go; the world stays. Only the author can (anyone else gets the answer for a missing listing), and a listing a
 * moderator removed keeps its record. A removed listing stops counting toward the author's cap, and a deleted one frees
 * its slot at once.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  listings: [] as Row[],
  ratings: [] as Row[],
  worlds: [] as Row[],
  locks: [] as number[],
  tx: null as unknown,
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const hit = (row: Row, where: Row) => Object.entries(where).every(([k, v]) => row[k] === v);
  return {
    prisma: shapeChecked({
      versecraftSeedListing: {
        findUnique: async ({ where }: { where: Row }) => h.listings.find((r) => hit(r, where)) ?? null,
        deleteMany: async ({ where }: { where: Row }) => {
          const gone = h.listings.filter((r) => hit(r, where));
          h.listings = h.listings.filter((r) => !gone.includes(r));
          return { count: gone.length };
        },
        count: async ({ where }: { where: Row }) => h.listings.filter((r) => hit(r, where)).length,
        create: async ({ data }: { data: Row }) => {
          const row = { id: `new-${h.listings.length}`, moderatedAt: null, ...data };
          h.listings.push(row);
          return { id: row.id };
        },
      },
      versecraftWorld: { findUnique: async ({ where }: { where: Row }) => h.worlds.find((w) => hit(w, where)) ?? null },
      versecraftSeedRating: {
        deleteMany: async ({ where }: { where: Row }) => {
          const gone = h.ratings.filter((r) => hit(r, where));
          h.ratings = h.ratings.filter((r) => !gone.includes(r));
          return { count: gone.length };
        },
      },
      $executeRaw: async () => {
        h.locks.push(1);
        return 0;
      },
      $transaction: async (fn: (tx: unknown) => unknown) => fn(h.tx),
    }),
  };
});
vi.mock('@/lib/api/handler.server', async (orig) => ({
  ...(await orig<object>()),
  defineHandler: (_o: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/moderation/auto-moderate.server', () => ({ screenNewContent: async () => undefined }));
vi.mock('@/lib/moderation.server', () => ({ getHiddenAuthorIds: async () => [] }));

type Handler = (a: { userId: string; params: { id: string } }) => Promise<Response>;

async function del(userId: string, id: string) {
  const { DELETE } = handlersOfModule<Handler>(await import('@/lib/versecraft/api/versecraft.seeds.$id.server'));
  const res = await DELETE!({ userId, params: { id } });
  const body = (await res.json()) as Record<string, unknown>;
  assertJsonSafe(body);
  return { status: res.status, body };
}

beforeEach(async () => {
  h.listings = [
    { id: 'l1', seed: 'seed-one', authorId: 'author', moderatedAt: null },
    { id: 'l2', seed: 'seed-two', authorId: 'author', moderatedAt: new Date('2027-01-05T00:00:00Z') },
  ];
  h.ratings = [
    { listingId: 'l1', userId: 'a', stars: 5 },
    { listingId: 'l1', userId: 'b', stars: 3 },
    { listingId: 'l2', userId: 'a', stars: 4 },
  ];
  h.worlds = [{ seed: 'seed-one' }, { seed: 'seed-two' }];
  h.locks = [];
  const { prisma } = await import('@/lib/prisma.server');
  h.tx = prisma;
});

describe('DELETE /api/versecraft/seeds/:id', () => {
  it('the author takes a story down: the listing and its ratings go, the world stays', async () => {
    const { status, body } = await del('author', 'l1');
    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(h.listings.map((r) => r.id)).toEqual(['l2']);
    expect(h.ratings.filter((r) => r.listingId === 'l1')).toEqual([]);
    expect(h.ratings.filter((r) => r.listingId === 'l2')).toHaveLength(1);
    expect(h.worlds).toHaveLength(2);
    // The check and the delete ran under the listing's lock.
    expect(h.locks).toHaveLength(1);
  });

  it('only the author can: anyone else gets the answer for a missing listing, and nothing changes', async () => {
    const other = await del('someone-else', 'l1');
    const missing = await del('author', 'nope');
    expect(other.status).toBe(404);
    expect(other.body).toEqual(missing.body);
    expect(missing.status).toBe(404);
    expect(h.listings).toHaveLength(2);
    expect(h.ratings).toHaveLength(3);
  });

  it('a listing a moderator removed cannot be deleted by its author: the record stays', async () => {
    const { status, body } = await del('author', 'l2');
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'GAME_CONTENT_REMOVED_BY_MODERATOR' });
    expect(h.listings.map((r) => r.id)).toContain('l2');
    expect(h.ratings.filter((r) => r.listingId === 'l2')).toHaveLength(1);
  });

  it('a second delete of the same story is a 404, not a second success', async () => {
    expect((await del('author', 'l1')).status).toBe(200);
    expect((await del('author', 'l1')).status).toBe(404);
  });
});

describe('the author cap after a takedown or a removal', () => {
  type Post = (a: { userId: string; body: { seed: string; title: string } }) => Promise<Response>;
  const publish = async (userId: string, seed: string) => {
    const { POST } = handlersOfModule<Post>(await import('@/lib/versecraft/api/versecraft.seeds.server'));
    return (await POST!({ userId, body: { seed, title: 'A new story' } })).status;
  };
  const fill = (live: number, removed: number) => {
    h.listings = [
      ...Array.from({ length: live }, (_, i) => ({
        id: `live-${i}`,
        seed: `live-seed-${i}`,
        authorId: 'author',
        moderatedAt: null,
      })),
      ...Array.from({ length: removed }, (_, i) => ({
        id: `gone-${i}`,
        seed: `gone-seed-${i}`,
        authorId: 'author',
        moderatedAt: new Date(),
      })),
    ];
    h.worlds = [{ seed: 'fresh-seed' }];
  };

  it('a full gallery slot count refuses a new story', async () => {
    fill(10, 0);
    expect(await publish('author', 'fresh-seed')).toBe(409);
  });

  it('stories a moderator removed do not count toward the cap', async () => {
    fill(9, 4);
    expect(await publish('author', 'fresh-seed')).toBe(201);
  });

  it('a story its author took down frees its slot at once, for the same seed too', async () => {
    fill(10, 0);
    h.worlds = [{ seed: 'live-seed-0' }];
    expect(await publish('author', 'live-seed-0')).toBe(409);
    expect((await del('author', 'live-0')).status).toBe(200);
    expect(await publish('author', 'live-seed-0')).toBe(201);
  });
});
