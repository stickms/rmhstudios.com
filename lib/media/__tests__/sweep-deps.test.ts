import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

/**
 * The real sweep dependencies name real Prisma delegates. A cast once hid `prisma.rmhark` (the client's delegate is
 * `rMHark`), so every sweep, preview and "Run now" threw on its first reference check. This builds a client double
 * with exactly the generated delegate names and checks each one the sweeps reach.
 */
const h = vi.hoisted(() => ({ client: {} as Record<string, unknown> }));

vi.mock('@/lib/prisma.server', () => ({ prisma: h.client }));
vi.mock('@/lib/admin-audit.server', () => ({ recordAdminActionIn: vi.fn() }));
vi.mock('@/lib/flags/flags.server', () => ({ isFeatureEnabled: vi.fn(async () => false) }));
vi.mock('@/lib/media/ingest.server', () => ({ variantKeysFor: vi.fn(() => []) }));
vi.mock('@/lib/storage/cdn.server', () => ({ purgeFromCdn: vi.fn() }));
vi.mock('@/lib/storage/s3.server', () => ({ deleteObject: vi.fn(), listObjectEntries: vi.fn() }));

for (const m of Prisma.dmmf.datamodel.models) {
  h.client[m.name.charAt(0).toLowerCase() + m.name.slice(1)] = {
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
}
// One old orphaned upload, so the sweep goes on to ask every surface whether it still names it.
const orphan = {
  id: 'm1',
  key: 'rmharks/u-1.webp',
  url: 'https://cdn.test/rmharks/u-1.webp',
  status: 'PENDING',
  postId: null,
  createdAt: new Date('2020-01-01T00:00:00Z'),
};
(h.client.media as { findMany: ReturnType<typeof vi.fn> }).findMany.mockImplementation(
  async (args: { cursor?: unknown }) => (args.cursor ? [] : [orphan]),
);

import { clipSweepDeps, mediaSweepDeps } from '@/lib/media/sweep-jobs.server';
import { sweepMedia } from '@/lib/media/sweep.server';

describe('the real sweep dependencies', () => {
  it('reach a generated delegate for every table the media sweep reads', () => {
    const delegates = mediaSweepDeps().prisma as unknown as Record<string, { findMany?: unknown } | undefined>;
    const names = Object.keys(delegates);
    expect(names).toContain('rMHark');
    for (const name of names) expect(typeof delegates[name]?.findMany, name).toBe('function');
  });

  it('let a preview run end to end, asking every surface', async () => {
    const summary = await sweepMedia(mediaSweepDeps(), { dryRun: true });
    expect(summary.targets).toBe(1);
    const rmhark = h.client.rMHark as { findMany: ReturnType<typeof vi.fn> };
    expect(rmhark.findMany).toHaveBeenCalled();
  });

  it('and for the clip sweep', () => {
    const delegates = clipSweepDeps().prisma as unknown as Record<string, { findMany?: unknown } | undefined>;
    for (const name of Object.keys(delegates)) expect(typeof delegates[name]?.findMany, name).toBe('function');
  });
});
