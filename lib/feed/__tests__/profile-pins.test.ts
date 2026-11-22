/**
 * Pin up to three posts (sprint 05 #19): three fit and a fourth is refused with nothing unpinned, an unpinned, deleted,
 * moderated or expired pin frees its slot, moving trades places with the neighbour, only the author can pin or move,
 * every change takes the member's lock before it counts, and every removal path clears the pin. Prisma is an in-memory
 * fake; nothing here touches a database.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evalWhere, type Row } from '@/lib/feed/__tests__/where-eval';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

interface PostRow extends Row {
  id: string;
  userId: string;
  deletedAt: Date | null;
  expiresAt: Date | null;
  communityId: string | null;
  pinnedAt: Date | null;
}

const h = vi.hoisted(() => ({
  viewer: 'author' as string,
  posts: [] as Array<Record<string, unknown>>,
  log: [] as string[],
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: {
          id: h.viewer,
        },
        session: {},
      }),
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({
  withRateLimitAsync: async () => null,
}));
vi.mock('@/lib/prisma.server', () => {
  const rows = () => h.posts as unknown as PostRow[];
  const rMHark = {
    findUnique: vi.fn(
      async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => rows().find((p) => p.id === where.id) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where: Row }) => {
      h.log.push('list');
      return rows()
        .filter((p) => evalWhere(p, where))
        .sort((a, b) => a.pinnedAt!.getTime() - b.pinnedAt!.getTime() || (a.id < b.id ? -1 : 1));
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: {
          id: string;
        };
        data: Partial<PostRow>;
      }) => {
        h.log.push(`update:${where.id}`);
        Object.assign(
          rows().find((p) => p.id === where.id)!,
          data,
        );
        return {};
      },
    ),
  };
  const prisma = {
    rMHark,
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.log.push(`lock:${strings.join('?')}:${String(values[0])}`);
      return 1;
    }),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return {
    prisma,
    default: prisma,
  };
});

import { PIN_LIMIT } from '@/lib/feed/profile-pins';
import {
  PinError,
  getPinState,
  listPinned,
  movePin,
  pinPost,
  pinnedOrderFor,
  togglePin,
  unpinPost,
} from '@/lib/feed/profile-pins.server';
import { route as pinRoute } from '@/lib/feed/api/rmharks.$id.pin.server';
import { route as moveRoute } from '@/lib/feed/api/rmharks.$id.pin.move.server';

const post = (id: string, over: Partial<PostRow> = {}): PostRow => ({
  id,
  userId: 'author',
  deletedAt: null,
  expiresAt: null,
  communityId: null,
  pinnedAt: null,
  ...over,
});

let clock = 1_000_000;
const tick = () => new Date((clock += 1000));
const pinnedIds = async () => (await listPinned('author')).map((p) => p.id);

async function failure(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof PinError) return e.code;
    throw e;
  }
  return 'none';
}

beforeEach(() => {
  h.viewer = 'author';
  h.log = [];
  h.posts = ['a', 'b', 'c', 'd', 'e'].map((id) => post(id));
});

describe('pinning', () => {
  it('pins three posts in the order they were pinned and refuses a fourth, unpinning nothing', async () => {
    for (const id of ['b', 'a', 'c']) await pinPost('author', id, tick());
    expect(await pinnedIds()).toEqual(['b', 'a', 'c']);
    expect(await failure(pinPost('author', 'd', tick()))).toBe('limit');
    expect(await pinnedIds()).toEqual(['b', 'a', 'c']);
    expect(h.posts.find((p) => p.id === 'd')!.pinnedAt).toBeNull();
  });

  it('reports the place, the count and the limit', async () => {
    await pinPost('author', 'a', tick());
    const state = await pinPost('author', 'b', tick());
    expect(state).toEqual({
      pinned: true,
      pinnedOrder: 2,
      pinnedCount: 2,
      limit: PIN_LIMIT,
    });
    expect(await getPinState('author', 'c')).toEqual({
      pinned: false,
      pinnedOrder: null,
      pinnedCount: 2,
      limit: PIN_LIMIT,
    });
  });

  it('a new pin lands last even when the clock reads earlier than the last pin', async () => {
    await pinPost('author', 'a', new Date(5_000_000));
    await pinPost('author', 'b', new Date(4_000_000));
    expect(await pinnedIds()).toEqual(['a', 'b']);
  });

  it('pinning a pinned post changes nothing', async () => {
    await pinPost('author', 'a', tick());
    await pinPost('author', 'b', tick());
    const before = h.posts.map((p) => p.pinnedAt);
    await pinPost('author', 'a', tick());
    expect(h.posts.map((p) => p.pinnedAt)).toEqual(before);
  });

  it('unpinning frees a slot and leaves the others in order', async () => {
    for (const id of ['a', 'b', 'c']) await pinPost('author', id, tick());
    expect(await unpinPost('author', 'b', tick())).toMatchObject({
      pinned: false,
      pinnedCount: 2,
    });
    await pinPost('author', 'd', tick());
    expect(await pinnedIds()).toEqual(['a', 'c', 'd']);
  });

  it('a deleted, moderation-removed or expired pinned post frees its slot', async () => {
    for (const id of ['a', 'b', 'c']) await pinPost('author', id, tick());
    h.posts.find((p) => p.id === 'a')!.deletedAt = new Date();
    expect(await getPinState('author', 'b')).toMatchObject({
      pinnedCount: 2,
    });
    await pinPost('author', 'd', tick());
    h.posts.find((p) => p.id === 'b')!.expiresAt = new Date(clock);
    expect(await pinnedIds()).toEqual(['c', 'd']);
    await pinPost('author', 'e', tick());
    expect(await pinnedIds()).toEqual(['c', 'd', 'e']);
  });

  it('toggles: pins, then unpins', async () => {
    expect(await togglePin('author', 'a', tick())).toMatchObject({
      pinned: true,
      pinnedCount: 1,
    });
    expect(await togglePin('author', 'a', tick())).toMatchObject({
      pinned: false,
      pinnedCount: 0,
    });
  });
});

describe('who can pin what', () => {
  it('only the author pins, moves or unpins; a deleted post is gone; a community post is not pinnable', async () => {
    await pinPost('author', 'a', tick());
    expect(await failure(pinPost('other', 'b', tick()))).toBe('forbidden');
    expect(await failure(unpinPost('other', 'a', tick()))).toBe('forbidden');
    expect(await failure(movePin('other', 'a', 'down', tick()))).toBe('forbidden');
    expect(await failure(getPinState('other', 'a'))).toBe('forbidden');
    expect(await failure(pinPost('author', 'nope', tick()))).toBe('not-found');
    h.posts.find((p) => p.id === 'c')!.deletedAt = new Date();
    expect(await failure(pinPost('author', 'c', tick()))).toBe('not-found');
    h.posts.find((p) => p.id === 'd')!.communityId = 'comm';
    expect(await failure(pinPost('author', 'd', tick()))).toBe('not-pinnable');
    expect(await pinnedIds()).toEqual(['a']);
  });
});

describe('moving', () => {
  beforeEach(async () => {
    for (const id of ['a', 'b', 'c']) await pinPost('author', id, tick());
  });

  it('trades places with the neighbour, up and down', async () => {
    expect(await movePin('author', 'c', 'up', tick())).toMatchObject({
      pinnedOrder: 2,
    });
    expect(await pinnedIds()).toEqual(['a', 'c', 'b']);
    expect(await movePin('author', 'a', 'down', tick())).toMatchObject({
      pinnedOrder: 2,
    });
    expect(await pinnedIds()).toEqual(['c', 'a', 'b']);
  });

  it('refuses at either end and for a post that is not pinned', async () => {
    expect(await failure(movePin('author', 'a', 'up', tick()))).toBe('at-end');
    expect(await failure(movePin('author', 'c', 'down', tick()))).toBe('at-end');
    expect(await failure(movePin('author', 'd', 'up', tick()))).toBe('not-pinned');
    expect(await pinnedIds()).toEqual(['a', 'b', 'c']);
  });

  it('writes exactly the two swapped posts', async () => {
    h.log = [];
    await movePin('author', 'b', 'down', tick());
    expect(h.log.filter((l) => l.startsWith('update:')).sort()).toEqual(['update:b', 'update:c']);
  });
});

describe('the lock', () => {
  it('is taken, on the member, before the pins are counted', async () => {
    await pinPost('author', 'a', tick());
    expect(h.log[0]).toBe('lock:SELECT pg_advisory_xact_lock(hashtext(?)):profile-pins:author');
    expect(h.log.indexOf('list')).toBeGreaterThan(0);
  });

  it('is taken before a move and an unpin read anything', async () => {
    await pinPost('author', 'a', tick());
    await pinPost('author', 'b', tick());
    for (const run of [
      () => movePin('author', 'b', 'up', tick()),
      () => unpinPost('author', 'a', tick()),
      () => togglePin('author', 'c', tick()),
    ]) {
      h.log = [];
      await run();
      expect(h.log[0]).toMatch(/^lock:.*profile-pins:author$/);
    }
  });
});

describe('the developer API order', () => {
  it('numbers each pinned post among its author’s live pins and omits the rest', async () => {
    for (const id of ['c', 'a']) await pinPost('author', id, tick());
    h.posts.push(
      post('x', {
        userId: 'someone',
        pinnedAt: tick(),
      }),
    );
    const order = await pinnedOrderFor(['a', 'b', 'c', 'x']);
    expect(order.get('c')).toBe(1);
    expect(order.get('a')).toBe(2);
    expect(order.get('x')).toBe(1);
    expect(order.has('b')).toBe(false);
  });
});

describe('the endpoints', () => {
  const call = async (handler: TestHandler, id: string, body?: unknown) =>
    handler({
      request: new Request(`https://x.test/api/rmharks/${id}/pin`, {
        method: 'POST',
        headers: {
          'cf-connecting-ip': String(Math.random()),
          cookie: 'better-auth.session_token=t',
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      params: {
        id,
      },
    });
  const POST = handlersOf(pinRoute).POST!;
  const MOVE = handlersOf(moveRoute).POST!;

  it('answers pinned, pinnedCount and limit; the fourth is a 409 naming the limit', async () => {
    for (const id of ['a', 'b', 'c']) {
      const res = await call(POST, id);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        success: true,
        pinned: true,
        limit: 3,
      });
    }
    const refused = await call(POST, 'd');
    expect(refused.status).toBe(409);
    expect(
      (
        (await refused.json()) as {
          error: string;
        }
      ).error,
    ).toBe('You can pin up to 3 posts. Unpin one first.');
    expect(await pinnedIds()).toEqual(['a', 'b', 'c']);
  });

  it('is 403 for someone else’s post and 404 for a missing one', async () => {
    h.viewer = 'other';
    expect((await call(POST, 'a')).status).toBe(403);
    h.viewer = 'author';
    expect((await call(POST, 'nope')).status).toBe(404);
  });

  it('moves a pin, validates the direction, and is author-only', async () => {
    await call(POST, 'a');
    await call(POST, 'b');
    const moved = await call(MOVE, 'b', {
      direction: 'up',
    });
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({
      pinnedOrder: 1,
      pinnedCount: 2,
    });
    expect(
      (
        await call(MOVE, 'b', {
          direction: 'sideways',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(MOVE, 'b', {
          direction: 'up',
        })
      ).status,
    ).toBe(409);
    h.viewer = 'other';
    expect(
      (
        await call(MOVE, 'a', {
          direction: 'down',
        })
      ).status,
    ).toBe(403);
  });
});

describe('removal paths clear the pin', () => {
  const root = join(__dirname, '..', '..', '..');
  const read = (rel: string) => readFileSync(join(root, rel), 'utf8');
  const paths: Array<[string, number]> = [
    ['lib/social/engagement.server.ts', 1],
    ['lib/feed/api/rmharks.$id.server.ts', 1],
    ['lib/trash/trash.server.ts', 1],
    ['lib/communities/automod.server.ts', 1],
    ['lib/moderation/content.server.ts', 2],
  ];

  it.each(paths)('%s sets pinnedAt: null where it sets deletedAt on a post', (rel, count) => {
    expect(read(rel).split('pinnedAt: null').length - 1).toBe(count);
  });
});
