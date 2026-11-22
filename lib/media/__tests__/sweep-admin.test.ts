import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  flag: true as boolean,
  audit: [] as Array<{ adminId: string; action: string; opts: { targetType?: string; detail?: string } }>,
  auditRows: [] as Array<{ id: string; action: string; createdAt: Date; detail: string | null }>,
  findMany: vi.fn(),
}));

vi.mock('@/lib/flags/flags.server', () => ({ isFeatureEnabled: vi.fn(async () => h.flag) }));
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: vi.fn(
    async (_tx: unknown, adminId: string, action: string, opts: { targetType?: string; detail?: string }) => {
      h.audit.push({ adminId, action, opts });
    },
  ),
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: object) => Promise<unknown>) => fn({})),
    adminAuditLog: { findMany: (args: unknown) => h.findMany(args) },
  },
}));
vi.mock('@/lib/storage/s3.server', () => ({ putObject: vi.fn(), deleteObject: vi.fn(), listObjectEntries: vi.fn() }));
vi.mock('@/lib/storage/cdn.server', () => ({ purgeFromCdn: vi.fn() }));

import { isFeatureEnabled } from '@/lib/flags/flags.server';
import {
  previewSweep,
  runScheduledClipSweep,
  runScheduledMediaSweep,
  runSweepNow,
  MEDIA_SWEEP_CRON,
  MEDIA_CLIP_SWEEP_CRON,
  MEDIA_CLIP_SWEEP_QUEUE,
  MEDIA_SWEEP_QUEUE,
  registerClipSweepCron,
  registerMediaSweepCron,
} from '@/lib/media/sweep-jobs.server';
import { listSweepRuns } from '@/lib/media/sweep-admin.server';
import { parseRunDetail, runDetail } from '@/lib/media/sweep-run-detail';
import type { SweepDeps } from '@/lib/media/sweep.server';
import type { ClipSweepDeps } from '@/lib/media/clip-sweep.server';
import type { ClipSweepSummary, SweepSummary } from '@/lib/media/sweep-summary';

const root = join(__dirname, '..', '..', '..');

/** One orphaned upload, one clip: enough for a run to have something to do. */
function fakes() {
  const media = {
    prisma: {
      media: {
        findMany: vi.fn(async (args: { where: Record<string, unknown> }) =>
          (args.where.id as { in?: string[] } | undefined)?.in
            ? [{ id: 'm1', status: 'PENDING', postId: null }]
            : [{ id: 'm1', key: 'rmharks/u-1.webp', url: 'https://cdn.test/u-1.webp' }],
        ),
        deleteMany: vi.fn(async () => ({ count: 1 })),
      },
      scheduledPost: { findMany: vi.fn(async () => []) },
      flashcard: { findMany: vi.fn(async () => []) },
      buildScreenshot: { findMany: vi.fn(async () => []) },
      userBuild: { findMany: vi.fn(async () => []) },
      rMHark: { findMany: vi.fn(async () => []) },
      feedAnnouncement: { findMany: vi.fn(async () => []) },
      chatMessage: { findMany: vi.fn(async () => []) },
      scheduledChatMessage: { findMany: vi.fn(async () => []) },
      homeListing: { findMany: vi.fn(async () => []) },
      emailCampaign: { findMany: vi.fn(async () => []) },
      siteEra: { findMany: vi.fn(async () => []) },
    },
    deleteObject: vi.fn(async (_key: string) => {}),
    purgeFromCdn: vi.fn(async (_key: string) => {}),
  };
  const clips = {
    listObjectEntries: vi.fn(async () => [
      { key: 'profile-pronunciation/a.webm', lastModified: new Date('2020-01-01T00:00:00Z') },
    ]),
    prisma: { profilePlus: { findMany: vi.fn(async () => []) } },
    deleteObject: vi.fn(async (_key: string) => {}),
    purgeFromCdn: vi.fn(async (_key: string) => {}),
  } satisfies ClipSweepDeps;
  // The doubles take the narrow argument each one reads; the intersection keeps the mock API and the deps shape.
  return { media: media as typeof media & SweepDeps, clips };
}

beforeEach(() => {
  h.flag = true;
  h.audit.length = 0;
  h.auditRows = [];
  h.findMany.mockReset();
  h.findMany.mockImplementation(async () => h.auditRows);
});

describe('the endpoints are admin only', () => {
  it.each(['admin.media-sweep.server.ts', 'admin.media-sweep.preview.server.ts', 'admin.media-sweep.run.server.ts'])(
    '%s uses implement with auth: admin',
    (file) => {
      const source = readFileSync(join(root, 'lib/media/api', file), 'utf8');
      expect(source).toContain('implement(');
      expect(source).toContain("auth: 'admin'");
      expect(source).not.toContain("auth: 'none'");
      expect(source).not.toContain("auth: 'optional'");
    },
  );

  it('the run and the preview validate their body, and the run is rate limited', () => {
    const run = readFileSync(join(root, 'lib/media/api/admin.media-sweep.run.server.ts'), 'utf8');
    const preview = readFileSync(join(root, 'lib/media/api/admin.media-sweep.preview.server.ts'), 'utf8');
    for (const source of [run, preview]) {
      expect(source).toContain('body: sweepKindBody');
      expect(source).toContain('rateLimit');
    }
  });
});

describe('the flag gates the scheduled jobs, not "Run now"', () => {
  it('does nothing at night while the flag is off', async () => {
    h.flag = false;
    const f = fakes();
    expect(await runScheduledMediaSweep({ media: f.media })).toBeNull();
    expect(await runScheduledClipSweep({ clips: f.clips })).toBeNull();
    expect(f.media.prisma.media.findMany).not.toHaveBeenCalled();
    expect(f.media.deleteObject).not.toHaveBeenCalled();
    expect(f.clips.listObjectEntries).not.toHaveBeenCalled();
    expect(f.clips.deleteObject).not.toHaveBeenCalled();
  });

  it('runs both jobs when the flag is on', async () => {
    const info = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fakes();
    expect(await runScheduledMediaSweep({ media: f.media })).toMatchObject({ deleted: 1 });
    expect(await runScheduledClipSweep({ clips: f.clips })).toMatchObject({ deleted: 1 });
    expect(f.media.deleteObject).toHaveBeenCalledWith('rmharks/u-1.webp');
    expect(f.clips.deleteObject).toHaveBeenCalledWith('profile-pronunciation/a.webm');
    // Counts only: no key reaches the log.
    expect(JSON.stringify(info.mock.calls)).not.toContain('rmharks');
    expect(JSON.stringify(info.mock.calls)).not.toContain('profile-pronunciation/');
    info.mockRestore();
  });

  it('treats a flag that cannot be read as off', async () => {
    vi.mocked(isFeatureEnabled).mockRejectedValueOnce(new Error('flags unavailable'));
    const f = fakes();
    expect(await runScheduledMediaSweep({ media: f.media })).toBeNull();
    expect(f.media.deleteObject).not.toHaveBeenCalled();
  });

  it('runs now with the flag off', async () => {
    h.flag = false;
    const info = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fakes();
    const summary = await runSweepNow('media', 'admin_1', { media: f.media });
    expect(summary).toMatchObject({ deleted: 1 });
    expect(f.media.deleteObject).toHaveBeenCalled();
    info.mockRestore();
  });

  it('is scheduled at a fixed minute off the hour', () => {
    expect(MEDIA_SWEEP_CRON).toMatch(/^[1-9]\d? \d+ \* \* \*$/);
    expect(MEDIA_CLIP_SWEEP_CRON).toMatch(/^[1-9]\d? \d+ \* \* 0$/);
  });
});

describe('a run is audited', () => {
  it.each([
    ['media', 'media_sweep_run'],
    ['clips', 'media_clip_sweep_run'],
  ] as const)('%s: one audit row, counts only, by the admin who ran it', async (kind, action) => {
    const info = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fakes();
    await runSweepNow(kind, 'admin_1', { media: f.media, clips: f.clips });
    info.mockRestore();

    expect(h.audit).toHaveLength(1);
    const [entry] = h.audit;
    expect(entry).toMatchObject({ adminId: 'admin_1', action });
    expect(entry!.opts.targetType).toBe('media-sweep');
    const detail = entry!.opts.detail!;
    expect(detail.length).toBeLessThanOrEqual(500);
    expect(detail).not.toContain('rmharks');
    expect(detail).not.toContain('profile-pronunciation');
    expect(JSON.parse(detail)).toMatchObject({ dryRun: false, deleted: 1 });
  });

  it('a preview deletes nothing and records nothing', async () => {
    const f = fakes();
    const media = await previewSweep('media', { media: f.media });
    const clips = await previewSweep('clips', { clips: f.clips });
    expect(media).toMatchObject({ dryRun: true, targets: 1, deleted: 0, sampleKeys: ['rmharks/u-1.webp'] });
    expect(clips).toMatchObject({ dryRun: true, targets: 1, deleted: 0 });
    expect(f.media.deleteObject).not.toHaveBeenCalled();
    expect(f.media.prisma.media.deleteMany).not.toHaveBeenCalled();
    expect(f.clips.deleteObject).not.toHaveBeenCalled();
    expect(h.audit).toHaveLength(0);
  });

  it('runDetail drops the keys and fits the audit column', () => {
    const summary: SweepSummary = {
      dryRun: false,
      scanned: 5,
      kept: 1,
      targets: 4,
      deleted: 3,
      failed: 1,
      byRule: { 'orphan-pending': 2, 'soft-deleted-post': 1, 'hard-deleted-post': 1 },
      capped: true,
      sampleKeys: ['rmharks/secret.webp'],
      durationMs: 12,
    };
    const detail = runDetail(summary);
    expect(detail).not.toContain('rmharks');
    expect(detail.length).toBeLessThanOrEqual(500);
    const clip: ClipSweepSummary = {
      dryRun: false,
      listed: 1,
      tooNew: 0,
      noTime: 0,
      referenced: 0,
      targets: 1,
      deleted: 1,
      failed: 0,
      capped: false,
      sampleKeys: ['profile-pronunciation/x'],
      durationMs: 1,
    };
    expect(runDetail(clip)).not.toContain('profile-pronunciation');
  });
});

describe('the page reads the audit rows back', () => {
  it('lists the last five runs of this feature, newest first, with the flag', async () => {
    h.auditRows = [
      {
        id: 'a1',
        action: 'media_sweep_run',
        createdAt: new Date('2026-06-02T00:00:00Z'),
        detail: '{"targets":4,"deleted":3,"failed":1,"capped":true}',
      },
      { id: 'a2', action: 'media_clip_sweep_run', createdAt: new Date('2026-06-01T00:00:00Z'), detail: 'not json' },
      { id: 'a3', action: 'user.ban', createdAt: new Date('2026-05-30T00:00:00Z'), detail: null },
    ];
    const state = await listSweepRuns();
    expect(state.enabled).toBe(true);
    expect(state.runs).toEqual([
      { id: 'a1', kind: 'media', at: '2026-06-02T00:00:00.000Z', targets: 4, deleted: 3, failed: 1, capped: true },
      { id: 'a2', kind: 'clips', at: '2026-06-01T00:00:00.000Z', targets: 0, deleted: 0, failed: 0, capped: false },
    ]);
    const args = h.findMany.mock.calls[0]![0] as { take: number; orderBy: unknown; where: { targetType: string } };
    expect(args.take).toBe(5);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.where.targetType).toBe('media-sweep');
  });

  it('reports the flag off', async () => {
    h.flag = false;
    expect((await listSweepRuns()).enabled).toBe(false);
  });

  it('parseRunDetail ignores a row this feature did not write', () => {
    expect(parseRunDetail({ id: 'x', action: 'user.ban', createdAt: new Date(), detail: null })).toBeNull();
  });
});

describe('the pg-boss wiring', () => {
  const fakeBoss = () => {
    const workers = new Map<string, () => Promise<void>>();
    const boss = {
      createQueue: vi.fn(async () => {}),
      schedule: vi.fn(async () => {}),
      work: vi.fn(async (queue: string, fn: () => Promise<void>) => {
        workers.set(queue, fn);
      }),
    };
    return { boss, workers };
  };

  it.each([
    [MEDIA_SWEEP_QUEUE, MEDIA_SWEEP_CRON, registerMediaSweepCron],
    [MEDIA_CLIP_SWEEP_QUEUE, MEDIA_CLIP_SWEEP_CRON, registerClipSweepCron],
  ] as const)('%s is scheduled, and its worker does nothing while the flag is off', async (queue, cron, register) => {
    h.flag = false;
    const { boss, workers } = fakeBoss();
    await register(boss as never);
    expect(boss.createQueue).toHaveBeenCalledWith(queue);
    expect(boss.schedule).toHaveBeenCalledWith(queue, cron, {}, { tz: 'UTC' });
    // The mocked prisma here has no `media` or `profilePlus`: a worker that got past the flag would throw.
    await expect(workers.get(queue)!()).resolves.toBeUndefined();
  });

  it('server/jobs registers both queues', () => {
    const source = readFileSync(join(root, 'server/jobs/index.ts'), 'utf8');
    expect(source).toContain('queue: MEDIA_SWEEP_QUEUE, register: registerMediaSweepCron');
    expect(source).toContain('queue: MEDIA_CLIP_SWEEP_QUEUE, register: registerClipSweepCron');
  });
});
