/**
 * The announcement discussion: only announcement posts have one, posting is gated like an RMHark reply, and a
 * comment is deleted only by its author or an admin.
 */
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

const m =
  vi.hoisted(
    () => ({
      session:
        vi.fn(),
      postFind:
        vi.fn(),
      commentMany:
        vi.fn(),
      commentCount:
        vi.fn(),
      commentCreate:
        vi.fn(),
      commentFind:
        vi.fn(),
      commentUpdate:
        vi.fn(),
      ban: vi.fn(),
      restriction:
        vi.fn(),
    }),
  );

vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession:
          m.session,
      },
    },
  }),
);
vi.mock(
  '@/lib/rate-limit.server',
  () => ({
    withRateLimitAsync:
      async () =>
        null,
  }),
);
vi.mock(
  '@/lib/prisma.server',
  () => ({
    prisma:
      {
        blogPost:
          {
            findFirst:
              m.postFind,
          },
        blogComment:
          {
            findMany:
              m.commentMany,
            count:
              m.commentCount,
            create:
              m.commentCreate,
            findFirst:
              m.commentFind,
            update:
              m.commentUpdate,
          },
      },
  }),
);
vi.mock(
  '@/lib/admin-audit.server',
  () => ({
    getActiveBan:
      m.ban,
  }),
);
vi.mock(
  '@/lib/moderation/restrictions.server',
  () => ({
    restrictionResponse:
      m.restriction,
  }),
);
vi.mock(
  '@/lib/moderation/auto-moderate.server',
  () => ({
    screenNewContent:
      vi.fn(),
  }),
);

import { route as listRoute } from '@/lib/blog/api/blog.$slug.comments.server';
import { route as deleteRoute } from '@/lib/blog/api/blog.comments.$id.server';
import { canDeleteComment } from '@/lib/blog/blog-comments.server';
import { createBlogCommentSchema } from '@/lib/blog/blog-comments-schema';

type Handler =
  (ctx: {
    request: Request;
    params: Record<
      string,
      string
    >;
  }) => Promise<Response>;
const get =
  handlersOf<Handler>(
    listRoute,
  )
    .GET as Handler;
const post =
  handlersOf<Handler>(
    listRoute,
  )
    .POST as Handler;
const del =
  handlersOf<Handler>(
    deleteRoute,
  )
    .DELETE as Handler;

const url =
  'https://rmhstudios.com/api/blog/hello/comments';
const req =
  (
    method: string,
    body?: unknown,
  ) =>
    new Request(
      url,
      {
        method,
        headers:
          {
            cookie:
              'better-auth.session_token=abc',
            'content-type':
              'application/json',
          },
        ...(body ===
        undefined
          ? {}
          : {
              body: JSON.stringify(
                body,
              ),
            }),
      },
    );
const signIn =
  (
    id: string,
    isAdmin = false,
  ) =>
    m.session.mockResolvedValue(
      {
        user: {
          id,
          isAdmin,
        },
        session:
          {
            id: 's',
          },
      },
    );

const row =
  (
    over: Record<
      string,
      unknown
    > = {},
  ) => ({
    id: 'c1',
    content:
      'hi',
    createdAt:
      new Date(
        '2026-11-18T00:00:00Z',
      ),
    userId:
      'author',
    user: {
      id: 'author',
      name: 'A',
      image:
        null,
      username:
        'a',
      handle:
        'a',
      isVerified: false,
      isAdmin: false,
    },
    ...over,
  });

beforeEach(
  () => {
    vi.clearAllMocks();
    m.session.mockResolvedValue(
      null,
    );
    m.ban.mockResolvedValue(
      null,
    );
    m.restriction.mockResolvedValue(
      null,
    );
    m.postFind.mockResolvedValue(
      {
        id: 'bp1',
      },
    );
    m.commentMany.mockResolvedValue(
      [],
    );
    m.commentCount.mockResolvedValue(
      0,
    );
  },
);

describe('comment body schema', () => {
  it('trims, and requires 1 to 2000 characters', () => {
    expect(
      createBlogCommentSchema.parse(
        {
          content:
            '  hi  ',
        },
      )
        .content,
    ).toBe(
      'hi',
    );
    expect(
      createBlogCommentSchema.safeParse(
        {
          content:
            '   ',
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      createBlogCommentSchema.safeParse(
        {
          content:
            'x'.repeat(
              2001,
            ),
        },
      )
        .success,
    ).toBe(
      false,
    );
    expect(
      createBlogCommentSchema.safeParse(
        {
          content:
            'x'.repeat(
              2000,
            ),
        },
      )
        .success,
    ).toBe(
      true,
    );
  });
});

describe('canDeleteComment', () => {
  it('is the author or an admin, never anyone else', () => {
    expect(
      canDeleteComment(
        {
          id: 'a',
          isAdmin: false,
        },
        'a',
      ),
    ).toBe(
      true,
    );
    expect(
      canDeleteComment(
        {
          id: 'z',
          isAdmin: true,
        },
        'a',
      ),
    ).toBe(
      true,
    );
    expect(
      canDeleteComment(
        {
          id: 'z',
          isAdmin: false,
        },
        'a',
      ),
    ).toBe(
      false,
    );
    expect(
      canDeleteComment(
        null,
        'a',
      ),
    ).toBe(
      false,
    );
  });
});

describe('GET /api/blog/$slug/comments', () => {
  it('404s unless the post is an announcement', async () => {
    m.postFind.mockResolvedValue(
      null,
    );
    const res =
      await get(
        {
          request:
            req(
              'GET',
            ),
          params:
            {
              slug: 'hello',
            },
        },
      );
    expect(
      res.status,
    ).toBe(
      404,
    );
    expect(
      m.postFind,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          where:
            expect.objectContaining(
              {
                slug: 'hello',
                announcement: true,
                // a draft or scheduled announcement has no discussion yet (s03-05)
                status:
                  'published',
              },
            ),
        },
      ),
    );
    expect(
      m.commentMany,
    ).not.toHaveBeenCalled();
  });

  it('lists live comments oldest first and marks which the viewer may delete', async () => {
    signIn(
      'author',
    );
    m.commentMany.mockResolvedValue(
      [
        row(),
        row(
          {
            id: 'c2',
            userId:
              'other',
          },
        ),
      ],
    );
    m.commentCount.mockResolvedValue(
      2,
    );
    const res =
      await get(
        {
          request:
            req(
              'GET',
            ),
          params:
            {
              slug: 'hello',
            },
        },
      );
    expect(
      res.status,
    ).toBe(
      200,
    );
    const body =
      (await res.json()) as {
        comments: {
          id: string;
          canDelete: boolean;
        }[];
        total: number;
      };
    expect(
      body.total,
    ).toBe(
      2,
    );
    expect(
      body.comments.map(
        (
          c,
        ) => [
          c.id,
          c.canDelete,
        ],
      ),
    ).toEqual(
      [
        [
          'c1',
          true,
        ],
        [
          'c2',
          false,
        ],
      ],
    );
    expect(
      m.commentMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          where:
            {
              postId:
                'bp1',
              deletedAt:
                null,
            },
          orderBy:
            [
              {
                createdAt:
                  'asc',
              },
              {
                id: 'asc',
              },
            ],
          take: 200,
        },
      ),
    );
  });

  it('lets a signed-out viewer read, with nothing deletable', async () => {
    m.commentMany.mockResolvedValue(
      [
        row(),
      ],
    );
    const res =
      await get(
        {
          request:
            req(
              'GET',
            ),
          params:
            {
              slug: 'hello',
            },
        },
      );
    const body =
      (await res.json()) as {
        comments: {
          canDelete: boolean;
        }[];
      };
    expect(
      res.status,
    ).toBe(
      200,
    );
    expect(
      body
        .comments[0]
        ?.canDelete,
    ).toBe(
      false,
    );
  });
});

describe('POST /api/blog/$slug/comments', () => {
  it('requires a signed-in user', async () => {
    const res =
      await post(
        {
          request:
            req(
              'POST',
              {
                content:
                  'hi',
              },
            ),
          params:
            {
              slug: 'hello',
            },
        },
      );
    expect(
      res.status,
    ).toBe(
      401,
    );
    expect(
      m.commentCreate,
    ).not.toHaveBeenCalled();
  });

  it('rejects an empty or oversized comment', async () => {
    signIn(
      'u1',
    );
    for (const content of [
      '   ',
      'x'.repeat(
        2001,
      ),
    ]) {
      const res =
        await post(
          {
            request:
              req(
                'POST',
                {
                  content,
                },
              ),
            params:
              {
                slug: 'hello',
              },
          },
        );
      expect(
        res.status,
      ).toBe(
        400,
      );
    }
    expect(
      m.commentCreate,
    ).not.toHaveBeenCalled();
  });

  it('refuses a suspended account and a user timed out of replying', async () => {
    signIn(
      'u1',
    );
    m.ban.mockResolvedValue(
      {
        reason:
          'spam',
      },
    );
    expect(
      (
        await post(
          {
            request:
              req(
                'POST',
                {
                  content:
                    'hi',
                },
              ),
            params:
              {
                slug: 'hello',
              },
          },
        )
      )
        .status,
    ).toBe(
      403,
    );
    m.ban.mockResolvedValue(
      null,
    );
    m.restriction.mockResolvedValue(
      Response.json(
        {
          code: 'feature_restricted',
        },
        {
          status: 403,
        },
      ),
    );
    expect(
      (
        await post(
          {
            request:
              req(
                'POST',
                {
                  content:
                    'hi',
                },
              ),
            params:
              {
                slug: 'hello',
              },
          },
        )
      )
        .status,
    ).toBe(
      403,
    );
    expect(
      m.restriction,
    ).toHaveBeenCalledWith(
      'u1',
      'comment',
    );
    expect(
      m.commentCreate,
    ).not.toHaveBeenCalled();
  });

  it('404s on a post that is not an announcement', async () => {
    signIn(
      'u1',
    );
    m.postFind.mockResolvedValue(
      null,
    );
    const res =
      await post(
        {
          request:
            req(
              'POST',
              {
                content:
                  'hi',
              },
            ),
          params:
            {
              slug: 'hello',
            },
        },
      );
    expect(
      res.status,
    ).toBe(
      404,
    );
    expect(
      m.commentCreate,
    ).not.toHaveBeenCalled();
  });

  it('creates the trimmed comment on the post', async () => {
    signIn(
      'author',
    );
    m.commentCreate.mockResolvedValue(
      row(),
    );
    const res =
      await post(
        {
          request:
            req(
              'POST',
              {
                content:
                  '  hi  ',
              },
            ),
          params:
            {
              slug: 'hello',
            },
        },
      );
    expect(
      res.status,
    ).toBe(
      201,
    );
    expect(
      m.commentCreate,
    ).toHaveBeenCalledWith(
      expect.objectContaining(
        {
          data: {
            postId:
              'bp1',
            userId:
              'author',
            content:
              'hi',
          },
        },
      ),
    );
  });
});

describe('DELETE /api/blog/comments/$id', () => {
  const call =
    () =>
      del(
        {
          request:
            req(
              'DELETE',
            ),
          params:
            {
              id: 'c1',
            },
        },
      );

  it('lets the author soft delete', async () => {
    signIn(
      'author',
    );
    m.commentFind.mockResolvedValue(
      {
        id: 'c1',
        userId:
          'author',
      },
    );
    expect(
      (
        await call()
      )
        .status,
    ).toBe(
      200,
    );
    expect(
      m.commentUpdate,
    ).toHaveBeenCalledWith(
      {
        where:
          {
            id: 'c1',
          },
        data: {
          deletedAt:
            expect.any(
              Date,
            ),
        },
      },
    );
  });

  it('lets an admin delete someone else’s comment', async () => {
    signIn(
      'admin',
      true,
    );
    m.commentFind.mockResolvedValue(
      {
        id: 'c1',
        userId:
          'author',
      },
    );
    expect(
      (
        await call()
      )
        .status,
    ).toBe(
      200,
    );
  });

  it('answers 404 for another member, and for a comment that is gone', async () => {
    signIn(
      'stranger',
    );
    m.commentFind.mockResolvedValue(
      {
        id: 'c1',
        userId:
          'author',
      },
    );
    expect(
      (
        await call()
      )
        .status,
    ).toBe(
      404,
    );
    m.commentFind.mockResolvedValue(
      null,
    );
    expect(
      (
        await call()
      )
        .status,
    ).toBe(
      404,
    );
    expect(
      m.commentUpdate,
    ).not.toHaveBeenCalled();
  });

  it('requires sign in', async () => {
    expect(
      (
        await call()
      )
        .status,
    ).toBe(
      401,
    );
  });
});
