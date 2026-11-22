/**
 * The media sweep's jobs and the one entry point the admin page calls. Server only.
 *
 *  - `media.sweep` (nightly, 03:17 UTC) runs `sweepMedia`; `media.clip-sweep` (weekly, Sunday 04:41 UTC) runs the
 *    pronunciation-clip sweep. Both are gated by the `media-sweep` feature flag (an absent flag is off), so the
 *    owner turns them on after reading a preview.
 *  - "Run now" and the preview ignore the flag: they are the owner's explicit act. A preview deletes nothing.
 *  - Every run writes one audit row (`media_sweep_run` / `media_clip_sweep_run`, counts only). The scheduled runs have
 *    NO audit row: `AdminAuditLog.adminId` is a required reference to a user and the jobs worker has no system actor,
 *    so they are logged (counts only: no object keys, no members) and the page lists the "Run now" runs.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { isFeatureEnabled } from '@/lib/flags/flags.server';
import { variantKeysFor } from '@/lib/media/ingest.server';
import { sweepMedia, type SweepDeps } from '@/lib/media/sweep.server';
import { sweepPronunciationClips, type ClipSweepDeps } from '@/lib/media/clip-sweep.server';
import { MEDIA_SWEEP_FLAG, runDetail, SWEEP_AUDIT_ACTION, SWEEP_AUDIT_TARGET } from '@/lib/media/sweep-run-detail';
import type { ClipSweepSummary, SweepKind, SweepSummary } from '@/lib/media/sweep-summary';
import { purgeFromCdn } from '@/lib/storage/cdn.server';
import { deleteObject, listObjectEntries } from '@/lib/storage/s3.server';

export { MEDIA_SWEEP_FLAG };
export const MEDIA_SWEEP_QUEUE = 'media.sweep';
export const MEDIA_CLIP_SWEEP_QUEUE = 'media.clip-sweep';
/** Every night at 03:17 UTC (a minute off the hour, in the quiet window). */
export const MEDIA_SWEEP_CRON = '17 3 * * *';
/** Sundays at 04:41 UTC. */
export const MEDIA_CLIP_SWEEP_CRON = '41 4 * * 0';

/**
 * The real dependencies. Each delegate is named here, so a name the client does not have (`rmhark` for `rMHark`) fails
 * to compile instead of throwing at 03:17; the cast only narrows Prisma's generated signatures to the few arguments
 * the sweep passes.
 */
export function mediaSweepDeps(): SweepDeps {
  const delegates = {
    media: prisma.media,
    scheduledPost: prisma.scheduledPost,
    flashcard: prisma.flashcard,
    buildScreenshot: prisma.buildScreenshot,
    userBuild: prisma.userBuild,
    rMHark: prisma.rMHark,
    feedAnnouncement: prisma.feedAnnouncement,
    chatMessage: prisma.chatMessage,
    scheduledChatMessage: prisma.scheduledChatMessage,
    homeListing: prisma.homeListing,
    emailCampaign: prisma.emailCampaign,
    siteEra: prisma.siteEra,
  } satisfies Record<keyof SweepDeps['prisma'], unknown>;
  return {
    prisma: delegates as unknown as SweepDeps['prisma'],
    deleteObject,
    purgeFromCdn,
    variantKeys: variantKeysFor,
  };
}

export function clipSweepDeps(): ClipSweepDeps {
  return {
    listObjectEntries,
    prisma: { profilePlus: prisma.profilePlus } as unknown as ClipSweepDeps['prisma'],
    deleteObject,
    purgeFromCdn,
  };
}

async function flagOn(): Promise<boolean> {
  try {
    return await isFeatureEnabled(MEDIA_SWEEP_FLAG);
  } catch {
    return false; // when in doubt, keep
  }
}

type Dependencies = { enabled?: () => Promise<boolean>; media?: SweepDeps; clips?: ClipSweepDeps };

/** Counts only: the log never carries an object key or a member. */
function logRun(kind: SweepKind, summary: SweepSummary | ClipSweepSummary): void {
  console.warn(`[media-sweep] ${kind} ${runDetail(summary)}`);
}

/** The nightly run. Returns null (and does nothing) while the flag is off. */
export async function runScheduledMediaSweep(deps: Dependencies = {}): Promise<SweepSummary | null> {
  if (!(await (deps.enabled ?? flagOn)())) return null;
  const summary = await sweepMedia(deps.media ?? mediaSweepDeps());
  logRun('media', summary);
  return summary;
}

/** The weekly run. Returns null (and does nothing) while the flag is off. */
export async function runScheduledClipSweep(deps: Dependencies = {}): Promise<ClipSweepSummary | null> {
  if (!(await (deps.enabled ?? flagOn)())) return null;
  const summary = await sweepPronunciationClips(deps.clips ?? clipSweepDeps());
  logRun('clips', summary);
  return summary;
}

/** What a run would delete. The same function as the run, with `dryRun`; nothing is deleted and nothing is recorded. */
export async function previewSweep(kind: SweepKind, deps: Dependencies = {}): Promise<SweepSummary | ClipSweepSummary> {
  return kind === 'media'
    ? sweepMedia(deps.media ?? mediaSweepDeps(), { dryRun: true })
    : sweepPronunciationClips(deps.clips ?? clipSweepDeps(), { dryRun: true });
}

/** "Run now": works with the flag off. Writes the audit row, in a transaction of its own, once the run is done. */
export async function runSweepNow(
  kind: SweepKind,
  adminId: string,
  deps: Dependencies = {},
): Promise<SweepSummary | ClipSweepSummary> {
  const summary =
    kind === 'media'
      ? await sweepMedia(deps.media ?? mediaSweepDeps())
      : await sweepPronunciationClips(deps.clips ?? clipSweepDeps());
  logRun(kind, summary);
  await prisma.$transaction(async (tx) => {
    await recordAdminActionIn(tx, adminId, SWEEP_AUDIT_ACTION[kind], {
      targetType: SWEEP_AUDIT_TARGET,
      detail: runDetail(summary),
    });
  });
  return summary;
}

export async function registerMediaSweepCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(MEDIA_SWEEP_QUEUE);
  await boss.schedule(MEDIA_SWEEP_QUEUE, MEDIA_SWEEP_CRON, {}, { tz: 'UTC' });
  await boss.work(MEDIA_SWEEP_QUEUE, async () => {
    await runScheduledMediaSweep();
  });
}

export async function registerClipSweepCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(MEDIA_CLIP_SWEEP_QUEUE);
  await boss.schedule(MEDIA_CLIP_SWEEP_QUEUE, MEDIA_CLIP_SWEEP_CRON, {}, { tz: 'UTC' });
  await boss.work(MEDIA_CLIP_SWEEP_QUEUE, async () => {
    await runScheduledClipSweep();
  });
}
