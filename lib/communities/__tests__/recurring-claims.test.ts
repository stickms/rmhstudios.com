/**
 * s10-18: the cron claim and "Post now" are one claim, not two. The cron moves `nextAt`; "Post now" used to claim
 * `lastPostedAt`; with the two on different columns a tick and a click in the same instant both posted. Now each
 * claim touches both columns in one compare-and-set, so whichever comes second loses, in either order.
 *
 * Prisma is a small stateful fake whose `updateMany` is atomic and understands the `where` shapes the claims use.
 * Publishing is held open so the two paths genuinely overlap.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & { id: string; nextAt: Date; lastPostedAt: Date | null };

const h = vi.hoisted(() => ({
  row: null as unknown,
  posts: 0,
  entered: null as null | (() => void),
  release: null as null | Promise<void>,
}));

const getRow = () => h.row as Row;

function matches(r: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Array<Record<string, unknown>>).some((c) => matches(r, c));
    const cur = r[k];
    if (v === null) return cur === null;
    if (v instanceof Date) return cur instanceof Date && cur.getTime() === v.getTime();
    if (v && typeof v === 'object') {
      const o = v as { lt?: Date; lte?: Date };
      if (!(cur instanceof Date)) return false;
      if (o.lt) return cur.getTime() < o.lt.getTime();
      if (o.lte) return cur.getTime() <= o.lte.getTime();
      return true;
    }
    return cur === v;
  });
}

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    communityRecurringThread: {
      findMany: vi.fn(async (a: { where: Record<string, unknown> }) =>
        matches(getRow(), a.where) ? [{ ...getRow(), createdBy: { deletionScheduledAt: null } }] : [],
      ),
      findFirst: vi.fn(async () => ({ ...getRow() })),
      updateMany: vi.fn(async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!matches(getRow(), a.where)) return { count: 0 };
        for (const [k, v] of Object.entries(a.data)) {
          if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) {
            getRow()[k] = (getRow()[k] as number) + (v as { increment: number }).increment;
          } else getRow()[k] = v;
        }
        return { count: 1 };
      }),
    },
    community: { findUnique: vi.fn(async () => ({ id: 'c1', name: 'Art', slug: 'art' })) },
    communityMember: { findUnique: vi.fn(async () => ({ role: 'MOD' })), findMany: vi.fn(async () => []) },
    user: { findUnique: vi.fn(async () => ({ bannedUntil: null })) },
    scheduledPost: {
      create: vi.fn(async () => ({ id: 'd1' })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    communityPostFlair: { upsert: vi.fn(async () => ({})) },
  },
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: vi.fn() }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/communities/access.server', () => ({ canModerate: () => true }));
vi.mock('@/lib/communities/bans.server', () => ({ activeSanction: async () => null }));
vi.mock('@/lib/communities/flairs.server', () => ({ flairBelongsTo: async () => true }));
vi.mock('@/lib/communities/modlog.server', () => ({ logModAction: vi.fn() }));
vi.mock('@/lib/communities/post-gate.server', () => ({
  prepareCommunityPost: async () => ({ ok: true, held: false, holdRule: 'AutoMod', flagRule: null }),
}));
vi.mock('@/lib/scheduled/publish.server', () => ({
  publishScheduledPost: async () => {
    h.posts += 1;
    h.entered?.();
    if (h.posts === 1 && h.release) await h.release; // only the first post is held open
    return `post-${h.posts}`;
  },
}));

const { postRecurringNow } = await import('@/lib/communities/recurring.server');
const { runDueRecurringThreads } = await import('@/lib/communities/recurring-jobs.server');

const NOW = new Date('2026-11-22T12:00:00Z'); // a Sunday
const MINUTE = 60_000;

function seed(nextAt: Date): void {
  h.row = {
    id: 't1',
    communityId: 'c1',
    createdById: 'u1',
    title: 'Weekly',
    body: 'Talk',
    flairId: null,
    failures: 0,
    active: true,
    cadence: 'weekly',
    weekday: 1,
    dayOfMonth: null,
    minuteOfDay: 9 * 60,
    timeZone: 'UTC',
    nextAt,
    lastPostId: null,
    lastPostedAt: null,
  };
}

/** Run `first` until it is inside the publish step, then run `second`, then let `first` finish. */
async function overlap<A, B>(first: () => Promise<A>, second: () => Promise<B>) {
  let open!: () => void;
  h.release = new Promise<void>((resolve) => (open = resolve));
  const inside = new Promise<void>((resolve) => (h.entered = resolve));
  const a = first();
  await inside;
  const b = await Promise.allSettled([second()]);
  open();
  return { a: await Promise.allSettled([a]), b: b[0] };
}

beforeEach(() => {
  h.posts = 0;
  h.entered = null;
  h.release = null;
  seed(new Date(NOW.getTime() - MINUTE));
});

describe('the cron and "Post now" claim the same occurrence', () => {
  it('cron first, then Post now in the same instant: one post, Post now is 409', async () => {
    const { a, b } = await overlap(
      () => runDueRecurringThreads(NOW),
      () => postRecurringNow({ communityId: 'c1', id: 't1', now: NOW }),
    );
    expect(a[0]).toMatchObject({ status: 'fulfilled', value: 1 });
    expect(b).toMatchObject({ status: 'rejected', reason: { status: 409, code: 'just_posted' } });
    expect(h.posts).toBe(1);
  });

  it('Post now first, then the cron in the same instant: one post, the cron skips it', async () => {
    const { a, b } = await overlap(
      () => postRecurringNow({ communityId: 'c1', id: 't1', now: NOW }),
      () => runDueRecurringThreads(NOW),
    );
    expect(a[0]).toMatchObject({ status: 'fulfilled' });
    expect(b).toMatchObject({ status: 'fulfilled', value: 0 });
    expect(h.posts).toBe(1);
  });

  it('Post now on the due occurrence moves nextAt past it, so the cron has nothing left to claim', async () => {
    await postRecurringNow({ communityId: 'c1', id: 't1', now: NOW });
    expect(getRow().nextAt.getTime()).toBeGreaterThan(NOW.getTime());
    h.release = null;
    expect(await runDueRecurringThreads(new Date(NOW.getTime() + 2 * MINUTE))).toBe(0);
    expect(h.posts).toBe(1);
  });

  it('Post now on a thread that is not due soon leaves the schedule where it was', async () => {
    const later = new Date(NOW.getTime() + 3 * 24 * 60 * MINUTE);
    seed(later);
    await postRecurringNow({ communityId: 'c1', id: 't1', now: NOW });
    expect(getRow().nextAt).toEqual(later);
    expect(getRow().lastPostedAt).toEqual(NOW);
  });

  it('a failed Post now gives back both columns', async () => {
    const due = getRow().nextAt;
    h.release = Promise.reject(new Error('boom'));
    h.release.catch(() => {});
    await expect(postRecurringNow({ communityId: 'c1', id: 't1', now: NOW })).rejects.toThrow('boom');
    expect(getRow().nextAt).toEqual(due);
    expect(getRow().lastPostedAt).toBeNull();
  });
});
