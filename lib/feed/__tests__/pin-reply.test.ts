import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinning one reply to the top of a post: only the post's author may, the reply must be a visible direct reply to that
// post, and hiding or deleting the pinned reply unpins it.

interface PostRow {
  userId: string;
  deletedAt: Date | null;
  pinnedCommentId: string | null;
}
interface CommentRow {
  rmheetId: string;
  userId: string;
  parentId: string | null;
  hiddenAt: Date | null;
  deletedAt: Date | null;
}
const db = vi.hoisted(() => ({
  posts: new Map<string, unknown>(),
  comments: new Map<string, unknown>(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rMHark: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
          };
        }) => db.posts.get(where.id) ?? null,
      ),
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
          Object.assign(db.posts.get(where.id) as PostRow, data);
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: {
            id: string;
            pinnedCommentId: string;
          };
          data: Partial<PostRow>;
        }) => {
          const p = db.posts.get(where.id) as PostRow | undefined;
          if (p && p.pinnedCommentId === where.pinnedCommentId) Object.assign(p, data);
        },
      ),
    },
    rMHarkComment: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
          };
        }) => {
          const c = db.comments.get(where.id) as CommentRow | undefined;
          if (!c) return null;
          // setReplyHidden reads the post author through the relation; pinReply reads the flags.
          return {
            ...c,
            rmhark: {
              userId: (db.posts.get(c.rmheetId) as PostRow).userId,
            },
          };
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: {
            id: string;
          };
          data: Partial<CommentRow>;
        }) => {
          Object.assign(db.comments.get(where.id) as CommentRow, data);
        },
      ),
    },
  },
}));
vi.mock('@/lib/api/implement.server', () => ({
  implement: (_contract: unknown, _options: unknown, handler: unknown) => handler,
}));
vi.mock('@/lib/admin-audit.server', () => ({
  logAdminAction: vi.fn(),
}));

const { pinReply, unpinReply } = await import('@/lib/feed/conversation-controls.server');
const { setReplyHidden } = await import('@/lib/feed/hidden-replies.server');
const { route: deleteRoute } = await import('@/lib/feed/api/rmharks.$id.comment.$commentId.server');

const post = (id: string) => db.posts.get(id) as PostRow;

beforeEach(() => {
  db.posts.clear();
  db.comments.clear();
  db.posts.set('p1', {
    userId: 'author',
    deletedAt: null,
    pinnedCommentId: null,
  });
  db.posts.set('p2', {
    userId: 'author',
    deletedAt: null,
    pinnedCommentId: null,
  });
  db.posts.set('gone', {
    userId: 'author',
    deletedAt: new Date(),
    pinnedCommentId: null,
  });
  const reply = (rmheetId: string, over: Partial<CommentRow> = {}): CommentRow => ({
    rmheetId,
    userId: 'reader',
    parentId: null,
    hiddenAt: null,
    deletedAt: null,
    ...over,
  });
  db.comments.set('c1', reply('p1'));
  db.comments.set('c2', reply('p1'));
  db.comments.set('other', reply('p2'));
  db.comments.set(
    'hidden',
    reply('p1', {
      hiddenAt: new Date(),
    }),
  );
  db.comments.set(
    'deleted',
    reply('p1', {
      deletedAt: new Date(),
    }),
  );
  db.comments.set(
    'nested',
    reply('p1', {
      parentId: 'c1',
    }),
  );
});

describe('pinReply', () => {
  it('pins a reply for the post’s author, and pinning another replaces it', async () => {
    expect(await pinReply('p1', 'c1', 'author')).toEqual({
      ok: true,
      pinnedReplyId: 'c1',
    });
    expect(post('p1').pinnedCommentId).toBe('c1');
    await pinReply('p1', 'c2', 'author');
    expect(post('p1').pinnedCommentId).toBe('c2');
  });

  it('refuses anyone but the author, and changes nothing', async () => {
    const result = await pinReply('p1', 'c1', 'reader');
    expect(result).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(post('p1').pinnedCommentId).toBeNull();
  });

  it('refuses a reply that belongs to another post', async () => {
    expect(await pinReply('p1', 'other', 'author')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(await pinReply('p1', 'missing', 'author')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(post('p1').pinnedCommentId).toBeNull();
  });

  it('refuses a hidden or deleted reply, a reply to a reply, and a deleted post', async () => {
    expect(await pinReply('p1', 'hidden', 'author')).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(await pinReply('p1', 'deleted', 'author')).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(await pinReply('p1', 'nested', 'author')).toMatchObject({
      ok: false,
      status: 422,
    });
    expect(await pinReply('gone', 'c1', 'author')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(post('p1').pinnedCommentId).toBeNull();
  });
});

describe('unpinReply', () => {
  it('is the author’s only', async () => {
    await pinReply('p1', 'c1', 'author');
    expect(await unpinReply('p1', 'reader')).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(post('p1').pinnedCommentId).toBe('c1');
    expect(await unpinReply('p1', 'author')).toEqual({
      ok: true,
      pinnedReplyId: null,
    });
    expect(post('p1').pinnedCommentId).toBeNull();
  });
});

describe('hiding or deleting the pinned reply', () => {
  it('hiding it unpins it; hiding another reply leaves the pin', async () => {
    await pinReply('p1', 'c1', 'author');
    await setReplyHidden('p1', 'c2', 'author', true);
    expect(post('p1').pinnedCommentId).toBe('c1');
    await setReplyHidden('p1', 'c1', 'author', true);
    expect(post('p1').pinnedCommentId).toBeNull();
  });

  it('unhiding does not pin again', async () => {
    await setReplyHidden('p1', 'c1', 'author', true);
    await setReplyHidden('p1', 'c1', 'author', false);
    expect(post('p1').pinnedCommentId).toBeNull();
  });

  it('deleting it unpins it', async () => {
    await pinReply('p1', 'c1', 'author');
    const del = deleteRoute.handlers.DELETE as unknown as (ctx: {
      params: {
        id: string;
        commentId: string;
      };
      session: {
        user: {
          id: string;
          isAdmin?: boolean;
        };
      };
    }) => Promise<Response>;
    const res = await del({
      params: {
        id: 'p1',
        commentId: 'c1',
      },
      session: {
        user: {
          id: 'reader',
        },
      },
    });
    expect(res.status).toBe(200);
    expect(post('p1').pinnedCommentId).toBeNull();
  });
});
