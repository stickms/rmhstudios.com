/**
 * Scheduled posts must pass the same community checks as a direct post
 * (membership, verification, AutoMod, flair) - at schedule time AND at publish time.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  member: { findUnique: vi.fn() },
  scheduled: {
    count: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  tx: {
    $queryRaw: vi.fn(),
    rMHark: { create: vi.fn() },
    user: { update: vi.fn() },
    community: { update: vi.fn() },
    rMHarkPoll: { create: vi.fn() },
    scheduledPost: { update: vi.fn() },
  },
  gate: vi.fn(),
  logRemoved: vi.fn(),
  recordModItem: vi.fn(),
  notify: vi.fn(),
  ban: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    communityMember: h.member,
    scheduledPost: h.scheduled,
    rMHark: { count: async () => 1 },
    user: { findUnique: async () => ({ handle: 'h' }) },
    $transaction: async (cb: (tx: unknown) => unknown) => cb(h.tx),
  },
}));
vi.mock('@/lib/communities/gate.server', () => ({
  gateCommunityContent: h.gate,
  logRemoved: h.logRemoved,
}));
vi.mock('@/lib/communities/automod.server', () => ({
  HELD_BY: 'automod_hold',
  recordModItem: h.recordModItem,
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: vi.fn() }));
vi.mock('@/lib/quests/engine.server', () => ({ progressQuests: vi.fn() }));
vi.mock('@/lib/achievements/engine.server', () => ({
  grantAchievement: vi.fn(),
  progressAchievement: vi.fn(),
}));
vi.mock('@/lib/admin-audit.server', () => ({ getActiveBan: h.ban }));
vi.mock('@/lib/feed/alt-text.server', () => ({ altTextViolation: async () => null }));
vi.mock('@/lib/storage/keys', async (orig) => ({
  ...(await orig<typeof import('@/lib/storage/keys')>()),
  ownsFeedImageUrl: () => true,
}));
vi.mock('@/lib/scheduled/list.server', () => ({ listScheduled: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  getClientIp: () => '1.1.1.1',
}));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: (c: unknown) => unknown) => fn,
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

import { publishScheduledPost } from '@/lib/scheduled/publish.server';

type Handler = (ctx: Record<string, unknown>) => Promise<Response>;
async function route(mod: string, method: string): Promise<Handler> {
  const m = (await import(/* @vite-ignore */ mod)) as {
    Route: { options: { server: { handlers: Record<string, Handler> } } };
  };
  return m.Route.options.server.handlers[method];
}

const FUTURE = new Date(Date.now() + 3600_000).toISOString();
const session = { user: { id: 'u1' } };
const post = (over: Record<string, unknown> = {}) => ({
  id: 'sp1',
  userId: 'u1',
  content: 'hello',
  gifUrl: null,
  imageUrls: [],
  imageAlts: [],
  audience: 'PUBLIC',
  isSensitive: false,
  replyControl: 'EVERYONE',
  unlockPrice: null,
  communityId: 'c1',
  poll: null,
  scheduledAt: new Date(Date.now() - 1000),
  publishedId: null,
  isCapsule: false,
  ...over,
});

beforeEach(() => {
  for (const g of Object.values(h)) {
    if (typeof g === 'function') (g as ReturnType<typeof vi.fn>).mockReset();
    else
      for (const fn of Object.values(g)) {
        if (typeof fn === 'function') (fn as ReturnType<typeof vi.fn>).mockReset();
        else
          for (const f of Object.values(fn as object)) (f as ReturnType<typeof vi.fn>).mockReset();
      }
  }
  h.member.findUnique.mockResolvedValue({ id: 'm' });
  h.gate.mockResolvedValue({ kind: 'allow' });
  h.scheduled.count.mockResolvedValue(0);
  h.scheduled.create.mockResolvedValue({ id: 'sp1' });
  h.scheduled.updateMany.mockResolvedValue({ count: 1 });
  h.tx.$queryRaw.mockResolvedValue([{ id: 'sp1' }]);
  h.tx.rMHark.create.mockResolvedValue({ id: 'new' });
  h.logRemoved.mockResolvedValue(undefined);
  h.recordModItem.mockResolvedValue('q1');
  h.notify.mockResolvedValue(undefined);
  h.ban.mockResolvedValue(null);
});

describe('POST /api/scheduled (schedule time)', () => {
  const call = async (body: Record<string, unknown>) =>
    (await route('@/app/routes/api/scheduled/index', 'POST'))({
      request: new Request('http://x'),
      session,
      body: { content: 'hello', scheduledAt: FUTURE, ...body },
    });

  it('refuses a non-member: 403, nothing stored', async () => {
    h.member.findUnique.mockResolvedValue(null);
    const res = await call({ communityId: 'c1' });
    expect(res.status).toBe(403);
    expect(h.scheduled.create).not.toHaveBeenCalled();
    expect(h.gate).not.toHaveBeenCalled();
  });

  it('refuses what verification denies', async () => {
    h.gate.mockResolvedValue({
      kind: 'deny',
      status: 403,
      code: 'verification_email',
      error: 'Verify your email',
    });
    const res = await call({ communityId: 'c1' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'verification_email' });
    expect(h.scheduled.create).not.toHaveBeenCalled();
  });

  it('refuses (and logs) what AutoMod would remove', async () => {
    h.gate.mockResolvedValue({ kind: 'remove', ruleName: 'no-spam' });
    const res = await call({ communityId: 'c1' });
    expect(res.status).toBe(422);
    expect(h.logRemoved).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 'c1', ruleName: 'no-spam' }),
    );
    expect(h.scheduled.create).not.toHaveBeenCalled();
  });

  it('stores a post for a member who passes the gate (flair-less: gate is asked with flairId null)', async () => {
    const res = await call({ communityId: 'c1' });
    expect(res.status).toBe(201);
    expect(h.gate).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 'c1', userId: 'u1', target: 'post', flairId: null }),
    );
    expect(h.scheduled.create.mock.calls[0][0].data.communityId).toBe('c1');
  });

  it('does not touch the community gate for a non-community post', async () => {
    const res = await call({});
    expect(res.status).toBe(201);
    expect(h.member.findUnique).not.toHaveBeenCalled();
    expect(h.gate).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/scheduled/:id', () => {
  it('re-runs the gate on edited community text (a clean draft cannot be edited past AutoMod)', async () => {
    h.scheduled.findUnique.mockResolvedValue(post({ scheduledAt: null }));
    h.gate.mockResolvedValue({ kind: 'remove', ruleName: 'no-spam' });
    const PATCH = await route('@/app/routes/api/scheduled/$id', 'PATCH');
    const res = await PATCH({ params: { id: 'sp1' }, session, body: { content: 'buy pills' } });
    expect(res.status).toBe(422);
    expect(h.gate.mock.calls[0][0].content).toBe('buy pills');
    expect(h.scheduled.update).not.toHaveBeenCalled();
  });
});

describe('publishScheduledPost (publish time)', () => {
  it('a member who has since left: not published, demoted to a draft, author told', async () => {
    h.member.findUnique.mockResolvedValue(null);
    expect(await publishScheduledPost(post() as never)).toBeNull();
    expect(h.tx.rMHark.create).not.toHaveBeenCalled();
    expect(h.scheduled.updateMany).toHaveBeenCalledWith({
      where: { id: 'sp1', publishedId: null },
      data: { scheduledAt: null, isCapsule: false },
    });
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', entityType: 'scheduled-post' }),
    );
  });

  it('AutoMod now removes the text: not published and logged', async () => {
    h.gate.mockResolvedValue({ kind: 'remove', ruleName: 'no-spam' });
    expect(await publishScheduledPost(post() as never)).toBeNull();
    expect(h.tx.rMHark.create).not.toHaveBeenCalled();
    expect(h.logRemoved).toHaveBeenCalledWith(expect.objectContaining({ ruleName: 'no-spam' }));
  });

  it('a passing community post is published and counted', async () => {
    expect(await publishScheduledPost(post() as never)).toBe('new');
    expect(h.tx.rMHark.create.mock.calls[0][0].data).toMatchObject({ communityId: 'c1' });
    expect(h.tx.rMHark.create.mock.calls[0][0].data.deletedBy).toBeUndefined();
    expect(h.tx.community.update).toHaveBeenCalled();
  });

  it('an AutoMod hold publishes as a held (invisible) post, uncounted, and is queued for mods', async () => {
    h.gate.mockResolvedValue({ kind: 'hold', ruleName: 'new-accounts' });
    expect(await publishScheduledPost(post() as never)).toBe('new');
    const data = h.tx.rMHark.create.mock.calls[0][0].data;
    expect(data.deletedBy).toBe('automod_hold');
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(h.tx.user.update).not.toHaveBeenCalled();
    expect(h.tx.community.update).not.toHaveBeenCalled();
    expect(h.recordModItem).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'hold', postId: 'new', ruleName: 'new-accounts' }),
    );
  });

  it('a non-community post skips the gate entirely', async () => {
    expect(await publishScheduledPost(post({ communityId: null }) as never)).toBe('new');
    expect(h.member.findUnique).not.toHaveBeenCalled();
    expect(h.gate).not.toHaveBeenCalled();
  });
});

describe('POST /api/scheduled/:id/publish', () => {
  it('relays the refusal instead of claiming success', async () => {
    h.scheduled.findUnique.mockResolvedValue(post());
    h.member.findUnique.mockResolvedValue(null);
    const POST = await route('@/app/routes/api/scheduled/$id/publish', 'POST');
    const res = await POST({ request: new Request('http://x'), params: { id: 'sp1' }, session });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'not_member' });
  });
});
