import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A held post alerts on a moderator's approval (not on creation); removals and flag dismissals alert nobody. */

const enqueue = vi.hoisted(() => vi.fn(async () => {}));
const item = vi.hoisted(() => ({
  current: null as null | {
    action: string;
    entityType: string;
    entityId: string | null;
  },
}));

// `defineHandler` hands the inner handler through, so the route's own logic runs without a session or rate limiter.
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_options: unknown, handler: unknown) => handler,
}));
vi.mock('@/lib/communities/guard.server', () => ({
  requireMod: async () => ({
    ok: true,
    value: {
      id: 'c1',
      name: 'Quiet Group',
    },
  }),
}));
vi.mock('@/lib/communities/automod.server', () => ({
  AutomodError: class extends Error {
    status = 400;
  },
  resolveModItem: vi.fn(async (_c: string, _i: string, decision: string) => ({
    status: decision === 'approve' ? 'APPROVED' : 'REMOVED',
  })),
}));
vi.mock('@/lib/communities/rules.server', () => ({
  getRule: vi.fn(),
  recordCitation: vi.fn(),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(),
}));
vi.mock('@/lib/communities/post-alerts.server', () => ({
  enqueuePostAlert: enqueue,
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    communityModItem: {
      findUnique: async () => item.current,
    },
  },
}));

import { route } from '@/lib/communities/api/communities.$slug.modqueue.$itemId.server';

type Handler = (args: { params: Record<string, string>; userId: string; body: unknown }) => Promise<Response>;
const post = (body: unknown) =>
  (route.handlers.POST as unknown as Handler)({
    params: {
      slug: 'quiet',
      itemId: 'i1',
    },
    userId: 'mod',
    body,
  });

beforeEach(() => {
  enqueue.mockClear();
  item.current = {
    action: 'hold',
    entityType: 'rmhark',
    entityId: 'p1',
  };
});

describe('mod queue approval', () => {
  it('queues the alerts for a held post when a moderator approves it', async () => {
    await post({
      decision: 'approve',
    });
    expect(enqueue).toHaveBeenCalledWith('p1');
  });

  it('queues nothing when the post is removed', async () => {
    await post({
      decision: 'remove',
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('queues nothing for a flagged post that was already live, or a held comment', async () => {
    item.current = {
      action: 'flag',
      entityType: 'rmhark',
      entityId: 'p1',
    };
    await post({
      decision: 'approve',
    });
    item.current = {
      action: 'hold',
      entityType: 'comment',
      entityId: 'cm1',
    };
    await post({
      decision: 'approve',
    });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
