import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s14-20 (a): resolving the last open report of a pack the reports hid, without a takedown, brings the pack back.
 * `decideReports` runs against a small in-memory report table; the pack module is a spy so only the decision's
 * branching is under test (`restoreReportedPack` itself is covered by pack-reports.test.ts).
 */

const h = vi.hoisted(() => ({
  restored: [] as string[],
  tookDown: [] as string[],
  reports: [] as { id: string; status: string; entityType: string; entityId: string; targetUserId: string | null }[],
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const contentReport = {
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
      h.reports.filter((r) => where.id.in.includes(r.id)).map((r) => ({ ...r, moderatorNote: null })),
    ),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: { in: string[] } }; data: object }) => {
      const r = h.reports.find((x) => x.id === where.id && where.status.in.includes(x.status));
      if (!r) return { count: 0 };
      Object.assign(r, data);
      return { count: 1 };
    }),
  };
  const client = shapeChecked({ contentReport });
  return { prisma: { ...client, $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops) } };
});
vi.mock('@/lib/party/pack-moderation.server', () => ({
  restoreReportedPack: vi.fn(async (id: string) => {
    h.restored.push(id);
    return true;
  }),
  takeDownPack: vi.fn(async (id: string) => {
    h.tookDown.push(id);
    return true;
  }),
  packPreviews: vi.fn(async () => new Map()),
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => null) }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: vi.fn(async () => undefined) }));
vi.mock('@/lib/moderation/my-reports.server', () => ({ notifyReportersOfOutcome: vi.fn(async () => undefined) }));

import { decideReports } from '@/lib/moderation/triage.server';

const seed = (entityType = 'rmhbox-pack') => {
  h.reports = [{ id: 'r1', status: 'PENDING', entityType, entityId: 'pack1', targetUserId: 'owner1' }];
};

beforeEach(() => {
  h.restored = [];
  h.tookDown = [];
  seed();
});

describe('decideReports and an auto-hidden pack', () => {
  it('restores the pack when the last report is resolved without a takedown', async () => {
    await decideReports(['r1'], { action: 'resolve', moderatorId: 'mod1' });
    expect(h.restored).toEqual(['pack1']);
    expect(h.tookDown).toEqual([]);
  });

  it('still restores on a dismissal', async () => {
    await decideReports(['r1'], { action: 'dismiss', moderatorId: 'mod1' });
    expect(h.restored).toEqual(['pack1']);
  });

  it('does not try to restore a pack that a resolve took down', async () => {
    await decideReports(['r1'], { action: 'resolve', moderatorId: 'mod1', deleteContent: true });
    expect(h.tookDown).toEqual(['pack1']);
    expect(h.restored).toEqual([]);
  });

  it('does not restore on review, nor for another report type', async () => {
    await decideReports(['r1'], { action: 'review', moderatorId: 'mod1' });
    expect(h.restored).toEqual([]);
    seed('post');
    await decideReports(['r1'], { action: 'resolve', moderatorId: 'mod1' });
    expect(h.restored).toEqual([]);
  });
});
