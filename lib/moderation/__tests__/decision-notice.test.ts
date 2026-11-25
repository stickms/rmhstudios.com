import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The decision message to a reported author is a key (sprint 12, feature 19): the frame is translated, the moderator's
 * words are a param and stay as written. Prisma is a small stand-in; nothing here touches a database.
 */

const h = vi.hoisted(() => ({ sent: [] as Record<string, unknown>[] }));

vi.mock('@/lib/prisma.server', () => {
  const row = (id: string) => ({
    id,
    status: 'PENDING',
    entityType: 'rmhark',
    entityId: 'p1',
    targetUserId: 'author',
    moderatorNote: null,
  });
  return {
    prisma: {
      contentReport: {
        findMany: vi.fn(async () => [row('r1'), row('r2')]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      $transaction: vi.fn(async (ops: unknown) => (Array.isArray(ops) ? Promise.all(ops) : ops)),
    },
  };
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

import { decideReports } from '@/lib/moderation/triage.server';
import { NOTICE_TEMPLATES } from '@/lib/notifications/notice-keys';

beforeEach(() => {
  h.sent = [];
});

describe('the report decision notice', () => {
  it('is the report-decision key with the moderator message as a param, once per target', async () => {
    const message = 'Thanks for the report. This post broke the “no spam” rule.';
    await decideReports(['r1', 'r2'], { action: 'resolve', moderatorId: 'mod1', message });
    expect(h.sent).toHaveLength(1);
    const sent = h.sent[0]!;
    expect(sent).toMatchObject({ userId: 'author', type: 'SYSTEM', entityType: 'report', entityId: 'r1' });
    const preview = sent.preview as { key: string; params: Record<string, unknown>; fallback: string };
    expect(preview.key).toBe('report-decision');
    expect(preview.params).toEqual({ message });
    expect(preview.fallback).toBe(NOTICE_TEMPLATES['report-decision'].replace('{{message}}', message));
  });

  it('sends no notice when there is no message, or the action is not resolve', async () => {
    await decideReports(['r1'], { action: 'resolve', moderatorId: 'mod1' });
    await decideReports(['r1'], { action: 'dismiss', moderatorId: 'mod1', message: 'no' });
    expect(h.sent).toEqual([]);
  });
});
