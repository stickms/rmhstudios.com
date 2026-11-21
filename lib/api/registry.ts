/**
 * Central registry of every public v1 endpoint.
 *
 * This is the single source of truth that drives BOTH the machine-readable
 * OpenAPI document (`/api/v1/openapi.json`) AND the human-readable wiki
 * reference pages. Keeping one list means the spec, the docs, and the routes
 * never drift apart. It is a pure module (no server imports) so it can be
 * imported on the client (wiki) and unit-tested.
 */

export const API_BASE_URL =
  'https://rmhstudios.com';
export const API_VERSION =
  'v1';

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PATCH'
  | 'DELETE';

export interface ApiParam {
  name: string;
  in:
    | 'path'
    | 'query';
  required?: boolean;
  type:
    | 'string'
    | 'integer'
    | 'boolean';
  description: string;
}

export interface ApiBodyField {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface ApiEndpoint {
  method: HttpMethod;
  /** OpenAPI-style path with `{param}` placeholders, e.g. `/api/v1/users/{handle}`. */
  path: string;
  operationId: string;
  /** Group used for wiki sections + the OpenAPI tag. */
  group: string;
  summary: string;
  description: string;
  /** Required scope, or null for unauthenticated/meta endpoints. */
  scope:
    | string
    | null;
  params?: ApiParam[];
  requestBody?: {
    contentType?: string;
    fields?: ApiBodyField[];
    example?: unknown;
  };
  /** Success status code (default 200). */
  status?: number;
  /** Example success body shown in docs + OpenAPI. */
  responseExample?: unknown;
  /** Keyset-paginated list endpoint (adds limit/cursor params + envelope note). */
  paginated?: boolean;
  /** Honors the Idempotency-Key header. */
  idempotent?: boolean;
}

const PAGE_PARAMS: ApiParam[] =
  [
    {
      name: 'limit',
      in: 'query',
      type: 'integer',
      description:
        'Page size, 1–50 (default 20).',
    },
    {
      name: 'cursor',
      in: 'query',
      type: 'string',
      description:
        'Opaque cursor from a previous `nextCursor` to fetch the next page.',
    },
  ];

/** Appended to every endpoint description that returns another member's posts (sprint 04 #14). */
const QUIET_COUNTS_NOTE =
  '`metrics` fields are `null` on a post whose author hides the counts on their posts from other accounts (your own posts always carry them); see the `PostMetrics` schema.';

/** Appended to the endpoints that return a post by id or the caller's own posts (sprint 05 #19). */
const PIN_NOTE =
  '`pinnedOrder` is the post’s place among its author’s pinned profile posts (1 is the top, at most 3), or `null` when it is not pinned.';

const POST_OBJECT =
  {
    id: 'ck_post123',
    content:
      'hello world',
    audience:
      'PUBLIC',
    createdAt:
      '2026-06-30T10:00:00.000Z',
    metrics:
      {
        likes: 3,
        comments: 1,
        reposts: 0,
        views: 42,
      },
  };

const AUTHOR_OBJECT =
  {
    id: 'ck_user123',
    name: 'Ada',
    handle:
      'ada',
    image:
      'https://…',
  };

export const ENDPOINTS: ApiEndpoint[] =
  [
    // ─── Account ────────────────────────────────────────────────────────────
    {
      method:
        'GET',
      path: '/api/v1/me',
      operationId:
        'getMe',
      group:
        'Account',
      scope:
        'read:profile',
      summary:
        'Get your account',
      description:
        'The authenticated key owner’s account summary, tier, and stats.',
      responseExample:
        {
          id: 'ck_user123',
          name: 'Ada',
          handle:
            'ada',
          image:
            'https://…',
          createdAt:
            '2026-01-02T03:04:05.000Z',
          tier: 'pro',
          stats:
            {
              coins: 1234,
              xp: 5200,
              level: 7,
              followers: 12,
              following: 30,
              posts: 88,
            },
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/me/notifications',
      operationId:
        'listMyNotifications',
      group:
        'Account',
      scope:
        'read:notifications',
      summary:
        'List your notifications',
      description:
        'Your notifications, newest first.',
      paginated: true,
      params:
        PAGE_PARAMS,
      responseExample:
        {
          data: [
            {
              id: 'ck_n1',
              type: 'FOLLOW',
              actor:
                AUTHOR_OBJECT,
              preview:
                null,
              link: '/u/ada',
              read: false,
              createdAt:
                '2026-06-30T09:00:00.000Z',
            },
          ],
          nextCursor:
            null,
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/me/bookmarks',
      operationId:
        'listMyBookmarks',
      group:
        'Account',
      scope:
        'read:bookmarks',
      summary:
        'List your bookmarks',
      description:
        'Posts you have bookmarked, newest first. ' +
        QUIET_COUNTS_NOTE,
      paginated: true,
      params:
        PAGE_PARAMS,
      responseExample:
        {
          data: [
            {
              ...POST_OBJECT,
              author:
                AUTHOR_OBJECT,
              bookmarkedAt:
                '2026-06-29T12:00:00.000Z',
            },
          ],
          nextCursor:
            null,
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/me/following',
      operationId:
        'listMyFollowing',
      group:
        'Account',
      scope:
        'read:profile',
      summary:
        'List who you follow',
      description:
        'Users the authenticated account follows.',
      paginated: true,
      params:
        PAGE_PARAMS,
      responseExample:
        {
          data: [
            AUTHOR_OBJECT,
          ],
          nextCursor:
            null,
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/me/followers',
      operationId:
        'listMyFollowers',
      group:
        'Account',
      scope:
        'read:profile',
      summary:
        'List your followers',
      description:
        'Users who follow the authenticated account.',
      paginated: true,
      params:
        PAGE_PARAMS,
      responseExample:
        {
          data: [
            AUTHOR_OBJECT,
          ],
          nextCursor:
            null,
        },
    },

    // ─── Posts ──────────────────────────────────────────────────────────────
    {
      method:
        'GET',
      path: '/api/v1/posts',
      operationId:
        'listMyPosts',
      group:
        'Posts',
      scope:
        'read:posts',
      summary:
        'List your posts',
      description:
        'Your recent posts, newest first. '+
        PIN_NOTE,
      paginated: true,
      params:
        PAGE_PARAMS,
      responseExample:
        {
          data: [
            {
              ...POST_OBJECT,
              pinnedOrder: null,
            },
          ],
          nextCursor:
            '2026-06-20T10:00:00.000Z',
        },
    },
    {
      method:
        'POST',
      path: '/api/v1/posts',
      operationId:
        'createPost',
      group:
        'Posts',
      scope:
        'write:posts',
      idempotent: true,
      status: 201,
      summary:
        'Create a post',
      description:
        'Create a post on your account. Awards XP and progresses quests exactly like the in-app composer.',
      requestBody:
        {
          fields:
            [
              {
                name: 'content',
                type: 'string',
                description:
                  '1–280 characters. Optional if at least one `media_ids` entry is supplied.',
              },
              {
                name: 'media_ids',
                type: 'string[]',
                description:
                  'Up to 4 media ids from POST /api/v1/images.',
              },
              {
                name: 'audience',
                type: 'string',
                description:
                  '`PUBLIC` (default), `FOLLOWERS`, or `PRIVATE`.',
              },
            ],
          example:
            {
              content:
                'Posted via the API!',
              audience:
                'PUBLIC',
            },
        },
      responseExample:
        {
          id: 'ck_post123',
          content:
            'Posted via the API!',
          audience:
            'PUBLIC',
          createdAt:
            '2026-06-30T10:00:00.000Z',
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/posts/{id}',
      operationId:
        'getPost',
      group:
        'Posts',
      scope:
        'read:posts',
      summary:
        'Get a post',
      description:
        'Fetch a single post by id. Returns public posts and your own posts; otherwise 404. '+
        QUIET_COUNTS_NOTE+
        ' '+
        PIN_NOTE,
      params:
        [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The post id.',
          },
        ],
      responseExample:
        {
          ...POST_OBJECT,
          pinnedOrder: null,
          author:
            AUTHOR_OBJECT,
        },
    },
    {
      method:
        'DELETE',
      path: '/api/v1/posts/{id}',
      operationId:
        'deletePost',
      group:
        'Posts',
      scope:
        'write:posts',
      idempotent: true,
      status: 204,
      summary:
        'Delete a post',
      description:
        'Soft-delete one of your own posts. Returns 204 on success.',
      params:
        [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The post id.',
          },
        ],
    },

    // ─── Engagement ───────────────────────────────────────────────────────────
    {
      method:
        'POST',
      path: '/api/v1/posts/{id}/like',
      operationId:
        'likePost',
      group:
        'Engagement',
      scope:
        'write:likes',
      idempotent: true,
      summary:
        'Like a post',
      description:
        'Like a post. Idempotent — liking an already-liked post is a no-op. `likeCount` is `null` when the post’s author hides the counts on their posts.',
      params:
        [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The post id.',
          },
        ],
      responseExample:
        {
          liked: true,
          likeCount: 4,
        },
    },
    {
      method:
        'DELETE',
      path: '/api/v1/posts/{id}/like',
      operationId:
        'unlikePost',
      group:
        'Engagement',
      scope:
        'write:likes',
      idempotent: true,
      summary:
        'Unlike a post',
      description:
        'Remove your like from a post.',
      params:
        [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The post id.',
          },
        ],
      responseExample:
        {
          liked: false,
          likeCount: 3,
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/posts/{id}/comments',
      operationId:
        'listComments',
      group:
        'Engagement',
      scope:
        'read:feed',
      paginated: true,
      summary:
        'List a post’s comments',
      description:
        'Top-level comments on a post, newest first.',
      params:
        [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The post id.',
          },
          ...PAGE_PARAMS,
        ],
      responseExample:
        {
          data: [
            {
              id: 'ck_c1',
              content:
                'nice',
              createdAt:
                '2026-06-30T10:01:00.000Z',
              author:
                AUTHOR_OBJECT,
            },
          ],
          nextCursor:
            null,
        },
    },
    {
      method:
        'POST',
      path: '/api/v1/posts/{id}/comments',
      operationId:
        'createComment',
      group:
        'Engagement',
      scope:
        'write:comments',
      idempotent: true,
      status: 201,
      summary:
        'Comment on a post',
      description:
        'Add a comment (or threaded reply) to a post.',
      params:
        [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The post id.',
          },
        ],
      requestBody:
        {
          fields:
            [
              {
                name: 'content',
                type: 'string',
                required: true,
                description:
                  '1–280 characters.',
              },
              {
                name: 'parent_id',
                type: 'string',
                description:
                  'Comment id to reply to (optional).',
              },
            ],
          example:
            {
              content:
                'Great post!',
            },
        },
      responseExample:
        {
          id: 'ck_c1',
          content:
            'Great post!',
          createdAt:
            '2026-06-30T10:01:00.000Z',
          author:
            AUTHOR_OBJECT,
        },
    },
    {
      method:
        'POST',
      path: '/api/v1/posts/{id}/bookmark',
      operationId:
        'bookmarkPost',
      group:
        'Engagement',
      scope:
        'write:bookmarks',
      idempotent: true,
      summary:
        'Bookmark a post',
      description:
        'Add a post to your bookmarks.',
      params:
        [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The post id.',
          },
        ],
      responseExample:
        {
          bookmarked: true,
        },
    },
    {
      method:
        'DELETE',
      path: '/api/v1/posts/{id}/bookmark',
      operationId:
        'unbookmarkPost',
      group:
        'Engagement',
      scope:
        'write:bookmarks',
      idempotent: true,
      summary:
        'Remove a bookmark',
      description:
        'Remove a post from your bookmarks.',
      params:
        [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The post id.',
          },
        ],
      responseExample:
        {
          bookmarked: false,
        },
    },

    // ─── Feed ────────────────────────────────────────────────────────────────
    {
      method:
        'GET',
      path: '/api/v1/feed',
      operationId:
        'getFeed',
      group:
        'Feed',
      scope:
        'read:feed',
      paginated: true,
      params:
        PAGE_PARAMS,
      summary:
        'Get the public feed',
      description:
        'The public global feed. Only public, free, non-community posts are returned. ' +
        QUIET_COUNTS_NOTE,
      responseExample:
        {
          data: [
            {
              ...POST_OBJECT,
              author:
                AUTHOR_OBJECT,
            },
          ],
          nextCursor:
            '2026-06-20T09:59:00.000Z',
        },
    },

    // ─── Users ───────────────────────────────────────────────────────────────
    {
      method:
        'GET',
      path: '/api/v1/users/{handle}',
      operationId:
        'getUser',
      group:
        'Users',
      scope:
        'read:users',
      summary:
        'Get a public profile',
      description:
        'A public user profile by handle.',
      params:
        [
          {
            name: 'handle',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The user’s handle (without @).',
          },
        ],
      responseExample:
        {
          id: 'ck_user123',
          name: 'Ada',
          handle:
            'ada',
          image:
            'https://…',
          bio: 'builder',
          createdAt:
            '2026-01-02T03:04:05.000Z',
          stats:
            {
              followers: 12,
              following: 30,
              posts: 88,
              level: 7,
            },
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/users/{handle}/posts',
      operationId:
        'listUserPosts',
      group:
        'Users',
      scope:
        'read:users',
      paginated: true,
      summary:
        'List a user’s public posts',
      description:
        'A user’s public posts, newest first. ' +
        QUIET_COUNTS_NOTE,
      params:
        [
          {
            name: 'handle',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The user’s handle.',
          },
          ...PAGE_PARAMS,
        ],
      responseExample:
        {
          data: [
            {
              ...POST_OBJECT,
              author:
                AUTHOR_OBJECT,
            },
          ],
          nextCursor:
            null,
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/users/{handle}/followers',
      operationId:
        'listUserFollowers',
      group:
        'Users',
      scope:
        'read:users',
      paginated: true,
      summary:
        'List a user’s followers',
      description:
        'Users who follow this user. Answers 403 `list_private` when the member keeps the list private from the key’s account. Blocked accounts are left out.',
      params:
        [
          {
            name: 'handle',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The user’s handle.',
          },
          ...PAGE_PARAMS,
        ],
      responseExample:
        {
          data: [
            AUTHOR_OBJECT,
          ],
          nextCursor:
            null,
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/users/{handle}/following',
      operationId:
        'listUserFollowing',
      group:
        'Users',
      scope:
        'read:users',
      paginated: true,
      summary:
        'List who a user follows',
      description:
        'Users this user follows. Answers 403 `list_private` when the member keeps the list private from the key’s account. Blocked accounts are left out.',
      params:
        [
          {
            name: 'handle',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The user’s handle.',
          },
          ...PAGE_PARAMS,
        ],
      responseExample:
        {
          data: [
            AUTHOR_OBJECT,
          ],
          nextCursor:
            null,
        },
    },
    {
      method:
        'POST',
      path: '/api/v1/users/{handle}/follow',
      operationId:
        'followUser',
      group:
        'Users',
      scope:
        'write:follows',
      idempotent: true,
      summary:
        'Follow a user',
      description:
        'Follow a user. Idempotent.',
      params:
        [
          {
            name: 'handle',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The user’s handle.',
          },
        ],
      responseExample:
        {
          following: true,
        },
    },
    {
      method:
        'DELETE',
      path: '/api/v1/users/{handle}/follow',
      operationId:
        'unfollowUser',
      group:
        'Users',
      scope:
        'write:follows',
      idempotent: true,
      summary:
        'Unfollow a user',
      description:
        'Stop following a user.',
      params:
        [
          {
            name: 'handle',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The user’s handle.',
          },
        ],
      responseExample:
        {
          following: false,
        },
    },

    // ─── Media ───────────────────────────────────────────────────────────────
    {
      method:
        'POST',
      path: '/api/v1/images',
      operationId:
        'uploadImage',
      group:
        'Media',
      scope:
        'write:media',
      status: 201,
      summary:
        'Upload an image',
      description:
        'Upload one image (multipart/form-data, field `image`, max 5 MB) and receive an opaque `media_id` to attach to a post via `media_ids`. Unattached media expires ~24h after upload.',
      requestBody:
        {
          contentType:
            'multipart/form-data',
          fields:
            [
              {
                name: 'image',
                type: 'file',
                required: true,
                description:
                  'png/jpg/webp/gif, max 5 MB.',
              },
            ],
        },
      responseExample:
        {
          id: 'media_abc',
          type: 'image',
          expires_at:
            '2026-07-01T10:00:00.000Z',
        },
    },

    // ─── Content ─────────────────────────────────────────────────────────────
    {
      method:
        'GET',
      path: '/api/v1/builds',
      operationId:
        'listBuilds',
      group:
        'Content',
      scope:
        'read:builds',
      paginated: true,
      summary:
        'List public builds',
      description:
        'The public builds marketplace, newest first.',
      params:
        [
          {
            name: 'category',
            in: 'query',
            type: 'string',
            description:
              'Filter by category slug.',
          },
          ...PAGE_PARAMS,
        ],
      responseExample:
        {
          data: [
            {
              slug: 'my-build',
              title:
                'My Build',
              description:
                '…',
              author:
                AUTHOR_OBJECT,
              technologies:
                [
                  'react',
                ],
              price:
                null,
              metrics:
                {
                  likes: 4,
                  comments: 1,
                  views: 90,
                },
              publishedAt:
                '2026-06-01T00:00:00.000Z',
            },
          ],
          nextCursor:
            null,
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/builds/{slug}',
      operationId:
        'getBuild',
      group:
        'Content',
      scope:
        'read:builds',
      summary:
        'Get a build',
      description:
        'A single public build, including its readme and its latest releases (up to 20, newest first). `versions` is deprecated: it carries the same releases without `commitHash`; read `releases` instead.',
      params:
        [
          {
            name: 'slug',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The build slug.',
          },
        ],
      responseExample:
        {
          slug: 'my-build',
          title:
            'My Build',
          description:
            '…',
          readme:
            '# My Build',
          repoUrl:
            null,
          demoUrl:
            null,
          author:
            AUTHOR_OBJECT,
          technologies:
            [
              'react',
            ],
          metrics:
            {
              likes: 4,
              comments: 1,
              views: 90,
            },
          versions:
            [
              {
                version:
                  '1.1',
                changelog:
                  'Faster loading.',
                createdAt:
                  '2026-11-20T12:00:00.000Z',
              },
            ],
          releases:
            [
              {
                version:
                  '1.1',
                changelog:
                  'Faster loading.',
                commitHash:
                  '3f2a9c1',
                createdAt:
                  '2026-11-20T12:00:00.000Z',
              },
            ],
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/blog',
      operationId:
        'listBlog',
      group:
        'Content',
      scope:
        'read:content',
      paginated: true,
      params:
        PAGE_PARAMS,
      summary:
        'List blog posts',
      description:
        'RMH Studios devlog posts, newest first.',
      responseExample:
        {
          data: [
            {
              slug: 'hello',
              title:
                'Hello',
              description:
                '…',
              date: '2026-06-01',
              tags: [
                'news',
              ],
            },
          ],
          nextCursor:
            null,
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/blog/{slug}',
      operationId:
        'getBlogPost',
      group:
        'Content',
      scope:
        'read:content',
      summary:
        'Get a blog post',
      description:
        'A single blog post, including markdown content.',
      params:
        [
          {
            name: 'slug',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The post slug.',
          },
        ],
      responseExample:
        {
          slug: 'hello',
          title:
            'Hello',
          description:
            '…',
          date: '2026-06-01',
          tags: [
            'news',
          ],
          content:
            '# Hello',
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/news',
      operationId:
        'listNews',
      group:
        'Content',
      scope:
        'read:content',
      paginated: true,
      summary:
        'List news articles',
      description:
        'Published news articles, newest first.',
      params:
        [
          {
            name: 'category',
            in: 'query',
            type: 'string',
            description:
              'Filter by category.',
          },
          ...PAGE_PARAMS,
        ],
      responseExample:
        {
          data: [
            {
              slug: 'big-news',
              title:
                'Big News',
              description:
                '…',
              date: '2026-06-01',
              category:
                'updates',
              featured: false,
            },
          ],
          nextCursor:
            null,
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/news/{slug}',
      operationId:
        'getNewsArticle',
      group:
        'Content',
      scope:
        'read:content',
      summary:
        'Get a news article',
      description:
        'A single published news article.',
      params:
        [
          {
            name: 'slug',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The article slug.',
          },
        ],
      responseExample:
        {
          slug: 'big-news',
          title:
            'Big News',
          description:
            '…',
          date: '2026-06-01',
          category:
            'updates',
          content:
            '…',
          source:
            {
              title:
                '…',
              url: 'https://…',
              publisher:
                '…',
            },
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/leaderboards/{game}',
      operationId:
        'getLeaderboard',
      group:
        'Content',
      scope:
        'read:leaderboards',
      paginated: true,
      summary:
        'Get a game leaderboard',
      description:
        'Top scores for a game. Supported games are listed in the response of an unknown game (400).',
      params:
        [
          {
            name: 'game',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'Game key, e.g. `vega`, `void-breaker`, `signal-forge`, `neon-driftway`, `laundry`, `synapse-storm`.',
          },
          {
            name: 'limit',
            in: 'query',
            type: 'integer',
            description:
              'Page size, 1–100 (default 25).',
          },
        ],
      responseExample:
        {
          game: 'vega',
          metric:
            'highScore',
          data: [
            {
              rank: 1,
              username:
                'ada',
              score: 99999,
              gamesPlayed: 12,
            },
          ],
        },
    },

    // ─── Games ───────────────────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/api/v1/games',
      operationId: 'listGames',
      group: 'Games',
      scope: null,
      summary: 'List games',
      description:
        'The game catalogue: every listed title that lives on this site, in display order. Public data, so any valid key may read it; no scope is required. Cached for five minutes (`Cache-Control: public, max-age=300`).',
      responseExample: {
        data: [
          {
            id: 'altair',
            title: 'Altair',
            description: 'A short description of the game.',
            href: 'https://rmhstudios.com/altair',
            multiplayer: true,
            tags: ['Deckbuilder', 'Roguelike'],
          },
        ],
      },
    },
    {
      method: 'GET',
      path: '/api/v1/me/games',
      operationId: 'listMyGames',
      group: 'Games',
      scope: 'read:games',
      summary: 'List your played games',
      description:
        'The titles you have played, most recently played first, with total minutes and the minutes in the last 7 and 30 UTC days (today counts).',
      responseExample: {
        data: [
          {
            gameId: 'altair',
            totalMinutes: 312,
            lastPlayedAt: '2026-11-20T21:14:00.000Z',
            minutesLast7Days: 95,
            minutesLast30Days: 240,
          },
        ],
      },
    },
    {
      method: 'GET',
      path: '/api/v1/me/games/{gameId}/days',
      operationId: 'getMyGameDays',
      group: 'Games',
      scope: 'read:games',
      summary: 'Get your minutes per day for a game',
      description:
        'Your minutes played on one title for each UTC day in a range, with 0 for days you did not play. The range may cover at most 90 days; it defaults to the last 30 days. An unknown title is a 404, a malformed or over-long range a 400.',
      params: [
        {
          name: 'gameId',
          in: 'path',
          required: true,
          type: 'string',
          description: 'A game id from `GET /api/v1/games`.',
        },
        {
          name: 'from',
          in: 'query',
          type: 'string',
          description: 'First day, ISO date `YYYY-MM-DD` (default: 29 days before `to`).',
        },
        {
          name: 'to',
          in: 'query',
          type: 'string',
          description: 'Last day, ISO date `YYYY-MM-DD` (default: today, UTC).',
        },
      ],
      responseExample: {
        gameId: 'altair',
        from: '2026-11-19',
        to: '2026-11-21',
        data: [
          { date: '2026-11-19', minutes: 0 },
          { date: '2026-11-20', minutes: 42 },
          { date: '2026-11-21', minutes: 18 },
        ],
      },
    },
    {
      method: 'GET',
      path: '/api/v1/me/achievements',
      operationId: 'listMyAchievements',
      group: 'Games',
      scope: 'read:games',
      paginated: true,
      summary: 'List your achievements',
      description:
        'Achievements you have unlocked, newest first. `rarityPercent` is the share of accounts holding it (null until computed) and `gameId` is the title it belongs to (null for site-wide ones). Secret achievements are never listed, and other members’ achievements are not readable.',
      params: [
        {
          name: 'gameId',
          in: 'query',
          type: 'string',
          description: 'Only achievements for this game id.',
        },
        {
          name: 'limit',
          in: 'query',
          type: 'integer',
          description: 'Page size, 1–100 (default 20).',
        },
        {
          name: 'cursor',
          in: 'query',
          type: 'string',
          description:
            'Opaque cursor from a previous `nextCursor` to fetch the next page.',
        },
      ],
      responseExample: {
        data: [
          {
            id: 'game.altair.first_run',
            gameId: 'altair',
            title: 'Into the Black',
            unlockedAt: '2026-11-18T19:02:00.000Z',
            rarityPercent: 41.5,
          },
        ],
        nextCursor: null,
      },
    },
    {
      method: 'GET',
      path: '/api/v1/users/{handle}/games',
      operationId: 'listUserGames',
      group: 'Games',
      scope: 'read:games',
      summary: 'List a member’s played games',
      description:
        'Another member’s playtime, in the same shape as `GET /api/v1/me/games`, as far as their playtime privacy setting lets the key owner see it (public: anyone with a key; followers: members who follow them; private: only them). When it is hidden, or the member does not exist, the answer is the same 404.',
      params: [
        {
          name: 'handle',
          in: 'path',
          required: true,
          type: 'string',
          description: 'The member’s handle, with or without a leading `@`.',
        },
      ],
      responseExample: {
        data: [
          {
            gameId: 'altair',
            totalMinutes: 312,
            lastPlayedAt: '2026-11-20T21:14:00.000Z',
            minutesLast7Days: 95,
            minutesLast30Days: 240,
          },
        ],
      },
    },

    // ─── Webhooks ────────────────────────────────────────────────────────────
    {
      method:
        'GET',
      path: '/api/v1/webhooks',
      operationId:
        'listWebhooks',
      group:
        'Webhooks',
      scope:
        'manage:webhooks',
      summary:
        'List webhook endpoints',
      description:
        'Your registered webhook endpoints.',
      responseExample:
        {
          data: [
            {
              id: 'wh_1',
              url: 'https://example.com/hook',
              events:
                [
                  'post.created',
                ],
              enabled: true,
              createdAt:
                '2026-06-01T00:00:00.000Z',
            },
          ],
        },
    },
    {
      method:
        'POST',
      path: '/api/v1/webhooks',
      operationId:
        'createWebhook',
      group:
        'Webhooks',
      scope:
        'manage:webhooks',
      idempotent: true,
      status: 201,
      summary:
        'Create a webhook endpoint',
      description:
        'Register a URL to receive HMAC-signed event deliveries. The signing `secret` is returned once.',
      requestBody:
        {
          fields:
            [
              {
                name: 'url',
                type: 'string',
                required: true,
                description:
                  'HTTPS URL to deliver events to.',
              },
              {
                name: 'events',
                type: 'string[]',
                required: true,
                description:
                  'Event names to subscribe to, or `["*"]` for all. See the Webhooks guide.',
              },
              {
                name: 'description',
                type: 'string',
                description:
                  'Optional label.',
              },
            ],
          example:
            {
              url: 'https://example.com/hook',
              events:
                [
                  'post.created',
                  'follow.created',
                ],
            },
        },
      responseExample:
        {
          id: 'wh_1',
          url: 'https://example.com/hook',
          events:
            [
              'post.created',
              'follow.created',
            ],
          enabled: true,
          secret:
            'whsec_…',
          createdAt:
            '2026-06-01T00:00:00.000Z',
        },
    },
    {
      method:
        'GET',
      path: '/api/v1/webhooks/{id}',
      operationId:
        'getWebhook',
      group:
        'Webhooks',
      scope:
        'manage:webhooks',
      summary:
        'Get a webhook endpoint',
      description:
        'One webhook endpoint with recent delivery attempts.',
      params:
        [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The webhook id.',
          },
        ],
      responseExample:
        {
          id: 'wh_1',
          url: 'https://example.com/hook',
          events:
            [
              'post.created',
            ],
          enabled: true,
          failureCount: 0,
          recentDeliveries:
            [],
        },
    },
    {
      method:
        'PATCH',
      path: '/api/v1/webhooks/{id}',
      operationId:
        'updateWebhook',
      group:
        'Webhooks',
      scope:
        'manage:webhooks',
      summary:
        'Update a webhook endpoint',
      description:
        'Update the URL, subscribed events, description, or enabled state.',
      params:
        [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The webhook id.',
          },
        ],
      requestBody:
        {
          fields:
            [
              {
                name: 'url',
                type: 'string',
                description:
                  'New HTTPS URL.',
              },
              {
                name: 'events',
                type: 'string[]',
                description:
                  'New event subscription list.',
              },
              {
                name: 'description',
                type: 'string',
                description:
                  'New label.',
              },
              {
                name: 'enabled',
                type: 'boolean',
                description:
                  'Enable or disable deliveries.',
              },
            ],
          example:
            {
              enabled: false,
            },
        },
      responseExample:
        {
          id: 'wh_1',
          url: 'https://example.com/hook',
          events:
            [
              'post.created',
            ],
          enabled: false,
        },
    },
    {
      method:
        'DELETE',
      path: '/api/v1/webhooks/{id}',
      operationId:
        'deleteWebhook',
      group:
        'Webhooks',
      scope:
        'manage:webhooks',
      status: 204,
      summary:
        'Delete a webhook endpoint',
      description:
        'Permanently remove a webhook endpoint.',
      params:
        [
          {
            name: 'id',
            in: 'path',
            required: true,
            type: 'string',
            description:
              'The webhook id.',
          },
        ],
    },

    // ─── Meta ────────────────────────────────────────────────────────────────
    {
      method:
        'GET',
      path: '/api/v1/openapi.json',
      operationId:
        'getOpenApi',
      group:
        'Meta',
      scope:
        null,
      summary:
        'OpenAPI document',
      description:
        'The machine-readable OpenAPI 3.1 description of this API. No authentication required.',
      responseExample:
        {
          openapi:
            '3.1.0',
          info: {
            title:
              'RMH Studios API',
            version:
              'v1',
          },
        },
    },
  ];

/** Group endpoints in declared order for wiki rendering. */
export function endpointsByGroup(): {
  group: string;
  endpoints: ApiEndpoint[];
}[] {
  const out: {
    group: string;
    endpoints: ApiEndpoint[];
  }[] =
    [];
  for (const ep of ENDPOINTS) {
    let bucket =
      out.find(
        (
          g,
        ) =>
          g.group ===
          ep.group,
      );
    if (
      !bucket
    ) {
      bucket =
        {
          group:
            ep.group,
          endpoints:
            [],
        };
      out.push(
        bucket,
      );
    }
    bucket.endpoints.push(
      ep,
    );
  }
  return out;
}
