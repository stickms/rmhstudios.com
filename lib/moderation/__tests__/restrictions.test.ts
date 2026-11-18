/**
 * Feature timeouts are access control: a timed-out user must be refused, and a
 * lapsed or lifted timeout must never keep refusing them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as { feature: string; expiresAt: Date | null }[],
  where: null as unknown,
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    featureRestriction: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        h.where = args.where;
        return h.rows;
      }),
    },
  },
}));
// No cache: every call reads the rows above.
vi.mock('@/lib/cached.server', () => ({
  cached: (_k: string, _ttl: number, load: () => Promise<unknown>) => load(),
  invalidateCached: async () => undefined,
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: async () => undefined }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: async () => undefined }));

import {
  activeRestrictionWhere,
  getActiveRestriction,
  restrictionResponse,
} from '@/lib/moderation/restrictions.server';

const DAY = 24 * 60 * 60 * 1000;

describe('feature restrictions', () => {
  beforeEach(() => {
    h.rows = [];
    h.where = null;
  });

  it('asks only for unlifted, unexpired rows of the user', async () => {
    await getActiveRestriction('u1', 'post');
    expect(h.where).toMatchObject({
      userId: 'u1',
      liftedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
    });
    expect(activeRestrictionWhere('u1')).toMatchObject({ userId: 'u1', liftedAt: null });
  });

  it('lets a user through when nothing is active', async () => {
    expect(await restrictionResponse('u1', 'post')).toBeNull();
  });

  it('refuses a timed-out feature with a 403 naming it, and only that feature', async () => {
    h.rows = [{ feature: 'post', expiresAt: new Date(Date.now() + DAY) }];
    const res = await restrictionResponse('u1', 'post');
    expect(res?.status).toBe(403);
    const body = (await res!.json()) as { code: string; feature: string; until: string | null };
    expect(body).toMatchObject({ code: 'feature_restricted', feature: 'post' });
    expect(body.until).not.toBeNull();
    expect(await restrictionResponse('u1', 'comment')).toBeNull();
  });

  it('a permanent restriction wins over a timed one', async () => {
    h.rows = [
      { feature: 'vibe', expiresAt: new Date(Date.now() + DAY) },
      { feature: 'vibe', expiresAt: null },
    ];
    expect(await getActiveRestriction('u1', 'vibe')).toEqual({ expiresAt: null });
  });

  it('a row that lapsed after it was cached does not refuse', async () => {
    h.rows = [{ feature: 'message', expiresAt: new Date(Date.now() - 1000) }];
    expect(await restrictionResponse('u1', 'message')).toBeNull();
  });
});
