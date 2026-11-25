/**
 * GIF descriptions (sprint 06 #15): a post's create, edit, schedule and publish carry `gifAlt`, a description over the
 * limit is refused, and describe-after-posting accepts the GIF's description for the author only. Prisma is an
 * in-memory fake; nothing here touches a database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { createRMHarkSchema, editRMHarkSchema } from '@/lib/rmhark-schema';
import { MAX_GIF_ALT_LENGTH } from '@/lib/feed/gif-alt';

const GIF = 'https://media.tenor.com/abc/cat.gif';
const GIF_2 = 'https://media.tenor.com/def/dog.gif';

interface PostRow {
  id: string;
  userId: string;
  content: string;
  deletedAt: Date | null;
  expiresAt: Date | null;
  unlockPrice: number | null;
  gifUrl: string | null;
  gifAlt: string | null;
  imageUrls: string[];
  imageAlts: string[];
}

const h = vi.hoisted(() => ({
  viewer: 'viewer' as string,
  altError: null as string | null,
  altChecks: [] as unknown[][],
  created: [] as Record<string, unknown>[],
  published: [] as unknown[],
  notified: [] as unknown[],
  readable: new Set<string>(),
  posts: [] as PostRow[],
  updates: [] as Record<string, unknown>[],
  edits: [] as unknown[],
  scheduledCreated: [] as Record<string, unknown>[],
  sanction: null as unknown,
}));

vi.mock('@/lib/communities/bans.server', () => ({
  activeSanction: async () => h.sanction,
}));
vi.mock('@/lib/communities/post-alerts.server', () => ({
  enqueuePostAlert: async () => {},
}));
vi.mock('@/lib/feed/map-feed-item.server', () => ({
  isLocked: () => false,
}));
// No feature timeouts in these tests (lib/moderation/restrictions.server.ts).
vi.mock('@/lib/moderation/restrictions.server', () => ({
  restrictionResponse: async () => null,
  isRestricted: async () => false,
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
  checkRateLimit: async () => ({
    allowed: true,
    retryAfter: 0,
  }),
}));
vi.mock('@/lib/feed-sse', () => ({
  feedEventBus: {
    publish: vi.fn(),
    publishCreatedPost: (event: unknown, post: unknown) =>
      h.published.push({
        event: event,
        post,
      }),
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: unknown) => void h.notified.push(n)),
  removeNotification: vi.fn(async () => {}),
}));
vi.mock('@/lib/moderation.server', () => ({
  getHiddenAuthorIds: async () => [],
  getBlockedAuthorIds: async () => [],
}));
vi.mock('@/lib/feed/audience.server', () => ({
  canReadThread: async (
    p: {
      id?: string;
    } | null,
  ) => !!p && h.readable.has(p.id as string),
}));
vi.mock('@/lib/admin-audit.server', () => ({
  getActiveBan: async () => null,
}));
vi.mock('@/lib/feed/alt-text.server', () => ({
  altTextViolation: async (...args: unknown[]) => {
    h.altChecks.push(args);
    return h.altError;
  },
}));
vi.mock('@/lib/posts-plus/compose.server', () => ({
  planPostsPlus: async () => ({
    plan: {
      expiresAt: null,
      seriesId: null,
      qotdDay: null,
    },
  }),
  recordPostsPlusTx: async () => {},
  afterPostsPlus: () => {},
}));
vi.mock('@/lib/tags-extract.server', () => ({
  linkPostHashtags: async () => {},
}));
vi.mock('@/lib/safety/link-risk.server', () => ({
  recordLinkDomains: async () => {},
}));
vi.mock('@/lib/moderation/auto-moderate.server', () => ({
  screenNewContent: async () => {},
}));
vi.mock('@/lib/feed/notify-mentions.server', () => ({
  notifyMentions: async () => {},
}));
vi.mock('@/lib/discovery/jobs.server', () => ({
  enqueuePostDiscovery: async () => {},
}));
vi.mock('@/lib/achievements/engine.server', () => ({
  grantAchievement: async () => {},
  progressAchievement: async () => {},
}));
vi.mock('@/lib/xp/engine.server', () => ({
  awardXp: async () => {},
}));
vi.mock('@/lib/quests/engine.server', () => ({
  progressQuests: async () => {},
}));
vi.mock('@/lib/feed/timeline', () => ({
  getTimeline: async () => ({}),
}));
vi.mock('@/lib/communities/gate.server', () => ({
  gateCommunityContent: async () => ({
    kind: 'allow',
  }),
  logRemoved: async () => {},
}));
vi.mock('@/lib/communities/automod.server', () => ({
  HELD_BY: 'automod',
  recordModItem: async () => {},
}));
vi.mock('@/lib/communities/flairs.server', () => ({
  listFlairs: async () => [],
}));
vi.mock('@/lib/communities/challenge.server', () => ({
  challengeEntryError: async () => null,
}));
vi.mock('@/lib/prisma.server', () => {
  const tx = {
    $executeRaw: async () => 0,
    $queryRaw: async () => [
      {
        id: 'sp1',
      },
    ],
    rMHark: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.created.push(data);
        return {
          id: 'new',
          createdAt: new Date(),
          imageUrls: [],
          imageAlts: [],
          gifUrl: null,
          gifAlt: null,
          isSensitive: false,
          replyControl: 'EVERYONE',
          isTake: false,
          hasEmbed: false,
          seriesId: null,
          expiresAt: null,
          ...data,
          user: {
            id: 'viewer',
            name: 'V',
            image: null,
            handle: 'v',
          },
        };
      },
      update: async () => ({}),
    },
    user: {
      update: async () => ({
        postCount: 1,
      }),
    },
    community: {
      update: async () => ({}),
    },
    scheduledPost: {
      update: async () => ({}),
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.scheduledCreated.push(data);
        return {
          id: 'sp1',
          ...data,
        };
      },
    },
  };
  const run = async (arg: unknown) =>
    typeof arg === 'function' ? (arg as (t: typeof tx) => unknown)(tx) : Promise.all(arg as unknown[]);
  return {
    prisma: {
      rMHark: {
        findUnique: async ({
          where,
        }: {
          where: {
            id: string;
          };
        }) => h.posts.find((p) => p.id === where.id) ?? null,
        update: async ({
          where,
          data,
        }: {
          where: {
            id: string;
          };
          data: Record<string, unknown>;
        }) => {
          h.updates.push(data);
          Object.assign(h.posts.find((p) => p.id === where.id) ?? {}, data);
          return {};
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: {
            id: string;
            userId: string;
            gifUrl?: string | null;
          };
          data: Record<string, unknown>;
        }) => {
          const post = h.posts.find(
            (p) =>
              p.id === where.id &&
              p.userId === where.userId &&
              (where.gifUrl === undefined || where.gifUrl === p.gifUrl),
          );
          if (!post)
            return {
              count: 0,
            };
          h.updates.push(data);
          Object.assign(post, data);
          return {
            count: 1,
          };
        },
        count: async () => 1,
      },
      rMHarkEdit: {
        create: async (a: unknown) => void h.edits.push(a),
      },
      scheduledPost: {
        count: async () => 0,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          h.scheduledCreated.push(data);
          return {
            id: 'sp1',
            ...data,
          };
        },
      },
      user: {
        findUnique: async () => ({
          handle: 'v',
        }),
      },
      $transaction: run,
    },
  };
});

import { route as CreateRoute } from '@/lib/feed/api/rmharks.server';
import { route as EditRoute } from '@/lib/feed/api/rmharks.$id.server';
import { route as ScheduleRoute } from '@/lib/scheduled/api/scheduled.server';
import { publishScheduledPost } from '@/lib/scheduled/publish.server';
import { updatePostAlts } from '@/lib/feed/alt-text-edit.server';

type H = (a: { request: Request; params?: Record<string, string> }) => Promise<Response>;

function req(method: string, body: Record<string, unknown>) {
  return new Request('https://x.test/api/x', {
    method,
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': String(Math.random()),
      cookie: 'better-auth.session_token=t',
    },
    body: JSON.stringify(body),
  });
}

const create = (body: Record<string, unknown>) =>
  handlersOf<H>(CreateRoute).POST({
    request: req('POST', body),
  });
const edit = (id: string, body: Record<string, unknown>) =>
  handlersOf<H>(EditRoute).PATCH({
    request: req('PATCH', body),
    params: {
      id,
    },
  });
const schedule = (body: Record<string, unknown>) =>
  handlersOf<H>(ScheduleRoute).POST({
    request: req('POST', body),
  });

function post(over: Partial<PostRow> = {}): PostRow {
  return {
    id: 'p1',
    userId: 'viewer',
    content: 'hi',
    deletedAt: null,
    expiresAt: null,
    unlockPrice: null,
    gifUrl: GIF,
    gifAlt: 'A cat waving',
    imageUrls: [],
    imageAlts: [],
    ...over,
  };
}

beforeEach(() => {
  h.viewer = 'viewer';
  h.altError = null;
  h.altChecks.length = 0;
  h.created.length = 0;
  h.updates.length = 0;
  h.edits.length = 0;
  h.scheduledCreated.length = 0;
  h.posts = [];
  h.sanction = null;
});

describe('the schemas', () => {
  it('accept a description beside a GIF', () => {
    expect(
      createRMHarkSchema.safeParse({
        content: '',
        gifUrl: GIF,
        gifAlt: 'A cat waving',
      }).success,
    ).toBe(true);
  });

  it('refuse a description over the limit, on create and on edit', () => {
    const tooLong = 'x'.repeat(MAX_GIF_ALT_LENGTH + 1);
    expect(
      createRMHarkSchema.safeParse({
        content: '',
        gifUrl: GIF,
        gifAlt: tooLong,
      }).success,
    ).toBe(false);
    expect(
      editRMHarkSchema.safeParse({
        content: 'a',
        gifAlt: tooLong,
      }).success,
    ).toBe(false);
  });

  it('take the limit exactly', () => {
    expect(
      createRMHarkSchema.safeParse({
        content: '',
        gifUrl: GIF,
        gifAlt: 'x'.repeat(MAX_GIF_ALT_LENGTH),
      }).success,
    ).toBe(true);
  });
});

describe('POST /api/rmharks', () => {
  it('stores the description beside the GIF, cleaned, and returns it', async () => {
    const res = await create({
      content: '',
      gifUrl: GIF,
      gifAlt: '  A cat\nwaving  ',
    });
    expect(res.status).toBe(201);
    expect(h.created[0]).toMatchObject({
      gifUrl: GIF,
      gifAlt: 'A cat waving',
    });
    const item = (await res.json()) as {
      gifAlt?: string;
    };
    expect(item.gifAlt).toBe('A cat waving');
  });

  it('stores null when the GIF has no description, or the description is blank', async () => {
    await create({
      content: '',
      gifUrl: GIF,
    });
    await create({
      content: '',
      gifUrl: GIF,
      gifAlt: '   ',
    });
    expect(h.created.map((c) => c.gifAlt)).toEqual([null, null]);
  });

  it('never keeps a description without a GIF', async () => {
    await create({
      content: 'text',
      gifAlt: 'orphan',
    });
    expect(h.created[0]?.gifAlt).toBeNull();
  });

  it('refuses a description over the limit with 400 and writes nothing', async () => {
    const res = await create({
      content: '',
      gifUrl: GIF,
      gifAlt: 'x'.repeat(MAX_GIF_ALT_LENGTH + 1),
    });
    expect(res.status).toBe(400);
    expect(h.created).toEqual([]);
  });

  it('hands the GIF to the require-alt-text check, so an undescribed GIF can be refused like an undescribed image', async () => {
    h.altError = 'Add a description to the GIF';
    const res = await create({
      content: '',
      gifUrl: GIF,
    });
    expect(res.status).toBe(400);
    expect(h.altChecks[0]?.[3]).toEqual({
      url: GIF,
      alt: undefined,
    });
  });
});

describe('PATCH /api/rmharks/$id', () => {
  it('a description sent on its own replaces the current one, with no edit history', async () => {
    h.posts = [post()];
    const res = await edit('p1', {
      content: 'hi',
      gifAlt: 'A cat waving hello',
    });
    expect(res.status).toBe(200);
    expect(h.posts[0]?.gifAlt).toBe('A cat waving hello');
    expect(h.edits).toEqual([]);
    const out = (await res.json()) as {
      editedAt: unknown;
      gifAlt?: string;
    };
    expect(out.editedAt).toBeNull();
    expect(out.gifAlt).toBe('A cat waving hello');
  });

  it('a different GIF starts from the description sent with it, never the old one', async () => {
    h.posts = [post()];
    await edit('p1', {
      content: 'hi',
      gifUrl: GIF_2,
      gifAlt: 'A dog',
    });
    expect(h.posts[0]).toMatchObject({
      gifUrl: GIF_2,
      gifAlt: 'A dog',
    });
    expect(h.edits).toHaveLength(1);
  });

  it('a different GIF with no description sent drops the old description', async () => {
    h.posts = [post()];
    await edit('p1', {
      content: 'hi',
      gifUrl: GIF_2,
    });
    expect(h.posts[0]?.gifAlt).toBeNull();
  });

  it('removing the GIF removes its description', async () => {
    h.posts = [post()];
    await edit('p1', {
      content: 'hi',
      gifUrl: null,
    });
    expect(h.posts[0]).toMatchObject({
      gifUrl: null,
      gifAlt: null,
    });
  });

  it('refuses a description over the limit and changes nothing', async () => {
    h.posts = [post()];
    const res = await edit('p1', {
      content: 'hi',
      gifAlt: 'x'.repeat(MAX_GIF_ALT_LENGTH + 1),
    });
    expect(res.status).toBe(400);
    expect(h.posts[0]?.gifAlt).toBe('A cat waving');
  });
});

describe('scheduled posts', () => {
  it('create carries the description onto the scheduled row', async () => {
    const res = await schedule({
      content: 'later',
      gifUrl: GIF,
      gifAlt: ' A cat ',
    });
    expect(res.status).toBe(201);
    expect(h.scheduledCreated[0]).toMatchObject({
      gifUrl: GIF,
      gifAlt: 'A cat',
    });
    expect(h.altChecks[0]?.[3]).toEqual({
      url: GIF,
      alt: ' A cat ',
    });
  });

  it('create refuses a description over the limit', async () => {
    const res = await schedule({
      content: 'later',
      gifUrl: GIF,
      gifAlt: 'x'.repeat(MAX_GIF_ALT_LENGTH + 1),
    });
    expect(res.status).toBe(400);
    expect(h.scheduledCreated).toEqual([]);
  });

  it('publish carries the description onto the post it creates', async () => {
    const id = await publishScheduledPost({
      id: 'sp1',
      userId: 'viewer',
      content: 'later',
      gifUrl: GIF,
      gifAlt: 'A cat waving',
      imageUrls: [],
      imageAlts: [],
      audience: 'PUBLIC',
      isSensitive: false,
      replyControl: 'EVERYONE',
      unlockPrice: null,
      communityId: null,
      poll: null,
      isCapsule: false,
      publishedId: null,
    } as never);
    expect(id).toBe('new');
    expect(h.created[0]).toMatchObject({
      gifUrl: GIF,
      gifAlt: 'A cat waving',
    });
  });

  it('publish stores no description for a row without a GIF', async () => {
    await publishScheduledPost({
      id: 'sp1',
      userId: 'viewer',
      content: 'later',
      gifUrl: null,
      gifAlt: 'stale',
      imageUrls: [],
      imageAlts: [],
      audience: 'PUBLIC',
      isSensitive: false,
      replyControl: 'EVERYONE',
      unlockPrice: null,
      communityId: null,
      poll: null,
      isCapsule: false,
      publishedId: null,
    } as never);
    expect(h.created[0]?.gifAlt).toBeNull();
  });
});

describe('describe after posting (updatePostAlts)', () => {
  it('lets the author describe a post that has only a GIF', async () => {
    h.posts = [
      post({
        gifAlt: null,
      }),
    ];
    const res = await updatePostAlts({
      postId: 'p1',
      userId: 'viewer',
      alts: [],
      gifAlt: '  A cat waving  ',
    });
    expect(res).toMatchObject({
      ok: true,
      gifAlt: 'A cat waving',
    });
    expect(h.posts[0]?.gifAlt).toBe('A cat waving');
  });

  it('clears the description with null', async () => {
    h.posts = [post()];
    await updatePostAlts({
      postId: 'p1',
      userId: 'viewer',
      alts: [],
      gifAlt: null,
    });
    expect(h.posts[0]?.gifAlt).toBeNull();
  });

  it('describes the GIF and the images together', async () => {
    h.posts = [
      post({
        imageUrls: ['a', 'b'],
        imageAlts: ['', ''],
      }),
    ];
    const res = await updatePostAlts({
      postId: 'p1',
      userId: 'viewer',
      alts: ['one', 'two'],
      gifAlt: 'three',
    });
    expect(res).toMatchObject({
      ok: true,
      imageAlts: ['one', 'two'],
      gifAlt: 'three',
    });
  });

  it('refuses someone else’s post with 403 and writes nothing', async () => {
    h.posts = [
      post({
        userId: 'other',
      }),
    ];
    const res = await updatePostAlts({
      postId: 'p1',
      userId: 'viewer',
      alts: [],
      gifAlt: 'mine now',
    });
    expect(res).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(h.updates).toEqual([]);
  });

  it('refuses a description for a post with no GIF', async () => {
    h.posts = [
      post({
        gifUrl: null,
        gifAlt: null,
        imageUrls: ['a'],
        imageAlts: [''],
      }),
    ];
    const res = await updatePostAlts({
      postId: 'p1',
      userId: 'viewer',
      alts: ['x'],
      gifAlt: 'no gif here',
    });
    expect(res).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('refuses a call that describes nothing', async () => {
    h.posts = [post()];
    const res = await updatePostAlts({
      postId: 'p1',
      userId: 'viewer',
      alts: [],
    });
    expect(res).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});
