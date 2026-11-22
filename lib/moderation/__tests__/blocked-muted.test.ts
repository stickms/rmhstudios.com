import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeCursor } from '@/lib/feed/cursor';

/** "Blocked and muted" (s05-14): only the caller's rows, keyset paging, the filter, explicit intent, tombstones. */

const h = vi.hoisted(() => ({
  blocks: [] as Record<string, unknown>[],
  mutes: [] as Record<string, unknown>[],
  calls: [] as { model: string; args: Record<string, unknown> }[],
  blockCount: 0,
  muteCount: 0,
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    userBlock: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        h.calls.push({ model: 'userBlock', args });
        return h.blocks;
      }),
      count: vi.fn(async () => h.blockCount),
      deleteMany: (args: unknown) => ({ model: 'userBlock', method: 'deleteMany', args }),
    },
    userMute: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        h.calls.push({ model: 'userMute', args });
        return h.mutes;
      }),
      count: vi.fn(async () => h.muteCount),
      deleteMany: (args: unknown) => ({ model: 'userMute', method: 'deleteMany', args }),
    },
  },
}));

import {
  BlockedMutedCursorError,
  blockMuteErasureOps,
  listBlocked,
  listMuted,
} from '@/lib/moderation/blocked-muted.server';
import { BLOCKED_MUTED_PAGE_SIZE, blockedMutedQuery, toggleAction } from '@/lib/moderation/blocked-muted-schema';

function user(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `Name ${id}`,
    image: `https://img/${id}.png`,
    username: id,
    handle: id,
    isVerified: false,
    isAdmin: false,
    isBot: false,
    profile: null,
    inventory: [],
    ...over,
  };
}

function block(n: number, blocked = user(`u${n}`)) {
  return { id: `b${n}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 100 - n)), blocked };
}

beforeEach(() => {
  h.blocks = [];
  h.mutes = [];
  h.calls = [];
  h.blockCount = 0;
  h.muteCount = 0;
});

describe('listBlocked / listMuted', () => {
  it('reads only the caller’s rows, newest first, with both counts', async () => {
    h.blocks = [block(1)];
    h.blockCount = 3;
    h.muteCount = 2;
    const page = await listBlocked('me');
    const args = h.calls[0]!.args as { where: Record<string, unknown>; orderBy: unknown };
    expect(args.where).toEqual({ blockerId: 'me' });
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(page.counts).toEqual({ blocked: 3, muted: 2 });
    expect(page.items[0]).toMatchObject({ userId: 'u1', handle: 'u1', deleted: false });

    h.mutes = [{ id: 'm1', createdAt: new Date(), muted: user('x') }];
    await listMuted('me');
    expect((h.calls[1]!.args as { where: unknown }).where).toEqual({ muterId: 'me' });
  });

  it('pages by (createdAt, id): 51 rows give a page of 50 and a cursor that continues after the last one', async () => {
    h.blocks = Array.from({ length: BLOCKED_MUTED_PAGE_SIZE + 1 }, (_, i) => block(i + 1));
    const page = await listBlocked('me');
    expect(page.items).toHaveLength(BLOCKED_MUTED_PAGE_SIZE);
    expect(page.nextCursor).toBe(
      encodeCursor(h.blocks[BLOCKED_MUTED_PAGE_SIZE - 1]!.createdAt as Date, `b${BLOCKED_MUTED_PAGE_SIZE}`),
    );
    expect((h.calls[0]!.args as { take: number }).take).toBe(BLOCKED_MUTED_PAGE_SIZE + 1);

    h.blocks = [block(60)];
    const last = await listBlocked('me', { after: page.nextCursor! });
    expect(last.nextCursor).toBeNull();
    const where = (h.calls[1]!.args as { where: { blockerId: string; OR: unknown[] } }).where;
    expect(where.blockerId).toBe('me');
    expect(where.OR).toEqual([
      { createdAt: { lt: expect.any(Date) } },
      { createdAt: expect.any(Date), id: { lt: `b${BLOCKED_MUTED_PAGE_SIZE}` } },
    ]);
  });

  it('refuses a malformed cursor', async () => {
    await expect(listBlocked('me', { after: '%%%' })).rejects.toBeInstanceOf(BlockedMutedCursorError);
  });

  it('filters by prefix on name, handle and display name, case-insensitively, ignoring a leading @', async () => {
    await listBlocked('me', { q: '@Ada' });
    const where = (h.calls[0]!.args as { where: { blocked: unknown } }).where;
    const starts = { startsWith: 'Ada', mode: 'insensitive' };
    expect(where.blocked).toEqual({
      OR: [{ name: starts }, { handle: starts }, { profile: { is: { displayName: starts } } }],
    });
    await listMuted('me', { q: '   ' });
    expect((h.calls[1]!.args as { where: Record<string, unknown> }).where).toEqual({ muterId: 'me' });
  });

  it('labels a deleted account and shows none of its details', async () => {
    h.blocks = [
      block(1, user('gone', { name: 'Deleted user', handle: null, username: null, image: null })),
      // The shared sentinel id is a tombstone whatever its row says.
      block(2, user('deleted-user', { name: 'Anything', handle: 'x', image: 'https://img/leak.png' })),
      block(3, user('real', { name: 'Deleted user', handle: 'someone' })),
    ];
    const { items } = await listBlocked('me');
    expect(items[0]).toMatchObject({ userId: 'gone', deleted: true, name: null, handle: null, image: null });
    expect(items[1]).toMatchObject({ userId: 'deleted-user', deleted: true, name: null, handle: null, image: null });
    expect(items[2]).toMatchObject({ deleted: false, handle: 'someone' });
  });
});

describe('explicit intent', () => {
  it('never creates a block (or mute) when the request says false', () => {
    expect(toggleAction(false, false)).toBe('none');
    expect(toggleAction(true, false)).toBe('delete');
  });
  it('does nothing when the state already matches, and creates only when asked', () => {
    expect(toggleAction(true, true)).toBe('none');
    expect(toggleAction(false, true)).toBe('create');
  });
  it('flips the current state when no intent is sent', () => {
    expect(toggleAction(true, undefined)).toBe('delete');
    expect(toggleAction(false, undefined)).toBe('create');
  });
});

describe('request and erasure shapes', () => {
  it('validates the query: tab defaults to blocked, filter is capped', () => {
    expect(blockedMutedQuery.parse({}).tab).toBe('blocked');
    expect(blockedMutedQuery.safeParse({ tab: 'other' }).success).toBe(false);
    expect(blockedMutedQuery.safeParse({ q: 'x'.repeat(65) }).success).toBe(false);
  });
  it('erases only the member’s own rows', () => {
    expect(blockMuteErasureOps('me')).toEqual([
      { model: 'userBlock', method: 'deleteMany', args: { where: { blockerId: 'me' } } },
      { model: 'userMute', method: 'deleteMany', args: { where: { muterId: 'me' } } },
    ]);
  });
});
