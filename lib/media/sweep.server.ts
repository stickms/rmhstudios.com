import { orphanCutoff, deletedPostCutoff } from "@/lib/media/sweep-policy";

interface Target { id: string; key: string }

export interface SweepDeps {
  prisma: {
    media: {
      findMany(args: { where: unknown; select: { id: true; key: true } }): Promise<Target[]>;
      deleteMany(args: { where: { id: { in: string[] } } }): Promise<{ count: number }>;
    };
  };
  deleteObject(key: string): Promise<void>;
  purgeFromCdn(key: string): Promise<void>;
  now?: Date;
}

/**
 * Reclaim media no longer referenced by a live post:
 *  (a) PENDING uploads never attached within the orphan TTL, and
 *  (b) media whose post was soft-deleted past the grace period.
 * Self-healing — keys off post.deletedAt, not a delete-handler hook.
 */
export async function sweepUnreferencedMedia(deps: SweepDeps): Promise<{ deleted: number }> {
  const now = deps.now ?? new Date();

  const targets = await deps.prisma.media.findMany({
    where: {
      OR: [
        { status: "PENDING", createdAt: { lt: orphanCutoff(now) } },
        { post: { deletedAt: { not: null, lt: deletedPostCutoff(now) } } },
        { status: "ATTACHED", postId: null, createdAt: { lt: deletedPostCutoff(now) } },
      ],
    },
    select: { id: true, key: true },
  });

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
