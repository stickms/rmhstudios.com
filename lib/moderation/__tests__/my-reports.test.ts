import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Your reports (s03-16): ownership, what leaves the server, and the once-only outcome notification. Prisma is a
 * small in-memory stand-in for `contentReport`; nothing here touches a database.
 */

interface Row {
  id: string;
  reporterId: string;
  reason: string;
  entityType: string;
  entityId: string;
  targetUserId: string | null;
  status: 'PENDING' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';
  resolvedById: string | null;
  resolvedAt: Date | null;
  moderatorNote: string | null;
  details: string | null;
  reporterNotifiedAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  findManyArgs: [] as unknown[],
  posts: [] as { id: string; content: string }[],
  created: [] as Record<string, unknown>[],
}));

type Where = {
  id?: string | { in: string[] };
  reporterId?: string;
  status?: string | { in: string[] };
  withdrawnAt?: null | { not: null };
  reporterNotifiedAt?: null;
  createdAt?: { gte: Date };
};

function matches(r: Row, w: Where): boolean {
  if (w.id !== undefined) {
    if (typeof w.id === 'string' ? r.id !== w.id : !w.id.in.includes(r.id)) return false;
  }
  if (w.reporterId !== undefined && r.reporterId !== w.reporterId) return false;
  if (w.status !== undefined) {
    if (typeof w.status === 'string' ? r.status !== w.status : !w.status.in.includes(r.status)) return false;
  }
  if (w.withdrawnAt === null && r.withdrawnAt !== null) return false;
  if (w.withdrawnAt && w.withdrawnAt.not === null && r.withdrawnAt === null) return false;
  if (w.reporterNotifiedAt === null && r.reporterNotifiedAt !== null) return false;
  if (w.createdAt && r.createdAt < w.createdAt.gte) return false;
  return true;
}

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    contentReport: {
      findMany: vi.fn(async (args: { where: Where; select?: Record<string, true>; take?: number }) => {
        h.findManyArgs.push(args);
        const found = h.rows
          .filter((r) => matches(r, args.where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, args.take);
        const select = args.select;
        return found.map((r) =>
          select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k as keyof Row]])) : r,
        );
      }),
      findFirst: vi.fn(async (args: { where: Where }) => h.rows.find((r) => matches(r, args.where)) ?? null),
      updateMany: vi.fn(async (args: { where: Where; data: Partial<Row> }) => {
        const hit = h.rows.filter((r) => matches(r, args.where));
        for (const r of hit) Object.assign(r, args.data);
        return { count: hit.length };
      }),
    },
    rMHark: { findMany: vi.fn(async () => h.posts) },
    rMHarkComment: { findMany: vi.fn(async () => []) },
    user: { findMany: vi.fn(async () => []) },
    userBuild: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('@/lib/feed/audience.server', () => ({ viewerVisiblePostWhere: vi.fn(async () => ({ deletedAt: null })) }));
vi.mock('@/lib/moderation.server', () => ({ getBlockedAuthorIds: vi.fn(async () => []) }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    h.created.push(input);
  }),
}));

import {
  exportMyReports,
  listMyReports,
  notifyReportersOfOutcome,
  withdrawReport,
} from '@/lib/moderation/my-reports.server';
import { OUTCOME_PREVIEW } from '@/lib/moderation/my-reports';

const NOW = new Date('2026-11-23T12:00:00Z');
const day = 86_400_000;

function row(over: Partial<Row>): Row {
  return {
    id: 'r1',
    reporterId: 'alice',
    reason: 'SPAM',
    entityType: 'rmhark',
    entityId: 'p1',
    targetUserId: 'bob',
    status: 'PENDING',
    resolvedById: null,
    resolvedAt: null,
    moderatorNote: null,
    details: null,
    reporterNotifiedAt: null,
    withdrawnAt: null,
    createdAt: new Date(NOW.getTime() - day),
    ...over,
  };
}

function decide(r: Row, status: 'RESOLVED' | 'DISMISSED') {
  r.status = status;
  r.resolvedById = 'mod-1';
  r.resolvedAt = NOW;
  r.moderatorNote = 'MACRO: this post was removed for spam and bob received a strike';
}

beforeEach(() => {
  h.rows = [];
  h.findManyArgs = [];
  h.posts = [{ id: 'p1', content: 'buy   cheap\nwatches now' }];
  h.created = [];
});

describe('listMyReports', () => {
  it('returns only the caller’s reports', async () => {
    h.rows = [row({ id: 'mine' }), row({ id: 'theirs', reporterId: 'carol' })];
    const page = await listMyReports('alice', { now: NOW });
    expect(page.items.map((i) => i.id)).toEqual(['mine']);
  });

  it('selects an allow-list and never sends moderator, note, resolver or target fields', async () => {
    const r = row({ id: 'mine' });
    decide(r, 'RESOLVED');
    h.rows = [r];
    const page = await listMyReports('alice', { now: NOW });
    const select = (h.findManyArgs[0] as { select: Record<string, true> }).select;
    expect(Object.keys(select).sort()).toEqual(
      ['createdAt', 'entityId', 'entityType', 'id', 'reason', 'status', 'withdrawnAt'].sort(),
    );
    const json = JSON.stringify(page);
    for (const leak of ['MACRO', 'mod-1', 'bob', 'moderatorNote', 'resolvedById', 'targetUserId']) {
      expect(json).not.toContain(leak);
    }
    expect(page.items[0]!.status).toBe('ACTION_TAKEN');
  });

  it('shows a pending post as waiting, with its text and link while the reporter can still see it', async () => {
    h.rows = [row({})];
    const [item] = (await listMyReports('alice', { now: NOW })).items;
    expect(item).toMatchObject({
      status: 'WAITING',
      canWithdraw: true,
      target: { kind: 'rmhark', available: true, name: 'buy cheap watches now', href: '/thread/p1' },
    });
  });

  it('labels a post the reporter can no longer see as unavailable, with no text or link', async () => {
    h.posts = [];
    h.rows = [row({})];
    const [item] = (await listMyReports('alice', { now: NOW })).items;
    expect(item!.target).toEqual({ kind: 'rmhark', available: false, name: null, href: null });
  });

  it('keeps the last 180 days only, and pages by 20', async () => {
    h.rows = [
      row({ id: 'old', createdAt: new Date(NOW.getTime() - 181 * day) }),
      ...Array.from({ length: 21 }, (_, i) =>
        row({ id: `r${i}`, entityType: 'song', createdAt: new Date(NOW.getTime() - (i + 1) * 60_000) }),
      ),
    ];
    const page = await listMyReports('alice', { now: NOW });
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBe('r19');
    expect(page.items.map((i) => i.id)).not.toContain('old');
  });

  it('reports a withdrawn report as withdrawn and not withdrawable', async () => {
    h.rows = [row({ status: 'DISMISSED', withdrawnAt: NOW })];
    const [item] = (await listMyReports('alice', { now: NOW })).items;
    expect(item).toMatchObject({ status: 'WITHDRAWN', canWithdraw: false });
  });
});

describe('withdrawReport', () => {
  it('withdraws the caller’s pending report: dismissed with withdrawnAt, and no outcome notification', async () => {
    h.rows = [row({})];
    expect(await withdrawReport('alice', 'r1')).toBe('withdrawn');
    expect(h.rows[0]).toMatchObject({ status: 'DISMISSED' });
    expect(h.rows[0]!.withdrawnAt).not.toBeNull();
    expect(await notifyReportersOfOutcome(['r1'])).toBe(0);
    expect(h.created).toEqual([]);
  });

  it('is idempotent: withdrawing twice answers withdrawn both times', async () => {
    h.rows = [row({})];
    expect(await withdrawReport('alice', 'r1')).toBe('withdrawn');
    expect(await withdrawReport('alice', 'r1')).toBe('withdrawn');
  });

  it('answers not_found for another member’s report and leaves it untouched', async () => {
    h.rows = [row({ reporterId: 'carol' })];
    expect(await withdrawReport('alice', 'r1')).toBe('not_found');
    expect(h.rows[0]!.status).toBe('PENDING');
  });

  it('answers not_found for a report that does not exist', async () => {
    expect(await withdrawReport('alice', 'nope')).toBe('not_found');
  });

  it('refuses once a moderator has picked the report up', async () => {
    h.rows = [row({ status: 'REVIEWING' })];
    expect(await withdrawReport('alice', 'r1')).toBe('not_pending');
    expect(h.rows[0]!.status).toBe('REVIEWING');
  });
});

describe('notifyReportersOfOutcome', () => {
  it('tells the reporter once, even when called twice', async () => {
    const r = row({});
    h.rows = [r];
    decide(r, 'RESOLVED');
    expect(await notifyReportersOfOutcome(['r1'])).toBe(1);
    expect(await notifyReportersOfOutcome(['r1'])).toBe(0);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({
      userId: 'alice',
      type: 'SYSTEM',
      entityType: 'report_outcome',
      entityId: 'r1',
      preview: OUTCOME_PREVIEW.ACTION_TAKEN,
      link: '/settings/security#your-reports',
    });
    expect(r.reporterNotifiedAt).not.toBeNull();
  });

  it('only one of two concurrent calls wins the claim', async () => {
    const r = row({});
    h.rows = [r];
    decide(r, 'RESOLVED');
    const [a, b] = await Promise.all([notifyReportersOfOutcome(['r1']), notifyReportersOfOutcome(['r1'])]);
    expect(a + b).toBe(1);
    expect(h.created).toHaveLength(1);
  });

  it('announces a dismissal with the other outcome', async () => {
    const r = row({});
    h.rows = [r];
    decide(r, 'DISMISSED');
    await notifyReportersOfOutcome(['r1']);
    expect(h.created[0]).toMatchObject({ preview: OUTCOME_PREVIEW.NO_VIOLATION });
    expect(OUTCOME_PREVIEW.NO_VIOLATION).not.toBe(OUTCOME_PREVIEW.ACTION_TAKEN);
  });

  it('puts nothing the reported member was told, and nothing about the moderator, in the notification', async () => {
    const r = row({});
    h.rows = [r];
    decide(r, 'RESOLVED');
    await notifyReportersOfOutcome(['r1']);
    const json = JSON.stringify(h.created);
    for (const leak of ['MACRO', 'removed', 'strike', 'mod-1', 'bob']) expect(json).not.toContain(leak);
  });

  it('does not announce a report that is still open', async () => {
    h.rows = [row({ status: 'REVIEWING' }), row({ id: 'r2' })];
    expect(await notifyReportersOfOutcome(['r1', 'r2'])).toBe(0);
    expect(h.created).toEqual([]);
  });

  it('gives each reporter of the same content their own notification', async () => {
    h.rows = [row({ id: 'a', reporterId: 'alice' }), row({ id: 'b', reporterId: 'carol' }), row({ id: 'c', reporterId: 'dan' })];
    for (const r of h.rows) decide(r, 'RESOLVED');
    expect(await notifyReportersOfOutcome(['a', 'b', 'c'])).toBe(3);
    expect(h.created.map((n) => n.userId).sort()).toEqual(['alice', 'carol', 'dan']);
  });

  it('does nothing for an empty list', async () => {
    expect(await notifyReportersOfOutcome([])).toBe(0);
  });
});

describe('exportMyReports', () => {
  it('exports only the member’s own reports, without moderator fields', async () => {
    const mine = row({ id: 'mine', details: 'it is a scam' });
    decide(mine, 'DISMISSED');
    h.rows = [mine, row({ id: 'theirs', reporterId: 'carol' })];
    const out = await exportMyReports('alice');
    expect(out.map((r) => r.id)).toEqual(['mine']);
    expect(out[0]).toMatchObject({ details: 'it is a scam', status: 'NO_VIOLATION' });
    expect(JSON.stringify(out)).not.toContain('MACRO');
  });
});
