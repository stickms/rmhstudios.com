import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Sprint 15, feature 16: a report takedown of a member's item is recorded once and its author told once. The fake
 * database is checked against the schema (`shapeChecked`); nothing here touches Postgres.
 */

interface ReportRow {
  id: string;
  status: 'PENDING' | 'RESOLVED';
  entityType: string;
  entityId: string;
  targetUserId: string | null;
  moderatorNote: string | null;
}

const h = vi.hoisted(() => ({
  sent: [] as Record<string, unknown>[],
  reports: [] as unknown[],
  takedown: vi.fn(async () => true),
  removals: null as null | ReturnType<typeof import('./removal-fake-db').makeRemovalDb>,
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const { makeRemovalDb } = await import('./removal-fake-db');
  h.removals = makeRemovalDb();
  const reports = () => h.reports as ReportRow[];
  const prisma = {
    contentReport: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        reports().filter((r) => where.id.in.includes(r.id)),
      ),
      // The compare-and-set: only a report still PENDING is claimed.
      updateMany: vi.fn(async ({ where }: { where: { id: string; status: { in: string[] } } }) => {
        const r = reports().find((x) => x.id === where.id);
        if (!r || !where.status.in.includes(r.status)) return { count: 0 };
        r.status = 'RESOLVED';
        return { count: 1 };
      }),
    },
    contentRemoval: h.removals.contentRemoval,
    rMHarkComment: { updateMany: vi.fn(async () => ({ count: 1 })) },
    $transaction: vi.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
  };
  return { prisma: shapeChecked(prisma) };
});
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    h.sent.push(input);
  }),
}));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: vi.fn(async () => {}) }));
vi.mock('@/lib/moderation/my-reports.server', () => ({ notifyReportersOfOutcome: vi.fn(async () => 0) }));
vi.mock('@/lib/builds/comments.server', () => ({ moderatorDeleteComment: vi.fn() }));
vi.mock('@/lib/builds/issues.server', () => ({ moderatorRemoveIssue: vi.fn() }));
vi.mock('@/lib/feed/conversation-controls.server', () => ({ clearPinnedForComment: vi.fn() }));
vi.mock('@/lib/profile/stamps.server', () => ({ takedownStamp: vi.fn() }));
vi.mock('@/lib/profile/webrings.server', () => ({ takedownRing: vi.fn() }));
vi.mock('@/lib/rmhmusic/learn/moderation.server', () => ({ hideMusicContent: vi.fn() }));
vi.mock('@/lib/studio/share.server', () => ({ takedownShare: vi.fn() }));
vi.mock('@/lib/moderation/notes.server', () => ({ noteCountsFor: vi.fn(async () => new Map()) }));
vi.mock('@/lib/study/deck-moderation.server', () => ({ moderateDeck: h.takedown }));

import { decideReports } from '@/lib/moderation/triage.server';
import { recordContentRemoval } from '@/lib/moderation/removal-reviews.server';
import { NOTICE_TEMPLATES } from '@/lib/notifications/notice-keys';

const report = (over: Partial<ReportRow> = {}): ReportRow => ({
  id: 'r1',
  status: 'PENDING',
  entityType: 'study-deck',
  entityId: 'deck-1',
  targetUserId: 'author',
  moderatorNote: null,
  ...over,
});
const previewOf = (n: Record<string, unknown>) => n.preview as { key: string; params: Record<string, unknown> };
const takedown = { action: 'resolve', moderatorId: 'mod1', deleteContent: true } as const;

beforeEach(() => {
  h.sent = [];
  h.reports = [report(), report({ id: 'r2' })];
  h.takedown.mockClear();
  h.takedown.mockResolvedValue(true);
  h.removals!.rows.length = 0;
  vi.mocked(h.removals!.contentRemoval.create).mockClear();
});

describe('a report takedown is recorded and told once', () => {
  it('writes one record and one plain notice for the target, however many reports it had', async () => {
    await decideReports(['r1', 'r2'], takedown);
    expect(h.takedown).toHaveBeenCalledTimes(1);
    expect(h.removals!.rows).toHaveLength(1);
    expect(h.removals!.rows[0]).toMatchObject({
      reportId: 'r1',
      entityType: 'study-deck',
      entityId: 'deck-1',
      authorId: 'author',
      reversible: true,
      reviewRequestedAt: null,
    });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ userId: 'author', type: 'SYSTEM', entityType: 'moderation' });
    const preview = previewOf(h.sent[0]!);
    expect(preview.key).toBe('content-removed-after-report');
    expect(preview.params).toEqual({ kind: 'study-deck' });
  });

  it('sends the message variant instead of report-decision when the moderator wrote a message', async () => {
    const message = 'This deck broke the rules.';
    await decideReports(['r1', 'r2'], { ...takedown, message });
    expect(h.sent).toHaveLength(1);
    const preview = previewOf(h.sent[0]!);
    expect(preview.key).toBe('content-removed-after-report-message');
    expect(preview.params).toEqual({ kind: 'study-deck', message });
    expect((preview as unknown as { fallback: string }).fallback).toBe(
      NOTICE_TEMPLATES['content-removed-after-report-message']
        .replace('{{kind}}', 'study-deck')
        .replace('{{message}}', message),
    );
    expect(h.sent.some((n) => previewOf(n).key === 'report-decision')).toBe(false);
  });

  it('writes nothing when the same decision is made again', async () => {
    await decideReports(['r1', 'r2'], takedown);
    await decideReports(['r1', 'r2'], takedown);
    expect(h.removals!.rows).toHaveLength(1);
    expect(h.sent).toHaveLength(1);
  });

  it('writes nothing when the report was already claimed by another moderator', async () => {
    h.reports = [report({ status: 'PENDING' })];
    const claimedFirst = h.removals!.contentRemoval.create;
    // The other moderator wins the claim between the read and the write.
    (h.reports[0] as ReportRow).status = 'RESOLVED';
    await decideReports(['r1'], takedown);
    expect(claimedFirst).not.toHaveBeenCalled();
    expect(h.sent).toEqual([]);
  });

  it('a second record call for the same report is a duplicate and tells nobody again', async () => {
    const input = { reportId: 'r1', entityType: 'study-deck', entityId: 'deck-1', authorId: 'author' };
    expect(await recordContentRemoval(input)).toBe('recorded');
    // Restored since, so the item is not "still down": only the unique report id stops a second row.
    h.removals!.rows[0]!.reviewOutcome = 'restored';
    expect(await recordContentRemoval(input)).toBe('duplicate');
    expect(h.removals!.rows).toHaveLength(1);
    expect(h.sent).toHaveLength(1);
  });

  it('records a deleted kind as not reversible', async () => {
    h.reports = [report({ entityType: 'comment', entityId: 'c1' })];
    await decideReports(['r1'], takedown);
    expect(h.removals!.rows[0]).toMatchObject({ entityType: 'comment', reversible: false });
    expect(previewOf(h.sent[0]!).params).toEqual({ kind: 'comment' });
  });

  it('records nothing for a report with no author, a dismissal, or a resolve that took nothing down', async () => {
    h.reports = [report({ targetUserId: null })];
    await decideReports(['r1'], takedown);
    h.reports = [report()];
    await decideReports(['r1'], { action: 'dismiss', moderatorId: 'mod1' });
    h.reports = [report()];
    await decideReports(['r1'], { action: 'resolve', moderatorId: 'mod1' });
    expect(h.removals!.rows).toEqual([]);
    expect(h.sent).toEqual([]);
  });

  it('keeps the plain report-decision notice for a resolve with a message and no takedown', async () => {
    await decideReports(['r1'], { action: 'resolve', moderatorId: 'mod1', message: 'Looked fine to us.' });
    expect(h.removals!.rows).toEqual([]);
    expect(h.sent.map((n) => previewOf(n).key)).toEqual(['report-decision']);
  });

  it('records nothing when the takedown failed, and leaves the report open', async () => {
    h.takedown.mockRejectedValue(new Error('boom'));
    const result = await decideReports(['r1'], takedown);
    expect(result.takedownFailed).toHaveLength(1);
    expect(h.removals!.rows).toEqual([]);
    expect(h.sent).toEqual([]);
  });

  it('a failed record never undoes the takedown and the typed message is still delivered', async () => {
    vi.mocked(h.removals!.contentRemoval.create).mockRejectedValueOnce(new Error('db down'));
    const result = await decideReports(['r1'], { ...takedown, message: 'Removed for spam.' });
    expect(result.decided).toEqual(['r1']);
    expect(h.takedown).toHaveBeenCalledTimes(1);
    expect(h.sent.map((n) => previewOf(n).key)).toEqual(['report-decision']);
  });

  it('a removal notice that fails falls back to report-decision, so the typed message is not lost', async () => {
    const { createNotification } = await import('@/lib/notifications.server');
    vi.mocked(createNotification).mockRejectedValueOnce(new Error('inbox down'));
    const result = await decideReports(['r1'], { ...takedown, message: 'Removed for spam.' });
    expect(result.decided).toEqual(['r1']);
    expect(h.removals!.rows).toHaveLength(1);
    expect(h.sent.map((n) => previewOf(n).key)).toEqual(['report-decision']);
  });

  it('an item still down from an earlier removal gets no second record or plain notice', async () => {
    await decideReports(['r1'], takedown);
    h.sent = [];
    h.reports = [report({ id: 'r9' })];
    await decideReports(['r9'], takedown);
    expect(h.removals!.rows).toHaveLength(1);
    expect(h.sent).toEqual([]);
  });

  it('a restored item that is removed again is a new record', async () => {
    await decideReports(['r1'], takedown);
    h.removals!.rows[0]!.reviewOutcome = 'restored';
    h.reports = [report({ id: 'r9' })];
    await decideReports(['r9'], takedown);
    expect(h.removals!.rows).toHaveLength(2);
  });
});
