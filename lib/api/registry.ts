/**
 * Central registry of every public v1 endpoint.
 *
 * This is the single source of truth that drives BOTH the machine-readable
 * OpenAPI document (`/api/v1/openapi.json`) AND the human-readable wiki
 * reference pages. Keeping one list means the spec, the docs, and the routes
 * never drift apart. It is a pure module (no server imports) so it can be
 * imported on the client (wiki) and unit-tested.
 */

export const API_BASE_URL = 'https://rmhstudios.com';
export const API_VERSION = 'v1';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiParam {
  name: string;
  in: 'path' | 'query';
  required?: boolean;
  type: 'string' | 'integer' | 'boolean';
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
  scope: string | null;
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

const PAGE_PARAMS: ApiParam[] = [
  {
    name: 'limit',
    in: 'query',
    type: 'integer',
    description: 'Page size, 1–50 (default 20).',
  },
  {
    name: 'cursor',
    in: 'query',
    type: 'string',
    description: 'Opaque cursor from a previous `nextCursor` to fetch the next page.',
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
  "`poll` is `null` unless the post carries a poll. A ranked-choice poll has `ranked: true`; once it has ended, `poll.result` holds `winnerOptionId` (null when nobody ranked an option) and the instant-runoff `rounds` (each round's option tallies and the option eliminated at its end, null on the deciding round). When the author hides counts from you, tallies are whole percents and `percentOnly` is `true`. A quiz poll has `quiz: true`; its `correctOptionId` and `explanation` are `null` until you may know them: you wrote the post, you voted on the poll, or it has ended. A poll that is not a quiz has `quiz: false` and both `null`.";

const POST_OBJECT = {
  id: 'ck_post123',
  content: 'hello world',
  audience: 'PUBLIC',
  sensitive: false,
  contentWarning: null,
  createdAt: '2026-06-30T10:00:00.000Z',
  metrics: {
    likes: 3,
    comments: 1,
    reposts: 0,
    views: 42,
  },
};

const AUTHOR_OBJECT = {
  id: 'ck_user123',
  name: 'Ada',
  handle: 'ada',
  image: 'https://…',
};

export const ENDPOINTS: ApiEndpoint[] = [
  // ─── Account ────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/v1/me',
    operationId: 'getMe',
    group: 'Account',
    scope: 'read:profile',
    summary: 'Get your account',
    description: 'The authenticated key owner’s account summary, tier, and stats.',
    responseExample: {
      id: 'ck_user123',
      name: 'Ada',
      handle: 'ada',
      image: 'https://…',
      createdAt: '2026-01-02T03:04:05.000Z',
      tier: 'pro',
      stats: {
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
    method: 'GET',
    path: '/api/v1/me/notifications',
    operationId: 'listMyNotifications',
    group: 'Account',
    scope: 'read:notifications',
    summary: 'List your notifications',
    description: 'Your notifications, newest first.',
    paginated: true,
    params: PAGE_PARAMS,
    responseExample: {
      data: [
        {
          id: 'ck_n1',
          type: 'FOLLOW',
          actor: AUTHOR_OBJECT,
          preview: null,
          link: '/u/ada',
          read: false,
          createdAt: '2026-06-30T09:00:00.000Z',
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/bookmarks',
    operationId: 'listMyBookmarks',
    group: 'Account',
    scope: 'read:bookmarks',
    summary: 'List your bookmarks',
    description:
      'Posts you have bookmarked, newest first. With `since` you get only the bookmarks made after that instant; a post you un-bookmarked is reported by `GET /api/v1/me/deleted?kind=bookmark`. ' +
      QUIET_COUNTS_NOTE,
    paginated: true,
    params: [
      ...PAGE_PARAMS,
      {
        name: 'since',
        in: 'query',
        type: 'string',
        description: 'Only bookmarks made after this ISO 8601 instant.',
      },
    ],
    responseExample: {
      data: [
        {
          ...POST_OBJECT,
          author: AUTHOR_OBJECT,
          bookmarkedAt: '2026-06-29T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/following',
    operationId: 'listMyFollowing',
    group: 'Account',
    scope: 'read:profile',
    summary: 'List who you follow',
    description: 'Users the authenticated account follows.',
    paginated: true,
    params: PAGE_PARAMS,
    responseExample: {
      data: [AUTHOR_OBJECT],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/followers',
    operationId: 'listMyFollowers',
    group: 'Account',
    scope: 'read:profile',
    summary: 'List your followers',
    description: 'Users who follow the authenticated account.',
    paginated: true,
    params: PAGE_PARAMS,
    responseExample: {
      data: [AUTHOR_OBJECT],
      nextCursor: null,
    },
  },

  // ─── Posts ──────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/v1/posts',
    operationId: 'listMyPosts',
    group: 'Posts',
    scope: 'read:posts',
    summary: 'List your posts',
    description: 'Your recent posts, newest first. ' + PIN_NOTE,
    paginated: true,
    params: PAGE_PARAMS,
    responseExample: {
      data: [
        {
          ...POST_OBJECT,
          pinnedOrder: null,
        },
      ],
      nextCursor: '2026-06-20T10:00:00.000Z',
    },
  },
  {
    method: 'POST',
    path: '/api/v1/posts',
    operationId: 'createPost',
    group: 'Posts',
    scope: 'write:posts',
    idempotent: true,
    status: 201,
    summary: 'Create a post',
    description: 'Create a post on your account. Awards XP and progresses quests exactly like the in-app composer.',
    requestBody: {
      fields: [
        {
          name: 'content',
          type: 'string',
          description: '1–280 characters. Optional if at least one `media_ids` entry is supplied.',
        },
        {
          name: 'media_ids',
          type: 'string[]',
          description: 'Up to 4 media ids from POST /api/v1/images.',
        },
        {
          name: 'audience',
          type: 'string',
          description: '`PUBLIC` (default), `FOLLOWERS`, or `PRIVATE`.',
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
          description: 'A flair of that community (needs `communityId`); required when the community requires one.',
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
      example: {
        content: 'Posted via the API!',
        audience: 'PUBLIC',
      },
    },
    responseExample: {
      id: 'ck_post123',
      content: 'Posted via the API!',
      audience: 'PUBLIC',
      createdAt: '2026-06-30T10:00:00.000Z',
    },
  },
  {
    method: 'GET',
    path: '/api/v1/posts/{id}',
    operationId: 'getPost',
    group: 'Posts',
    scope: 'read:posts',
    summary: 'Get a post',
    description:
      'Fetch a single post by id. Returns public posts and your own posts; otherwise 404. ' +
      QUIET_COUNTS_NOTE +
      ' ' +
      PIN_NOTE +
      ' ' +
      POLL_NOTE,
    params: [
      {
        name: 'id',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The post id.',
      },
    ],
    responseExample: {
      ...POST_OBJECT,
      pinnedOrder: null,
      poll: null,
      author: AUTHOR_OBJECT,
    },
  },
  {
    method: 'DELETE',
    path: '/api/v1/posts/{id}',
    operationId: 'deletePost',
    group: 'Posts',
    scope: 'write:posts',
    idempotent: true,
    status: 204,
    summary: 'Delete a post',
    description: 'Soft-delete one of your own posts. Returns 204 on success.',
    params: [
      {
        name: 'id',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The post id.',
      },
    ],
  },

  // ─── Engagement ───────────────────────────────────────────────────────────
  {
    method: 'POST',
    path: '/api/v1/posts/{id}/like',
    operationId: 'likePost',
    group: 'Engagement',
    scope: 'write:likes',
    idempotent: true,
    summary: 'Like a post',
    description:
      'Like a post. Idempotent — liking an already-liked post is a no-op. `likeCount` is `null` when the post’s author hides the counts on their posts.',
    params: [
      {
        name: 'id',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The post id.',
      },
    ],
    responseExample: {
      liked: true,
      likeCount: 4,
    },
  },
  {
    method: 'DELETE',
    path: '/api/v1/posts/{id}/like',
    operationId: 'unlikePost',
    group: 'Engagement',
    scope: 'write:likes',
    idempotent: true,
    summary: 'Unlike a post',
    description: 'Remove your like from a post.',
    params: [
      {
        name: 'id',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The post id.',
      },
    ],
    responseExample: {
      liked: false,
      likeCount: 3,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/posts/{id}/comments',
    operationId: 'listComments',
    group: 'Engagement',
    scope: 'read:feed',
    paginated: true,
    summary: 'List a post’s comments',
    description: 'Top-level comments on a post, newest first.',
    params: [
      {
        name: 'id',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The post id.',
      },
      ...PAGE_PARAMS,
    ],
    responseExample: {
      data: [
        {
          id: 'ck_c1',
          content: 'nice',
          createdAt: '2026-06-30T10:01:00.000Z',
          author: AUTHOR_OBJECT,
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'POST',
    path: '/api/v1/posts/{id}/comments',
    operationId: 'createComment',
    group: 'Engagement',
    scope: 'write:comments',
    idempotent: true,
    status: 201,
    summary: 'Comment on a post',
    description: 'Add a comment (or threaded reply) to a post.',
    params: [
      {
        name: 'id',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The post id.',
      },
    ],
    requestBody: {
      fields: [
        {
          name: 'content',
          type: 'string',
          required: true,
          description: '1–280 characters.',
        },
        {
          name: 'parent_id',
          type: 'string',
          description: 'Comment id to reply to (optional).',
        },
      ],
      example: {
        content: 'Great post!',
      },
    },
    responseExample: {
      id: 'ck_c1',
      content: 'Great post!',
      createdAt: '2026-06-30T10:01:00.000Z',
      author: AUTHOR_OBJECT,
    },
  },
  {
    method: 'POST',
    path: '/api/v1/posts/{id}/bookmark',
    operationId: 'bookmarkPost',
    group: 'Engagement',
    scope: 'write:bookmarks',
    idempotent: true,
    summary: 'Bookmark a post',
    description: 'Add a post to your bookmarks.',
    params: [
      {
        name: 'id',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The post id.',
      },
    ],
    responseExample: {
      bookmarked: true,
    },
  },
  {
    method: 'DELETE',
    path: '/api/v1/posts/{id}/bookmark',
    operationId: 'unbookmarkPost',
    group: 'Engagement',
    scope: 'write:bookmarks',
    idempotent: true,
    summary: 'Remove a bookmark',
    description: 'Remove a post from your bookmarks.',
    params: [
      {
        name: 'id',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The post id.',
      },
    ],
    responseExample: {
      bookmarked: false,
    },
  },

  // ─── Feed ────────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/v1/feed',
    operationId: 'getFeed',
    group: 'Feed',
    scope: 'read:feed',
    paginated: true,
    params: PAGE_PARAMS,
    summary: 'Get the public feed',
    description: 'The public global feed. Only public, free, non-community posts are returned. ' + QUIET_COUNTS_NOTE,
    responseExample: {
      data: [
        {
          ...POST_OBJECT,
          author: AUTHOR_OBJECT,
        },
      ],
      nextCursor: '2026-06-20T09:59:00.000Z',
    },
  },

  // ─── Users ───────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/v1/users/{handle}',
    operationId: 'getUser',
    group: 'Users',
    scope: 'read:users',
    summary: 'Get a public profile',
    description: 'A public user profile by handle.',
    params: [
      {
        name: 'handle',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The user’s handle (without @).',
      },
    ],
    responseExample: {
      id: 'ck_user123',
      name: 'Ada',
      handle: 'ada',
      image: 'https://…',
      bio: 'builder',
      createdAt: '2026-01-02T03:04:05.000Z',
      stats: {
        followers: 12,
        following: 30,
        posts: 88,
        level: 7,
      },
    },
  },
  {
    method: 'GET',
    path: '/api/v1/users/{handle}/posts',
    operationId: 'listUserPosts',
    group: 'Users',
    scope: 'read:users',
    paginated: true,
    summary: 'List a user’s public posts',
    description: 'A user’s public posts, newest first. ' + QUIET_COUNTS_NOTE,
    params: [
      {
        name: 'handle',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The user’s handle.',
      },
      ...PAGE_PARAMS,
    ],
    responseExample: {
      data: [
        {
          ...POST_OBJECT,
          author: AUTHOR_OBJECT,
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/users/{handle}/followers',
    operationId: 'listUserFollowers',
    group: 'Users',
    scope: 'read:users',
    paginated: true,
    summary: 'List a user’s followers',
    description:
      'Users who follow this user. Answers 403 `list_private` when the member keeps the list private from the key’s account. Blocked accounts are left out.',
    params: [
      {
        name: 'handle',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The user’s handle.',
      },
      ...PAGE_PARAMS,
    ],
    responseExample: {
      data: [AUTHOR_OBJECT],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/users/{handle}/following',
    operationId: 'listUserFollowing',
    group: 'Users',
    scope: 'read:users',
    paginated: true,
    summary: 'List who a user follows',
    description:
      'Users this user follows. Answers 403 `list_private` when the member keeps the list private from the key’s account. Blocked accounts are left out.',
    params: [
      {
        name: 'handle',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The user’s handle.',
      },
      ...PAGE_PARAMS,
    ],
    responseExample: {
      data: [AUTHOR_OBJECT],
      nextCursor: null,
    },
  },
  {
    method: 'POST',
    path: '/api/v1/users/{handle}/follow',
    operationId: 'followUser',
    group: 'Users',
    scope: 'write:follows',
    idempotent: true,
    summary: 'Follow a user',
    description: 'Follow a user. Idempotent.',
    params: [
      {
        name: 'handle',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The user’s handle.',
      },
    ],
    responseExample: {
      following: true,
    },
  },
  {
    method: 'DELETE',
    path: '/api/v1/users/{handle}/follow',
    operationId: 'unfollowUser',
    group: 'Users',
    scope: 'write:follows',
    idempotent: true,
    summary: 'Unfollow a user',
    description: 'Stop following a user.',
    params: [
      {
        name: 'handle',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The user’s handle.',
      },
    ],
    responseExample: {
      following: false,
    },
  },

  // ─── Media ───────────────────────────────────────────────────────────────
  {
    method: 'POST',
    path: '/api/v1/images',
    operationId: 'uploadImage',
    group: 'Media',
    scope: 'write:media',
    status: 201,
    summary: 'Upload an image',
    description:
      'Upload one image (multipart/form-data, field `image`, max 5 MB) and receive an opaque `media_id` to attach to a post via `media_ids`, or, with `surface=flashcard`, to set on a flashcard side as `{ media_id, alt }`. Unattached media expires ~24h after upload.',
    requestBody: {
      contentType: 'multipart/form-data',
      fields: [
        {
          name: 'image',
          type: 'file',
          required: true,
          description: 'png/jpg/webp/gif, max 5 MB (png/jpg/webp only with `surface=flashcard`).',
        },
        {
          name: 'surface',
          type: 'string',
          description:
            'Optional. `flashcard` stores the picture for a flashcard side: still images only, metadata stripped. Omit it for a post image.',
        },
      ],
    },
    responseExample: {
      id: 'media_abc',
      type: 'image',
      expires_at: '2026-07-01T10:00:00.000Z',
    },
  },

  // ─── Content ─────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/v1/builds',
    operationId: 'listBuilds',
    group: 'Content',
    scope: 'read:builds',
    paginated: true,
    summary: 'List public builds',
    description: 'The public builds marketplace, newest first.',
    params: [
      {
        name: 'category',
        in: 'query',
        type: 'string',
        description: 'Filter by category slug.',
      },
      ...PAGE_PARAMS,
    ],
    responseExample: {
      data: [
        {
          slug: 'my-build',
          title: 'My Build',
          description: '…',
          author: AUTHOR_OBJECT,
          technologies: ['react'],
          price: null,
          metrics: {
            likes: 4,
            comments: 1,
            views: 90,
          },
          publishedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/builds/{slug}',
    operationId: 'getBuild',
    group: 'Content',
    scope: 'read:builds',
    summary: 'Get a build',
    description:
      'A single public build, including its readme, its cover description (`thumbnailAlt`), its described `screenshots` in order (up to 8) and its latest releases (up to 20, newest first). `versions` is deprecated: it carries the same releases without `commitHash`; read `releases` instead.',
    params: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The build slug.',
      },
    ],
    responseExample: {
      slug: 'my-build',
      title: 'My Build',
      description: '…',
      readme: '# My Build',
      repoUrl: null,
      demoUrl: null,
      thumbnailAlt: null,
      screenshots: [
        {
          url: 'https://rmhstudios.com/api/image/example.webp',
          width: 1280,
          height: 720,
          description: 'The title screen with the level list open.',
        },
      ],
      author: AUTHOR_OBJECT,
      technologies: ['react'],
      metrics: {
        likes: 4,
        comments: 1,
        views: 90,
      },
      versions: [
        {
          version: '1.1',
          changelog: 'Faster loading.',
          createdAt: '2026-11-20T12:00:00.000Z',
        },
      ],
      releases: [
        {
          version: '1.1',
          changelog: 'Faster loading.',
          commitHash: '3f2a9c1',
          createdAt: '2026-11-20T12:00:00.000Z',
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/api/v1/blog',
    operationId: 'listBlog',
    group: 'Content',
    scope: 'read:content',
    paginated: true,
    params: PAGE_PARAMS,
    summary: 'List blog posts',
    description: 'RMH Studios devlog posts, newest first.',
    responseExample: {
      data: [
        {
          slug: 'hello',
          title: 'Hello',
          description: '…',
          date: '2026-06-01',
          tags: ['news'],
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/blog/{slug}',
    operationId: 'getBlogPost',
    group: 'Content',
    scope: 'read:content',
    summary: 'Get a blog post',
    description: 'A single blog post, including markdown content.',
    params: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The post slug.',
      },
    ],
    responseExample: {
      slug: 'hello',
      title: 'Hello',
      description: '…',
      date: '2026-06-01',
      tags: ['news'],
      content: '# Hello',
    },
  },
  {
    method: 'GET',
    path: '/api/v1/news',
    operationId: 'listNews',
    group: 'Content',
    scope: 'read:content',
    paginated: true,
    summary: 'List news articles',
    description: 'Published news articles, newest first.',
    params: [
      {
        name: 'category',
        in: 'query',
        type: 'string',
        description: 'Filter by category.',
      },
      ...PAGE_PARAMS,
    ],
    responseExample: {
      data: [
        {
          slug: 'big-news',
          title: 'Big News',
          description: '…',
          date: '2026-06-01',
          category: 'updates',
          featured: false,
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/news/{slug}',
    operationId: 'getNewsArticle',
    group: 'Content',
    scope: 'read:content',
    summary: 'Get a news article',
    description: 'A single published news article.',
    params: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The article slug.',
      },
    ],
    responseExample: {
      slug: 'big-news',
      title: 'Big News',
      description: '…',
      date: '2026-06-01',
      category: 'updates',
      content: '…',
      source: {
        title: '…',
        url: 'https://…',
        publisher: '…',
      },
    },
  },
  {
    method: 'GET',
    path: '/api/v1/leaderboards/{game}',
    operationId: 'getLeaderboard',
    group: 'Content',
    scope: 'read:leaderboards',
    paginated: true,
    summary: 'Get a game leaderboard',
    description: 'Top scores for a game. Supported games are listed in the response of an unknown game (400).',
    params: [
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
        description: 'Page size, 1–100 (default 25).',
      },
    ],
    responseExample: {
      game: 'vega',
      metric: 'highScore',
      data: [
        {
          rank: 1,
          username: 'ada',
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
        description: 'Opaque cursor from a previous `nextCursor` to fetch the next page.',
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
    method: 'GET',
    path: '/api/v1/webhooks',
    operationId: 'listWebhooks',
    group: 'Webhooks',
    scope: 'manage:webhooks',
    summary: 'List webhook endpoints',
    description: 'Your registered webhook endpoints.',
    responseExample: {
      data: [
        {
          id: 'wh_1',
          url: 'https://example.com/hook',
          events: ['post.created'],
          enabled: true,
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/api/v1/webhooks',
    operationId: 'createWebhook',
    group: 'Webhooks',
    scope: 'manage:webhooks',
    idempotent: true,
    status: 201,
    summary: 'Create a webhook endpoint',
    description: 'Register a URL to receive HMAC-signed event deliveries. The signing `secret` is returned once.',
    requestBody: {
      fields: [
        {
          name: 'url',
          type: 'string',
          required: true,
          description: 'HTTPS URL to deliver events to.',
        },
        {
          name: 'events',
          type: 'string[]',
          required: true,
          description: 'Event names to subscribe to, or `["*"]` for all. See the Webhooks guide.',
        },
        {
          name: 'description',
          type: 'string',
          description: 'Optional label.',
        },
      ],
      example: {
        url: 'https://example.com/hook',
        events: ['post.created', 'follow.created'],
      },
    },
    responseExample: {
      id: 'wh_1',
      url: 'https://example.com/hook',
      events: ['post.created', 'follow.created'],
      enabled: true,
      secret: 'whsec_…',
      createdAt: '2026-06-01T00:00:00.000Z',
    },
  },
  {
    method: 'GET',
    path: '/api/v1/webhooks/{id}',
    operationId: 'getWebhook',
    group: 'Webhooks',
    scope: 'manage:webhooks',
    summary: 'Get a webhook endpoint',
    description: 'One webhook endpoint with recent delivery attempts.',
    params: [
      {
        name: 'id',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The webhook id.',
      },
    ],
    responseExample: {
      id: 'wh_1',
      url: 'https://example.com/hook',
      events: ['post.created'],
      enabled: true,
      failureCount: 0,
      recentDeliveries: [],
    },
  },
  {
    method: 'PATCH',
    path: '/api/v1/webhooks/{id}',
    operationId: 'updateWebhook',
    group: 'Webhooks',
    scope: 'manage:webhooks',
    summary: 'Update a webhook endpoint',
    description: 'Update the URL, subscribed events, description, or enabled state.',
    params: [
      {
        name: 'id',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The webhook id.',
      },
    ],
    requestBody: {
      fields: [
        {
          name: 'url',
          type: 'string',
          description: 'New HTTPS URL.',
        },
        {
          name: 'events',
          type: 'string[]',
          description: 'New event subscription list.',
        },
        {
          name: 'description',
          type: 'string',
          description: 'New label.',
        },
        {
          name: 'enabled',
          type: 'boolean',
          description: 'Enable or disable deliveries.',
        },
      ],
      example: {
        enabled: false,
      },
    },
    responseExample: {
      id: 'wh_1',
      url: 'https://example.com/hook',
      events: ['post.created'],
      enabled: false,
    },
  },
  {
    method: 'DELETE',
    path: '/api/v1/webhooks/{id}',
    operationId: 'deleteWebhook',
    group: 'Webhooks',
    scope: 'manage:webhooks',
    status: 204,
    summary: 'Delete a webhook endpoint',
    description: 'Permanently remove a webhook endpoint.',
    params: [
      {
        name: 'id',
        in: 'path',
        required: true,
        type: 'string',
        description: 'The webhook id.',
      },
    ],
  },

  // ─── Meta ────────────────────────────────────────────────────────────────
  {
    method: 'GET',
    path: '/api/v1/openapi.json',
    operationId: 'getOpenApi',
    group: 'Meta',
    scope: null,
    summary: 'OpenAPI document',
    description: 'The machine-readable OpenAPI 3.1 description of this API. No authentication required.',
    responseExample: {
      openapi: '3.1.0',
      info: {
        title: 'RMH Studios API',
        version: 'v1',
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
    description:
      'Your flashcard decks, newest change first. `dueCount` is how many cards are due now; `suspended` is how many the key owner has set aside (not in `dueCount`). Only your own decks are listed.',
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
    description:
      'The cards you wrote, in deck order. Cards generated from them (the reverse side of a reversible card, one card per cloze deletion or occlusion mask) are not listed. `frontImage` and `backImage` are `{ url, alt }` or `null`. `frontSound` and `backSound` are `{ url, transcript, durationMs }` or `null`: a sound you recorded on the site, read-only here, and private to you. `occlusion` is `{ mode, masks }` on a `kind: "occlusion"` card and `null` on every other kind.',
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
      {
        name: 'since',
        in: 'query',
        type: 'string',
        description:
          'Only cards created after this ISO 8601 instant, still in deck order. Editing a card does not change its creation time; deleted cards are in `GET /api/v1/me/deleted?kind=card`.',
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
          frontImage: null,
          backImage: null,
          frontSound: null,
          backSound: null,
          occlusion: null,
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
    description:
      'Add 1 to 100 cards in one request, all or nothing: one invalid card, a duplicate `externalId`, or a deck over its 2,000-card limit (generated cards count) writes nothing. Reversible, cloze and occlusion cards get their generated cards exactly as in the editor. `kind` is `basic`, `reversible`, `cloze` (a cloze card has only `front`, with `{{c1::answer}}` deletions) or `occlusion` (a front picture and `occlusion` masks; each mask is one card).',
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
          description:
            '1–100 cards: `{ kind?, front, back?, externalId?, frontImage?, backImage?, occlusion? }`. `front` and `back` up to 500 characters (a cloze `front` up to 1000; an occlusion card’s `front` is an optional prompt and its `back` an optional note); `externalId` up to 100 characters, unique in the deck. A picture is `{ media_id, alt }`: `media_id` from `POST /api/v1/images` with `surface=flashcard`, `alt` a required description (up to 1,000 characters). A cloze card takes a picture on the back only. An occlusion card needs a front picture (a still image) and `occlusion: { mode: "hide-all" | "hide-one", masks: [{ id?, x, y, w, h, label }] }`: 1–20 masks in picture-relative units (0–1, at least 0.02 wide and tall, inside the picture), `label` the answer (up to 200 characters); a mask with no `id` takes the next free one.',
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
          frontImage: null,
          backImage: null,
          frontSound: null,
          backSound: null,
          occlusion: null,
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
    description:
      'Change a card’s kind, front, back, pictures or occlusion masks. Its review history stays (a mask keeps its card when you send its `id` back); its generated cards are regenerated in place. A generated card is 404.',
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
          description: '`basic`, `reversible`, `cloze` or `occlusion`.',
        },
        {
          name: 'front',
          type: 'string',
          description: 'The front (a cloze card’s whole text; an occlusion card’s optional prompt).',
        },
        {
          name: 'back',
          type: 'string',
          description: 'The back.',
        },
        {
          name: 'frontImage',
          type: 'object',
          description:
            'A picture for this side: `{ media_id, alt }`, where `media_id` is an upload of yours from `POST /api/v1/images` with `surface=flashcard` and `alt` is the description a screen reader reads (required, up to 1,000 characters). `null` removes the picture. A cloze card takes a picture on the back only. You can have pictures on at most 500 cards.',
        },
        {
          name: 'backImage',
          type: 'object',
          description: 'The picture on the back, the same shape as `frontImage`.',
        },
        {
          name: 'occlusion',
          type: 'object',
          description:
            'The masks of an occlusion card: `{ mode: "hide-all" | "hide-one", masks: [{ id?, x, y, w, h, label }] }`. Send back the `id`s a read returned so each mask keeps its card’s review history. `null` clears them (a card changed to another kind).',
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
      frontImage: null,
      backImage: null,
      frontSound: null,
      backSound: null,
      occlusion: null,
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
    description:
      'Create the card keyed by your own id in this deck, or update it. The same body sent twice changes nothing the second time. 201 when created, 200 when the card already existed.',
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
          description: '`basic` (default), `reversible`, `cloze` or `occlusion`.',
        },
        {
          name: 'front',
          type: 'string',
          required: true,
          description: 'The front. Optional for an occlusion card, where it is the prompt.',
        },
        {
          name: 'back',
          type: 'string',
          description: 'The back (not used by cloze cards).',
        },
        {
          name: 'frontImage',
          type: 'object',
          description:
            'A picture for this side: `{ media_id, alt }`, where `media_id` is an upload of yours from `POST /api/v1/images` with `surface=flashcard` and `alt` is the description a screen reader reads (required, up to 1,000 characters). `null` removes the picture. A cloze card takes a picture on the back only. You can have pictures on at most 500 cards. A side you leave out keeps its picture.',
        },
        {
          name: 'backImage',
          type: 'object',
          description: 'The picture on the back, the same shape as `frontImage`.',
        },
        {
          name: 'occlusion',
          type: 'object',
          description:
            'The masks of an occlusion card, as for `POST …/cards`. Send back the `id`s a read returned so each mask keeps its card’s review history.',
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
      frontImage: null,
      backImage: null,
      frontSound: null,
      backSound: null,
      occlusion: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/decks/{id}/due',
    operationId: 'getMyDeckDue',
    group: 'Study',
    scope: 'read:study',
    summary: 'Get due counts',
    description:
      'How many cards in the deck are due now and in the next 24 hours (suspended cards are not counted), for a “you have 40 cards due” widget. No card content. To fetch the cards themselves use `GET /api/v1/me/decks/{id}/review`.',
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
    description:
      "Events you can see on the site (a private event or a private community's events only when the site shows them to you), soonest first. A repeating event appears once per date inside the window, with skipped dates left out and moved dates where they now are; `occurrence` is the date's original start, which RSVPs are keyed by. The window defaults to the next 31 days and may be at most 31 days wide. Times are ISO 8601 UTC with the event's `timeZone` beside them.",
    paginated: true,
    params: [
      {
        name: 'from',
        in: 'query',
        type: 'string',
        description: 'Start of the window, an ISO 8601 date or timestamp (default now).',
      },
      {
        name: 'to',
        in: 'query',
        type: 'string',
        description: 'End of the window (default 31 days after `from`; at most 31 days after it).',
      },
      { name: 'community', in: 'query', type: 'string', description: 'Only events of this community (id or slug).' },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 25).' },
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
    description:
      'One event you can see, with its next dates (up to 10, overrides applied), the going, maybe and waitlisted counts, the host and co-hosts, and the latest five updates. For a repeating event the top-level date is the next one that is on. A guest list is `GET /events/{id}/attendees`, for hosts only. Counts are read from at most 8,000 answers per event, so on an event with more than that they are approximate.',
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true }],
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
    description:
      "Who is going or maybe for one date, by handle, display name and status. Only the event's host and accepted co-hosts may read it (`403` for anyone else, who can read the counts from the event). On a repeating event `occurrence` picks the date (its original start); without it, the next date that is on.",
    paginated: true,
    params: [
      { name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true },
      {
        name: 'occurrence',
        in: 'query',
        type: 'string',
        description: "The date's original start, an ISO 8601 timestamp (repeating events).",
      },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 25).' },
      {
        name: 'cursor',
        in: 'query',
        type: 'string',
        description: 'Opaque cursor from a previous `nextCursor` to fetch the next page.',
      },
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
    description:
      'The dates of events you answered going or maybe to, soonest first, in the same shape as `GET /events` with `yourRsvp` set. A date you sat out or that was skipped is not listed. Same window rules as `GET /events`.',
    paginated: true,
    params: [
      {
        name: 'from',
        in: 'query',
        type: 'string',
        description: 'Start of the window, an ISO 8601 date or timestamp (default now).',
      },
      {
        name: 'to',
        in: 'query',
        type: 'string',
        description: 'End of the window (default 31 days after `from`; at most 31 days after it).',
      },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 25).' },
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
    description:
      "Answer going or maybe, through the site's own RSVP, so capacity, the waitlist, reminders and who may see the event are the site's rules. A full one-off event answers `status: \"waitlisted\"`; a full repeating event has no waitlist and is a `409`. A member banned or timed out of the event's community is refused with a `403`. On a repeating event the answer is for one date (`occurrence`, the date's original start; default the next one) or, with `everyTime`, every date. The response is the resulting state.",
    idempotent: true,
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true }],
    requestBody: {
      fields: [
        { name: 'status', type: 'string', required: true, description: '`going` or `maybe`.' },
        {
          name: 'occurrence',
          type: 'string',
          description: "The date's original start, an ISO 8601 timestamp (repeating events).",
        },
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
    description:
      'Take your answer back, through the site\'s own un-RSVP (a freed seat goes to the waitlist). On a repeating event it sits out one date (`occurrence`, default the next one), or with `everyTime=true` leaves the series. The response is the resulting state, `status: "none"` when you no longer have an answer.',
    idempotent: true,
    params: [
      { name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true },
      {
        name: 'occurrence',
        in: 'query',
        type: 'string',
        description: "The date's original start, an ISO 8601 timestamp (repeating events).",
      },
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
    description:
      'The communities you belong to, newest membership first, with your role and the day you joined. Joining and leaving stay on the site.',
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
    description:
      'A community you can see: its description, member count, privacy, posting requirements, flairs and whether you are a member (`role` is `null` when you are not). A private community you are not a member of is a 404. Member lists are not exposed.',
    params: [{ name: 'slug', in: 'path', type: 'string', description: 'The community slug.', required: true }],
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
    summary: "Get a community's rules",
    description:
      'The rules as the site shows them, in order (`position` starts at 1). Same visibility as `GET /communities/{slug}`.',
    params: [{ name: 'slug', in: 'path', type: 'string', description: 'The community slug.', required: true }],
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
    summary: "List a community's posts",
    description:
      'The community feed as the site returns it to you, newest first: the same visibility, removed and held posts left out, and quiet counts. Paginate with the opaque `nextCursor`. ' +
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
          pinned: false,
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
    description:
      'Your highlights and notes on library books, blog posts and news, newest first. Private notes are returned because they are yours; a wildcard key (`read:*`, `*`) can read them too. With `since` (ISO 8601) you get the highlights **updated** after that instant instead, ordered by `updatedAt` then `id` ascending, so a sync can store the last `updatedAt` it saw and ask again from there; follow `nextCursor` (a cursor from one mode does not work in the other). A highlight whose document has been removed is returned with `document: null` (as in the example); otherwise `document` is `{ title, url }`. To learn which highlights were deleted, ask `GET /api/v1/me/deleted?kind=highlight&since=…`. Highlights cannot be created through the API.',
    paginated: true,
    params: [
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 30).' },
      { name: 'cursor', in: 'query', type: 'string', description: 'Opaque cursor from a previous `nextCursor`.' },
      { name: 'kind', in: 'query', type: 'string', description: 'Only `library`, `blog` or `news` highlights.' },
      {
        name: 'since',
        in: 'query',
        type: 'string',
        description: 'Only highlights updated after this ISO 8601 instant, oldest update first.',
      },
      {
        name: 'hasNote',
        in: 'query',
        type: 'boolean',
        description: '`true` for highlights with a note, `false` for those without.',
      },
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
        },
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
    description:
      'Change the note and/or visibility of one of your highlights. `note: null` or an empty string clears the note. It runs the same function as the site, so the public-highlight rules apply; the API cannot supply the passage positions the reader computes, so a highlight made public here is public but does not count toward "popular passages". A highlight that is not yours is a 404.',
    idempotent: true,
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The highlight id.', required: true }],
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
    description:
      'Permanently delete one of your highlights and its note. The deletion is kept as a tombstone for 90 days, so a `since` sync finds it through `GET /api/v1/me/deleted`.',
    idempotent: true,
    status: 204,
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The highlight id.', required: true }],
  },
  {
    method: 'GET',
    path: '/api/v1/me/shelves',
    operationId: 'listMyShelves',
    group: 'Reading',
    scope: 'read:reading',
    summary: 'List your shelves',
    description:
      'Your shelf entries (`want`, `reading`, `read`), most recently changed first, up to 500. Optionally only one shelf.',
    params: [{ name: 'shelf', in: 'query', type: 'string', description: '`want`, `reading` or `read`.' }],
    responseExample: {
      data: [
        {
          slug: 'meditations',
          title: 'Meditations',
          shelf: 'want',
          pages: 254,
          finishedAt: null,
          updatedAt: '2026-11-10T08:00:00.000Z',
        },
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
    description:
      "Shelve a library book, moving it if it is already shelved. Marking it `read` stamps `finishedAt` (now, or the date already there, or the one you send) and it counts toward that year's reading goal. A slug that is not a library book is a 404.",
    idempotent: true,
    params: [{ name: 'slug', in: 'path', type: 'string', description: 'The library book slug.', required: true }],
    requestBody: {
      fields: [
        { name: 'shelf', type: 'string', required: true, description: '`want`, `reading` or `read`.' },
        { name: 'pages', type: 'integer', description: 'Page count, used only when the book has none of its own.' },
        {
          name: 'finishedAt',
          type: 'string | null',
          description: 'ISO 8601 finish date; only with `read`, not in the future.',
        },
      ],
      example: { shelf: 'read', finishedAt: '2026-11-10T00:00:00.000Z' },
    },
    responseExample: {
      slug: 'meditations',
      title: 'Meditations',
      shelf: 'want',
      pages: 254,
      finishedAt: null,
      updatedAt: '2026-11-10T08:00:00.000Z',
    },
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
    params: [{ name: 'slug', in: 'path', type: 'string', description: 'The library book slug.', required: true }],
  },
  {
    method: 'GET',
    path: '/api/v1/me/reading-goal',
    operationId: 'getMyReadingGoal',
    group: 'Reading',
    scope: 'read:reading',
    summary: 'Get your reading goal',
    description:
      "Your goal for a year and how far along you are: books and pages finished that year and `done` in the goal's unit. `goal` is `null` when you set none, otherwise `{ unit, target, books, pages, done }`. Setting the goal stays on the site.",
    params: [
      {
        name: 'year',
        in: 'query',
        type: 'integer',
        description: 'The year, 2000–2200 (default the current UTC year).',
      },
    ],
    responseExample: {
      year: 2026,
      goal: null,
    },
  },

  // Sprint 08 (docs/autonomous/sprint-08/plan.md §Anchors)
  // s08-02 api-tournaments
  {
    method: 'GET',
    path: '/api/v1/tournaments',
    operationId: 'listTournaments',
    group: 'Tournaments',
    scope: 'read:tournaments',
    summary: 'List tournaments',
    description:
      'Public tournaments, newest first (cancelled ones only with `status=CANCELLED`). An unlisted tournament is never listed; its id still opens it. `status` is `REGISTRATION`, `LIVE`, `COMPLETE` or `CANCELLED`, and `game` is a game id. `startsAt`, `checkInMinutes`, `checkInOpensAt`, `matchDeadlineHours`, `swissRounds`, `startedAt`, `completedAt` and `gameTitle` are `null` when the tournament has none. Registering, withdrawing and creating stay on the site: they move coins.',
    paginated: true,
    params: [
      { name: 'status', in: 'query', type: 'string', description: 'Only tournaments in this status.' },
      { name: 'game', in: 'query', type: 'string', description: 'Only tournaments of this game id.' },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 25).' },
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
          id: 'cltourney1',
          name: 'Friday bracket',
          gameId: 'altair',
          gameTitle: null,
          format: 'SINGLE_ELIM',
          status: 'REGISTRATION',
          entryFeeCoins: 100,
          prizePoolCoins: 300,
          minPlayers: 2,
          maxPlayers: 8,
          playerCount: 3,
          swissRounds: null,
          seeding: 'join',
          startsAt: null,
          checkInMinutes: null,
          checkInOpensAt: null,
          matchDeadlineHours: null,
          startedAt: null,
          completedAt: null,
          createdAt: '2026-11-20T18:00:00.000Z',
          host: { handle: 'ada', name: 'Ada' },
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/tournaments/{id}',
    operationId: 'getTournament',
    group: 'Tournaments',
    scope: 'read:tournaments',
    summary: 'Get a tournament',
    description:
      'One tournament as its site page shows it: game, format, status, entry fee, prize pool, player caps, check-in window, deadlines and start and completion times. An unlisted tournament is returned by id exactly when the site page shows it. `you` says whether you are entered and checked in. Nothing private is returned: no e-mail, coin balance or rating.',
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The tournament id.', required: true }],
    responseExample: {
      id: 'cltourney1',
      name: 'Friday bracket',
      gameId: 'altair',
      gameTitle: null,
      format: 'SINGLE_ELIM',
      status: 'REGISTRATION',
      entryFeeCoins: 100,
      prizePoolCoins: 300,
      minPlayers: 2,
      maxPlayers: 8,
      playerCount: 3,
      swissRounds: null,
      seeding: 'join',
      startsAt: null,
      checkInMinutes: null,
      checkInOpensAt: null,
      matchDeadlineHours: null,
      startedAt: null,
      completedAt: null,
      createdAt: '2026-11-20T18:00:00.000Z',
      host: { handle: 'ada', name: 'Ada' },
      you: { entered: true, checkedIn: false },
    },
  },
  {
    method: 'GET',
    path: '/api/v1/tournaments/{id}/matches',
    operationId: 'listTournamentMatches',
    group: 'Tournaments',
    scope: 'read:tournaments',
    summary: 'Read a tournament bracket',
    description:
      'The bracket by round and slot, one page of matches with both players (public handle and display name only). `bracket` is `W` (winners), `L` (losers), `GF` (grand final) or `GR` (bracket reset); `W` for other formats. `state` is `PENDING`, `READY`, `LIVE`, `COMPLETE` or `CANCELLED`. `claim` is the reported result awaiting the opponent (`state: "open"`, answerable until `answerBy`) or `"disputed"`, and `null` when there is none; who reported what is shown only to the two players and the host, and a claim\'s note is never returned. Sides are `null` until the bracket fills them.',
    paginated: true,
    params: [
      { name: 'id', in: 'path', type: 'string', description: 'The tournament id.', required: true },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–200 (default 100).' },
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
          id: 'clmatch1',
          round: 2,
          slot: 1,
          bracket: 'W',
          state: 'PENDING',
          playerA: null,
          playerB: null,
          winnerEntrantId: null,
          resultSource: null,
          scheduledAt: null,
          deadlineAt: null,
          claim: null,
        },
        {
          id: 'clmatch2',
          round: 1,
          slot: 1,
          bracket: 'W',
          state: 'LIVE',
          playerA: { entrantId: 'clentrant1', seed: 1, handle: 'ada', name: 'Ada' },
          playerB: { entrantId: 'clentrant2', seed: 2, handle: 'bob', name: 'Bob' },
          winnerEntrantId: null,
          resultSource: null,
          scheduledAt: '2026-11-26T19:00:00.000Z',
          deadlineAt: '2026-11-27T19:00:00.000Z',
          claim: {
            state: 'open',
            winnerEntrantId: 'clentrant1',
            claimedByEntrantId: 'clentrant1',
            claimedAt: '2026-11-26T19:20:00.000Z',
            answerBy: '2026-11-26T19:35:00.000Z',
          },
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/tournaments',
    operationId: 'listMyTournaments',
    group: 'Tournaments',
    scope: 'read:tournaments',
    summary: 'List your tournaments',
    description:
      'The tournaments you entered, newest entry first, each with your entry and `nextMatch`, the match you are due to play (`null` when there is none).',
    paginated: true,
    params: [
      { name: 'status', in: 'query', type: 'string', description: 'Only tournaments in this status.' },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 25).' },
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
          tournament: {
            id: 'cltourney1',
            name: 'Friday bracket',
            gameId: 'altair',
            gameTitle: null,
            format: 'SINGLE_ELIM',
            status: 'REGISTRATION',
            entryFeeCoins: 100,
            prizePoolCoins: 300,
            minPlayers: 2,
            maxPlayers: 8,
            playerCount: 3,
            swissRounds: null,
            seeding: 'join',
            startsAt: null,
            checkInMinutes: null,
            checkInOpensAt: null,
            matchDeadlineHours: null,
            startedAt: null,
            completedAt: null,
            createdAt: '2026-11-20T18:00:00.000Z',
            host: { handle: 'ada', name: 'Ada' },
          },
          entry: {
            entrantId: 'clentrant1',
            seed: null,
            placement: null,
            checkedIn: false,
            wins: 0,
            losses: 0,
          },
          nextMatch: null,
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'POST',
    path: '/api/v1/tournaments/{id}/check-in',
    operationId: 'checkInToTournament',
    group: 'Tournaments',
    scope: 'write:tournaments',
    summary: 'Check in to a tournament',
    description:
      "Check yourself in, through the site's own check-in: it must be open, the tournament still taking registrations and you registered. Repeating it is a no-op. Registering stays on the site.",
    idempotent: true,
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The tournament id.', required: true }],
    responseExample: { tournamentId: 'cltourney1', checkedIn: true },
  },
  {
    method: 'POST',
    path: '/api/v1/tournaments/{id}/matches/{matchId}/claim',
    operationId: 'claimTournamentMatchResult',
    group: 'Tournaments',
    scope: 'write:tournaments',
    summary: 'Report a match result',
    description:
      "Report that you (`me`) or your opponent won, through the site's own claim: only the two players, only a live match, and the opponent has 15 minutes to confirm or dispute it. `status` is `claimed`, `confirmed` or `unchanged`. A report that would confirm the opponent's claim of a match that decides the prizes is `409 confirm_on_site`, and a report that would dispute an existing claim is a `409 conflict`: disputing and the prize-deciding confirmation are done on the site.",
    idempotent: true,
    params: [
      { name: 'id', in: 'path', type: 'string', description: 'The tournament id.', required: true },
      { name: 'matchId', in: 'path', type: 'string', description: 'The match id.', required: true },
    ],
    requestBody: {
      fields: [{ name: 'winner', type: 'string', required: true, description: '`me` or `opponent`.' }],
      example: { winner: 'me' },
    },
    responseExample: { status: 'claimed', settled: false, tournamentComplete: false },
  },
  {
    method: 'POST',
    path: '/api/v1/tournaments/{id}/matches/{matchId}/claim/confirm',
    operationId: 'confirmTournamentMatchResult',
    group: 'Tournaments',
    scope: 'write:tournaments',
    summary: 'Confirm a reported result',
    description:
      'Confirm the result your opponent reported: the match settles and the bracket advances. If settling it would complete a tournament with a prize pool, it answers `409 confirm_on_site` and changes nothing: no call through a key can pay a prize, confirm that result on the site.',
    idempotent: true,
    params: [
      { name: 'id', in: 'path', type: 'string', description: 'The tournament id.', required: true },
      { name: 'matchId', in: 'path', type: 'string', description: 'The match id.', required: true },
    ],
    responseExample: { settled: true, tournamentComplete: false },
  },
  {
    method: 'POST',
    path: '/api/v1/tournaments/{id}/matches/{matchId}/claim/withdraw',
    operationId: 'withdrawTournamentMatchResult',
    group: 'Tournaments',
    scope: 'write:tournaments',
    summary: 'Withdraw a reported result',
    description: 'Take back the result you reported, before your opponent answers it.',
    idempotent: true,
    params: [
      { name: 'id', in: 'path', type: 'string', description: 'The tournament id.', required: true },
      { name: 'matchId', in: 'path', type: 'string', description: 'The match id.', required: true },
    ],
    responseExample: { withdrawn: true },
  },

  // s08-03 api-scheduled
  {
    method: 'GET',
    path: '/api/v1/me/scheduled',
    operationId: 'listMyScheduled',
    group: 'Scheduled',
    scope: 'read:scheduled',
    summary: 'List your drafts and scheduled posts',
    description:
      'Your unpublished drafts, scheduled posts and time capsules (capsules are read-only), newest first. Anything now due is published first, as on the site. `held` says why a row would not go out now (`community_sanction`, `image_descriptions` or `automod`; the rule is never returned); it is read from the publish checks and never stored. Only your own rows are listed.',
    paginated: true,
    params: [
      { name: 'kind', in: 'query', type: 'string', description: 'Filter: `draft`, `scheduled` or `capsule`.' },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–50 (default 20).' },
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
          id: 'clsched1',
          kind: 'scheduled',
          content: 'Weekly digest: three things I read this week.',
          audience: 'PUBLIC',
          replyControl: 'EVERYONE',
          contentWarning: null,
          communityId: null,
          poll: null,
          imageUrls: ['/api/media/med_example.png'],
          imageAlts: ['A cat on a keyboard'],
          gifUrl: null,
          gifAlt: null,
          scheduledAt: '2026-11-23T09:00:00.000Z',
          held: null,
          postId: null,
          createdAt: '2026-11-22T10:15:00.000Z',
          updatedAt: '2026-11-22T10:15:00.000Z',
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'POST',
    path: '/api/v1/me/scheduled',
    operationId: 'createMyScheduled',
    group: 'Scheduled',
    scope: 'write:scheduled',
    summary: 'Save a draft or schedule a post',
    description:
      'Save a draft, or schedule a post with `scheduledAt`. At most 50 drafts and scheduled posts at once (`409 conflict` beyond that). The body is the post body of `POST /api/v1/posts`. A body with `communityId` also needs `write:communities`; a post AutoMod would hold or flag is refused with `422 automod_held`, because a scheduled post is published without a hold. Time capsules are created on the site.',
    idempotent: true,
    status: 201,
    requestBody: {
      fields: [
        {
          name: 'content',
          type: 'string',
          description: 'The post text, up to 1,000 characters. A post needs text, a poll or an image.',
        },
        {
          name: 'scheduledAt',
          type: 'string',
          description: 'ISO 8601 time to publish, UTC. 2 minutes to 365 days ahead. Absent or null saves a draft.',
        },
        { name: 'audience', type: 'string', description: '`PUBLIC` (default), `FOLLOWERS` or `PRIVATE`.' },
        { name: 'replyControl', type: 'string', description: '`EVERYONE` (default), `FOLLOWING` or `MENTIONED`.' },
        {
          name: 'contentWarning',
          type: 'string',
          description: 'A reason for a content warning, 1–80 characters on one line; null removes it.',
        },
        {
          name: 'media_ids',
          type: 'string[]',
          description: 'Up to 4 ids from `POST /api/v1/images`, your own uploads.',
        },
        {
          name: 'media_alts',
          type: 'string[]',
          description: 'A description per image, in the same order, up to 1,000 characters each.',
        },
        {
          name: 'poll',
          type: 'object',
          description:
            'A poll (`question`, `options`, optionally `multiSelect`, `ranked`, `durationHours`, or a quiz). Cannot be combined with `communityId`.',
        },
        {
          name: 'communityId',
          type: 'string',
          description:
            'Post into a community you belong to. Needs `write:communities` too, and the community gate (membership, bans, flair, descriptions, AutoMod) runs when you save.',
        },
      ],
      example: {
        content: 'Weekly digest: three things I read this week.',
        scheduledAt: '2026-11-23T09:00:00.000Z',
      },
    },
    responseExample: {
      id: 'clsched1',
      kind: 'scheduled',
      content: 'Weekly digest: three things I read this week.',
      audience: 'PUBLIC',
      replyControl: 'EVERYONE',
      contentWarning: null,
      communityId: null,
      poll: null,
      imageUrls: ['/api/media/med_example.png'],
      imageAlts: ['A cat on a keyboard'],
      gifUrl: null,
      gifAlt: null,
      scheduledAt: '2026-11-23T09:00:00.000Z',
      held: null,
      postId: null,
      createdAt: '2026-11-22T10:15:00.000Z',
      updatedAt: '2026-11-22T10:15:00.000Z',
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/scheduled/{id}',
    operationId: 'getMyScheduled',
    group: 'Scheduled',
    scope: 'read:scheduled',
    summary: 'Get a draft or scheduled post',
    description: 'One of your drafts, scheduled posts or capsules. Once published, `postId` is the post it became.',
    params: [
      { name: 'id', in: 'path', type: 'string', description: 'The draft or scheduled post id.', required: true },
    ],
    responseExample: {
      id: 'clsched1',
      kind: 'scheduled',
      content: 'Weekly digest: three things I read this week.',
      audience: 'PUBLIC',
      replyControl: 'EVERYONE',
      contentWarning: null,
      communityId: null,
      poll: null,
      imageUrls: ['/api/media/med_example.png'],
      imageAlts: ['A cat on a keyboard'],
      gifUrl: null,
      gifAlt: null,
      scheduledAt: '2026-11-23T09:00:00.000Z',
      held: null,
      postId: null,
      createdAt: '2026-11-22T10:15:00.000Z',
      updatedAt: '2026-11-22T10:15:00.000Z',
    },
  },
  {
    method: 'PATCH',
    path: '/api/v1/me/scheduled/{id}',
    operationId: 'updateMyScheduled',
    group: 'Scheduled',
    scope: 'write:scheduled',
    summary: 'Change a draft or scheduled post',
    description:
      'Change any of the creation fields; `scheduledAt: null` turns a scheduled post back into a draft. A published post or a time capsule is `409 conflict`. Changing a community post needs `write:communities` and runs the community gate again.',
    idempotent: true,
    params: [
      { name: 'id', in: 'path', type: 'string', description: 'The draft or scheduled post id.', required: true },
    ],
    requestBody: {
      fields: [
        {
          name: 'content',
          type: 'string',
          description: 'The post text, up to 1,000 characters. A post needs text, a poll or an image.',
        },
        {
          name: 'scheduledAt',
          type: 'string',
          description: 'ISO 8601 time to publish, UTC. 2 minutes to 365 days ahead. Absent or null saves a draft.',
        },
        { name: 'audience', type: 'string', description: '`PUBLIC` (default), `FOLLOWERS` or `PRIVATE`.' },
        { name: 'replyControl', type: 'string', description: '`EVERYONE` (default), `FOLLOWING` or `MENTIONED`.' },
        {
          name: 'contentWarning',
          type: 'string',
          description: 'A reason for a content warning, 1–80 characters on one line; null removes it.',
        },
        {
          name: 'media_ids',
          type: 'string[]',
          description: 'Up to 4 ids from `POST /api/v1/images`, your own uploads.',
        },
        {
          name: 'media_alts',
          type: 'string[]',
          description: 'A description per image, in the same order, up to 1,000 characters each.',
        },
        {
          name: 'poll',
          type: 'object',
          description:
            'A poll (`question`, `options`, optionally `multiSelect`, `ranked`, `durationHours`, or a quiz). Cannot be combined with `communityId`.',
        },
        {
          name: 'communityId',
          type: 'string',
          description:
            'Post into a community you belong to. Needs `write:communities` too, and the community gate (membership, bans, flair, descriptions, AutoMod) runs when you save.',
        },
      ],
      example: { scheduledAt: '2026-11-24T09:00:00.000Z' },
    },
    responseExample: {
      id: 'clsched1',
      kind: 'scheduled',
      content: 'Weekly digest: three things I read this week.',
      audience: 'PUBLIC',
      replyControl: 'EVERYONE',
      contentWarning: null,
      communityId: null,
      poll: null,
      imageUrls: ['/api/media/med_example.png'],
      imageAlts: ['A cat on a keyboard'],
      gifUrl: null,
      gifAlt: null,
      scheduledAt: '2026-11-23T09:00:00.000Z',
      held: null,
      postId: null,
      createdAt: '2026-11-22T10:15:00.000Z',
      updatedAt: '2026-11-22T10:15:00.000Z',
    },
  },
  {
    method: 'DELETE',
    path: '/api/v1/me/scheduled/{id}',
    operationId: 'deleteMyScheduled',
    group: 'Scheduled',
    scope: 'write:scheduled',
    summary: 'Discard a draft or scheduled post',
    description:
      'Discard a draft or scheduled post. A published post or a time capsule is `409 conflict`; capsules are cancelled on the site.',
    idempotent: true,
    status: 204,
    params: [
      { name: 'id', in: 'path', type: 'string', description: 'The draft or scheduled post id.', required: true },
    ],
  },
  {
    method: 'POST',
    path: '/api/v1/me/scheduled/{id}/publish',
    operationId: 'publishMyScheduled',
    group: 'Scheduled',
    scope: 'write:scheduled',
    summary: 'Publish a draft or scheduled post now',
    description:
      'Publish now, through the same checks as the scheduled sweep. If a check holds it (a community ban or timeout, a missing image description) it stays a draft and the answer is `409 conflict`. A community post needs `write:communities`.',
    idempotent: true,
    params: [
      { name: 'id', in: 'path', type: 'string', description: 'The draft or scheduled post id.', required: true },
    ],
    responseExample: { published: true, postId: 'clpost1' },
  },

  // s08-14 api-search
  {
    method: 'GET',
    path: '/api/v1/search/posts',
    operationId: 'searchPosts',
    group: 'Search',
    scope: 'read:search',
    paginated: true,
    params: [
      {
        name: 'q',
        in: 'query',
        type: 'string',
        description:
          "The query, 1–200 characters. Free text plus the site's operators: `from:@handle`, `in:community-slug`, `has:media`, `before:YYYY-MM-DD`, `after:YYYY-MM-DD`. Operators alone return matching posts newest first.",
        required: true,
      },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–50 (default 20).' },
      {
        name: 'cursor',
        in: 'query',
        type: 'string',
        description:
          'Opaque cursor from a previous `nextCursor` to fetch the next page. Ranked results page through the best 120 matches.',
      },
    ],
    summary: 'Search public posts',
    description:
      "Keyword search over public, free posts with the site's operators. Posts in private communities, posts by members who blocked you or whom you blocked or muted, and posts by banned or deleted members never appear. Semantic search is not available. Each call counts as 3 requests against the daily quota. " +
      QUIET_COUNTS_NOTE,
    responseExample: {
      data: [
        {
          ...POST_OBJECT,
          author: AUTHOR_OBJECT,
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/search/people',
    operationId: 'searchPeople',
    group: 'Search',
    scope: 'read:search',
    params: [
      {
        name: 'q',
        in: 'query',
        type: 'string',
        description: 'A name, handle or display name, 1–100 characters.',
        required: true,
      },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–25 (default 10).' },
    ],
    summary: 'Search people',
    description:
      'Find members by name, handle or display name. Only public profile fields are returned. Members who blocked you or whom you blocked, and banned, deleted or deletion-scheduled accounts, never appear. Each call counts as 3 requests against the daily quota. There is one page: `nextCursor` is always `null`.',
    responseExample: {
      data: [
        {
          ...AUTHOR_OBJECT,
          bio: null,
          location: null,
          website: null,
          createdAt: '2026-01-05T10:00:00.000Z',
        },
      ],
      nextCursor: null,
    },
  },

  // Sprint 09 (docs/autonomous/sprint-09/plan.md §Anchors)
  // s09-08 api-feeds
  {
    method: 'GET',
    path: '/api/v1/me/feeds',
    operationId: 'listMyFeeds',
    group: 'Feeds',
    scope: 'read:feeds',
    summary: 'List your feeds',
    description:
      'Your feeds, lists, saved searches and keyword alerts, newest first. `kind` is `feed`, `list`, `search` or `alert`; `query` and `types` describe a saved search or alert, `tags` and `keywords` a feed. Only your own are listed.',
    paginated: true,
    params: [
      {
        name: 'kind',
        in: 'query',
        type: 'string',
        description: 'Only this kind: `feed`, `list`, `search` or `alert`.',
      },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–50 (default 20).' },
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
          id: 'clfeed1',
          kind: 'feed',
          name: 'Rust news',
          description: null,
          visibility: 'PRIVATE',
          pinned: false,
          tags: ['rust'],
          keywords: ['release'],
          query: null,
          types: ['post'],
          notify: false,
          subscribers: 0,
          createdAt: '2026-11-19T09:00:00.000Z',
          updatedAt: '2026-11-20T21:14:00.000Z',
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/feeds/{id}',
    operationId: 'getMyFeed',
    group: 'Feeds',
    scope: 'read:feeds',
    summary: 'Get one of your feeds',
    description:
      "One of your feeds with `members`, the handles of its people (a list, or a feed with people). Another member's feed is a `404`, private or not.",
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The feed id.', required: true }],
    responseExample: {
      ...{
        id: 'clfeed1',
        kind: 'feed',
        name: 'Rust news',
        description: null,
        visibility: 'PRIVATE',
        pinned: false,
        tags: ['rust'],
        keywords: ['release'],
        query: null,
        types: ['post'],
        notify: false,
        subscribers: 0,
        createdAt: '2026-11-19T09:00:00.000Z',
        updatedAt: '2026-11-20T21:14:00.000Z',
      },
      members: ['ada'],
    },
  },
  {
    method: 'GET',
    path: '/api/v1/feeds/{id}/posts',
    operationId: 'listFeedPosts',
    group: 'Feeds',
    scope: 'read:feeds',
    summary: "Read a feed's posts",
    description:
      "The posts of a feed or list as the site pages them for you, newest first: your own feed, or one its owner published or shared by link. Needs `read:posts` as well as `read:feeds`. Authors you blocked or muted, who blocked you, or who are banned or deleted never appear. A saved search or keyword alert is `409 not_a_timeline`; another member's private feed is a `404`. " +
      QUIET_COUNTS_NOTE,
    paginated: true,
    params: [
      { name: 'id', in: 'path', type: 'string', description: 'The feed id.', required: true },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–50 (default 20).' },
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
          ...POST_OBJECT,
          author: AUTHOR_OBJECT,
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'PUT',
    path: '/api/v1/me/feeds/{id}/members',
    operationId: 'replaceListMembers',
    group: 'Feeds',
    scope: 'write:feeds',
    summary: "Replace a list's members",
    description:
      "Make the list's members exactly these handles (case-insensitive, at most 500; an empty array clears the list). Handles that match no account, a deleted or banned account, or a member blocked in either direction are not added and come back in `skipped` with the reason `not_found` or `blocked`; a member who left the list stays off it and comes back as `left`. Only your own lists: a feed that is not a list, or another member's, is a `404`.",
    idempotent: true,
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The list id.', required: true }],
    requestBody: {
      fields: [
        {
          name: 'handles',
          type: 'string[]',
          required: true,
          description: 'The handles of the members, with or without a leading `@`. At most 500.',
        },
      ],
      example: { handles: ['ada', 'grace'] },
    },
    responseExample: {
      id: 'clfeed1',
      memberCount: 1,
      members: ['ada'],
      skipped: [{ handle: 'grace', reason: 'blocked' }],
    },
  },

  // s09-09 api-practice
  {
    method: 'GET',
    path: '/api/v1/me/typing',
    operationId: 'getMyTyping',
    group: 'Practice',
    scope: 'read:practice',
    summary: 'Your typing summary',
    description:
      'Your RMHType profile, one per difficulty that you have played (totals, bests, averages and streaks; `bestWpm` is words per minute, accuracies are percentages, `totalTimeMs` is milliseconds), and your touch-typing lesson progress (best speed and accuracy, stars, attempts, `completedAt`). Only your own. Multiplayer match history and ghost replays are not included.',
    responseExample: {
      profiles: [
        {
          difficulty: 'medium',
          totalGamesPlayed: 42,
          totalWins: 17,
          bestWpm: 88.5,
          bestWpmAccuracy: 97.2,
          avgWpm: 71.3,
          bestAccuracy: 99.1,
          avgAccuracy: 95.4,
          totalCharsTyped: 18250,
          totalTimeMs: 2640000,
          currentStreak: 3,
          bestStreak: 9,
          updatedAt: '2026-11-20T10:00:00.000Z',
        },
      ],
      lessons: [
        {
          lessonId: 'home-row-1',
          bestWpm: 32.5,
          bestAccuracy: 98,
          stars: 3,
          attempts: 4,
          completedAt: null,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/typing/daily',
    operationId: 'listMyTypingDaily',
    group: 'Practice',
    scope: 'read:practice',
    summary: 'Your daily typing entries',
    description:
      'Your entries for the daily passage, oldest first, one per day. `day` is the stored UTC day as `YYYYMMDD`. `wpm`, `accuracy` (a percentage) and `timeMs` are `null` for a day started but not finished in time (`finishedAt` is then set, or `null` if it was never closed). `from` and `to` take `YYYYMMDD` or `YYYY-MM-DD`; the range spans at most 366 days and defaults to the last 30.',
    params: [
      { name: 'from', in: 'query', type: 'string', description: 'First day, inclusive. Default: 29 days before `to`.' },
      { name: 'to', in: 'query', type: 'string', description: 'Last day, inclusive. Default: today (UTC).' },
    ],
    responseExample: {
      from: '20261120',
      to: '20261121',
      data: [
        { day: '20261120', passageId: 'p-142', wpm: null, accuracy: null, timeMs: null, finishedAt: null },
        {
          day: '20261121',
          passageId: 'p-143',
          wpm: 74.2,
          accuracy: 96.5,
          timeMs: 38200,
          finishedAt: '2026-11-21T08:15:00.000Z',
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/typing/keys',
    operationId: 'listMyTypingKeys',
    group: 'Practice',
    scope: 'read:practice',
    summary: 'Your per-key typing figures',
    description:
      'Your per-key counters with derived figures, slowest first (`weakness` is `msPerKey` inflated by `errorRate`; higher is worse). Only keys with at least `minAttempts` attempts are returned. `msPerKey` is the mean time per key in milliseconds and `errorRate` runs from 0 to 1. The list is empty while key statistics are switched off on the site.',
    params: [
      {
        name: 'layout',
        in: 'query',
        type: 'string',
        description:
          'Only this layout: `qwerty`, `azerty`, `dvorak` or `colemak`. Default: every layout you have data for.',
      },
    ],
    responseExample: {
      minAttempts: 5,
      data: [
        {
          key: 'q',
          layout: 'qwerty',
          attempts: 24,
          errors: 6,
          totalMs: 9120,
          msPerKey: 380,
          errorRate: 0.25,
          weakness: 760,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/music/practice',
    operationId: 'listMyMusicPractice',
    group: 'Practice',
    scope: 'read:practice',
    summary: 'Your music practice entries',
    description:
      'Your RMH Music practice entries, newest first. `kind` is the activity (`song`, `sprint`, `cards`) and `refId` what was practised. `mode` is the song or sprint mode and `score` the result, both `null` when the activity has none; `durationMs` is `null` when the client did not say.',
    paginated: true,
    params: [
      { name: 'since', in: 'query', type: 'string', description: 'Only entries at or after this ISO 8601 instant.' },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 50).' },
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
          id: 1042,
          kind: 'cards',
          refId: 'scales-major',
          mode: null,
          score: null,
          durationMs: null,
          createdAt: '2026-11-21T18:30:00.000Z',
        },
        {
          id: 1041,
          kind: 'song',
          refId: 'ode-to-joy',
          mode: 'wait',
          score: 920,
          durationMs: 180000,
          createdAt: '2026-11-20T18:00:00.000Z',
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/focus-sessions',
    operationId: 'listMyFocusSessions',
    group: 'Practice',
    scope: 'read:practice',
    summary: 'Your focus sessions',
    description:
      'Your RMHStudy focus sessions, newest first. Times are in milliseconds. `endedAt` is `null` for a session that has not been closed. The first page (no `cursor`) also carries a `summary` with your weekly goal in minutes and your time zone, each `null` when unset.',
    paginated: true,
    params: [
      {
        name: 'since',
        in: 'query',
        type: 'string',
        description: 'Only sessions started at or after this ISO 8601 instant.',
      },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–100 (default 50).' },
      {
        name: 'cursor',
        in: 'query',
        type: 'string',
        description: 'Opaque cursor from a previous `nextCursor` to fetch the next page.',
      },
    ],
    responseExample: {
      summary: { weeklyGoalMinutes: null, timeZone: null },
      data: [
        {
          id: 'clfocus1',
          focusTimeMs: 1500000,
          breakTimeMs: 300000,
          sessionsInRun: 2,
          startedAt: '2026-11-21T09:00:00.000Z',
          endedAt: null,
        },
      ],
      nextCursor: null,
    },
  },

  // s09-10 api-sync-deletions
  {
    method: 'GET',
    path: '/api/v1/me/deleted',
    operationId: 'listMyDeleted',
    group: 'Account',
    scope: 'read:reading',
    summary: 'List what you deleted',
    description:
      "Deletions of one `kind` after `since`, oldest first, so an app keeping a copy of your highlights, decks, cards, bookmarks or shelf entries can drop what you removed on the site. `kind` is `highlight`, `deck`, `card`, `bookmark` or `shelf_entry`. Each item is `{ id, kind, deletedAt }` and carries no content. `id` is the highlight, deck or card id, the bookmarked post's id, or the book's slug. The scope is the read scope of the kind: `read:reading` for `highlight` and `shelf_entry`, `read:study` for `deck` and `card`, `read:bookmarks` for `bookmark` (the scope listed here is the first; the others are checked per kind). Deletions are kept 90 days: a `since` older than that is `410 sync_window_expired` and the client must resync in full. Without `since` you get every deletion still kept. Deleting a deck is one `deck` item and none for its cards. A bookmark or shelf entry you add again after deleting it has a later time than its tombstone: apply a deletion only when its `deletedAt` is later than the item you hold.",
    paginated: true,
    params: [
      {
        name: 'kind',
        in: 'query',
        type: 'string',
        required: true,
        description: '`highlight`, `deck`, `card`, `bookmark` or `shelf_entry`.',
      },
      {
        name: 'since',
        in: 'query',
        type: 'string',
        description: 'Only deletions after this ISO 8601 instant. At most 90 days ago, or `410 sync_window_expired`.',
      },
      { name: 'cursor', in: 'query', type: 'string', description: 'Opaque cursor from a previous `nextCursor`.' },
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–500 (default 100).' },
    ],
    responseExample: {
      data: [{ id: 'clhl1', kind: 'highlight', deletedAt: '2026-11-22T12:00:00.000Z' }],
      nextCursor: null,
    },
  },

  // Sprint 10 (docs/autonomous/sprint-10/plan.md §Anchors)
  // s10-12 api-events
  {
    method: 'POST',
    path: '/api/v1/events',
    operationId: 'createEvent',
    group: 'Events',
    scope: 'manage:events',
    summary: 'Create an event',
    description:
      "Host a new event as the key owner, through the site's own `createEvent`. `community` is a community slug; a community event needs you to moderate that community (`403 forbidden` otherwise, `404` for an unknown slug). Times are ISO 8601 with an offset, between 2000 and 2099. A `URL` venue needs a public http(s) address. `repeat` repeats it weekly (`W`) or monthly (`M`) in the time zone `repeat_tz`, optionally until `repeat_until`; host rotation and co-host invitations stay on the site. `visibility` is `public` (default) or `private` (only you and the people you let in see it). No field names a host: you are the host. At most 10 events a minute, shared with the site. Answers `201` with the event as `GET /events/{id}` returns it. Errors: `invalid_dates`, `invalid_venue_url`, `invalid_recurrence`.",
    idempotent: true,
    requestBody: {
      fields: [
        { name: 'title', type: 'string', required: true, description: '3–120 characters.' },
        { name: 'starts_at', type: 'string', required: true, description: 'ISO 8601 timestamp with an offset.' },
        {
          name: 'venue_kind',
          type: 'string',
          required: true,
          description: '`SPACE`, `TOURNAMENT`, `GAME`, `URL` or `IRL`.',
        },
        { name: 'description', type: 'string', description: 'Up to 2000 characters.' },
        { name: 'ends_at', type: 'string', description: 'ISO 8601 timestamp, after `starts_at`.' },
        { name: 'venue', type: 'string', description: 'The address (`URL` venues, required) or a place name.' },
        { name: 'capacity', type: 'integer', description: 'Seats, 1–1,000,000. Omit for no limit.' },
        { name: 'community', type: 'string', description: 'Slug of a community you moderate.' },
        { name: 'visibility', type: 'string', description: '`public` (default) or `private`.' },
        { name: 'repeat', type: 'string', description: '`W` (weekly) or `M` (monthly). Needs `repeat_tz`.' },
        {
          name: 'repeat_tz',
          type: 'string',
          description: 'IANA time zone the repeat follows, e.g. `America/New_York`.',
        },
        { name: 'repeat_until', type: 'string', description: 'Last date, an ISO 8601 timestamp with an offset.' },
      ],
      example: {
        title: 'Game night',
        description: 'Bring a controller.',
        starts_at: '2026-12-03T19:00:00Z',
        ends_at: '2026-12-03T21:00:00Z',
        venue_kind: 'URL',
        venue: 'https://example.com/room',
        capacity: 12,
      },
    },
    responseExample: {
      id: 'clevent1',
      title: 'Game night',
      description: 'Bring a controller.',
      startsAt: '2026-12-03T19:00:00.000Z',
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
      cohosts: [{ id: 'cluser2', handle: 'co', name: 'Co-host' }],
      counts: { going: 0, maybe: 0, waitlisted: 0 },
      yourRsvp: null,
      nextOccurrences: [
        {
          occurrence: '2026-12-03T19:00:00.000Z',
          startsAt: '2026-12-03T19:00:00.000Z',
          endsAt: null,
          state: 'normal',
          note: null,
        },
      ],
      updates: [{ id: 'clupdate1', body: 'Doors at 18:45.', occurrence: null, createdAt: '2026-11-22T10:00:00.000Z' }],
    },
  },
  {
    method: 'PATCH',
    path: '/api/v1/events/{id}',
    operationId: 'updateEvent',
    group: 'Events',
    scope: 'manage:events',
    summary: 'Edit an event',
    description:
      "Change an event through the site's own `updateEvent`: the host or an accepted co-host (a co-host cannot change `repeat`). Send only the fields to change; `null` clears `ends_at`, `venue`, `capacity` and `repeat`. `404` for an event you cannot see, `403 not_host` for one you see but do not manage. Answers the event as `GET /events/{id}` returns it.",
    idempotent: true,
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true }],
    requestBody: {
      fields: [
        { name: 'title', type: 'string', description: '3–120 characters.' },
        { name: 'description', type: 'string', description: 'Up to 2000 characters.' },
        { name: 'starts_at', type: 'string', description: 'ISO 8601 timestamp with an offset.' },
        { name: 'ends_at', type: 'string', description: 'ISO 8601 timestamp, or `null` to clear.' },
        { name: 'venue_kind', type: 'string', description: '`SPACE`, `TOURNAMENT`, `GAME`, `URL` or `IRL`.' },
        { name: 'venue', type: 'string', description: 'The address or place name, or `null` to clear.' },
        { name: 'capacity', type: 'integer', description: 'Seats, or `null` for no limit.' },
        {
          name: 'repeat',
          type: 'string',
          description: '`W` or `M` (needs `repeat_tz`), or `null` to stop repeating. Host only.',
        },
        { name: 'repeat_tz', type: 'string', description: 'IANA time zone the repeat follows.' },
        { name: 'repeat_until', type: 'string', description: 'Last date, an ISO 8601 timestamp with an offset.' },
      ],
      example: { title: 'Game night (moved online)', capacity: 20 },
    },
    responseExample: {
      id: 'clevent1',
      title: 'Game night',
      description: 'Bring a controller.',
      startsAt: '2026-12-03T19:00:00.000Z',
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
      cohosts: [{ id: 'cluser2', handle: 'co', name: 'Co-host' }],
      counts: { going: 0, maybe: 0, waitlisted: 0 },
      yourRsvp: null,
      nextOccurrences: [
        {
          occurrence: '2026-12-03T19:00:00.000Z',
          startsAt: '2026-12-03T19:00:00.000Z',
          endsAt: null,
          state: 'normal',
          note: null,
        },
      ],
      updates: [{ id: 'clupdate1', body: 'Doors at 18:45.', occurrence: null, createdAt: '2026-11-22T10:00:00.000Z' }],
    },
  },
  {
    method: 'POST',
    path: '/api/v1/events/{id}/cancel',
    operationId: 'cancelEvent',
    group: 'Events',
    scope: 'manage:events',
    summary: 'Cancel an event',
    description:
      'Cancel an event you host (the host only, as on the site). Everyone who answered is told, as on the site. Canceling again is `409 already_canceled`. Answers the event with `canceled: true`.',
    idempotent: true,
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true }],
    responseExample: {
      id: 'clevent1',
      title: 'Game night',
      description: 'Bring a controller.',
      startsAt: '2026-12-03T19:00:00.000Z',
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
      canceled: true,
      host: { id: 'cluser1', handle: 'rmh', name: 'RMH' },
      cohosts: [{ id: 'cluser2', handle: 'co', name: 'Co-host' }],
      counts: { going: 0, maybe: 0, waitlisted: 0 },
      yourRsvp: null,
      nextOccurrences: [
        {
          occurrence: '2026-12-03T19:00:00.000Z',
          startsAt: '2026-12-03T19:00:00.000Z',
          endsAt: null,
          state: 'normal',
          note: null,
        },
      ],
      updates: [{ id: 'clupdate1', body: 'Doors at 18:45.', occurrence: null, createdAt: '2026-11-22T10:00:00.000Z' }],
    },
  },
  {
    method: 'GET',
    path: '/api/v1/events/{id}/updates',
    operationId: 'listEventUpdates',
    group: 'Events',
    scope: 'read:events',
    summary: 'List event updates',
    description:
      'The latest updates the hosts posted to the people coming, newest first (at most five, as the event page shows them), to anyone who can see the event.',
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true }],
    responseExample: {
      data: [{ id: 'clupdate1', body: 'Doors at 18:45.', occurrence: null, createdAt: '2026-11-22T10:00:00.000Z' }],
    },
  },
  {
    method: 'POST',
    path: '/api/v1/events/{id}/updates',
    operationId: 'postEventUpdate',
    group: 'Events',
    scope: 'manage:events',
    summary: 'Post an event update',
    description:
      "Post an update as the host or a co-host, through the site's own `postUpdate`: the same per-event limit (`429 rate_limited` when you post too fast, `409 canceled` on a canceled event) and the same durable notification to the people coming, minus anyone blocked with you. On a repeating event `occurrence` is the date's original start; omit it for the next date, `null` for the whole series. Answers `201`.",
    idempotent: true,
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The event id.', required: true }],
    requestBody: {
      fields: [
        { name: 'body', type: 'string', required: true, description: '1–500 characters.' },
        {
          name: 'occurrence',
          type: 'string',
          description: "The date's original start, an ISO 8601 timestamp (repeating events).",
        },
      ],
      example: { body: 'Doors at 18:45.' },
    },
    responseExample: {
      id: 'clupdate1',
      body: 'Doors at 18:45.',
      occurrence: null,
      createdAt: '2026-11-22T10:00:00.000Z',
    },
  },

  // s10-13 api-moderation
  {
    method: 'GET',
    path: '/api/v1/communities/{slug}/modqueue',
    operationId: 'listModQueue',
    group: 'Moderation',
    scope: 'manage:moderation',
    summary: "List a community's mod queue",
    description:
      "Held and flagged posts and comments, newest first, for a community you moderate. `view=pending` (default) is what still needs a decision; `view=log` is what was already decided. A held post's text comes back in `post`, serialised like every other post the API returns (content warnings, GIF descriptions and quiet counts apply); a held comment has no `post`. `text` is the held text either way, which is what the queue is for. `403 not_moderator` when you are not a moderator of the community now (checked on every call, never cached on the key), `404` for a community you cannot see. Needs the `manage:moderation` scope, which `*` and `manage:*` do not grant: a key must list it. Each call counts as 2 requests against the daily quota.",
    paginated: true,
    params: [
      { name: 'slug', in: 'path', type: 'string', description: 'The community slug.', required: true },
      { name: 'view', in: 'query', type: 'string', description: '`pending` (default) or `log`.' },
      ...PAGE_PARAMS,
    ],
    responseExample: {
      data: [
        {
          id: 'clmodq1',
          type: 'comment',
          action: 'hold',
          status: 'PENDING',
          ruleName: 'New account links',
          snapshot: 'Check out my new site',
          text: 'Check out my new site',
          reporters: null,
          citedRule: null,
          createdAt: '2026-11-22T09:30:00.000Z',
          author: AUTHOR_OBJECT,
          post: null,
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'POST',
    path: '/api/v1/communities/{slug}/modqueue/{itemId}',
    operationId: 'decideModItem',
    group: 'Moderation',
    scope: 'manage:moderation',
    summary: 'Approve or remove a queued item',
    description:
      "Decide one item as the key owner, through the same code the site's queue uses: approving a held post publishes it and queues its alerts; removing with a `rule_id` records the citation and tells the author which rule it broke, with your `message` if you send one. The decision is in the community's moderator log as yours, marked as made through the API (the public log does not show the marker). `409 item_resolved` when someone already decided it, `400 rule_not_found` for a rule of another community. At most 120 decisions a key an hour, on top of the write limit.",
    idempotent: true,
    params: [
      { name: 'slug', in: 'path', type: 'string', description: 'The community slug.', required: true },
      { name: 'itemId', in: 'path', type: 'string', description: 'The queue item id.', required: true },
    ],
    requestBody: {
      fields: [
        { name: 'decision', type: 'string', required: true, description: '`approve` or `remove`.' },
        {
          name: 'rule_id',
          type: 'string',
          description: 'The community rule a removal cites (`GET /communities/{slug}/rules`).',
        },
        {
          name: 'message',
          type: 'string',
          description: 'A note sent to the author with a removal, up to 1000 characters.',
        },
      ],
      example: { decision: 'remove', rule_id: 'clrule1', message: 'Please keep promotion to the weekly thread.' },
    },
    responseExample: { id: 'clmodq1', status: 'REMOVED' },
  },
  {
    method: 'GET',
    path: '/api/v1/communities/{slug}/sanctions',
    operationId: 'listSanctions',
    group: 'Moderation',
    scope: 'manage:moderation',
    summary: "List a community's timeouts and bans",
    description:
      "Current timeouts and bans (`active=true`, the default), or the lifted and ended ones (`active=false`), newest first. `reason` is the private note moderators wrote (an empty string when there is none); it is never shown to the member. `endsAt` is `null` for a ban with no end; `moderator` is `null` when that moderator's account was erased. `403 not_moderator` when you are not a moderator of the community now.",
    paginated: true,
    params: [
      { name: 'slug', in: 'path', type: 'string', description: 'The community slug.', required: true },
      { name: 'active', in: 'query', type: 'string', description: '`true` (default) or `false`.' },
      ...PAGE_PARAMS,
    ],
    responseExample: {
      data: [
        {
          id: 'clsanction1',
          kind: 'ban',
          member: { id: 'ck_user456', name: 'Grace', handle: 'grace' },
          moderator: null,
          endsAt: null,
          createdAt: '2026-11-22T09:30:00.000Z',
          liftedAt: null,
          rule: null,
          reason: 'Second warning today.',
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'POST',
    path: '/api/v1/communities/{slug}/sanctions',
    operationId: 'createSanction',
    group: 'Moderation',
    scope: 'manage:moderation',
    summary: 'Time out or ban a member',
    description:
      "Sanction a member as the key owner, by `handle`, through the site's own rules: a moderator can act on members, only the owner can sanction a moderator, and nobody can sanction the owner or themselves (`409 sanction_refused`, with the site's reason). A timeout lasts `1h`, `1d` (default), `3d` or `7d`; a ban `1d`, `7d` (default), `30d` or `forever`. A new sanction replaces the member's active one. The member is told the kind, the end and the rule's title, never the `reason`. `404` for a handle that is not a member (a timeout needs a member), `400 rule_not_found` for a rule of another community. At most 30 sanctions a key an hour, on top of the write limit. Answers `201`.",
    idempotent: true,
    status: 201,
    params: [{ name: 'slug', in: 'path', type: 'string', description: 'The community slug.', required: true }],
    requestBody: {
      fields: [
        { name: 'handle', type: 'string', required: true, description: 'The member, with or without a leading `@`.' },
        { name: 'kind', type: 'string', required: true, description: '`timeout` or `ban`.' },
        {
          name: 'duration',
          type: 'string',
          description: '`1h`, `1d`, `3d`, `7d`, `30d` or `forever`; which are allowed depends on `kind`.',
        },
        { name: 'rule_id', type: 'string', description: 'The community rule the sanction cites.' },
        { name: 'reason', type: 'string', description: 'A private note for moderators, up to 300 characters.' },
      ],
      example: {
        handle: 'grace',
        kind: 'timeout',
        duration: '1d',
        rule_id: 'clrule1',
        reason: 'Second warning today.',
      },
    },
    responseExample: { id: 'clsanction1', kind: 'ban', endsAt: null },
  },
  {
    method: 'DELETE',
    path: '/api/v1/communities/{slug}/sanctions/{id}',
    operationId: 'liftSanction',
    group: 'Moderation',
    scope: 'manage:moderation',
    summary: 'Lift a timeout or ban',
    description:
      "Lift a still-active sanction early, through the site's `lift`; the member is told. Answers `204`. `404` for an unknown sanction or one that already ended. Counts against the 30 sanctions a key an hour.",
    idempotent: true,
    status: 204,
    params: [
      { name: 'slug', in: 'path', type: 'string', description: 'The community slug.', required: true },
      { name: 'id', in: 'path', type: 'string', description: 'The sanction id.', required: true },
    ],
  },

  // s10-14 api-rmhtube
  {
    method: 'GET',
    path: '/api/v1/me/rmhtube/watch-later',
    operationId: 'listMyWatchLater',
    group: 'RMHTube',
    scope: 'read:rmhtube',
    summary: 'List your Watch later',
    description:
      'Your RMHTube Watch later list, oldest first, in pages of up to 50 by a `(createdAt, id)` cursor. It is the same list as on the site, which keeps at most 200 videos (adding a 201st drops the oldest), so the API never lists more than those 200. Only your own.',
    paginated: true,
    params: [
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–50 (default 50).' },
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
          id: 'clwl1',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          title: 'A video to watch later',
          createdAt: '2026-11-22T09:30:00.000Z',
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'POST',
    path: '/api/v1/me/rmhtube/watch-later',
    operationId: 'addToWatchLater',
    group: 'RMHTube',
    scope: 'write:rmhtube',
    summary: 'Save a video to Watch later',
    description:
      "Saves a video URL to your Watch later, through the site's own function and the same URL rules (a fragment is dropped). Answers `201` with the new item, or `200` with the existing item when the URL is already saved. The list keeps the newest 200: adding a 201st drops the oldest. `title` defaults to the URL's host name.",
    idempotent: true,
    status: 201,
    requestBody: {
      fields: [
        { name: 'url', type: 'string', required: true, description: 'The video URL, up to 2048 characters.' },
        { name: 'title', type: 'string', description: 'A label, up to 256 characters.' },
      ],
      example: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'A video to watch later' },
    },
    responseExample: {
      id: 'clwl1',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'A video to watch later',
      createdAt: '2026-11-22T09:30:00.000Z',
    },
  },
  {
    method: 'DELETE',
    path: '/api/v1/me/rmhtube/watch-later/{id}',
    operationId: 'removeFromWatchLater',
    group: 'RMHTube',
    scope: 'write:rmhtube',
    summary: 'Remove a video from Watch later',
    description:
      "Removes one of your own saved videos. Answers `204`. `404` for an id that is not yours or is already gone: another member's item is never reachable.",
    idempotent: true,
    status: 204,
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The Watch later item id.', required: true }],
  },
  {
    method: 'GET',
    path: '/api/v1/rmhtube/parties',
    operationId: 'listRmhtubeParties',
    group: 'RMHTube',
    scope: 'read:rmhtube',
    summary: 'List upcoming watch parties',
    description:
      'The upcoming RMHTube watch parties you can see, soonest first, as the site lists them: your own (hosting or going, any visibility) and then public ones. A link-only party is listed only to its host and the people going. `going` is your own answer and `goingCount` the count the site shows; who else is going is not returned. Parties whose host is blocked by you or has blocked you are left out.',
    responseExample: {
      data: [
        {
          id: 'AB12CD',
          name: 'Friday film night',
          description: '',
          startsAt: '2026-11-27T19:00:00.000Z',
          isPublic: true,
          maxMembers: 20,
          host: { id: 'ck_user123', name: 'Ada' },
          goingCount: 4,
          going: false,
          isHost: false,
          closed: false,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/api/v1/rmhtube/parties/{id}',
    operationId: 'getRmhtubeParty',
    group: 'RMHTube',
    scope: 'read:rmhtube',
    summary: 'Get a watch party',
    description:
      'One watch party by its room code. `404` when it does not exist or you cannot see it: a link-only party you neither host nor are going to is the same answer as a missing one, as is one whose host is in a block with you.',
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The party room code.', required: true }],
    responseExample: {
      id: 'AB12CD',
      name: 'Friday film night',
      description: '',
      startsAt: '2026-11-27T19:00:00.000Z',
      isPublic: true,
      maxMembers: 20,
      host: { id: 'ck_user123', name: 'Ada' },
      goingCount: 4,
      going: false,
      isHost: false,
      closed: false,
    },
  },
  {
    method: 'PUT',
    path: '/api/v1/rmhtube/parties/{id}/going',
    operationId: 'setRmhtubePartyGoing',
    group: 'RMHTube',
    scope: 'write:rmhtube',
    summary: 'Say whether you are going to a watch party',
    description:
      'Sets your answer through the site\'s own `setGoing`, so the reminders and the going count behave as on the site. `{ "going": false }` takes it back. Answers the party. `404` for a party you cannot see (as in the read), `409 party_closed` when the host cancelled it or it has ended.',
    idempotent: true,
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The party room code.', required: true }],
    requestBody: {
      fields: [
        { name: 'going', type: 'boolean', required: true, description: '`true` to go, `false` to take it back.' },
      ],
      example: { going: true },
    },
    responseExample: {
      id: 'AB12CD',
      name: 'Friday film night',
      description: '',
      startsAt: '2026-11-27T19:00:00.000Z',
      isPublic: true,
      maxMembers: 20,
      host: { id: 'ck_user123', name: 'Ada' },
      goingCount: 5,
      going: true,
      isHost: false,
      closed: false,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/rmhtube/stats',
    operationId: 'getMyRmhtubeStats',
    group: 'RMHTube',
    scope: 'read:rmhtube',
    summary: 'Your RMHTube watch statistics',
    description:
      'Your own watch statistics exactly as the site shows them: the counters (`totalWatchTimeMinutes` in minutes), whether recording is `paused`, and the last 30 UTC days of minutes (zero-filled, oldest first, `day` as `YYYY-MM-DD`). Only yours. Pausing and clearing are done on the site.',
    responseExample: {
      counters: {
        totalWatchTimeMinutes: 640,
        videosWatched: 31,
        roomsCreated: 2,
        roomsJoined: 14,
        messagesSent: 120,
        reactionsUsed: 58,
      },
      paused: false,
      days: [{ day: '2026-11-22', minutes: 45 }],
    },
  },

  // Sprint 12
  // s12-12 api-reviews
  {
    method: 'GET',
    path: '/api/v1/me/decks/{id}/review',
    operationId: 'getMyDeckReview',
    group: 'Study',
    scope: 'read:study',
    summary: 'Get the cards due for review',
    description:
      'The cards the site’s review queue would show you now for this deck, in its order: scheduled cards that are due, then new cards within the deck’s daily pace (suspended cards are left out). A deck you edit or a public deck is reviewed on your own schedule. Each card has its text, pictures with their descriptions, its `externalId` and its `schedule` (`state` is `new` or `review`). A cloze card is one deletion (`clozeIndex`); an occlusion card is one mask (`clozeIndex` is the mask id). Card sounds are never returned. Grade a card with `POST /api/v1/me/decks/{id}/cards/{cardId}/review`. A deck you may not read is 404.',
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
        description: 'Cards to return, 1–50 (default 20).',
      },
    ],
    responseExample: {
      data: [
        {
          id: 'clcard1',
          kind: 'basic',
          front: 'hablar',
          back: 'to speak',
          clozeIndex: null,
          externalId: null,
          frontImage: null,
          backImage: null,
          occlusion: null,
          schedule: {
            state: 'new',
            dueAt: null,
            intervalDays: 0,
          },
        },
        {
          id: 'clcard2',
          kind: 'basic',
          front: 'comer',
          back: 'to eat',
          clozeIndex: null,
          externalId: 'verbs-002',
          frontImage: null,
          backImage: null,
          occlusion: null,
          schedule: {
            state: 'review',
            dueAt: '2026-11-25T08:00:00.000Z',
            intervalDays: 6,
          },
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/api/v1/me/decks/{id}/cards/{cardId}/review',
    operationId: 'gradeMyDeckCard',
    group: 'Study',
    scope: 'write:study-reviews',
    summary: 'Grade a card',
    description:
      'Grade one card (`again`, `hard`, `good` or `easy`) on your own schedule. It is the same review as one in the browser: the schedule, your history and the leech rule are the site’s, so it shows up on your statistics. It earns no daily quest progress or XP. Send `Idempotency-Key` so a retry never grades twice. `cardId` is a card id from `GET /api/v1/me/decks/{id}/review` (a generated cloze or occlusion card included). A card that is not in the deck, or is not one you may read, is 404; a card you suspended is 409. At most 120 grades a minute. Needs the explicit `write:study-reviews` scope, which `*` and `write:*` do not include.',
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
          name: 'grade',
          type: 'string',
          required: true,
          description: 'How well you knew it: `again`, `hard`, `good` or `easy`.',
        },
      ],
      example: {
        grade: 'good',
      },
    },
    responseExample: {
      data: {
        dueAt: '2026-11-26T08:00:00.000Z',
        intervalDays: 1,
        leech: false,
      },
    },
  },

  // s12-13 api-characters
  {
    method: 'GET',
    path: '/api/v1/me/characters',
    operationId: 'listMyCharacters',
    group: 'RMHCharacters',
    scope: 'read:characters',
    summary: 'List your characters',
    description:
      "Your RMHCharacters sheets, most recently edited first. `summary` is the one a party sees, computed by the site's own rules engine: armor class, hit points, conditions, Perception (passive in 5e), speed and initiative. A sheet the rules data can no longer read is left out. Never cached (`Cache-Control: private, no-store`).",
    paginated: true,
    params: [
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–50 (default 25).' },
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
          id: '0b9f6c1e-5d1a-4a0e-9d57-6a3f1d2c8e11',
          system: 'dnd5e',
          name: 'Brienne',
          level: 5,
          summary: {
            system: 'dnd5e',
            name: 'Brienne',
            level: 5,
            ancestry: null,
            classes: [{ name: 'Fighter', level: 5 }],
            ac: 18,
            hp: { current: 38, max: 44, temp: 0 },
            conditions: ['Poisoned'],
            perception: 13,
            speed: 30,
            initiative: 2,
          },
          updatedAt: '2026-11-24T19:30:00.000Z',
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/characters/{id}',
    operationId: 'getMyCharacter',
    group: 'RMHCharacters',
    scope: 'read:characters',
    summary: 'Get one of your characters',
    description:
      "One of your characters: the list fields plus `sheet`, the stored sheet as the site keeps it, without the `portrait` image (it is large); `portrait` says whether the sheet had one. Your own `notes` are part of the sheet. Another member's character is `404 not_found`. Never cached.",
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The character id.', required: true }],
    responseExample: {
      data: {
        id: '0b9f6c1e-5d1a-4a0e-9d57-6a3f1d2c8e11',
        system: 'dnd5e',
        name: 'Brienne',
        level: 5,
        summary: {
          system: 'dnd5e',
          name: 'Brienne',
          level: 5,
          ancestry: null,
          classes: [{ name: 'Fighter', level: 5 }],
          ac: 18,
          hp: { current: 38, max: 44, temp: 0 },
          conditions: ['Poisoned'],
          perception: 13,
          speed: 30,
          initiative: 2,
        },
        updatedAt: '2026-11-24T19:30:00.000Z',
        portrait: false,
        sheet: { id: '0b9f6c1e-5d1a-4a0e-9d57-6a3f1d2c8e11', system: 'dnd5e', name: 'Brienne', notes: '' },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/parties',
    operationId: 'listMyParties',
    group: 'RMHCharacters',
    scope: 'read:characters',
    summary: 'List your parties',
    description:
      "The parties you run (`role` `gm`) or play in (`player`), most recently changed first, with the game master's name and the number of players. Never cached.",
    responseExample: {
      data: [
        {
          id: 'clparty1',
          name: 'Thursday table',
          system: 'dnd5e',
          role: 'player',
          gm: 'Ada',
          members: 4,
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/parties/{id}',
    operationId: 'getMyParty',
    group: 'RMHCharacters',
    scope: 'read:characters',
    summary: 'Get one of your parties',
    description:
      "One party as the site shows it to you: each member's name and the summary of the character they brought, the turn order and `turnIndex`, the line whose turn it is. A member's `summary` is `null` when the sheet cannot be read. Never another player's sheet or notes, and never the invite code. A party you are not in, or have left, is `404 not_found`. Never cached.",
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The party id.', required: true }],
    responseExample: {
      data: {
        id: 'clparty1',
        name: 'Thursday table',
        system: 'dnd5e',
        role: 'player',
        gm: 'Ada',
        members: [
          {
            userId: 'cluser1',
            name: 'Ada',
            joinedAt: '2026-11-01T18:00:00.000Z',
            isGm: true,
            summary: {
              system: 'dnd5e',
              name: 'Brienne',
              level: 5,
              ancestry: null,
              classes: [{ name: 'Fighter', level: 5 }],
              ac: 18,
              hp: { current: 38, max: 44, temp: 0 },
              conditions: ['Poisoned'],
              perception: 13,
              speed: 30,
              initiative: 2,
            },
          },
        ],
        order: [
          { id: 'line2', kind: 'extra', userId: null, name: 'Goblin', value: 12 },
          { id: 'line1', kind: 'member', userId: 'cluser1', name: 'Ada', value: 17 },
        ],
        turnIndex: 0,
      },
    },
  },

  // Sprint 13
  // s13-10 api-ladder
  {
    method: 'GET',
    path: '/api/v1/me/ladder/applications',
    operationId: 'listMyLadderApplications',
    group: 'RMHLadder',
    scope: 'read:ladder',
    summary: 'List your applications',
    description:
      'Your RMHLadder applications, most recently changed first. Each carries its status, applied and follow-up dates, interview dates, your own notes, and its job: title, company, location, remote status, link and deadline (`own` is true for a job you added yourself). Only your own applications are returned, and never offers, pay, resumes, cover letters, referral names or contact e-mails. Never cached (`Cache-Control: private, no-store`). Needs the explicit `read:ladder` scope, which `*`, `read:*` and a new key’s default grant do not include.',
    paginated: true,
    params: [
      { name: 'limit', in: 'query', type: 'integer', description: 'Page size, 1–50 (default 25).' },
      {
        name: 'cursor',
        in: 'query',
        type: 'string',
        description: 'Opaque cursor from a previous `nextCursor` to fetch the next page.',
      },
      {
        name: 'status',
        in: 'query',
        type: 'string',
        description:
          'Only applications in these statuses: one, or several separated by commas (`not_applied`, `planning`, `applied`, `networking`, `interviewing`, `final_round`, `rejected`, `offer`, `withdrawn`).',
      },
    ],
    responseExample: {
      data: [
        {
          id: 'cm4ladderapp0003',
          status: 'networking',
          appliedDate: null,
          followUpDate: null,
          interviewDates: ['2026-12-02T15:00:00.000Z'],
          notes: null,
          updatedAt: '2026-11-24T19:30:00.000Z',
          job: {
            id: 'cm4ladderjob0003',
            title: 'Platform Engineer Intern',
            company: 'Initech',
            location: null,
            remote: 'hybrid',
            url: null,
            deadline: null,
            own: true,
          },
        },
        {
          id: 'cm4ladderapp0001',
          status: 'interviewing',
          appliedDate: '2026-11-18T00:00:00.000Z',
          followUpDate: '2026-12-03T00:00:00.000Z',
          interviewDates: ['2026-12-02T15:00:00.000Z'],
          notes: 'Phone screen went well.',
          updatedAt: '2026-11-23T19:30:00.000Z',
          job: {
            id: 'cm4ladderjob0001',
            title: 'Software Engineer Intern',
            company: 'Acme',
            location: 'Rochester, NY',
            remote: 'hybrid',
            url: 'https://acme.example/careers/intern',
            deadline: '2026-12-15',
            own: false,
          },
        },
      ],
      nextCursor: null,
    },
  },
  {
    method: 'GET',
    path: '/api/v1/me/ladder/applications/{id}',
    operationId: 'getMyLadderApplication',
    group: 'RMHLadder',
    scope: 'read:ladder',
    summary: 'Get one of your applications',
    description:
      'One of your applications: the list fields plus `events`, its timeline, newest first (at most 50). An event is `{ id, type, fromStatus, toStatus, fields, createdAt }`: `type` is `status_changed` or `application_updated`, and `fields` names what a change touched, never the values. Another member’s application, or an unknown id, is `404 not_found`. Never cached.',
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The application id.', required: true }],
    responseExample: {
      data: {
        id: 'cm4ladderapp0001',
        status: 'networking',
        appliedDate: null,
        followUpDate: null,
        interviewDates: ['2026-12-02T15:00:00.000Z'],
        notes: null,
        updatedAt: '2026-11-24T19:30:00.000Z',
        job: {
          id: 'cm4ladderjob0003',
          title: 'Platform Engineer Intern',
          company: 'Initech',
          location: null,
          remote: 'hybrid',
          url: null,
          deadline: null,
          own: true,
        },
        events: [
          {
            id: 'cm4ladderevt0003',
            type: 'application_updated',
            fromStatus: null,
            toStatus: null,
            fields: ['interviewDates'],
            createdAt: '2026-11-24T19:30:00.000Z',
          },
          {
            id: 'cm4ladderevt0002',
            type: 'status_changed',
            fromStatus: 'applied',
            toStatus: 'networking',
            fields: ['status'],
            createdAt: '2026-11-22T10:00:00.000Z',
          },
        ],
      },
    },
  },
  {
    method: 'PATCH',
    path: '/api/v1/me/ladder/applications/{id}',
    operationId: 'updateMyLadderApplication',
    group: 'RMHLadder',
    scope: 'write:ladder',
    summary: 'Change one of your applications',
    description:
      'Change an application’s status, applied date, follow-up date, interview dates or notes, through the site’s own update: the timeline gets one event for the change and your insights match. Send only what changes; a date or `notes` set to `null` is cleared, and `interviewDates` replaces the list (at most 25). Send `Idempotency-Key` so a retry never records twice. Nothing else of an application can be written here: an unknown field is `400 invalid_request`. Answers with the application as `GET` returns it. Another member’s application is `404 not_found`. Needs the explicit `write:ladder` scope, which `*` and `write:*` do not include.',
    idempotent: true,
    params: [{ name: 'id', in: 'path', type: 'string', description: 'The application id.', required: true }],
    requestBody: {
      fields: [
        {
          name: 'status',
          type: 'string',
          description:
            '`not_applied`, `planning`, `applied`, `networking`, `interviewing`, `final_round`, `rejected`, `offer` or `withdrawn`.',
        },
        {
          name: 'appliedDate',
          type: 'string',
          description: 'A day (`2026-11-18`) or an ISO 8601 instant; `null` clears it.',
        },
        { name: 'followUpDate', type: 'string', description: 'A day or an instant; `null` clears it.' },
        {
          name: 'interviewDates',
          type: 'string[]',
          description: 'Up to 25 days or instants. Replaces the list; `[]` clears it.',
        },
        { name: 'notes', type: 'string', description: 'Up to 2,000 characters; `null` clears it.' },
      ],
      example: { status: 'interviewing', interviewDates: ['2026-12-02T15:00:00.000Z'] },
    },
    responseExample: {
      data: {
        id: 'cm4ladderapp0001',
        status: 'networking',
        appliedDate: null,
        followUpDate: null,
        interviewDates: ['2026-12-02T15:00:00.000Z'],
        notes: null,
        updatedAt: '2026-11-24T19:30:00.000Z',
        job: {
          id: 'cm4ladderjob0003',
          title: 'Platform Engineer Intern',
          company: 'Initech',
          location: null,
          remote: 'hybrid',
          url: null,
          deadline: null,
          own: true,
        },
        events: [
          {
            id: 'cm4ladderevt0003',
            type: 'application_updated',
            fromStatus: null,
            toStatus: null,
            fields: ['interviewDates'],
            createdAt: '2026-11-24T19:30:00.000Z',
          },
          {
            id: 'cm4ladderevt0002',
            type: 'status_changed',
            fromStatus: 'applied',
            toStatus: 'networking',
            fields: ['status'],
            createdAt: '2026-11-22T10:00:00.000Z',
          },
        ],
      },
    },
  },
  {
    method: 'POST',
    path: '/api/v1/me/ladder/own-jobs',
    operationId: 'createMyLadderOwnJob',
    group: 'RMHLadder',
    scope: 'write:ladder',
    summary: 'Add a job you found elsewhere',
    description:
      'Add a job of your own (one you found outside RMHLadder), through the site’s own create: it is visible only to you, and the site’s limit of 300 own jobs applies (`409 conflict` beyond it). The link is stored, never fetched. Pay is not accepted: an unknown field is `400 invalid_request`. Answers `201` with the application the job opens (status `not_applied`), so a following `PATCH` can move it along. Send `Idempotency-Key` so a retry never adds twice. Needs the explicit `write:ladder` scope.',
    idempotent: true,
    status: 201,
    requestBody: {
      fields: [
        { name: 'title', type: 'string', required: true, description: '1–160 characters.' },
        { name: 'company', type: 'string', required: true, description: '1–120 characters.' },
        { name: 'link', type: 'string', description: 'An http or https address, up to 2,000 characters.' },
        { name: 'location', type: 'string', description: 'Up to 160 characters.' },
        {
          name: 'remoteStatus',
          type: 'string',
          description: '`onsite` (default), `hybrid` or `remote_us`.',
        },
        { name: 'employmentType', type: 'string', description: '`internship` (default) or `full_time`.' },
        { name: 'deadline', type: 'string', description: 'A day, `2026-12-15`.' },
      ],
      example: {
        title: 'Platform Engineer Intern',
        company: 'Initech',
        remoteStatus: 'hybrid',
      },
    },
    responseExample: {
      data: {
        id: 'cm4ladderapp0009',
        status: 'not_applied',
        appliedDate: null,
        followUpDate: null,
        interviewDates: [],
        notes: null,
        updatedAt: '2026-11-25T10:00:00.000Z',
        job: {
          id: 'cm4ladderjob0009',
          title: 'Platform Engineer Intern',
          company: 'Initech',
          location: null,
          remote: 'hybrid',
          url: null,
          deadline: null,
          own: true,
        },
        events: [
          {
            id: 'cm4ladderevt0009',
            type: 'application_updated',
            fromStatus: null,
            toStatus: null,
            fields: ['created'],
            createdAt: '2026-11-25T10:00:00.000Z',
          },
        ],
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
  }[] = [];
  for (const ep of ENDPOINTS) {
    let bucket = out.find((g) => g.group === ep.group);
    if (!bucket) {
      bucket = {
        group: ep.group,
        endpoints: [],
      };
      out.push(bucket);
    }
    bucket.endpoints.push(ep);
  }
  return out;
}
