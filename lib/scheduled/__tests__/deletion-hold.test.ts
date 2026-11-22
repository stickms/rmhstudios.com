/**
 * s09-14: while an author's deletion is scheduled their scheduled posts stay drafts and their recurring templates
 * skip the occurrence. The gate and the row lock of `publishScheduledPost` are untouched (s09-11's tests).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  deletionScheduledAt: null as Date | null,
  txRuns: 0,
  posted: [] as string[],
  claims: [] as unknown[],
  due: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ deletionScheduledAt: h.deletionScheduledAt })) },
    scheduledPost: { findUnique: vi.fn(async () => ({ publishedId: null })) },
    $transaction: vi.fn(async () => {
      h.txRuns += 1;
      return null;
    }),
    communityRecurringThread: {
      findMany: vi.fn(async () => h.due),
      updateMany: vi.fn(async (a: unknown) => {
        h.claims.push(a);
        return { count: 1 };
      }),
    },
  },
}));
vi.mock('@/lib/xp/engine.server', () => ({ awardXp: vi.fn() }));
vi.mock('@/lib/quests/engine.server', () => ({ progressQuests: vi.fn() }));
vi.mock('@/lib/achievements/engine.server', () => ({ grantAchievement: vi.fn(), progressAchievement: vi.fn() }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/communities/automod.server', () => ({ HELD_BY: 'automod-hold', recordModItem: vi.fn() }));
vi.mock('@/lib/scheduled/gate.server', () => ({
  evaluateScheduledGate: vi.fn(async () => ({ kind: 'allow', flagRule: null })),
}));
vi.mock('@/lib/communities/post-alerts.server', () => ({ enqueuePostAlert: vi.fn() }));
vi.mock('@/lib/communities/recurring.server', () => ({
  postOccurrence: vi.fn(async (row: { id: string }) => {
    h.posted.push(row.id);
    return { ok: true, postId: 'p' };
  }),
  pauseRecurring: vi.fn(),
  specOf: vi.fn(() => ({ cadence: 'weekly', weekday: 1, dayOfMonth: null, minuteOfDay: 0, timeZone: 'UTC' })),
}));

import type { ScheduledPost } from '@prisma/client';
import { publishScheduledPost } from '@/lib/scheduled/publish.server';
import { runDueRecurringThreads } from '@/lib/communities/recurring-jobs.server';

const draft = { id: 'sp1', userId: 'u1', publishedId: null, content: 'hello' } as unknown as ScheduledPost;
const NOW = new Date('2026-12-03T09:00:00Z');

beforeEach(() => {
  h.deletionScheduledAt = null;
  h.txRuns = 0;
  h.posted.length = 0;
  h.claims.length = 0;
  h.due = [
    {
      id: 'r1',
      active: true,
      nextAt: new Date('2026-12-03T08:00:00Z'),
      failures: 0,
      createdBy: { deletionScheduledAt: null },
    },
  ];
});

describe('publishScheduledPost', () => {
  it('keeps the draft while the author’s deletion is scheduled: no claim, no gate, no post', async () => {
    h.deletionScheduledAt = new Date('2026-12-30');
    expect(await publishScheduledPost(draft)).toBeNull();
    expect(h.txRuns).toBe(0);
  });

  it('goes on to the locked claim when no deletion is scheduled', async () => {
    await publishScheduledPost(draft);
    expect(h.txRuns).toBe(1);
  });
});

describe('the recurring job', () => {
  it('skips a template whose author’s deletion is scheduled, and still claims the occurrence', async () => {
    h.due[0]!.createdBy = { deletionScheduledAt: new Date('2026-12-30') };
    expect(await runDueRecurringThreads(NOW)).toBe(0);
    expect(h.posted).toEqual([]);
    expect(h.claims).toHaveLength(1);
  });

  it('posts a template whose author is not being deleted', async () => {
    expect(await runDueRecurringThreads(NOW)).toBe(1);
    expect(h.posted).toEqual(['r1']);
  });
});
