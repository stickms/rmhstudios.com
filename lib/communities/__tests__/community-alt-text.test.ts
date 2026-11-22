/**
 * s07-16 communities that require image descriptions. Prisma and the settings cache are stood in for; the pure rule
 * (`communityAltMissing`) is the member rule's own `missingAltIndexes`, so NBSP-only and blank descriptions count as
 * missing here too.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({
  requireImageAlt: true,
  sanction: null as null,
  member: {
    role: 'MEMBER',
    joinedAt: new Date('2026-01-01'),
  } as {
    role: string;
    joinedAt: Date;
  } | null,
  mod: true,
  notes: [] as Array<Record<string, unknown>>,
  created: [] as Array<Record<string, unknown>>,
  logged: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  existingNotice: false,
  post: null as null | Record<string, unknown>,
  updateMany: vi.fn(async () => ({
    count: 1,
  })),
}));

vi.mock('@/lib/communities/settings.server', async (orig) => {
  const real = await orig<typeof import('@/lib/communities/settings.server')>();
  return {
    ...real,
    getCommunitySettings: async () => ({
      verification: {
        level: 'none',
        value: 0,
      },
      flairRequired: false,
      starThreshold: 5,
      requireImageAlt: h.requireImageAlt,
    }),
  };
});
vi.mock('@/lib/prisma.server', () => {
  const prisma = {
    communityMember: {
      findUnique: async () => h.member,
    },
    user: {
      findUnique: async () => ({
        emailVerified: true,
        createdAt: new Date('2025-01-01'),
        image: null,
      }),
    },
    community: {
      findUnique: async () => ({
        id: 'c1',
        name: 'Chess',
        slug: 'chess',
        requireImageAlt: false,
      }),
      update: async (a: { data: Record<string, unknown> }) => {
        h.updates.push(a.data);
        return {};
      },
    },
    rMHark: {
      findUnique: async () => h.post,
      updateMany: h.updateMany,
    },
    notification: {
      findFirst: async () =>
        h.existingNotice
          ? {
              id: 'n1',
            }
          : null,
    },
    scheduledPost: {
      count: async () => 0,
      create: async (a: { data: Record<string, unknown> }) => {
        h.created.push(a.data);
        return {
          id: 'sp1',
          ...a.data,
        };
      },
    },
    $transaction: async (cb: (tx: unknown) => unknown) => cb(prisma),
  };
  return {
    prisma,
  };
});
vi.mock('@/lib/communities/bans.server', () => ({
  activeSanction: async () => h.sanction,
}));
vi.mock('@/lib/communities/flairs.server', () => ({
  flairBelongsTo: async () => true,
}));
vi.mock('@/lib/communities/automod.server', () => ({
  getAutomodRules: async () => [],
  recordModItem: vi.fn(),
}));
vi.mock('@/lib/communities/modlog.server', () => ({
  logModAction: async (_tx: unknown, a: Record<string, unknown>) => {
    h.logged.push(a);
  },
}));
vi.mock('@/lib/cached.server', () => ({
  cached: async (_k: string, _t: number, fn: () => unknown) => fn(),
  invalidateCached: async () => {},
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (n: Record<string, unknown>) => {
    h.notes.push(n);
  },
}));
vi.mock('@/lib/xp/engine.server', () => ({
  awardXp: vi.fn(),
}));
vi.mock('@/lib/quests/engine.server', () => ({
  progressQuests: vi.fn(),
}));
vi.mock('@/lib/achievements/engine.server', () => ({
  grantAchievement: vi.fn(),
  progressAchievement: vi.fn(),
}));
vi.mock('@/lib/communities/post-alerts.server', () => ({
  enqueuePostAlert: vi.fn(),
}));
vi.mock('@/lib/api/implement.server', () => ({
  implement: (_c: unknown, _o: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({
    allowed: true,
  }),
  getClientIp: () => 'ip',
}));
vi.mock('@/lib/storage/keys', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage/keys')>()),
  ownsFeedImageUrl: () => true,
}));
vi.mock('@/lib/scheduled/list.server', () => ({
  listScheduled: vi.fn(),
}));
vi.mock('@/lib/feed/alt-text.server', () => ({
  altTextViolation: async () => null,
}));
vi.mock('@/lib/communities/guard.server', () => ({
  requireMod: async () =>
    h.mod
      ? {
          ok: true,
          value: {
            id: 'c1',
          },
        }
      : {
          ok: false,
          response: Response.json(
            {
              error: 'Forbidden',
            },
            {
              status: 403,
            },
          ),
        },
}));
vi.mock('@/lib/feed/map-feed-item.server', () => ({
  isLocked: () => false,
}));

const { gateCommunityContent } = await import('@/lib/communities/gate.server');
const { updateCommunitySettings } = await import('@/lib/communities/settings.server');
const { publishScheduledPost } = await import('@/lib/scheduled/publish.server');
const { updatePostAlts } = await import('@/lib/feed/alt-text-edit.server');
const { communityAltMissing, clearsDescription } = await import('@/lib/communities/alt-required');

const gate = (imageUrls?: string[], imageAlts?: string[], target: 'post' | 'comment' = 'post') =>
  gateCommunityContent({
    communityId: 'c1',
    userId: 'u1',
    target,
    content: 'hi',
    postKind: 'text' as never,
    imageUrls,
    imageAlts,
  });

beforeEach(() => {
  h.requireImageAlt = true;
  h.member = {
    role: 'MEMBER',
    joinedAt: new Date('2026-01-01'),
  };
  h.mod = true;
  h.notes.length = 0;
  h.created.length = 0;
  h.logged.length = 0;
  h.updates.length = 0;
  h.existingNotice = false;
  h.post = null;
  h.updateMany.mockClear();
});

describe('communityAltMissing', () => {
  it('is empty when the community does not require descriptions or the post has no images', () => {
    expect(communityAltMissing(false, ['a.png'], [''])).toEqual([]);
    expect(communityAltMissing(true, [], [])).toEqual([]);
    expect(communityAltMissing(true, undefined, undefined)).toEqual([]);
  });
  it('counts blank and NBSP-only descriptions as missing', () => {
    expect(communityAltMissing(true, ['a', 'b', 'c'], ['ok', '   ', ' '])).toEqual([1, 2]);
  });
  it('detects a cleared description', () => {
    expect(clearsDescription(['x', 'y'], ['x', ''])).toBe(true);
    expect(clearsDescription(['x', ''], ['x', 'z'])).toBe(false);
    expect(clearsDescription(['', ''], ['', ''])).toBe(false);
  });
});

describe('gateCommunityContent with images', () => {
  it('refuses an image without a description (create and scheduled create share the gate)', async () => {
    expect(await gate(['a.png'], [''])).toMatchObject({
      kind: 'deny',
      status: 400,
      code: 'ALT_REQUIRED',
      missing: [0],
    });
  });
  it('does not exempt moderators', async () => {
    h.member = {
      role: 'MOD',
      joinedAt: new Date('2026-01-01'),
    };
    expect(await gate(['a.png'], [])).toMatchObject({
      kind: 'deny',
      code: 'ALT_REQUIRED',
    });
  });
  it('allows an image that has a description', async () => {
    expect((await gate(['a.png'], ['A cat on a chessboard'])).kind).toBe('allow');
  });
  it('allows a text-only post', async () => {
    expect((await gate()).kind).toBe('allow');
    expect((await gate([], [])).kind).toBe('allow');
  });
  it('leaves a community that does not require descriptions alone', async () => {
    h.requireImageAlt = false;
    expect((await gate(['a.png'], [''])).kind).toBe('allow');
  });
});

describe('scheduled create', () => {
  const post = async (body: Record<string, unknown>) => {
    const mod = await import('@/lib/scheduled/api/scheduled.server');
    const handler = handlersOfModule<(a: unknown) => Promise<Response>>(mod).POST!;
    return handler({
      userId: 'u1',
      session: {
        user: {
          id: 'u1',
        },
      },
      request: new Request('http://x/api/scheduled', {
        method: 'POST',
      }),
      body,
    });
  };
  it('refuses an undescribed image into a requiring community', async () => {
    const res = await post({
      content: 'x',
      communityId: 'c1',
      imageUrls: ['a.png'],
      imageAlts: [''],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: 'ALT_REQUIRED',
      missing: [0],
    });
    expect(h.created).toHaveLength(0);
  });
  it('accepts it with a description', async () => {
    const res = await post({
      content: 'x',
      communityId: 'c1',
      imageUrls: ['a.png'],
      imageAlts: ['A cat'],
    });
    expect(res.status).toBe(201);
  });
  it('accepts a text-only draft', async () => {
    const res = await post({
      content: 'x',
      communityId: 'c1',
    });
    expect(res.status).toBe(201);
  });
});

describe('scheduled publish', () => {
  const sp = (over: Record<string, unknown> = {}) =>
    ({
      id: 'sp1',
      userId: 'u1',
      communityId: 'c1',
      publishedId: null,
      imageUrls: ['a.png'],
      imageAlts: [''],
      content: 'x',
      ...over,
    }) as never;
  it('does not publish a post that no longer meets the rule, and tells its author once', async () => {
    expect(await publishScheduledPost(sp())).toBeNull();
    expect(h.notes).toHaveLength(1);
    expect(h.notes[0]).toMatchObject({
      userId: 'u1',
      type: 'SYSTEM',
      entityType: 'scheduled-alt-required',
      entityId: 'sp1',
    });
    expect(String(h.notes[0]!.preview)).toContain('an image needs a description');
  });
  it('does not repeat the notice on a later pass', async () => {
    h.existingNotice = true;
    expect(await publishScheduledPost(sp())).toBeNull();
    expect(h.notes).toHaveLength(0);
  });
});

describe('description edit', () => {
  const owned = (alts: string[]) => ({
    id: 'p1',
    userId: 'u1',
    deletedAt: null,
    imageUrls: ['a.png', 'b.png'],
    imageAlts: alts,
    gifUrl: null,
    gifAlt: null,
    unlockPrice: null,
    expiresAt: null,
    communityId: 'c1',
  });
  it('refuses clearing a description in a requiring community', async () => {
    h.post = owned(['one', 'two']);
    const r = await updatePostAlts({
      postId: 'p1',
      userId: 'u1',
      alts: ['one', ' '],
    });
    expect(r).toMatchObject({
      ok: false,
      status: 400,
    });
    expect(h.updateMany).not.toHaveBeenCalled();
  });
  it('allows rewording or filling one in', async () => {
    h.post = owned(['one', '']);
    const r = await updatePostAlts({
      postId: 'p1',
      userId: 'u1',
      alts: ['uno', 'dos'],
    });
    expect(r.ok).toBe(true);
  });
  it('allows clearing where the community does not require descriptions', async () => {
    h.requireImageAlt = false;
    h.post = owned(['one', 'two']);
    const r = await updatePostAlts({
      postId: 'p1',
      userId: 'u1',
      alts: ['one', ''],
    });
    expect(r.ok).toBe(true);
  });
});

describe('the setting', () => {
  const row = {
    verificationLevel: 'none',
    verificationValue: 0,
    flairRequired: false,
    starThreshold: 5,
    publicModLog: false,
    requireImageAlt: false,
  };
  it('is logged in the mod log as a settings change', async () => {
    const mod = await import('@/lib/prisma.server');
    (
      mod.prisma.community as unknown as {
        findUnique: unknown;
      }
    ).findUnique = async () => row;
    await updateCommunitySettings(
      'c1',
      {
        requireImageAlt: true,
      },
      'mod1',
    );
    expect(h.updates[0]).toEqual({
      requireImageAlt: true,
    });
    expect(h.logged[0]).toMatchObject({
      communityId: 'c1',
      actorId: 'mod1',
      action: 'settings_changed',
      detail: {
        fields: ['requireImageAlt'],
      },
    });
  });
  it('is refused for a non-moderator and sets nothing', async () => {
    h.mod = false;
    const mod = await import('@/lib/communities/api/communities.$slug.settings.server');
    const handler = handlersOfModule<(a: unknown) => Promise<Response>>(mod).PATCH!;
    const res = await handler({
      params: {
        slug: 'chess',
      },
      userId: 'u2',
      body: {
        requireImageAlt: true,
      },
    });
    expect(res.status).toBe(403);
    expect(h.updates).toHaveLength(0);
  });
});

describe('GIFs count like images (s07-16)', () => {
  const gifGate = (gifUrl: string | null, gifAlt: string | null) =>
    gateCommunityContent({
      communityId: 'c1',
      userId: 'u1',
      target: 'post',
      content: 'hi',
      postKind: 'text' as never,
      gifUrl,
      gifAlt,
    });
  it('refuses an undescribed or blank-described GIF', async () => {
    expect(await gifGate('https://g/x.gif', null)).toMatchObject({
      kind: 'deny',
      code: 'ALT_REQUIRED',
      missingGif: true,
    });
    expect(await gifGate('https://g/x.gif', ' \u00a0 ')).toMatchObject({ kind: 'deny', code: 'ALT_REQUIRED' });
  });
  it('allows a described GIF and a post with no GIF', async () => {
    expect((await gifGate('https://g/x.gif', 'a cat waves')).kind).toBe('allow');
    expect((await gifGate(null, null)).kind).toBe('allow');
  });
  it('does not publish a scheduled GIF post without a description', async () => {
    expect(
      await publishScheduledPost({
        id: 'sp2',
        userId: 'u1',
        communityId: 'c1',
        publishedId: null,
        imageUrls: [],
        imageAlts: [],
        gifUrl: 'https://g/x.gif',
        gifAlt: null,
        content: 'x',
      } as never),
    ).toBeNull();
  });
});
