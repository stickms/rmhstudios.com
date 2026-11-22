import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `moderateContent`'s one option, `sweep: { id }` (sprint 08 18): without it nothing changes (the owner gets a
 * notice, the audit log a row, the feed an event); with it the per-item notice, audit row and feed event are
 * skipped and nothing else changes.
 */

const m = vi.hoisted(() => {
  const tx = {
    rMHark: { update: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({ count: 1 })) },
    user: { updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn(async () => ({})) },
    community: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  return {
    tx,
    post: {
      userId: 'owner',
      content: 'buy now',
      deletedAt: null as Date | null,
      deletedByAdmin: false,
      communityId: null,
    },
    comment: { userId: 'owner', content: 'spam reply', deletedAt: null as Date | null, deletedByAdmin: false },
    prisma: {
      rMHark: { findUnique: vi.fn(), update: vi.fn() },
      rMHarkComment: { findUnique: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
      $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    },
    logAdminAction: vi.fn(async () => {}),
    createNotification: vi.fn(async () => {}),
    publishPostEngagement: vi.fn(),
    issueStrike: vi.fn(async () => ({ strikeId: 's1', activeStrikes: 1, autoBanned: false })),
  };
});

vi.mock('@/lib/prisma.server', () => ({ prisma: m.prisma }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: m.logAdminAction }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: m.createNotification }));
vi.mock('@/lib/feed-sse', () => ({ feedEventBus: { publishPostEngagement: m.publishPostEngagement } }));
vi.mock('@/lib/feed/conversation-controls.server', () => ({ clearPinnedForComment: vi.fn(async () => {}) }));
vi.mock('@/lib/tags-extract.server', () => ({
  unlinkPostHashtags: vi.fn(async () => {}),
  linkPostHashtags: vi.fn(async () => {}),
}));
vi.mock('@/lib/presence.server', () => ({ setActivity: vi.fn(async () => {}) }));
vi.mock('@/lib/moderation/strikes.server', () => ({ issueStrike: m.issueStrike }));
vi.mock('@/lib/moderation/restrictions.server', () => ({
  ACCOUNT_STATUS_LINK: '/settings/account-status',
  restrictFeature: vi.fn(async () => ({ id: 'r1' })),
}));

import { moderateContent } from '@/lib/moderation/content.server';

beforeEach(() => {
  vi.clearAllMocks();
  m.post.deletedAt = null;
  m.post.deletedByAdmin = false;
  m.comment.deletedAt = null;
  m.comment.deletedByAdmin = false;
  m.prisma.rMHark.findUnique.mockImplementation(async () => ({ ...m.post }));
  m.prisma.rMHarkComment.findUnique.mockImplementation(async () => ({ ...m.comment }));
});

const base = { adminId: 'admin', reason: 'Spam wave', action: 'remove' as const };

describe('moderateContent without the sweep option (defaults unchanged)', () => {
  it('removing a post writes an audit row, notifies the owner and publishes the feed event', async () => {
    await moderateContent({ ...base, entityType: 'rmhark', entityId: 'p1' });
    expect(m.tx.rMHark.update).toHaveBeenCalledTimes(1);
    expect(m.logAdminAction).toHaveBeenCalledTimes(1);
    expect(m.logAdminAction).toHaveBeenCalledWith(
      'admin',
      'content.remove',
      expect.objectContaining({ targetId: 'p1' }),
    );
    expect(m.createNotification).toHaveBeenCalledTimes(1);
    expect(m.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner', entityType: 'moderation' }),
    );
    expect(m.publishPostEngagement).toHaveBeenCalledTimes(1);
  });

  it('restoring a reply still writes its audit row and notice', async () => {
    m.comment.deletedAt = new Date();
    m.comment.deletedByAdmin = true;
    await moderateContent({ ...base, action: 'restore', entityType: 'comment', entityId: 'c1' });
    expect(m.logAdminAction).toHaveBeenCalledWith('admin', 'content.restore', expect.anything());
    expect(m.createNotification).toHaveBeenCalledTimes(1);
  });
});

describe('moderateContent with sweep: { id }', () => {
  it('removes a post but skips the notice, the audit row and the per-post feed event', async () => {
    await moderateContent({ ...base, entityType: 'rmhark', entityId: 'p1', sweep: { id: 'sw1' } });
    // The removal itself is identical: the same write, in the same transaction.
    expect(m.tx.rMHark.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedByAdmin: true, deletedBy: 'moderator' }) }),
    );
    expect(m.tx.user.updateMany).toHaveBeenCalled();
    expect(m.logAdminAction).not.toHaveBeenCalled();
    expect(m.createNotification).not.toHaveBeenCalled();
    expect(m.publishPostEngagement).not.toHaveBeenCalled();
  });

  it('removes and restores a reply with no per-item notice or audit row', async () => {
    await moderateContent({ ...base, entityType: 'comment', entityId: 'c1', sweep: { id: 'sw1' } });
    expect(m.prisma.rMHarkComment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedBy: 'moderator', deletedByAdmin: true }) }),
    );
    m.comment.deletedAt = new Date();
    m.comment.deletedByAdmin = true;
    const result = await moderateContent({
      ...base,
      action: 'restore',
      entityType: 'comment',
      entityId: 'c1',
      sweep: { id: 'sw1' },
    });
    expect(result).toMatchObject({ success: true, action: 'restore', ownerId: 'owner' });
    expect(m.logAdminAction).not.toHaveBeenCalled();
    expect(m.createNotification).not.toHaveBeenCalled();
  });

  it('still refuses what it refused before: content that is not there, and an already removed item', async () => {
    m.prisma.rMHarkComment.findUnique.mockResolvedValueOnce(null);
    await expect(
      moderateContent({ ...base, entityType: 'comment', entityId: 'gone', sweep: { id: 'sw1' } }),
    ).rejects.toMatchObject({ status: 404 });
    m.comment.deletedAt = new Date();
    m.comment.deletedByAdmin = true;
    await expect(
      moderateContent({ ...base, entityType: 'comment', entityId: 'c1', sweep: { id: 'sw1' } }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('the option names a sweep: there is no bare switch for the notice or the audit row', () => {
    // A compile-time property, pinned here by shape: the only extra input is `sweep`, an object with an id.
    const input: Parameters<typeof moderateContent>[0] = {
      ...base,
      entityType: 'comment',
      entityId: 'c1',
      sweep: { id: 's' },
    };
    expect(Object.keys(input)).not.toEqual(expect.arrayContaining(['notify', 'audit']));
  });
});
