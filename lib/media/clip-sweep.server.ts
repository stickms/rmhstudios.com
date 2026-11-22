/**
 * The weekly sweep of orphaned pronunciation clips (sprint 08 19's follow-up).
 *
 * A clip is one object per member under `profile-pronunciation/`; replacing or removing it deletes the old object,
 * and a delete that keeps failing leaves one nothing names. This lists the prefix and deletes the objects that no
 * `ProfilePlus.pronunciationKey` names and that storage last modified more than 7 days ago.
 *
 * The age rule is the guard against a race the check cannot close: the clip is at a fixed key per member, so a clip
 * uploaded between the listing and the `ProfilePlus` read is protected only by being new. Keep it. An entry storage
 * gave no time for is skipped, and so is a key outside the prefix. The listing is bounded; reaching its limit means
 * clips beyond it wait for a later run (the check against the database is per key, so a short listing never turns
 * into a wrong deletion).
 */
import { PRONUNCIATION_PREFIX } from '@/lib/profile/plus.server';
import { SAMPLE_KEYS, type ClipSweepSummary } from '@/lib/media/sweep-summary';
import type { ObjectEntry } from '@/lib/storage/s3.server';

/** A clip younger than this is never a target. */
export const CLIP_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Objects one run lists. */
export const CLIP_LIST_LIMIT = 5000;
const REFERENCE_CHUNK = 500;

export interface ClipSweepDeps {
  listObjectEntries(prefix: string, limit: number): Promise<ObjectEntry[]>;
  prisma: {
    profilePlus: {
      findMany(args: {
        where: { pronunciationKey: { in: string[] } };
        select: { pronunciationKey: true };
      }): Promise<Array<{ pronunciationKey: string | null }>>;
    };
  };
  deleteObject(key: string): Promise<void>;
  purgeFromCdn(key: string): Promise<void>;
  now?: Date;
}

export async function sweepPronunciationClips(
  deps: ClipSweepDeps,
  opts: { dryRun?: boolean } = {},
): Promise<ClipSweepSummary> {
  const started = Date.now();
  const dryRun = opts.dryRun === true;
  const now = (deps.now ?? new Date()).getTime();

  const entries = await deps.listObjectEntries(PRONUNCIATION_PREFIX, CLIP_LIST_LIMIT);
  let noTime = 0;
  let tooNew = 0;
  const old: string[] = [];
  for (const entry of entries) {
    if (!entry.key.startsWith(PRONUNCIATION_PREFIX) || entry.key.length === PRONUNCIATION_PREFIX.length) continue;
    const time = entry.lastModified?.getTime();
    if (time === undefined || Number.isNaN(time)) {
      noTime++;
      continue;
    }
    if (now - time <= CLIP_MIN_AGE_MS) {
      tooNew++;
      continue;
    }
    old.push(entry.key);
  }

  // A clip is referenced when any member's row names it. Checked per key, after the age rule.
  const referenced = new Set<string>();
  for (let i = 0; i < old.length; i += REFERENCE_CHUNK) {
    const rows = await deps.prisma.profilePlus.findMany({
      where: { pronunciationKey: { in: old.slice(i, i + REFERENCE_CHUNK) } },
      select: { pronunciationKey: true },
    });
    for (const row of rows) if (row.pronunciationKey) referenced.add(row.pronunciationKey);
  }
  const targets = old.filter((key) => !referenced.has(key));

  const summary: ClipSweepSummary = {
    dryRun,
    listed: entries.length,
    tooNew,
    noTime,
    referenced: old.length - targets.length,
    targets: targets.length,
    deleted: 0,
    failed: 0,
    capped: entries.length >= CLIP_LIST_LIMIT,
    sampleKeys: dryRun ? targets.slice(0, SAMPLE_KEYS) : [],
    durationMs: 0,
  };

  if (!dryRun) {
    for (const key of targets) {
      try {
        await deps.deleteObject(key);
        await deps.purgeFromCdn(key);
        summary.deleted++;
      } catch (err) {
        summary.failed++;
        console.error('[clip-sweep] failed to delete a clip:', err instanceof Error ? err.name : 'error');
      }
    }
  }

  summary.durationMs = Date.now() - started;
  return summary;
}
