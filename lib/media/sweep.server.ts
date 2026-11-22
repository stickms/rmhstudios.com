import { orphanCutoff, deletedPostCutoff } from "@/lib/media/sweep-policy";
import { SWEEP_RULES, type SweepRule } from "@/lib/media/sweep-surfaces";
import { SAMPLE_KEYS, type SweepSummary } from "@/lib/media/sweep-summary";
import { CARD_SOUND_PREFIX } from "@/lib/study/card-sound";
import { FEED_IMAGE_PREFIX } from "@/lib/storage/keys";

interface Target { id: string; key: string; url: string }
interface RuleRow { id: string; status?: string; postId?: string | null }

interface FindManyArgs {
  where: unknown;
  select: Record<string, true>;
  orderBy?: unknown;
  take?: number;
  cursor?: { id: string };
  skip?: number;
}
type FindMany<Row> = (args: FindManyArgs) => Promise<Row[]>;

export interface SweepDeps {
  prisma: {
    media: {
      findMany: FindMany<Target> & FindMany<RuleRow>;
      deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
    };
    // Surfaces that keep an upload by its URL rather than by flipping the row to
    // ATTACHED at the moment they are saved (s08-03, s08-15, s07-17). A target
    // any of them still names is kept, whatever its status says.
    scheduledPost: { findMany: FindMany<{ imageUrls: string[] }> };
    flashcard: {
      findMany: FindMany<{
        frontImageUrl: string | null;
        backImageUrl: string | null;
        frontSoundUrl?: string | null;
        backSoundUrl?: string | null;
      }>;
    };
    buildScreenshot: { findMany: FindMany<{ url: string }> };
    userBuild: { findMany: FindMany<{ thumbnailUrl: string | null }> };
    // Live content that names an upload by URL, whatever the Media row says: a copied, re-posted or
    // otherwise re-used picture keeps its object. When in doubt, keep.
    rMHark: { findMany: FindMany<{ imageUrls: string[] }> };
    feedAnnouncement: { findMany: FindMany<{ imageUrls: string[] }> };
    chatMessage: { findMany: FindMany<{ imageUrls: string[] }> };
    scheduledChatMessage: { findMany: FindMany<{ imageUrls: string[] }> };
    // Other tables that store a feed-space URL from `/api/rmharks/image` as a plain string: a homes listing's photos
    // (`aiImages` is a subset of `images`), an admin email campaign's pictures and a museum era's screenshot. None of
    // them claims a Media row, so without these a re-used upload could be reclaimed while they still show it.
    homeListing: { findMany: FindMany<{ images: string[] }> };
    emailCampaign: { findMany: FindMany<{ imageUrls: string[] }> };
    siteEra: { findMany: FindMany<{ imageUrl: string | null }> };
  };
  deleteObject(key: string): Promise<void>;
  purgeFromCdn(key: string): Promise<void>;
  /**
   * The smaller variants stored beside a row's full-size object (a `Media` row names only that one). Deleted
   * before it. Absent means none, which is how the sweep stays free of the ingest's image code.
   */
  variantKeys?(key: string): string[];
  now?: Date;
}

/** Most rows one run takes: oldest first, so a backlog drains in order and a run is bounded. */
export const SWEEP_ROW_CAP = 2000;
/** Rows whose objects are deleted, and whose rows are removed, together. */
export const SWEEP_BATCH = 200;
/** Candidate pages one run reads while looking for targets (rows kept by a reference do not count as targets). */
const MAX_SCAN_PAGES = 5;

/** URLs per reference query: keeps each `IN (...)` list bounded. */
const REFERENCE_CHUNK = 500;

/**
 * The target URLs something still points at:
 *  - an unpublished ScheduledPost (a draft or a scheduled post whose developer
 *    API uploads stay PENDING until `publishScheduledPost` attaches them),
 *  - a flashcard side, a picture (copies share one object by URL) or a sound (s10-02: one object per side, never
 *    shared; a sound a card uses is never swept, and an unclaimed upload goes by `orphan-pending`),
 *  - a build screenshot or a build cover,
 *  - a live post, announcement or chat message (sent or scheduled),
 *  - a homes listing photo, an admin email campaign picture or a museum era screenshot.
 */
export async function referencedUrls(deps: SweepDeps, urls: string[]): Promise<Set<string>> {
  const kept = new Set<string>();
  for (let i = 0; i < urls.length; i += REFERENCE_CHUNK) {
    const chunk = urls.slice(i, i + REFERENCE_CHUNK);
    const [scheduled, cards, shots, builds, live, listings, eras] = await Promise.all([
      deps.prisma.scheduledPost.findMany({
        where: { publishedId: null, imageUrls: { hasSome: chunk } },
        select: { imageUrls: true },
      }),
      deps.prisma.flashcard.findMany({
        where: {
          OR: [
            { frontImageUrl: { in: chunk } },
            { backImageUrl: { in: chunk } },
            { frontSoundUrl: { in: chunk } },
            { backSoundUrl: { in: chunk } },
          ],
        },
        select: { frontImageUrl: true, backImageUrl: true, frontSoundUrl: true, backSoundUrl: true },
      }),
      deps.prisma.buildScreenshot.findMany({ where: { url: { in: chunk } }, select: { url: true } }),
      deps.prisma.userBuild.findMany({ where: { thumbnailUrl: { in: chunk } }, select: { thumbnailUrl: true } }),
      Promise.all([
        deps.prisma.rMHark.findMany({
          where: { deletedAt: null, imageUrls: { hasSome: chunk } },
          select: { imageUrls: true },
        }),
        deps.prisma.feedAnnouncement.findMany({ where: { imageUrls: { hasSome: chunk } }, select: { imageUrls: true } }),
        deps.prisma.chatMessage.findMany({ where: { imageUrls: { hasSome: chunk } }, select: { imageUrls: true } }),
        deps.prisma.scheduledChatMessage.findMany({
          where: { imageUrls: { hasSome: chunk } },
          select: { imageUrls: true },
        }),
        deps.prisma.emailCampaign.findMany({ where: { imageUrls: { hasSome: chunk } }, select: { imageUrls: true } }),
      ]),
      deps.prisma.homeListing.findMany({ where: { images: { hasSome: chunk } }, select: { images: true } }),
      deps.prisma.siteEra.findMany({ where: { imageUrl: { in: chunk } }, select: { imageUrl: true } }),
    ]);
    for (const l of listings) for (const u of l.images) kept.add(u);
    for (const e of eras) if (e.imageUrl) kept.add(e.imageUrl);
    for (const rows of live) for (const r of rows) for (const u of r.imageUrls) kept.add(u);
    for (const s of scheduled) for (const u of s.imageUrls) kept.add(u);
    for (const c of cards) {
      if (c.frontImageUrl) kept.add(c.frontImageUrl);
      if (c.backImageUrl) kept.add(c.backImageUrl);
      if (c.frontSoundUrl) kept.add(c.frontSoundUrl);
      if (c.backSoundUrl) kept.add(c.backSoundUrl);
    }
    for (const s of shots) kept.add(s.url);
    for (const b of builds) if (b.thumbnailUrl) kept.add(b.thumbnailUrl);
  }
  return kept;
}

/**
 * Only feed-space keys, and card sounds (an unclaimed upload, s10-02: `referencedUrls` keeps every sound a card
 * names), are ever deleted. A row with any other key, an empty one, or one that climbs out of its folder is kept,
 * whatever its status says.
 */
const SWEEPABLE_PREFIXES = [FEED_IMAGE_PREFIX, CARD_SOUND_PREFIX];
function sweepableKey(key: string): boolean {
  return (
    typeof key === "string" &&
    !key.includes("..") &&
    SWEEPABLE_PREFIXES.some((prefix) => key.startsWith(prefix) && key.length > prefix.length)
  );
}

function candidateWhere(now: Date) {
  return {
    OR: [
      { status: "PENDING", createdAt: { lt: orphanCutoff(now) } },
      { post: { deletedAt: { not: null, lt: deletedPostCutoff(now) } } },
      // A post's media lost its postId (hard-deleted post, FK SetNull). Only
      // post attachment stamps `attachedAt`; emoji-pack items are ATTACHED
      // with no post and no attachedAt, and must not match this heuristic.
      {
        status: "ATTACHED",
        postId: null,
        attachedAt: { not: null },
        createdAt: { lt: deletedPostCutoff(now) },
      },
    ],
  };
}

const chunksOf = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * The oldest `limit` rows that are targets. Rows a reference keeps are skipped, not counted, and more pages are
 * read for them: a backlog of permanently kept rows (flashcard pictures stay PENDING for good) at the front of the
 * order must not starve the sweep.
 */
async function collectTargets(deps: SweepDeps, now: Date, limit: number) {
  const where = candidateWhere(now);
  const targets: Target[] = [];
  let scanned = 0;
  let kept = 0;
  let capped = false;
  let cursor: string | undefined;

  for (let page = 0; page < MAX_SCAN_PAGES && !capped; page++) {
    const rows = await deps.prisma.media.findMany({
      where,
      select: { id: true, key: true, url: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }) as Target[];
    if (rows.length === 0) break;
    scanned += rows.length;

    const referenced = await referencedUrls(deps, [...new Set(rows.map((r) => r.url))]);
    for (const row of rows) {
      if (!sweepableKey(row.key) || referenced.has(row.url)) {
        kept++;
        continue;
      }
      if (targets.length >= limit) {
        capped = true;
        break;
      }
      targets.push(row);
    }

    if (rows.length < limit) break;
    cursor = rows[rows.length - 1]!.id;
    // A full last page may hide more; the loop ending here means this run stopped reading, not that it finished.
    if (page === MAX_SCAN_PAGES - 1) capped = true;
  }
  return { targets, scanned, kept, capped };
}

/**
 * The batch's rows that are still targets right now. The selection can be minutes old by the time a later
 * batch is reached; an upload attached or referenced in between must survive, so each batch is checked again,
 * by the same candidate query and the same reference check, immediately before its first delete.
 */
async function stillTargets(deps: SweepDeps, now: Date, batch: Target[]): Promise<Target[]> {
  const fresh = (await deps.prisma.media.findMany({
    where: { AND: [{ id: { in: batch.map((t) => t.id) } }, candidateWhere(now)] },
    select: { id: true, key: true, url: true },
  })) as Target[];
  const still = new Set(fresh.map((r) => r.id));
  const referenced = await referencedUrls(deps, [...new Set(batch.map((t) => t.url))]);
  return batch.filter((t) => still.has(t.id) && !referenced.has(t.url));
}

/** Which rule chose each target. Counts only; it never decides what is deleted. */
async function countByRule(deps: SweepDeps, targets: Target[]): Promise<Record<SweepRule, number>> {
  const byRule = Object.fromEntries(SWEEP_RULES.map((r) => [r, 0])) as Record<SweepRule, number>;
  for (const chunk of chunksOf(targets, REFERENCE_CHUNK)) {
    const rows = await deps.prisma.media.findMany({
      where: { id: { in: chunk.map((t) => t.id) } },
      select: { id: true, status: true, postId: true },
    }) as RuleRow[];
    const wanted = new Set(chunk.map((t) => t.id));
    for (const row of rows) {
      if (!wanted.has(row.id)) continue;
      if (row.status === "PENDING") byRule["orphan-pending"]++;
      else if (row.postId === null) byRule["hard-deleted-post"]++;
      else byRule["soft-deleted-post"]++;
    }
  }
  return byRule;
}

/**
 * Reclaim media no longer referenced by a live post:
 *  (a) PENDING uploads never attached within the orphan TTL (`orphan-pending`),
 *  (b) media whose post was soft-deleted past the grace period (`soft-deleted-post`), and
 *  (c) ATTACHED media whose post was hard-deleted (`hard-deleted-post`).
 * Self-healing — keys off post.deletedAt, not a delete-handler hook.
 *
 * A target whose URL is still referenced (`referencedUrls`: an unpublished scheduled post, a flashcard, a build, a
 * live post or chat message, a homes listing, an email campaign or a museum era) is never deleted.
 *
 * One run takes at most {@link SWEEP_ROW_CAP} rows, oldest first, and deletes them {@link SWEEP_BATCH} at a time.
 * A row's object (its smaller variants first) goes before the row; a row whose delete failed stays for the next
 * run. `dryRun` selects with the same query and the same exclusions and deletes nothing, so a preview lists what
 * the run then deletes. This is the one function behind the preview, "Run now" and the nightly job.
 */
export async function sweepMedia(deps: SweepDeps, opts: { dryRun?: boolean } = {}): Promise<SweepSummary> {
  const started = Date.now();
  const dryRun = opts.dryRun === true;
  const now = deps.now ?? new Date();

  const { targets, scanned, kept, capped } = await collectTargets(deps, now, SWEEP_ROW_CAP);
  const byRule = await countByRule(deps, targets);
  const summary: SweepSummary = {
    dryRun,
    scanned,
    kept,
    targets: targets.length,
    deleted: 0,
    failed: 0,
    byRule,
    capped,
    sampleKeys: dryRun ? targets.slice(0, SAMPLE_KEYS).map((t) => t.key) : [],
    durationMs: 0,
  };

  if (!dryRun) {
    for (const planned of chunksOf(targets, SWEEP_BATCH)) {
      const batch = await stillTargets(deps, now, planned);
      summary.kept += planned.length - batch.length;
      const succeededIds: string[] = [];
      for (const t of batch) {
        try {
          const variants = deps.variantKeys?.(t.key) ?? [];
          // Variants first: if one fails the row stays pointing at a live full-size object and the next run retries.
          for (const key of variants) await deps.deleteObject(key);
          await deps.deleteObject(t.key);
          for (const key of [...variants, t.key]) await deps.purgeFromCdn(key);
          succeededIds.push(t.id);
        } catch (err) {
          summary.failed++;
          console.error("[sweep] failed to delete an object or purge the CDN:", err instanceof Error ? err.name : "error");
        }
      }
      if (succeededIds.length === 0) continue;
      try {
        await deps.prisma.media.deleteMany({ where: { id: { in: succeededIds } } });
        summary.deleted += succeededIds.length;
      } catch (err) {
        // The objects are gone and the rows remain; the next run deletes them again (an object delete is idempotent).
        summary.failed += succeededIds.length;
        console.error("[sweep] failed to remove the rows of a batch:", err instanceof Error ? err.name : "error");
      }
    }
  }

  summary.durationMs = Date.now() - started;
  return summary;
}

/** {@link sweepMedia} reduced to the count. `dryRun` deletes nothing and reports 0. */
export async function sweepUnreferencedMedia(
  deps: SweepDeps,
  opts: { dryRun?: boolean } = {},
): Promise<{ deleted: number }> {
  const summary = await sweepMedia(deps, opts);
  return { deleted: summary.deleted };
}
