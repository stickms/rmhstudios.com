/**
 * s09-11: the drafts list returns a refusal notice's preview as `blockedReason` only when it is newer than the
 * draft's `updatedAt` (so an edit clears the line), and reads the notices in one query.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  notices: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/scheduled/publish.server', () => ({ publishDueForUser: vi.fn(async () => 0) }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    scheduledPost: { findMany: vi.fn(async () => h.rows) },
    notification: { findMany: vi.fn(async () => h.notices) },
  },
}));

const { listScheduled } = await import('@/lib/scheduled/list.server');
const { prisma } = await import('@/lib/prisma.server');

const row = (id: string, updatedAt: string, scheduledAt: string | null = null) => ({
  id,
  content: 'x',
  gifUrl: null,
  gifAlt: null,
  contentWarning: null,
  imageUrls: [],
  imageAlts: [],
  audience: 'PUBLIC',
  unlockPrice: null,
  poll: null,
  scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date(updatedAt),
});
const notice = (entityId: string, createdAt: string, preview: string) => ({
  entityId,
  preview,
  createdAt: new Date(createdAt),
});

beforeEach(() => {
  h.rows = [];
  h.notices = [];
  vi.mocked(prisma.notification.findMany).mockClear();
});

describe('listScheduled blockedReason', () => {
  it('shows the reason for a notice newer than the draft and not for an older one', async () => {
    h.rows = [row('new', '2026-11-02T00:00:00Z'), row('edited', '2026-11-04T00:00:00Z')];
    h.notices = [
      notice('new', '2026-11-03T00:00:00Z', 'Not published: you left'),
      notice('edited', '2026-11-03T00:00:00Z', 'Not published: you left'),
    ];
    const { drafts } = await listScheduled('u1');
    expect(drafts.find((d) => d.id === 'new')?.blockedReason).toBe('Not published: you left');
    expect(drafts.find((d) => d.id === 'edited')?.blockedReason).toBeNull();
  });

  it('uses the newest notice per draft, in one query on the member’s refusal notices', async () => {
    h.rows = [row('a', '2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z'), row('b', '2026-11-01T00:00:00Z')];
    // Ordered newest first, as the query asks.
    h.notices = [
      notice('a', '2026-11-05T00:00:00Z', 'second refusal'),
      notice('a', '2026-11-03T00:00:00Z', 'first refusal'),
    ];
    const { drafts, scheduled } = await listScheduled('u1');
    expect(scheduled[0]?.blockedReason).toBe('second refusal');
    expect(drafts[0]?.blockedReason).toBeNull();
    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          type: 'SYSTEM',
          entityType: { in: ['scheduled-refused', 'scheduled-alt-required'] },
          entityId: { in: ['a', 'b'] },
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('asks nothing when there are no drafts', async () => {
    expect(await listScheduled('u1')).toEqual({ drafts: [], scheduled: [] });
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });
});
