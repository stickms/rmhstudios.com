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
  | 'PUT'
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

/** Appended to `getPost` (sprint 06 #19). */
const POLL_NOTE =
  '`poll` is `null` unless the post carries a poll. A ranked-choice poll has `ranked: true`; once it has ended, `poll.result` holds `winnerOptionId` (null when nobody ranked an option) and the instant-runoff `rounds` (each round\'s option tallies and the option eliminated at its end, null on the deciding round). When the author hides counts from you, tallies are whole percents and `percentOnly` is `true`. A quiz poll has `quiz: true`; its `correctOptionId` and `explanation` are `null` until you may know them: you wrote the post, you voted on the poll, or it has ended. A poll that is not a quiz has `quiz: false` and both `null`.';

const POST_OBJECT =
  {
    id: 'ck_post123',
    content:
      'hello world',
    audience:
      'PUBLIC',
    sensitive: false,
    contentWarning: null,
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
              {
                name: 'communityId',
                type: 'string',
                description:
                  'Post into this community instead of only your timeline. Needs the `write:communities` scope as well as `write:posts`, and you must be a member. The community\'s own rules apply (flair, verification, AutoMod, image descriptions, bans and timeouts): a held post answers `202` with `{ "status": "held", "id": … }`, an AutoMod removal `422` with the rule name, and a refusal the gate\'s `code` (a ban or timeout also carries `endsAt`).',
              },
              {
                name: 'flairId',
                type: 'string',
                description:
                  'A flair of that community (needs `communityId`); required when the community requires one.',
              },
              {
                name: 'media_alts',
                type: 'string[]',
                description:
                  'With `communityId`: a description for each `media_ids` image, in order. A community can require one on every image.',
              },
              {
                name: 'poll',
                type: 'object',
                description:
                  'A poll on the post (not with `communityId`): `question`, 2 to 4 `options` (strings), optional `multiSelect` and `durationHours` (1 to 720). A quiz adds `quiz: true`, `correctIndex` (the zero-based position of the one correct option) and an optional `explanation` of at most 280 characters; a quiz is single choice, so it cannot also set `multiSelect`. A post may carry just a poll, with no `content`.',
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
        PIN_NOTE+
        ' '+
        POLL_NOTE,
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
          poll: null,
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
        'A single public build, including its readme, its cover description (`thumbnailAlt`), its described `screenshots` in order (up to 8) and its latest releases (up to 20, newest first). `versions` is deprecated: it carries the same releases without `commitHash`; read `releases` instead.',
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
          thumbnailAlt:
            null,
          screenshots:
            [
              {
                url: 'https://rmhstudios.com/api/image/example.webp',
                width: 1280,
                height: 720,
                description:
                  'The title screen with the level list open.',
              },
            ],
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

    // Sprint 06 (docs/autonomous/sprint-06/plan.md §Anchors)
    // s06-12 game-webhooks
    {
      method: 'GET',
      path: '/api/v1/me/personal-bests',
      operationId: 'listMyPersonalBests',
      group: 'Games',
      scope: 'read:games',
      paginated: true,
      summary: 'List your personal bests',
      description:
        'Your current personal best in each game, ordered by game id. `previousScore` is the best before this one (null for a first score). No rank is returned. Other members’ bests are not readable. The same data is sent by the `personal_best.created` webhook event: `{ "event": "personal_best.created", "created": "2026-11-20T21:14:00.000Z", "data": { "gameId": "altair", "gameTitle": "Altair", "score": 4200, "previousScore": 3900, "achievedAt": "2026-11-20T21:14:00.000Z" } }`. The `achievement.unlocked` event carries `{ "achievementId": "game.altair.first_run", "name": "Into the Black", "gameId": "altair", "unlockedAt": "2026-11-20T21:14:00.000Z" }`.',
      params: [
        {
          name: 'gameId',
          in: 'query',
          type: 'string',
          description: 'Only this game.',
        },
        {
          name: 'since',
          in: 'query',
          type: 'string',
          description: 'ISO 8601 time; only games whose current best was set at or after it.',
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
          description: 'Opaque cursor from a previous `nextCursor` to fetch the next page.',
        },
      ],
      responseExample: {
        data: [
          {
            gameId: 'altair',
            gameTitle: 'Altair',
            score: 4200,
            previousScore: null,
            achievedAt: '2026-11-20T21:14:00.000Z',
          },
        ],
        nextCursor: null,
      },
    },

    // s06-13 api-flashcards
    {
      method: 'GET',
      path: '/api/v1/me/decks',
      operationId: 'listMyDecks',
      group: 'Study',
      scope: 'read:study',
      summary: 'List your decks',
      description: 'Your flashcard decks, newest change first. `dueCount` is how many cards are due now; `suspended` is how many the key owner has set aside (not in `dueCount`). Only your own decks are listed.',
      paginated: true,
      params: [
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
          description: 'Opaque cursor from a previous `nextCursor` to fetch the next page.',
        },
      ],
      responseExample: {
        data: [
          {
            id: 'cldeck1',
            title: 'Spanish verbs',
            description: null,
            isPublic: false,
            cardCount: 2,
            dueCount: 2,
            suspended: 0,
            updatedAt: '2026-11-20T21:14:00.000Z',
          },
        ],
        nextCursor: null,
      },
    },
    {
      method: 'POST',
      path: '/api/v1/me/decks',
      operationId: 'createMyDeck',
      group: 'Study',
      scope: 'write:study',
      summary: 'Create a deck',
      description: 'Create an empty deck. At most 200 decks per account.',
      idempotent: true,
      status: 201,
      requestBody: {
        fields: [
          {
            name: 'title',
            type: 'string',
            required: true,
            description: '1–100 characters.',
          },
          {
            name: 'description',
            type: 'string',
            description: 'Up to 500 characters.',
          },
          {
            name: 'isPublic',
            type: 'boolean',
            description: 'List the deck in the public marketplace (default false).',
          },
        ],
        example: {
          title: 'Spanish verbs',
          description: null,
          isPublic: false,
        },
      },
      responseExample: {
        id: 'cldeck1',
        title: 'Spanish verbs',
        description: null,
        isPublic: false,
        cardCount: 2,
        dueCount: 2,
        suspended: 0,
        updatedAt: '2026-11-20T21:14:00.000Z',
      },
    },
    {
      method: 'GET',
      path: '/api/v1/me/decks/{id}',
      operationId: 'getMyDeck',
      group: 'Study',
      scope: 'read:study',
      summary: 'Get a deck',
      description: 'One of your decks. A deck that is not yours is 404.',
      params: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          description: 'The deck id.',
          required: true,
        },
      ],
      responseExample: {
        id: 'cldeck1',
        title: 'Spanish verbs',
        description: null,
        isPublic: false,
        cardCount: 2,
        dueCount: 2,
        suspended: 0,
        updatedAt: '2026-11-20T21:14:00.000Z',
      },
    },
    {
      method: 'PATCH',
      path: '/api/v1/me/decks/{id}',
      operationId: 'updateMyDeck',
      group: 'Study',
      scope: 'write:study',
      summary: 'Update a deck',
      description: 'Change the title, description or visibility. An empty description clears it.',
      idempotent: true,
      params: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          description: 'The deck id.',
          required: true,
        },
      ],
      requestBody: {
        fields: [
          {
            name: 'title',
            type: 'string',
            description: '1–100 characters.',
          },
          {
            name: 'description',
            type: 'string',
            description: 'Up to 500 characters; empty clears it.',
          },
          {
            name: 'isPublic',
            type: 'boolean',
            description: 'Public in the marketplace.',
          },
        ],
        example: {
          title: 'Spanish verbs, set 1',
        },
      },
      responseExample: {
        id: 'cldeck1',
        title: 'Spanish verbs',
        description: null,
        isPublic: false,
        cardCount: 2,
        dueCount: 2,
        suspended: 0,
        updatedAt: '2026-11-20T21:14:00.000Z',
      },
    },
    {
      method: 'DELETE',
      path: '/api/v1/me/decks/{id}',
      operationId: 'deleteMyDeck',
      group: 'Study',
      scope: 'write:study',
      summary: 'Delete a deck',
      description: 'Permanently delete the deck, its cards and their review history.',
      idempotent: true,
      status: 204,
      params: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          description: 'The deck id.',
          required: true,
        },
      ],
    },
    {
      method: 'GET',
      path: '/api/v1/me/decks/{id}/cards',
      operationId: 'listMyDeckCards',
      group: 'Study',
      scope: 'read:study',
      summary: 'List a deck’s cards',
      description: 'The cards you wrote, in deck order. Cards generated from them (the reverse side of a reversible card, one card per cloze deletion) are not listed.',
      paginated: true,
      params: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          description: 'The deck id.',
          required: true,
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
          description: 'Opaque cursor from a previous `nextCursor` to fetch the next page.',
        },
      ],
      responseExample: {
        data: [
          {
            id: 'clcard1',
            kind: 'basic',
            front: 'hablar',
            back: 'to speak',
            position: 0,
            externalId: null,
          },
        ],
        nextCursor: null,
      },
    },
    {
      method: 'POST',
      path: '/api/v1/me/decks/{id}/cards',
      operationId: 'createMyDeckCards',
      group: 'Study',
      scope: 'write:study',
      summary: 'Add cards',
      description: 'Add 1 to 100 cards in one request, all or nothing: one invalid card, a duplicate `externalId`, or a deck over its 2,000-card limit (generated cards count) writes nothing. Reversible and cloze cards get their generated cards exactly as in the editor. `kind` is `basic`, `reversible` or `cloze` (a cloze card has only `front`, with `{{c1::answer}}` deletions).',
      idempotent: true,
      status: 201,
      params: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          description: 'The deck id.',
          required: true,
        },
      ],
      requestBody: {
        fields: [
          {
            name: 'cards',
            type: 'object[]',
            required: true,
            description: '1–100 cards: `{ kind?, front, back?, externalId? }`. `front` and `back` up to 500 characters (a cloze `front` up to 1000); `externalId` up to 100 characters, unique in the deck.',
          },
        ],
        example: {
          cards: [
            {
              front: 'hablar',
              back: 'to speak',
              externalId: null,
            },
            {
              kind: 'reversible',
              front: 'comer',
              back: 'to eat',
            },
          ],
        },
      },
      responseExample: {
        data: [
          {
            id: 'clcard1',
            kind: 'basic',
            front: 'hablar',
            back: 'to speak',
            position: 0,
            externalId: null,
          },
        ],
        cardCount: 2,
      },
    },
    {
      method: 'PATCH',
      path: '/api/v1/me/decks/{id}/cards/{cardId}',
      operationId: 'updateMyDeckCard',
      group: 'Study',
      scope: 'write:study',
      summary: 'Update a card',
      description: 'Change a card’s kind, front or back. Its review history stays; its generated cards are regenerated in place. A generated card is 404.',
      idempotent: true,
      params: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          description: 'The deck id.',
          required: true,
        },
        {
          name: 'cardId',
          in: 'path',
          type: 'string',
          description: 'The card id.',
          required: true,
        },
      ],
      requestBody: {
        fields: [
          {
            name: 'kind',
            type: 'string',
            description: '`basic`, `reversible` or `cloze`.',
          },
          {
            name: 'front',
            type: 'string',
            description: 'The front (a cloze card’s whole text).',
          },
          {
            name: 'back',
            type: 'string',
            description: 'The back.',
          },
        ],
        example: {
          back: 'to talk, to speak',
        },
      },
      responseExample: {
        id: 'clcard1',
        kind: 'basic',
        front: 'hablar',
        back: 'to speak',
        position: 0,
        externalId: null,
      },
    },
    {
      method: 'DELETE',
      path: '/api/v1/me/decks/{id}/cards/{cardId}',
      operationId: 'deleteMyDeckCard',
      group: 'Study',
      scope: 'write:study',
      summary: 'Delete a card',
      description: 'Delete a card with its generated cards and review history.',
      idempotent: true,
      status: 204,
      params: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          description: 'The deck id.',
          required: true,
        },
        {
          name: 'cardId',
          in: 'path',
          type: 'string',
          description: 'The card id.',
          required: true,
        },
      ],
    },
    {
      method: 'PUT',
      path: '/api/v1/me/decks/{id}/cards/by-external-id/{externalId}',
      operationId: 'upsertMyDeckCard',
      group: 'Study',
      scope: 'write:study',
      summary: 'Create or update a card by external id',
      description: 'Create the card keyed by your own id in this deck, or update it. The same body sent twice changes nothing the second time. 201 when created, 200 when the card already existed.',
      idempotent: true,
      params: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          description: 'The deck id.',
          required: true,
        },
        {
          name: 'externalId',
          in: 'path',
          type: 'string',
          description: 'Your own id for the card, up to 100 characters, unique in the deck.',
          required: true,
        },
      ],
      requestBody: {
        fields: [
          {
            name: 'kind',
            type: 'string',
            description: '`basic` (default), `reversible` or `cloze`.',
          },
          {
            name: 'front',
            type: 'string',
            required: true,
            description: 'The front.',
          },
          {
            name: 'back',
            type: 'string',
            description: 'The back (not used by cloze cards).',
          },
        ],
        example: {
          front: 'hablar',
          back: 'to speak',
        },
      },
      responseExample: {
        id: 'clcard1',
        kind: 'basic',
        front: 'hablar',
        back: 'to speak',
        position: 0,
        externalId: 'verbs-001',
      },
    },
    {
      method: 'GET',
      path: '/api/v1/me/decks/{id}/due',
      operationId: 'getMyDeckDue',
      group: 'Study',
      scope: 'read:study',
      summary: 'Get due counts',
      description: 'How many cards in the deck are due now and in the next 24 hours (suspended cards are not counted), for a “you have 40 cards due” widget. No card content. Reviews are made in the app and cannot be written through the API.',
      params: [
        {
          name: 'id',
          in: 'path',
          type: 'string',
          description: 'The deck id.',
          required: true,
        },
      ],
      responseExample: {
        deckId: 'cldeck1',
        dueNow: 40,
        dueNext24h: 12,
        asOf: '2026-11-20T21:14:00.000Z',
      },
    },

    // Sprint 07 (docs/autonomous/sprint-07/plan.md §Anchors)
    // s07-10 api-events
    {
      method: 'GET',
      path: '/api/v1/events',
      operationId: 'listEvents',
      group: 'Events',
      scope: 'read:events',
      summary: 'List events',
      description: 'Events you can see on the site (a private event or a private community\'s events only when the site shows them to you), soonest first. A repeating event appears once per date inside the window, with skipped dates left out and moved dates where they now are; `occurrence` is the date\'s original start, which RSVPs are keyed by. The window defaults to the next 31 days and may be at most 31 days wide. Times are ISO 8601 UTC with the event\'s `timeZone` beside them.',
      paginated: true,
      params: [
        { name: 'from', in: 'query', type: 'string', description: 'Start of the window, an ISO 8601 date or timestamp (default now).' },
        { name: 'to', in: 'query', type: 'string', description: 'End of the window (default 31 days after `from`; at most 31 days after it).' },
        { name: 'community', in: 'query', type: 'string', description: 'Only events of this community (id or slug).' },
        { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 25).' },
        { name: 'cursor', in: 'query', type: 'string', description: 'Opaque cursor from a previous `nextCursor` to fetch the next page.' },
      ],
      responseExample: {
        data: [
          {
            id: 'clevent1',
            title: 'Game night',
            description: 'Bring a controller.',
            startsAt: '2026-11-26T19:00:00.000Z',
            endsAt: null,
            timeZone: null,
            occurrence: null,
            state: 'normal',
            note: null,
            repeats: false,
            venueKind: 'URL',
            venue: null,
            capacity: null,
            communityId: null,
            canceled: false,
            host: { id: 'cluser1', handle: 'rmh', name: 'RMH' },
            cohosts: [{ id: 'cluser1', handle: 'rmh', name: 'RMH' }],
            counts: { going: 4, maybe: 1, waitlisted: 0 },
            yourRsvp: null,
          },
        ],
        nextCursor: null,
      },
    },
    {
      method: 'GET',
      path: '/api/v1/events/{id}',
      operationId: 'getEvent',
      group: 'Events',
      scope: 'read:events',
      summary: 'Get an event',
      description: 'One event you can see, with its next dates (up to 10, overrides applied), the going, maybe and waitlisted counts, the host and co-hosts, and the latest five updates. For a repeating event the top-level date is the next one that is on. A guest list is `GET /events/{id}/attendees`, for hosts only. Counts are read from at most 8,000 answers per event, so on an event with more than that they are approximate.',
      params: [
        { name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true },
      ],
      responseExample: {
        id: 'clevent1',
        title: 'Game night',
        description: 'Bring a controller.',
        startsAt: '2026-11-26T19:00:00.000Z',
        endsAt: null,
        timeZone: null,
        occurrence: null,
        state: 'normal',
        note: null,
        repeats: false,
        venueKind: 'URL',
        venue: null,
        capacity: null,
        communityId: null,
        canceled: false,
        host: { id: 'cluser1', handle: 'rmh', name: 'RMH' },
        cohosts: [{ id: 'cluser1', handle: 'rmh', name: 'RMH' }],
        counts: { going: 4, maybe: 1, waitlisted: 0 },
        yourRsvp: null,
        nextOccurrences: [
          {
            occurrence: '2026-11-26T19:00:00.000Z',
            startsAt: '2026-11-26T19:00:00.000Z',
            endsAt: '2026-11-26T21:00:00.000Z',
            state: 'normal',
            note: 'Back on.',
          },
        ],
        updates: [
          {
            id: 'clupdate1',
            body: 'Doors at 18:45.',
            occurrence: null,
            createdAt: '2026-11-22T10:00:00.000Z',
          },
        ],
      },
    },
    {
      method: 'GET',
      path: '/api/v1/events/{id}/attendees',
      operationId: 'listEventAttendees',
      group: 'Events',
      scope: 'read:events',
      summary: 'List attendees',
      description: 'Who is going or maybe for one date, by handle, display name and status. Only the event\'s host and accepted co-hosts may read it (`403` for anyone else, who can read the counts from the event). On a repeating event `occurrence` picks the date (its original start); without it, the next date that is on.',
      paginated: true,
      params: [
        { name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true },
        { name: 'occurrence', in: 'query', type: 'string', description: 'The date\'s original start, an ISO 8601 timestamp (repeating events).' },
        { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 25).' },
        { name: 'cursor', in: 'query', type: 'string', description: 'Opaque cursor from a previous `nextCursor` to fetch the next page.' },
      ],
      responseExample: {
        data: [{ id: 'cluser2', handle: 'guest', name: 'Guest', status: 'going' }],
        nextCursor: null,
      },
    },
    {
      method: 'GET',
      path: '/api/v1/me/events',
      operationId: 'listMyEvents',
      group: 'Events',
      scope: 'read:events',
      summary: 'List your events',
      description: 'The dates of events you answered going or maybe to, soonest first, in the same shape as `GET /events` with `yourRsvp` set. A date you sat out or that was skipped is not listed. Same window rules as `GET /events`.',
      paginated: true,
      params: [
        { name: 'from', in: 'query', type: 'string', description: 'Start of the window, an ISO 8601 date or timestamp (default now).' },
        { name: 'to', in: 'query', type: 'string', description: 'End of the window (default 31 days after `from`; at most 31 days after it).' },
        { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 25).' },
        { name: 'cursor', in: 'query', type: 'string', description: 'Opaque cursor from a previous `nextCursor` to fetch the next page.' },
      ],
      responseExample: {
        data: [
          {
            id: 'clevent1',
            title: 'Game night',
            description: 'Bring a controller.',
            startsAt: '2026-11-26T19:00:00.000Z',
            endsAt: null,
            timeZone: null,
            occurrence: null,
            state: 'normal',
            note: null,
            repeats: false,
            venueKind: 'URL',
            venue: null,
            capacity: null,
            communityId: null,
            canceled: false,
            host: { id: 'cluser1', handle: 'rmh', name: 'RMH' },
            cohosts: [{ id: 'cluser1', handle: 'rmh', name: 'RMH' }],
            counts: { going: 4, maybe: 1, waitlisted: 0 },
            yourRsvp: null,
          },
        ],
        nextCursor: null,
      },
    },
    {
      method: 'PUT',
      path: '/api/v1/events/{id}/rsvp',
      operationId: 'rsvpToEvent',
      group: 'Events',
      scope: 'write:events',
      summary: 'RSVP to an event',
      description: 'Answer going or maybe, through the site\'s own RSVP, so capacity, the waitlist, reminders and who may see the event are the site\'s rules. A full one-off event answers `status: "waitlisted"`; a full repeating event has no waitlist and is a `409`. A member banned or timed out of the event\'s community is refused with a `403`. On a repeating event the answer is for one date (`occurrence`, the date\'s original start; default the next one) or, with `everyTime`, every date. The response is the resulting state.',
      idempotent: true,
      params: [
        { name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true },
      ],
      requestBody: {
        fields: [
          { name: 'status', type: 'string', required: true, description: '`going` or `maybe`.' },
          { name: 'occurrence', type: 'string', description: 'The date\'s original start, an ISO 8601 timestamp (repeating events).' },
          { name: 'everyTime', type: 'boolean', description: 'Answer for every date of a repeating event.' },
        ],
        example: { status: 'going' },
      },
      responseExample: {
        eventId: 'clevent1',
        status: 'going',
        occurrence: null,
        everyTime: false,
        counts: { going: 5, maybe: 1, waitlisted: 0 },
        waitlistPosition: null,
      },
    },
    {
      method: 'DELETE',
      path: '/api/v1/events/{id}/rsvp',
      operationId: 'cancelEventRsvp',
      group: 'Events',
      scope: 'write:events',
      summary: 'Cancel your RSVP',
      description: 'Take your answer back, through the site\'s own un-RSVP (a freed seat goes to the waitlist). On a repeating event it sits out one date (`occurrence`, default the next one), or with `everyTime=true` leaves the series. The response is the resulting state, `status: "none"` when you no longer have an answer.',
      idempotent: true,
      params: [
        { name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true },
        { name: 'occurrence', in: 'query', type: 'string', description: 'The date\'s original start, an ISO 8601 timestamp (repeating events).' },
        { name: 'everyTime', in: 'query', type: 'string', description: '`true` to leave the whole series.' },
      ],
      responseExample: {
        eventId: 'clevent1',
        status: 'none',
        occurrence: null,
        everyTime: false,
        counts: { going: 4, maybe: 1, waitlisted: 0 },
        waitlistPosition: null,
      },
    },

    // s07-11 api-communities
    {
      method: 'GET',
      path: '/api/v1/me/communities',
      operationId: 'listMyCommunities',
      group: 'Communities',
      scope: 'read:communities',
      summary: 'List your communities',
      description: 'The communities you belong to, newest membership first, with your role and the day you joined. Joining and leaving stay on the site.',
      paginated: true,
      params: PAGE_PARAMS,
      responseExample: {
        data: [
          {
            id: 'clcommunity1',
            slug: 'retro-gamers',
            name: 'Retro Gamers',
            icon: '🎮',
            isPrivate: false,
            memberCount: 128,
            role: 'MEMBER',
            joinedAt: '2026-10-01T12:00:00.000Z',
          },
        ],
        nextCursor: null,
      },
    },
    {
      method: 'GET',
      path: '/api/v1/communities/{slug}',
      operationId: 'getCommunity',
      group: 'Communities',
      scope: 'read:communities',
      summary: 'Get a community',
      description: 'A community you can see: its description, member count, privacy, posting requirements, flairs and whether you are a member (`role` is `null` when you are not). A private community you are not a member of is a 404. Member lists are not exposed.',
      params: [
        { name: 'slug', in: 'path', type: 'string', description: 'The community slug.', required: true },
      ],
      responseExample: {
        id: 'clcommunity1',
        slug: 'retro-gamers',
        name: 'Retro Gamers',
        description: 'Talk about the old ones.',
        icon: '🎮',
        color: '#4455aa',
        isPrivate: false,
        memberCount: 128,
        createdAt: '2026-09-01T12:00:00.000Z',
        isMember: true,
        role: 'MEMBER',
        posting: {
          verification: { level: 'none', value: 0 },
          flairRequired: false,
          requireImageAlt: false,
        },
        flairs: [{ id: 'clflair1', name: 'Discussion', color: 'accent' }],
      },
    },
    {
      method: 'GET',
      path: '/api/v1/communities/{slug}/rules',
      operationId: 'getCommunityRules',
      group: 'Communities',
      scope: 'read:communities',
      summary: 'Get a community\'s rules',
      description: 'The rules as the site shows them, in order (`position` starts at 1). Same visibility as `GET /communities/{slug}`.',
      params: [
        { name: 'slug', in: 'path', type: 'string', description: 'The community slug.', required: true },
      ],
      responseExample: {
        data: [{ id: 'clrule1', position: 1, title: 'Be kind', description: 'No harassment.' }],
      },
    },
    {
      method: 'GET',
      path: '/api/v1/communities/{slug}/posts',
      operationId: 'listCommunityPosts',
      group: 'Communities',
      scope: 'read:communities',
      summary: 'List a community\'s posts',
      description: 'The community feed as the site returns it to you, newest first: the same visibility, removed and held posts left out, and quiet counts. Paginate with the opaque `nextCursor`. '+
        QUIET_COUNTS_NOTE,
      paginated: true,
      params: [
        { name: 'slug', in: 'path', type: 'string', description: 'The community slug.', required: true },
        ...PAGE_PARAMS,
        { name: 'flair', in: 'query', type: 'string', description: 'Only posts with this flair id.' },
      ],
      responseExample: {
        data: [
          {
            id: 'ck_post123',
            content: 'What is everyone playing this week?',
            imageUrls: [],
            imageAlts: [],
            gifUrl: null,
            gifAlt: null,
            sensitive: false,
            contentWarning: null,
            pinnedReplyId: null,
            createdAt: '2026-11-20T10:00:00.000Z',
            author: AUTHOR_OBJECT,
            metrics: { likes: 3, comments: 1, reposts: 0, views: 42 },
            flair: { id: 'clflair1', name: 'Discussion', color: 'accent' },
          },
        ],
        nextCursor: null,
      },
    },

    // s07-12 api-reading
    {
      method: 'GET',
      path: '/api/v1/me/highlights',
      operationId: 'listMyHighlights',
      group: 'Reading',
      scope: 'read:reading',
      summary: 'List your highlights and notes',
      description: 'Your highlights and notes on library books, blog posts and news, newest first. Private notes are returned because they are yours; a wildcard key (`read:*`, `*`) can read them too. With `since` (ISO 8601) you get the highlights **updated** after that instant instead, ordered by `updatedAt` then `id` ascending, so a sync can store the last `updatedAt` it saw and ask again from there; follow `nextCursor` (a cursor from one mode does not work in the other). A highlight whose document has been removed is returned with `document: null` (as in the example); otherwise `document` is `{ title, url }`. Deletions are not tombstoned: to learn which highlights were deleted, compare the ids you hold with a full listing. Highlights cannot be created through the API.',
      paginated: true,
      params: [
        { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 30).' },
        { name: 'cursor', in: 'query', type: 'string', description: 'Opaque cursor from a previous `nextCursor`.' },
        { name: 'kind', in: 'query', type: 'string', description: 'Only `library`, `blog` or `news` highlights.' },
        { name: 'since', in: 'query', type: 'string', description: 'Only highlights updated after this ISO 8601 instant, oldest update first.' },
        { name: 'hasNote', in: 'query', type: 'boolean', description: '`true` for highlights with a note, `false` for those without.' },
        { name: 'visibility', in: 'query', type: 'string', description: '`public` or `private`.' },
      ],
      responseExample: {
        data: [
          {
            id: 'clhl1',
            kind: 'library',
            key: 'meditations',
            document: null,
            quote: 'You have power over your mind, not outside events.',
            note: null,
            isPublic: false,
            createdAt: '2026-11-01T09:00:00.000Z',
            updatedAt: '2026-11-20T18:30:00.000Z',
          }
        ],
        nextCursor: null,
      },
    },
    {
      method: 'PATCH',
      path: '/api/v1/me/highlights/{id}',
      operationId: 'updateMyHighlight',
      group: 'Reading',
      scope: 'write:reading',
      summary: 'Edit a highlight',
      description: 'Change the note and/or visibility of one of your highlights. `note: null` or an empty string clears the note. It runs the same function as the site, so the public-highlight rules apply; the API cannot supply the passage positions the reader computes, so a highlight made public here is public but does not count toward "popular passages". A highlight that is not yours is a 404.',
      idempotent: true,
      params: [
        { name: 'id', in: 'path', type: 'string', description: 'The highlight id.', required: true },
      ],
      requestBody: {
        fields: [
          { name: 'note', type: 'string | null', description: 'Up to 2000 characters; null or empty clears it.' },
          { name: 'isPublic', type: 'boolean', description: 'Show the highlight and its note publicly.' },
        ],
        example: { note: 'Re-read before the review.' },
      },
      responseExample: {
            id: 'clhl1',
            kind: 'library',
            key: 'meditations',
            document: null,
            quote: 'You have power over your mind, not outside events.',
            note: null,
            isPublic: false,
            createdAt: '2026-11-01T09:00:00.000Z',
            updatedAt: '2026-11-20T18:30:00.000Z',
          },
    },
    {
      method: 'DELETE',
      path: '/api/v1/me/highlights/{id}',
      operationId: 'deleteMyHighlight',
      group: 'Reading',
      scope: 'write:reading',
      summary: 'Delete a highlight',
      description: 'Permanently delete one of your highlights and its note. Deletions are not tombstoned for `since` syncs.',
      idempotent: true,
      status: 204,
      params: [
        { name: 'id', in: 'path', type: 'string', description: 'The highlight id.', required: true },
      ],
    },
    {
      method: 'GET',
      path: '/api/v1/me/shelves',
      operationId: 'listMyShelves',
      group: 'Reading',
      scope: 'read:reading',
      summary: 'List your shelves',
      description: 'Your shelf entries (`want`, `reading`, `read`), most recently changed first, up to 500. Optionally only one shelf.',
      params: [
        { name: 'shelf', in: 'query', type: 'string', description: '`want`, `reading` or `read`.' },
      ],
      responseExample: {
        data: [
          { slug: 'meditations', title: 'Meditations', shelf: 'want', pages: 254, finishedAt: null, updatedAt: '2026-11-10T08:00:00.000Z' },
        ],
      },
    },
    {
      method: 'PUT',
      path: '/api/v1/me/shelves/{slug}',
      operationId: 'setMyShelf',
      group: 'Reading',
      scope: 'write:reading',
      summary: 'Put a book on a shelf',
      description: 'Shelve a library book, moving it if it is already shelved. Marking it `read` stamps `finishedAt` (now, or the date already there, or the one you send) and it counts toward that year\'s reading goal. A slug that is not a library book is a 404.',
      idempotent: true,
      params: [
        { name: 'slug', in: 'path', type: 'string', description: 'The library book slug.', required: true },
      ],
      requestBody: {
        fields: [
          { name: 'shelf', type: 'string', required: true, description: '`want`, `reading` or `read`.' },
          { name: 'pages', type: 'integer', description: 'Page count, used only when the book has none of its own.' },
          { name: 'finishedAt', type: 'string | null', description: 'ISO 8601 finish date; only with `read`, not in the future.' },
        ],
        example: { shelf: 'read', finishedAt: '2026-11-10T00:00:00.000Z' },
      },
      responseExample: { slug: 'meditations', title: 'Meditations', shelf: 'want', pages: 254, finishedAt: null, updatedAt: '2026-11-10T08:00:00.000Z' },
    },
    {
      method: 'DELETE',
      path: '/api/v1/me/shelves/{slug}',
      operationId: 'removeMyShelf',
      group: 'Reading',
      scope: 'write:reading',
      summary: 'Take a book off your shelves',
      description: 'Remove the shelf entry. A book that is not on your shelves is a 404.',
      idempotent: true,
      status: 204,
      params: [
        { name: 'slug', in: 'path', type: 'string', description: 'The library book slug.', required: true },
      ],
    },
    {
      method: 'GET',
      path: '/api/v1/me/reading-goal',
      operationId: 'getMyReadingGoal',
      group: 'Reading',
      scope: 'read:reading',
      summary: 'Get your reading goal',
      description: 'Your goal for a year and how far along you are: books and pages finished that year and `done` in the goal\'s unit. `goal` is `null` when you set none, otherwise `{ unit, target, books, pages, done }`. Setting the goal stays on the site.',
      params: [
        { name: 'year', in: 'query', type: 'integer', description: 'The year, 2000–2200 (default the current UTC year).' },
      ],
      responseExample: {
        year: 2026,
        goal: null,
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
