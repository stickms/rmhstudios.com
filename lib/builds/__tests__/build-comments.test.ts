import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Build comments (s06-14): the author's edit window and delete, the creator's hide and lock, admin delete, blocks and
 * bans on comment and reply, the list's deleted-text rule and the private-build gate. Prisma is mocked.
 */

const db = vi.hoisted(() => {
  const fn = () => vi.fn();
  const tx = {
    userBuild: {
      findUnique: fn(),
      update: fn(),
      updateMany: fn(),
    },
    buildComment: {
      create: fn(),
      updateMany: fn(),
    },
  };
  return {
    tx,
    userBuild: {
      findUnique: fn(),
      updateMany: fn(),
    },
    buildComment: {
      findFirst: fn(),
      findMany: fn(),
      updateMany: fn(),
    },
    user: {
      findUnique: fn(),
    },
    $executeRaw: fn(),
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
  };
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: db,
}));
const blocked = vi.hoisted(() => vi.fn());
vi.mock('@/lib/messages/send.server', () => ({
  isBlockedPair: blocked,
}));
const audit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: audit,
}));
vi.mock('@/lib/user-display', () => ({
  userDisplaySelect: {},
  resolveUser: (u: { id: string; name?: string }) => ({
    id: u.id,
    name: u.name ?? null,
    image: null,
  }),
}));

import {
  canReadBuildComments,
  commentRefusal,
  createComment,
  deleteComment,
  editComment,
  hideComment,
  listComments,
  setCommentsLocked,
} from '@/lib/builds/comments.server';

const build = {
  id: 'b1',
  userId: 'creator',
  visibility: 'PUBLIC',
  commentsLocked: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  blocked.mockResolvedValue(false);
  db.user.findUnique.mockResolvedValue({
    bannedUntil: null,
  });
  db.tx.userBuild.findUnique.mockResolvedValue({
    commentsLocked: false,
  });
  db.tx.buildComment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'c-new',
    ...data,
    createdAt: new Date('2026-11-20T10:00:00Z'),
    updatedAt: new Date('2026-11-20T10:00:00Z'),
    user: {
      id: data.userId,
    },
  }));
});

describe('editComment', () => {
  it('writes inside the window with the database clock, scoped to the build and the author', async () => {
    db.$executeRaw.mockResolvedValue(1);
    const r = await editComment('b1', 'c1', 'author', 'fixed');
    expect(r).toEqual({
      ok: true,
      content: 'fixed',
    });
    const [strings, ...values] = db.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join('?');
    expect(sql).toContain('UPDATE "build_comment"');
    expect(sql).toContain('"editedAt" = now()');
    expect(sql).toContain('"createdAt" > now()');
    expect(sql).toContain('"buildId"');
    expect(sql).toContain('"userId"');
    expect(sql).toContain('"deletedAt" IS NULL');
    expect(values).toEqual(expect.arrayContaining(['c1', 'b1', 'author', 'fixed', 30]));
  });

  it('refuses after 30 minutes (the update matches nothing) with 409', async () => {
    db.$executeRaw.mockResolvedValue(0);
    db.buildComment.findFirst.mockResolvedValue({
      userId: 'author',
    });
    expect(await editComment('b1', 'c1', 'author', 'late')).toMatchObject({
      ok: false,
      status: 409,
    });
  });

  it("refuses another member's edit with 403 and a missing comment with 404", async () => {
    db.$executeRaw.mockResolvedValue(0);
    db.buildComment.findFirst.mockResolvedValueOnce({
      userId: 'someone-else',
    });
    expect(await editComment('b1', 'c1', 'author', 'x')).toMatchObject({
      ok: false,
      status: 403,
    });
    db.buildComment.findFirst.mockResolvedValueOnce(null);
    expect(await editComment('b1', 'c1', 'author', 'x')).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe('deleteComment', () => {
  it("refuses another member's delete", async () => {
    db.buildComment.findFirst.mockResolvedValue({
      userId: 'author',
    });
    expect(await deleteComment('b1', 'c1', 'stranger', false)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('the author deletes: soft, deletedBy author, count down once', async () => {
    db.buildComment.findFirst.mockResolvedValue({
      userId: 'author',
    });
    db.tx.buildComment.updateMany.mockResolvedValue({
      count: 1,
    });
    expect(await deleteComment('b1', 'c1', 'author', false)).toEqual({
      ok: true,
    });
    expect(db.tx.buildComment.updateMany.mock.calls[0]![0]).toMatchObject({
      where: {
        id: 'c1',
        buildId: 'b1',
        deletedAt: null,
      },
      data: {
        deletedBy: 'author',
      },
    });
    expect(db.tx.userBuild.updateMany).toHaveBeenCalledTimes(1);
    expect(db.tx.userBuild.updateMany.mock.calls[0]![0]).toMatchObject({
      data: {
        commentCount: {
          decrement: 1,
        },
      },
    });
    expect(audit).not.toHaveBeenCalled();
  });

  it('a lost compare-and-set does not decrement again', async () => {
    db.buildComment.findFirst.mockResolvedValue({
      userId: 'author',
    });
    db.tx.buildComment.updateMany.mockResolvedValue({
      count: 0,
    });
    await deleteComment('b1', 'c1', 'author', false);
    expect(db.tx.userBuild.updateMany).not.toHaveBeenCalled();
  });

  it('an admin delete is marked moderator and audited in the same transaction', async () => {
    db.buildComment.findFirst.mockResolvedValue({
      userId: 'author',
    });
    db.tx.buildComment.updateMany.mockResolvedValue({
      count: 1,
    });
    await deleteComment('b1', 'c1', 'admin-1', true);
    expect(db.tx.buildComment.updateMany.mock.calls[0]![0]).toMatchObject({
      data: {
        deletedBy: 'moderator',
      },
    });
    expect(audit).toHaveBeenCalledWith(
      db.tx,
      'admin-1',
      'build.comment.delete',
      expect.objectContaining({
        targetId: 'c1',
      }),
    );
  });
});

describe('hideComment and setCommentsLocked', () => {
  it('hides with a write scoped to the build creator, and unhides', async () => {
    db.buildComment.updateMany.mockResolvedValue({
      count: 1,
    });
    expect(await hideComment('b1', 'c1', 'creator', true)).toEqual({
      ok: true,
      hidden: true,
    });
    expect(db.buildComment.updateMany.mock.calls[0]![0]).toMatchObject({
      where: {
        id: 'c1',
        buildId: 'b1',
        build: {
          userId: 'creator',
        },
      },
      data: {
        hiddenById: 'creator',
      },
    });
    await hideComment('b1', 'c1', 'creator', false);
    expect(db.buildComment.updateMany.mock.calls[1]![0]).toMatchObject({
      data: {
        hiddenAt: null,
        hiddenById: null,
      },
    });
  });

  it('a non-creator cannot hide', async () => {
    db.buildComment.updateMany.mockResolvedValue({
      count: 0,
    });
    db.userBuild.findUnique.mockResolvedValue({
      userId: 'creator',
    });
    expect(await hideComment('b1', 'c1', 'stranger', true)).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('only the creator locks', async () => {
    db.userBuild.updateMany.mockResolvedValueOnce({
      count: 1,
    });
    expect(await setCommentsLocked('b1', 'creator', true)).toEqual({
      ok: true,
      locked: true,
    });
    expect(db.userBuild.updateMany.mock.calls[0]![0]).toMatchObject({
      where: {
        id: 'b1',
        userId: 'creator',
      },
    });
    db.userBuild.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    db.userBuild.findUnique.mockResolvedValue({
      id: 'b1',
    });
    expect(await setCommentsLocked('b1', 'stranger', true)).toMatchObject({
      ok: false,
      status: 403,
    });
  });
});

describe('commenting', () => {
  it('a locked build refuses a comment and a reply, whoever asks', async () => {
    const locked = {
      ...build,
      commentsLocked: true,
    };
    expect(
      await createComment(locked, 'm1', {
        content: 'hi',
      }),
    ).toMatchObject({
      ok: false,
      status: 403,
      error: 'Comments are closed',
    });
    expect(
      await createComment(locked, 'creator', {
        content: 'hi',
        parentId: 'c1',
      }),
    ).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(db.tx.buildComment.create).not.toHaveBeenCalled();
  });

  it('a lock that lands between the check and the write still refuses', async () => {
    db.tx.userBuild.findUnique.mockResolvedValue({
      commentsLocked: true,
    });
    expect(
      await createComment(build, 'm1', {
        content: 'hi',
      }),
    ).toMatchObject({
      ok: false,
      error: 'Comments are closed',
    });
    expect(db.tx.buildComment.create).not.toHaveBeenCalled();
  });

  it('a block either way refuses, with no reason given', async () => {
    blocked.mockResolvedValue(true);
    const r = await createComment(build, 'm1', {
      content: 'hi',
    });
    expect(r).toMatchObject({
      ok: false,
      status: 403,
      error: 'You cannot comment here',
    });
    expect(blocked).toHaveBeenCalledWith('m1', 'creator');
  });

  it('a banned member is refused', async () => {
    db.user.findUnique.mockResolvedValue({
      bannedUntil: new Date(Date.now() + 86_400_000),
    });
    expect(await commentRefusal(build, 'm1')).toBe('restricted');
    db.user.findUnique.mockResolvedValue({
      bannedUntil: new Date(Date.now() - 1000),
    });
    expect(await commentRefusal(build, 'm1')).toBeNull();
  });

  it('a reply to a member who blocked you is refused', async () => {
    db.buildComment.findFirst.mockResolvedValue({
      userId: 'parent-author',
    });
    blocked.mockImplementation(async (_a: string, b: string) => b === 'parent-author');
    expect(
      await createComment(build, 'm1', {
        content: 'hi',
        parentId: 'c1',
      }),
    ).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(db.tx.buildComment.create).not.toHaveBeenCalled();
  });

  it('a reply to a deleted or foreign comment is 404', async () => {
    db.buildComment.findFirst.mockResolvedValue(null);
    expect(
      await createComment(build, 'm1', {
        content: 'hi',
        parentId: 'gone',
      }),
    ).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(db.buildComment.findFirst.mock.calls[0]![0]).toMatchObject({
      where: {
        id: 'gone',
        buildId: 'b1',
        deletedAt: null,
      },
    });
  });

  it('posts and counts', async () => {
    const r = await createComment(build, 'm1', {
      content: '  hi  ',
    });
    expect(r).toMatchObject({
      ok: true,
      content: 'hi',
    });
    expect(db.tx.userBuild.update).toHaveBeenCalledWith({
      where: {
        id: 'b1',
      },
      data: {
        commentCount: {
          increment: 1,
        },
      },
    });
  });
});

describe('listing', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'c',
    userId: 'u1',
    content: 'words',
    createdAt: new Date('2026-11-20T10:00:00Z'),
    updatedAt: new Date('2026-11-20T10:00:00Z'),
    editedAt: null,
    deletedAt: null,
    hiddenAt: null,
    user: {
      id: 'u1',
    },
    replies: [],
    _count: {
      replies: 0,
    },
    ...over,
  });

  it("never returns a deleted comment's content, and drops one with no replies", async () => {
    db.buildComment.findMany.mockResolvedValue([
      row({
        id: 'a',
        deletedAt: new Date(),
        content: 'secret words',
        _count: {
          replies: 1,
        },
        replies: [
          row({
            id: 'r1',
          }),
        ],
      }),
      row({
        id: 'b',
        deletedAt: new Date(),
        content: 'also secret',
      }),
      row({
        id: 'c',
        content: 'kept',
      }),
    ]);
    const out = await listComments({
      build,
      viewerId: 'v',
      isAdmin: false,
      cursor: null,
      limit: 20,
    });
    expect(out.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(out.items[0]).toMatchObject({
      state: 'deleted',
      content: '',
      user: {
        id: '',
        name: null,
        image: null,
      },
    });
    expect(JSON.stringify(out)).not.toContain('secret');
  });

  it('computes rights on the server from the row and the build', async () => {
    db.buildComment.findMany.mockResolvedValue([
      row({
        id: 'mine',
        userId: 'v',
        user: {
          id: 'v',
        },
        createdAt: new Date(),
      }),
      row({
        id: 'theirs',
      }),
    ]);
    const out = await listComments({
      build: {
        ...build,
        userId: 'v',
      },
      viewerId: 'v',
      isAdmin: false,
      cursor: null,
      limit: 20,
    });
    expect(out.items[0]).toMatchObject({
      canEdit: true,
      canDelete: true,
      canHide: false,
      canReport: false,
    });
    expect(out.items[1]).toMatchObject({
      canEdit: false,
      canDelete: false,
      canHide: true,
      canReport: true,
    });
    expect(out.canLock).toBe(true);
  });
});

describe('private builds', () => {
  const priv = {
    ...build,
    visibility: 'PRIVATE',
  };
  it('answer only to the creator and admins', () => {
    expect(canReadBuildComments(priv, null, false)).toBe(false);
    expect(canReadBuildComments(priv, 'stranger', false)).toBe(false);
    expect(canReadBuildComments(priv, 'creator', false)).toBe(true);
    expect(canReadBuildComments(priv, 'someone', true)).toBe(true);
    expect(
      canReadBuildComments(
        {
          ...build,
          visibility: 'UNLISTED',
        },
        null,
        false,
      ),
    ).toBe(true);
  });
});
