/**
 * RMH Vibes on RMHarks: the create schema accepts a vibe-only post, and POST /api/rmharks
 * pins a vibe only when the page is ready and the version is one of its own.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';
import { createRMHarkSchema } from '@/lib/rmhark-schema';

const h = vi.hoisted(() => ({
  page: null as { id: string; status: string } | null,
  version: null as { pageId: string } | null,
  created: [] as Record<string, unknown>[],
  published: [] as unknown[],
  notified: [] as unknown[],
  readable: new Set<string>(),
  posts: {} as Record<string, Record<string, unknown>>,
}));

// No feature timeouts in these tests (lib/moderation/restrictions.server.ts).
vi.mock('@/lib/moderation/restrictions.server', () => ({
  restrictionResponse: async () => null,
}));
vi.mock(
  '@/lib/auth',
  () => ({
    auth: {
      api: {
        getSession:
          async () => ({
            user: {
              id: 'viewer',
            },
            session:
              {},
          }),
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
    checkRateLimit:
      async () => ({
        allowed: true,
        retryAfter: 0,
      }),
  }),
);
vi.mock(
  '@/lib/feed-sse',
  () => ({
    feedEventBus:
      {
        publish:
          vi.fn(),
        publishCreatedPost:
          (
            event: unknown,
            post: unknown,
          ) =>
            h.published.push(
              {
                event:
                  event,
                post,
              },
            ),
      },
  }),
);
vi.mock(
  '@/lib/notifications.server',
  () => ({
    createNotification:
      vi.fn(
        async (
          n: unknown,
        ) =>
          void h.notified.push(
            n,
          ),
      ),
    removeNotification:
      vi.fn(
        async () => {},
      ),
  }),
);
vi.mock(
  '@/lib/moderation.server',
  () => ({
    getHiddenAuthorIds:
      async () => [],
    getBlockedAuthorIds:
      async () => [],
  }),
);
vi.mock(
  '@/lib/feed/audience.server',
  () => ({
    canReadThread:
      async (
        p: {
          id?: string;
        } | null,
      ) =>
        !!p &&
        h.readable.has(
          p.id as string,
        ),
  }),
);
vi.mock(
  '@/lib/admin-audit.server',
  () => ({
    getActiveBan:
      async () =>
        null,
  }),
);
vi.mock(
  '@/lib/feed/alt-text.server',
  () => ({
    altTextViolation:
      async () =>
        null,
  }),
);
vi.mock(
  '@/lib/posts-plus/compose.server',
  () => ({
    planPostsPlus:
      async () => ({
        plan: {
          expiresAt:
            null,
          seriesId:
            null,
          qotdDay:
            null,
        },
      }),
    recordPostsPlusTx:
      async () => {},
    afterPostsPlus:
      () => {},
  }),
);
vi.mock(
  '@/lib/tags-extract.server',
  () => ({
    linkPostHashtags:
      async () => {},
  }),
);
vi.mock(
  '@/lib/safety/link-risk.server',
  () => ({
    recordLinkDomains:
      async () => {},
  }),
);
vi.mock(
  '@/lib/moderation/auto-moderate.server',
  () => ({
    screenNewContent:
      async () => {},
  }),
);
vi.mock(
  '@/lib/feed/notify-mentions.server',
  () => ({
    notifyMentions:
      async () => {},
  }),
);
vi.mock(
  '@/lib/discovery/jobs.server',
  () => ({
    enqueuePostDiscovery:
      async () => {},
  }),
);
vi.mock(
  '@/lib/achievements/engine.server',
  () => ({
    grantAchievement:
      async () => {},
    progressAchievement:
      async () => {},
  }),
);
vi.mock(
  '@/lib/xp/engine.server',
  () => ({
    awardXp:
      async () => {},
  }),
);
vi.mock(
  '@/lib/quests/engine.server',
  () => ({
    progressQuests:
      async () => {},
  }),
);
vi.mock(
  '@/lib/scheduled/publish.server',
  () => ({
    publishDueForUser:
      async () => {},
  }),
);
vi.mock(
  '@/lib/feed/timeline',
  () => ({
    getTimeline:
      async () => ({}),
  }),
);
vi.mock(
  '@/lib/communities/gate.server',
  () => ({
    gateCommunityContent:
      async () => ({
        kind: 'allow',
      }),
    logRemoved:
      async () => {},
  }),
);
vi.mock(
  '@/lib/communities/automod.server',
  () => ({
    HELD_BY:
      'automod',
    recordModItem:
      async () => {},
  }),
);
vi.mock(
  '@/lib/communities/flairs.server',
  () => ({
    listFlairs:
      async () => [],
  }),
);
vi.mock(
  '@/lib/communities/challenge.server',
  () => ({
    challengeEntryError:
      async () =>
        null,
  }),
);
vi.mock('@/lib/prisma.server', () => {
  const tx = {
    rMHark: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        h.created.push(data);
        return {
          id: 'new',
          createdAt: new Date(),
          imageUrls: [],
          imageAlts: [],
          gifUrl: null,
          isSensitive: false,
          replyControl: 'EVERYONE',
          isTake: false,
          hasEmbed: false,
          seriesId: null,
          expiresAt: null,
          ...data,
          user: { id: 'viewer', name: 'V', image: null, handle: 'v' },
        };
      },
      update: async () => ({}),
    },
    user: { update: async () => ({ postCount: 1 }) },
    community: { update: async () => ({}) },
  };
  return {
    prisma: {
      vibePage: { findUnique: async () => h.page },
      vibePageVersion: { findUnique: async () => h.version },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { route as Route } from '@/lib/feed/api/rmharks.server';

const POST = handlersOf<(a: { request: Request }) => Promise<Response>>(Route).POST;

async function post(body: Record<string, unknown>) {
  return POST({
    request: new Request('https://x.test/api/rmharks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': String(Math.random()),
        cookie: 'better-auth.session_token=t',
      },
      body: JSON.stringify(body),
    }),
  });
}

const vibe = { slug: 'neon', versionId: 'v1' };

beforeEach(() => {
  h.created.length = 0;
  h.page = { id: 'p1', status: 'ready' };
  h.version = { pageId: 'p1' };
});

describe('createRMHarkSchema vibe field', () => {
  it('accepts a vibe-only post', () => {
    expect(createRMHarkSchema.safeParse({ content: '', vibe: { slug: 'a', versionId: 'v' } }).success).toBe(true);
  });

  it('still rejects an empty post', () => {
    expect(createRMHarkSchema.safeParse({ content: '' }).success).toBe(false);
  });
});

describe('POST /api/rmharks with a vibe', () => {
  it('pins the version in the same create', async () => {
    const res = await post({ content: '', vibe });
    expect(res.status).toBe(201);
    expect(h.created[0]).toMatchObject({
      hasVibe: true,
      vibeEmbed: { create: { pageId: 'p1', versionId: 'v1' } },
    });
  });

  it('refuses a version that belongs to another page', async () => {
    h.version = { pageId: 'other' };
    const res = await post({ content: '', vibe });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Vibe not available' });
    expect(h.created).toEqual([]);
  });

  it('refuses a page that is still generating', async () => {
    h.page = { id: 'p1', status: 'generating' };
    expect((await post({ content: '', vibe })).status).toBe(400);
    expect(h.created).toEqual([]);
  });

  it('refuses a page that does not exist', async () => {
    h.page = null;
    expect((await post({ content: '', vibe })).status).toBe(400);
  });
});
