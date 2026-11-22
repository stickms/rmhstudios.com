/**
 * s09-11: a scheduled community post meets the community gate (AutoMod included) once, under the row lock.
 * Allowed publishes, held is stored as a held post and queued with one notice, refused stays a draft with one notice,
 * the image-description outcome is unchanged, and two racing publishers make one post. The three publishing paths
 * (lazy `publishDueForUser`, the job's direct `publishScheduledPost`, and "Post now") are each driven.
 */
import { noticeFallbackText } from '@/lib/notifications/notice-keys';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type GateOutcome =
  | { kind: 'allow'; flagRule: string | null }
  | { kind: 'hold'; holdRule: string }
  | { kind: 'refuse'; notice: 'alt-required' | 'refused'; reason: string };

const h = vi.hoisted(() => ({
  gate: { kind: 'allow', flagRule: null } as GateOutcome,
  gateCalls: 0,
  /** Ids whose row lock another publisher already took (the `FOR UPDATE ... publishedId IS NULL` finds nothing). */
  locked: new Set<string>(),
  created: [] as Array<Record<string, unknown>>,
  userUpdates: 0,
  communityUpdates: 0,
  published: new Map<string, string>(),
  notices: [] as Array<Record<string, unknown>>,
  existing: false,
  recentRefusals: [] as Array<Record<string, unknown>>,
  modItems: [] as Array<Record<string, unknown>>,
  seq: 0,
  queue: Promise.resolve() as Promise<unknown>,
}));

vi.mock('@/lib/prisma.server', () => {
  const tx = {
    $queryRaw: vi.fn(async (_s: TemplateStringsArray, id: string) => (h.locked.has(id) ? [] : [{ id }])),
    media: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({})) },
    rMHark: {
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        h.created.push(a.data);
        h.seq += 1;
        return { id: `post${h.seq}` };
      }),
    },
    user: {
      update: vi.fn(async () => {
        h.userUpdates += 1;
        return {};
      }),
    },
    community: {
      update: vi.fn(async () => {
        h.communityUpdates += 1;
        return {};
      }),
    },
    scheduledPost: {
      update: vi.fn(async (a: { where: { id: string }; data: { publishedId: string } }) => {
        h.published.set(a.where.id, a.data.publishedId);
        h.locked.add(a.where.id);
        return {};
      }),
    },
  };
  return {
    prisma: {
      // `FOR UPDATE` makes the second transaction wait for the first to finish: model it as a queue.
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => {
        const run = h.queue.then(() => fn(tx));
        h.queue = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      }),
      scheduledPost: {
        findUnique: vi.fn(async (a: { where: { id: string } }) => ({
          publishedId: h.published.get(a.where.id) ?? null,
        })),
        findMany: vi.fn(async () => []),
      },
      notification: {
        findFirst: vi.fn(async () => (h.existing ? { id: 'n1' } : null)),
        findMany: vi.fn(async () => h.recentRefusals),
      },
      community: { findUnique: vi.fn(async () => ({ name: 'Chess', slug: 'chess' })) },
      rMHark: { count: vi.fn(async () => 1) },
      user: { findUnique: vi.fn(async () => null) },
    },
  };
});
vi.mock('@/lib/scheduled/gate.server', () => ({
  evaluateScheduledGate: vi.fn(async () => {
    h.gateCalls += 1;
    return h.gate;
  }),
}));
vi.mock('@/lib/communities/automod.server', () => ({
  HELD_BY: 'automod-hold',
  recordModItem: vi.fn(async (a: Record<string, unknown>) => {
    h.modItems.push(a);
    return 'm1';
  }),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: Record<string, unknown>) => {
    h.notices.push(n);
  }),
}));
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: vi.fn() }));
vi.mock('@/lib/quests/engine.server', () => ({ progressQuests: vi.fn() }));
vi.mock('@/lib/achievements/engine.server', () => ({ grantAchievement: vi.fn(), progressAchievement: vi.fn() }));
const enqueuePostAlert = vi.fn();
vi.mock('@/lib/communities/post-alerts.server', () => ({ enqueuePostAlert: (id: string) => enqueuePostAlert(id) }));

const { publishScheduledPost, publishDueForUser } = await import('@/lib/scheduled/publish.server');
const { prisma } = await import('@/lib/prisma.server');

const draft = (over: Record<string, unknown> = {}) =>
  ({
    id: 'sp1',
    userId: 'u1',
    content: ' hello ',
    gifUrl: null,
    gifAlt: null,
    imageUrls: [],
    imageAlts: [],
    audience: 'PUBLIC',
    isSensitive: false,
    contentWarning: null,
    replyControl: 'EVERYONE',
    unlockPrice: null,
    communityId: 'c1',
    poll: null,
    publishedId: null,
    isCapsule: false,
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    ...over,
  }) as never;

beforeEach(() => {
  h.gate = { kind: 'allow', flagRule: null };
  h.gateCalls = 0;
  h.locked.clear();
  h.created.length = 0;
  h.userUpdates = 0;
  h.communityUpdates = 0;
  h.published.clear();
  h.notices.length = 0;
  h.existing = false;
  h.recentRefusals = [];
  h.modItems.length = 0;
  h.seq = 0;
  enqueuePostAlert.mockClear();
});

describe('scheduled community post: allowed', () => {
  it('publishes as before, runs the gate once and queues the member alerts', async () => {
    expect(await publishScheduledPost(draft())).toBe('post1');
    expect(h.gateCalls).toBe(1);
    expect(h.created[0]).not.toHaveProperty('deletedAt');
    expect(h.userUpdates).toBe(1);
    expect(h.communityUpdates).toBe(1);
    expect(h.published.get('sp1')).toBe('post1');
    expect(enqueuePostAlert).toHaveBeenCalledWith('post1');
    expect(h.notices).toHaveLength(0);
    expect(h.modItems).toHaveLength(0);
  });

  it('a flagged but visible post is published and queued for the mods as a flag', async () => {
    h.gate = { kind: 'allow', flagRule: 'Links' };
    expect(await publishScheduledPost(draft())).toBe('post1');
    expect(h.modItems).toEqual([expect.objectContaining({ action: 'flag', ruleName: 'Links', postId: 'post1' })]);
    expect(h.notices).toHaveLength(0);
  });
});

describe('scheduled community post: held by AutoMod', () => {
  it('stores a held post, files the mod item with the rule, tells the author once and counts it as published', async () => {
    h.gate = { kind: 'hold', holdRule: 'No links' };
    expect(await publishScheduledPost(draft())).toBe('post1');
    expect(h.created[0]).toMatchObject({ deletedBy: 'automod-hold' });
    expect(h.created[0]!.deletedAt).toBeInstanceOf(Date);
    expect(h.published.get('sp1')).toBe('post1');
    // A held post is not counted or announced until a moderator approves it.
    expect(h.userUpdates).toBe(0);
    expect(h.communityUpdates).toBe(0);
    expect(enqueuePostAlert).not.toHaveBeenCalled();
    expect(h.modItems).toEqual([
      expect.objectContaining({
        communityId: 'c1',
        action: 'hold',
        ruleName: 'No links',
        entityId: 'post1',
        authorId: 'u1',
        snapshot: ' hello '.trim(),
      }),
    ]);
    expect(h.notices).toEqual([
      expect.objectContaining({ userId: 'u1', type: 'SYSTEM', entityType: 'scheduled-held', entityId: 'sp1' }),
    ]);
    expect(noticeFallbackText(h.notices[0]!.preview as never)).toBe(
      'Your scheduled post to Chess is waiting for a moderator',
    );
  });

  it('is never attempted again: the row carries publishedId, so a later pass returns it without the gate', async () => {
    h.gate = { kind: 'hold', holdRule: 'No links' };
    await publishScheduledPost(draft());
    h.gateCalls = 0;
    expect(await publishScheduledPost(draft({ publishedId: 'post1' }))).toBe('post1');
    expect(h.gateCalls).toBe(0);
    expect(h.notices).toHaveLength(1);
  });
});

describe('scheduled community post: refused', () => {
  it('stays a draft and tells the author once with the reason', async () => {
    h.gate = { kind: 'refuse', notice: 'refused', reason: 'Join the community to post in it' };
    expect(await publishScheduledPost(draft())).toBeNull();
    expect(h.created).toHaveLength(0);
    expect(h.published.size).toBe(0);
    expect(h.notices).toEqual([
      expect.objectContaining({
        type: 'SYSTEM',
        entityType: 'scheduled-refused',
        entityId: 'sp1',
        link: '/drafts',
      }),
    ]);
    expect(noticeFallbackText(h.notices[0]!.preview as never)).toBe(
      'Your scheduled post to Chess was not published: Join the community to post in it',
    );
  });

  it('does not repeat the notice on a later pass over the same unedited draft', async () => {
    h.gate = { kind: 'refuse', notice: 'refused', reason: 'Join the community to post in it' };
    await publishScheduledPost(draft());
    h.existing = true;
    await publishScheduledPost(draft());
    expect(h.notices).toHaveLength(1);
    expect(prisma.notification.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: 'scheduled-refused',
          createdAt: { gt: new Date('2026-11-01T00:00:00Z') },
        }),
      }),
    );
  });

  it('keeps the image-description notice, key and wording', async () => {
    h.gate = { kind: 'refuse', notice: 'alt-required', reason: 'ignored' };
    expect(await publishScheduledPost(draft())).toBeNull();
    expect(h.notices).toEqual([expect.objectContaining({ entityType: 'scheduled-alt-required', entityId: 'sp1' })]);
    expect(noticeFallbackText(h.notices[0]!.preview as never)).toContain('an image needs a description');
  });

  it('a ban or timeout is told once and the draft publishes on a later pass once it lifts', async () => {
    h.gate = { kind: 'refuse', notice: 'refused', reason: 'You are timed out' };
    expect(await publishScheduledPost(draft())).toBeNull();
    expect(h.notices).toHaveLength(1);
    h.gate = { kind: 'allow', flagRule: null };
    expect(await publishScheduledPost(draft())).toBe('post1');
  });
});

describe('two racing publishers', () => {
  it('produce one post: the loser sees the row locked and takes the winner’s id', async () => {
    const [a, b] = await Promise.all([
      publishScheduledPost(draft()),
      (async () => {
        await Promise.resolve();
        return publishScheduledPost(draft());
      })(),
    ]);
    expect(h.created).toHaveLength(1);
    expect([a, b].filter((x) => x === 'post1')).toHaveLength(2);
    expect(h.gateCalls).toBe(1);
  });
});

describe('the publishing paths', () => {
  it('lazy: publishDueForUser gates each due community post once', async () => {
    (prisma.scheduledPost.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      draft(),
      draft({ id: 'sp2' }),
    ]);
    h.gate = { kind: 'hold', holdRule: 'Spam' };
    expect(await publishDueForUser('u1')).toBe(2);
    expect(h.gateCalls).toBe(2);
    expect(h.modItems).toHaveLength(2);
    expect(h.notices.map((n) => n.entityType)).toEqual(['scheduled-held', 'scheduled-held']);
  });

  it('sweep: a draft refused after its last edit is not gated again inside the backoff, an edited one is', async () => {
    h.recentRefusals = [{ entityId: 'sp1', userId: 'u1', createdAt: new Date() }];
    (prisma.scheduledPost.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      draft({ updatedAt: new Date(Date.now() - 60_000) }),
      // edited after the refusal: decided again
      draft({ id: 'sp2', updatedAt: new Date(Date.now() + 60_000) }),
    ]);
    h.recentRefusals.push({ entityId: 'sp2', userId: 'u1', createdAt: new Date() });
    expect(await publishDueForUser('u1')).toBe(1);
    expect(h.gateCalls).toBe(1);
  });

  it('job: a direct publish of a due post (the posts.publish-scheduled path) is gated the same way', async () => {
    h.gate = { kind: 'refuse', notice: 'refused', reason: 'Rule broken' };
    expect(await publishScheduledPost(draft())).toBeNull();
    expect(h.gateCalls).toBe(1);
    expect(h.created).toHaveLength(0);
  });

  it('a profile post (no community) skips the gate result and publishes', async () => {
    expect(await publishScheduledPost(draft({ communityId: null }))).toBe('post1');
    expect(h.modItems).toHaveLength(0);
  });
});
