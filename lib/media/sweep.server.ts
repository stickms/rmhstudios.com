import { orphanCutoff, deletedPostCutoff } from "@/lib/media/sweep-policy";

interface Target { id: string; key: string; url: string }

type FindMany<Row> = (args: { where: unknown; select: Record<string, true> }) => Promise<Row[]>;

export interface SweepDeps {
  prisma: {
    media: {
      findMany: FindMany<Target>;
      deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
    };
    // Surfaces that keep an upload by its URL rather than by flipping the row to
    // ATTACHED at the moment they are saved (s08-03, s08-15, s07-17). A target
    // any of them still names is kept, whatever its status says.
    scheduledPost: { findMany: FindMany<{ imageUrls: string[] }> };
    flashcard: { findMany: FindMany<{ frontImageUrl: string | null; backImageUrl: string | null }> };
    buildScreenshot: { findMany: FindMany<{ url: string }> };
    userBuild: { findMany: FindMany<{ thumbnailUrl: string | null }> };
  };
  deleteObject(key: string): Promise<void>;
  purgeFromCdn(key: string): Promise<void>;
  now?: Date;
}

/** URLs per reference query: keeps each `IN (...)` list bounded. */
const REFERENCE_CHUNK = 500;

/**
 * The target URLs something still points at:
 *  - an unpublished ScheduledPost (a draft or a scheduled post whose developer
 *    API uploads stay PENDING until `publishScheduledPost` attaches them),
 *  - a flashcard side (copies share one object by URL),
 *  - a build screenshot or a build cover.
 */
async function referencedUrls(deps: SweepDeps, urls: string[]): Promise<Set<string>> {
  const kept = new Set<string>();
  for (let i = 0; i < urls.length; i += REFERENCE_CHUNK) {
    const chunk = urls.slice(i, i + REFERENCE_CHUNK);
    const [scheduled, cards, shots, builds] = await Promise.all([
      deps.prisma.scheduledPost.findMany({
        where: { publishedId: null, imageUrls: { hasSome: chunk } },
        select: { imageUrls: true },
      }),
      deps.prisma.flashcard.findMany({
        where: { OR: [{ frontImageUrl: { in: chunk } }, { backImageUrl: { in: chunk } }] },
        select: { frontImageUrl: true, backImageUrl: true },
      }),
      deps.prisma.buildScreenshot.findMany({ where: { url: { in: chunk } }, select: { url: true } }),
      deps.prisma.userBuild.findMany({ where: { thumbnailUrl: { in: chunk } }, select: { thumbnailUrl: true } }),
    ]);
    for (const s of scheduled) for (const u of s.imageUrls) kept.add(u);
    for (const c of cards) {
      if (c.frontImageUrl) kept.add(c.frontImageUrl);
      if (c.backImageUrl) kept.add(c.backImageUrl);
    }
    for (const s of shots) kept.add(s.url);
    for (const b of builds) if (b.thumbnailUrl) kept.add(b.thumbnailUrl);
  }
  return kept;
}

/**
 * Reclaim media no longer referenced by a live post:
 *  (a) PENDING uploads never attached within the orphan TTL, and
 *  (b) media whose post was soft-deleted past the grace period.
 * Self-healing — keys off post.deletedAt, not a delete-handler hook.
 *
 * A target whose URL is still referenced by an unpublished scheduled post, a
 * flashcard or a build (screenshot or cover) is never deleted.
 */
export async function sweepUnreferencedMedia(deps: SweepDeps): Promise<{ deleted: number }> {
  const now = deps.now ?? new Date();

  const candidates = await deps.prisma.media.findMany({
    where: {
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
    },
    select: { id: true, key: true, url: true },
  });

  if (candidates.length === 0) return { deleted: 0 };

  const kept = await referencedUrls(deps, [...new Set(candidates.map((c) => c.url))]);
  const targets = candidates.filter((c) => !kept.has(c.url));
  if (targets.length === 0) return { deleted: 0 };

  const succeededIds: string[] = [];
  for (const t of targets) {
    try {
      await deps.deleteObject(t.key);
      await deps.purgeFromCdn(t.key);
      succeededIds.push(t.id);
    } catch (err) {
      console.error(`[sweep] failed to delete object/CDN for key ${t.key}:`, err);
    }
  }

  if (succeededIds.length === 0) return { deleted: 0 };

  await deps.prisma.media.deleteMany({ where: { id: { in: succeededIds } } });
  return { deleted: succeededIds.length };
}
