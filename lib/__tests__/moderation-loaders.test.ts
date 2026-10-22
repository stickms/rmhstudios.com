/**
 * The real loaders behind `getHiddenAuthorIds` / `getBlockedAuthorIds` and the
 * real `invalidateHiddenAuthors`, run through the real `cached` (in-process L1,
 * no Redis) against an in-memory Prisma double. Every other suite mocks this
 * module, so the "blocked by me OR blocked me" union and the read-after-write
 * invalidation were never executed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  blocks: [] as { blockerId: string; blockedId: string }[],
  mutes: [] as { muterId: string; mutedId: string }[],
  failBlocks: false,
  blockReads: 0,
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    userBlock: {
      findMany: async ({ where }: { where: { blockerId?: string; blockedId?: string } }) => {
        db.blockReads += 1;
        if (db.failBlocks) throw new Error('db down');
        return db.blocks.filter(
          (b) =>
            (where.blockerId === undefined || b.blockerId === where.blockerId) &&
            (where.blockedId === undefined || b.blockedId === where.blockedId),
        );
      },
    },
    userMute: {
      findMany: async ({ where }: { where: { muterId: string } }) =>
        db.mutes.filter((m) => m.muterId === where.muterId),
    },
  },
}));

import {
  getBlockedAuthorIds,
  getHiddenAuthorIds,
  getHiddenAuthorIdsStrict,
  invalidateHiddenAuthors,
} from '@/lib/moderation.server';

beforeEach(() => {
  db.blocks = [];
  db.mutes = [];
  db.failBlocks = false;
  db.blockReads = 0;
  // Fresh cache keys per test: the L1 lives for the process, so use unique users.
});

let n = 0;
const user = () => `u${++n}`;

describe('loaders: blocked by me or blocked me', () => {
  it('unions both directions, and only the hidden set carries mutes', async () => {
    const me = user();
    db.blocks = [
      { blockerId: me, blockedId: 'iBlocked' },
      { blockerId: 'blockedMe', blockedId: me },
      { blockerId: 'x', blockedId: 'y' }, // unrelated
    ];
    db.mutes = [{ muterId: me, mutedId: 'iMuted' }];

    expect((await getBlockedAuthorIds(me)).sort()).toEqual(['blockedMe', 'iBlocked']);
    expect((await getHiddenAuthorIds(me)).sort()).toEqual(['blockedMe', 'iBlocked', 'iMuted']);
    expect((await getHiddenAuthorIdsStrict(me)).sort()).toEqual(['blockedMe', 'iBlocked', 'iMuted']);
  });
});

describe('invalidateHiddenAuthors: read-after-write through the real cache', () => {
  it('blocking drops BOTH users cached sets', async () => {
    const a = user();
    const b = user();
    // Warm both caches while nobody is blocked.
    expect(await getBlockedAuthorIds(a)).toEqual([]);
    expect(await getBlockedAuthorIds(b)).toEqual([]);
    expect(await getHiddenAuthorIds(a)).toEqual([]);
    expect(await getHiddenAuthorIds(b)).toEqual([]);

    // a blocks b: the write, then the route's invalidation of both ids.
    db.blocks.push({ blockerId: a, blockedId: b });
    // Still warm: the stale answer is what the cache is for.
    expect(await getBlockedAuthorIds(a)).toEqual([]);

    invalidateHiddenAuthors(a, b);

    expect(await getBlockedAuthorIds(a)).toEqual([b]);
    expect(await getBlockedAuthorIds(b)).toEqual([a]);
    expect(await getHiddenAuthorIds(a)).toEqual([b]);
    expect(await getHiddenAuthorIds(b)).toEqual([a]);
  });

  it('invalidating only one side would leave the other stale (why both are passed)', async () => {
    const a = user();
    const b = user();
    await getBlockedAuthorIds(b);
    db.blocks.push({ blockerId: a, blockedId: b });
    invalidateHiddenAuthors(a);
    expect(await getBlockedAuthorIds(b)).toEqual([]);
  });
});

describe('getHiddenAuthorIdsStrict', () => {
  it('rejects when the block lookup fails, where getHiddenAuthorIds fails open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const me = user();
    db.failBlocks = true;
    expect(await getHiddenAuthorIds(me)).toEqual([]);
    await expect(getHiddenAuthorIdsStrict(me)).rejects.toThrow('db down');
  });

  it('anonymous viewers need no lookup', async () => {
    expect(await getHiddenAuthorIdsStrict(null)).toEqual([]);
  });
});
