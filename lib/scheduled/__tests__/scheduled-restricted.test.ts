/**
 * s14-17: a moderator's `post` timeout holds for what the member queued before it. The draft stays a draft (no
 * claim, no gate, no post), a due pass does not count it as published, the developer API's publish answers 403
 * `feature_restricted`, and the first pass after the timeout ends publishes it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as { userId: string; feature: string; expiresAt: Date | null }[],
  txRuns: 0,
  due: [] as Array<Record<string, unknown>>,
  dueArgs: [] as unknown[],
}));

vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('@/lib/db/query-shape')).shapeChecked({
    featureRestriction: {
      findMany: async (args: { where: { userId: string } }) =>
        h.rows
          .filter((r) => r.userId === args.where.userId && (r.expiresAt === null || r.expiresAt > new Date()))
          .map((r) => ({ feature: r.feature, expiresAt: r.expiresAt })),
    },
    user: { findUnique: async () => ({ deletionScheduledAt: null }) },
    scheduledPost: {
      findMany: async (args: unknown) => {
        h.dueArgs.push(args);
        return h.due;
      },
      findUnique: async () => ({ publishedId: null }),
    },
    rMHark: { count: async () => 1 },
    $transaction: async () => {
      h.txRuns += 1;
      return { kind: 'created', id: 'post-1', held: false, gate: { kind: 'allow', flagRule: null } };
    },
  }),
}));
vi.mock('@/lib/cached.server', () => ({
  cached: (_k: string, _ttl: number, load: () => Promise<unknown>) => load(),
  invalidateCached: async () => undefined,
}));
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: vi.fn() }));
vi.mock('@/lib/quests/engine.server', () => ({ progressQuests: vi.fn() }));
vi.mock('@/lib/achievements/engine.server', () => ({ grantAchievement: vi.fn(), progressAchievement: vi.fn() }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/communities/automod.server', () => ({ HELD_BY: 'automod-hold', recordModItem: vi.fn() }));
vi.mock('@/lib/scheduled/gate.server', () => ({
  evaluateScheduledGate: vi.fn(async () => ({ kind: 'allow', flagRule: null })),
}));
vi.mock('@/lib/communities/post-alerts.server', () => ({ enqueuePostAlert: vi.fn() }));
// The developer API's publish module pulls in the community gate; only the restriction answer is under test.
vi.mock('@/lib/communities/post-gate.server', () => ({ prepareCommunityPost: vi.fn() }));
vi.mock('@/lib/communities/bans.server', () => ({ activeSanction: vi.fn(async () => null) }));
vi.mock('@/lib/communities/settings.server', () => ({ getCommunitySettings: vi.fn() }));

import type { ScheduledPost } from '@prisma/client';
import { publishDueForUser, publishScheduledPost } from '@/lib/scheduled/publish.server';
import { publishScheduledForKey } from '@/lib/api/v1/scheduled.server';
import { publishDueScheduled } from '@/lib/posts-plus/capsules.server';
import { clearRestrictionCache } from '@/lib/moderation/restrictions-core';

const draft = {
  id: 'sp1',
  userId: 'u1',
  publishedId: null,
  content: 'hello',
  communityId: null,
} as unknown as ScheduledPost;
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  h.rows = [];
  h.txRuns = 0;
  h.due = [draft as unknown as Record<string, unknown>];
  h.dueArgs = [];
  clearRestrictionCache();
});

describe('a post timeout and a queued post', () => {
  it('leaves the draft a draft while the author is timed out of posting: no claim, no post', async () => {
    h.rows = [{ userId: 'u1', feature: 'post', expiresAt: new Date(Date.now() + DAY) }];
    expect(await publishScheduledPost(draft)).toBeNull();
    expect(h.txRuns).toBe(0);
  });

  it('does not count it as published in a due pass, and publishes it after the timeout ends', async () => {
    h.rows = [{ userId: 'u1', feature: 'post', expiresAt: new Date(Date.now() + DAY) }];
    expect(await publishDueForUser('u1')).toBe(0);
    expect(h.txRuns).toBe(0);

    h.rows = []; // the timeout ended (or was lifted)
    expect(await publishDueForUser('u1')).toBe(1);
    expect(h.txRuns).toBe(1);
  });

  it('is not held back by a timeout on something else', async () => {
    h.rows = [{ userId: 'u1', feature: 'comment', expiresAt: null }];
    expect(await publishScheduledPost(draft)).toBe('post-1');
  });

  it('the developer API publish answers 403 feature_restricted with the sentence', async () => {
    h.rows = [{ userId: 'u1', feature: 'post', expiresAt: null }];
    const out = await publishScheduledForKey('u1', draft);
    expect(out).toMatchObject({ ok: false, status: 403, code: 'feature_restricted' });
    expect(h.txRuns).toBe(0);
    expect(JSON.stringify(out)).toContain('restricted on your account');
  });

  it('the sweep for all authors skips anyone timed out of posting in its query, so their drafts cannot fill a batch', async () => {
    const now = new Date('2026-11-25T12:00:00Z');
    await publishDueScheduled(now);
    const where = (h.dueArgs[0] as { where: { user: { featureRestrictions: unknown } } }).where;
    expect(where.user.featureRestrictions).toEqual({
      none: {
        feature: 'post',
        liftedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
  });
});
