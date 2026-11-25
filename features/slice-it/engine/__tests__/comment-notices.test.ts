import { beforeEach, describe, expect, it, vi } from 'vitest';

// A comment on a Slice It song (s14-11): the uploader is told, in the Replies category; nobody else is, and nothing is
// written for the uploader's own comment, a block either way, a mute, a private or taken-down song, a banned uploader.

const db = vi.hoisted(() => ({
  songs: new Map<
    string,
    { id: string; title: string; uploadedBy: string; isPublic: boolean; takenDownAt: Date | null }
  >(),
  users: new Set<string>(['uploader', 'fan', 'other']),
  blocks: [] as { blockerId: string; blockedId: string }[],
  mutes: [] as { muterId: string; mutedId: string; expiresAt: Date | null }[],
  unavailable: new Set<string>(),
  failReads: false,
}));
const create = vi.hoisted(() => ({ fn: vi.fn(async (_input: Record<string, unknown>) => {}) }));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return {
    prisma: shapeChecked({
      song: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          if (db.failReads) throw new Error('database is down');
          return db.songs.get(where.id) ?? null;
        },
      },
      user: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          db.users.has(where.id)
            ? { id: where.id, name: `Name ${where.id}`, image: null, handle: where.id, profile: null }
            : null,
        findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.filter((id) => db.unavailable.has(id)).map((id) => ({ id })),
      },
      userBlock: {
        findMany: async ({ where }: { where: { OR: [{ blockerId: string }, { blockedId: string }] } }) => {
          const [a, b] = where.OR;
          return db.blocks.filter((x) => x.blockerId === a.blockerId || x.blockedId === b.blockedId);
        },
      },
      userMute: {
        findMany: async ({ where }: { where: { mutedId: string; muterId: { in: string[] } } }) =>
          db.mutes.filter(
            (m) =>
              m.mutedId === where.mutedId &&
              where.muterId.in.includes(m.muterId) &&
              (m.expiresAt === null || m.expiresAt.getTime() > Date.now()),
          ),
      },
    }),
  };
});
vi.mock('@/lib/notifications.server', () => ({ createNotification: create.fn }));

import { notifySongComment } from '@features/slice-it/engine/comment-notices.server';

beforeEach(() => {
  create.fn.mockClear();
  db.songs.clear();
  db.blocks.length = 0;
  db.mutes.length = 0;
  db.unavailable.clear();
  db.failReads = false;
  db.songs.set('S', { id: 'S', title: 'Night Drive', uploadedBy: 'uploader', isPublic: true, takenDownAt: null });
});

const comment = (commenterId = 'fan') => notifySongComment({ songId: 'S', commenterId });

describe('notifySongComment', () => {
  it('tells the uploader, in the Replies category, with the notice and a link to the library', async () => {
    expect(await comment()).toBe(true);
    expect(create.fn).toHaveBeenCalledOnce();
    expect(create.fn.mock.calls[0]![0]).toMatchObject({
      userId: 'uploader',
      actorId: 'fan',
      type: 'SYSTEM',
      category: 'replies',
      entityType: 'song',
      entityId: 'S',
      dedupeUnread: true,
      preview: { key: 'song-comment', params: { name: 'Name fan', title: 'Night Drive' } },
      link: '/slice-it?q=Night%20Drive',
    });
  });

  it('does not tell the uploader about their own comment', async () => {
    expect(await comment('uploader')).toBe(false);
    expect(create.fn).not.toHaveBeenCalled();
  });

  it('does not tell an uploader who blocked the commenter, or one the commenter blocked', async () => {
    db.blocks.push({ blockerId: 'uploader', blockedId: 'fan' });
    expect(await comment()).toBe(false);
    db.blocks.length = 0;
    db.blocks.push({ blockerId: 'fan', blockedId: 'uploader' });
    expect(await comment()).toBe(false);
    expect(create.fn).not.toHaveBeenCalled();
  });

  it('does not tell an uploader who muted the commenter, but does when the mute has ended or is for another member', async () => {
    db.mutes.push({ muterId: 'uploader', mutedId: 'fan', expiresAt: null });
    expect(await comment()).toBe(false);
    db.mutes.length = 0;
    db.mutes.push({ muterId: 'uploader', mutedId: 'fan', expiresAt: new Date(Date.now() - 1000) });
    db.mutes.push({ muterId: 'uploader', mutedId: 'other', expiresAt: null });
    expect(await comment()).toBe(true);
  });

  it('does not tell for a taken-down or private song', async () => {
    db.songs.set('S', { id: 'S', title: 'x', uploadedBy: 'uploader', isPublic: true, takenDownAt: new Date() });
    expect(await comment()).toBe(false);
    db.songs.set('S', { id: 'S', title: 'x', uploadedBy: 'uploader', isPublic: false, takenDownAt: null });
    expect(await comment()).toBe(false);
    expect(create.fn).not.toHaveBeenCalled();
  });

  it('does not tell a banned uploader or one waiting to be deleted', async () => {
    db.unavailable.add('uploader');
    expect(await comment()).toBe(false);
    expect(create.fn).not.toHaveBeenCalled();
  });

  it('says nothing for a song that no longer exists', async () => {
    expect(await notifySongComment({ songId: 'gone', commenterId: 'fan' })).toBe(false);
  });

  it('never throws: a failing read is logged and the comment stands', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.failReads = true;
    expect(await comment()).toBe(false);
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
