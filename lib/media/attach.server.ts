import { isMediaId } from "@/lib/media/id";
import { attachError, MAX_MEDIA_PER_POST } from "@/lib/media/policy";

interface MediaRow { id: string; url: string; userId: string; status: string }

export interface AttachDeps {
  prisma: {
    media: {
      findMany(args: { where: { id: { in: string[] } } }): Promise<MediaRow[]>;
      updateMany(
        args:
          | {
              where: { id: { in: string[] }; status: "PENDING" };
              data: { status: "ATTACHED"; postId: string; attachedAt: Date };
            }
          | {
              where: { id: { in: string[] }; status: "ATTACHED"; postId: string };
              data: { status: "PENDING"; postId: null; attachedAt: null };
            },
      ): Promise<{ count: number }>;
    };
  };
}

export async function resolveMediaForPost(
  deps: AttachDeps,
  args: { userId: string; mediaIds: string[]; postId: string; now?: Date }
): Promise<{ ok: true; urls: string[] } | { ok: false; error: string }> {
  const { userId, mediaIds, postId } = args;
  if (mediaIds.length === 0) return { ok: true, urls: [] };
  if (mediaIds.length > MAX_MEDIA_PER_POST) {
    return { ok: false, error: `At most ${MAX_MEDIA_PER_POST} images per post.` };
  }
  if (!mediaIds.every(isMediaId)) return { ok: false, error: "Media not found." };

  const rows = await deps.prisma.media.findMany({ where: { id: { in: mediaIds } } });
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const id of mediaIds) {
    const err = attachError(byId.get(id) ?? null, userId);
    if (err) return { ok: false, error: err };
  }

  // Guarded flip: only rows still PENDING move. If the count doesn't match, a
  // concurrent attach won the race for one of them.
  const { count } = await deps.prisma.media.updateMany({
    where: { id: { in: mediaIds }, status: "PENDING" },
    data: { status: "ATTACHED", postId, attachedAt: args.now ?? new Date() },
  });
  if (count !== mediaIds.length) {
    // Undo the flips this call DID make (scoped to our postId, so a racing
    // attach's rows are untouched). Left in place they would point at a post
    // the caller is about to delete, and the upload could never be reused.
    if (count > 0) {
      await deps.prisma.media.updateMany({
        where: { id: { in: mediaIds }, status: "ATTACHED", postId },
        data: { status: "PENDING", postId: null, attachedAt: null },
      });
    }
    return { ok: false, error: "One or more media were already attached." };
  }

  // Preserve caller's order.
  return { ok: true, urls: mediaIds.map((id) => byId.get(id)!.url) };
}
