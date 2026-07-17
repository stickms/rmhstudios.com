import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";
import { feedEventBus } from "@/lib/feed-sse";
import { unlinkPostHashtags } from "@/lib/tags-extract.server";
import { editRMHarkSchema } from "@/lib/rmhark-schema";
import { canViewPost } from "@/lib/feed/audience.server";
import { isLocked } from "@/lib/feed/map-feed-item.server";
import { logAdminAction } from "@/lib/admin-audit.server";

export const Route = createFileRoute('/api/rmharks/$id')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
  try {
    const { id } = params;

    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      userId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    const rmhark: any = await prisma.rMHark.findUnique({
      where: { id },
      include: {
        user: { select: userDisplaySelect },
        ...(userId
          ? {
              likes: { where: { userId }, select: { id: true } },
              reposts: { where: { userId }, select: { id: true } },
              unlocks: { where: { userId }, select: { id: true } },
            }
          : {}),
        poll: {
          include: {
            options: {
              orderBy: { position: "asc" as const },
              include: {
                _count: { select: { votes: true } },
                ...(userId
                  ? { votes: { where: { userId }, select: { id: true, optionId: true } } }
                  : {}),
              },
            },
          },
        },
        original: {
          include: {
            user: { select: userDisplaySelect },
          },
        },
      },
    });

    if (!rmhark) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    // Audience visibility — non-public posts 404 for viewers who can't see them.
    if (!(await canViewPost({ userId: rmhark.userId, audience: rmhark.audience }, userId))) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    let pollData;
    if (rmhark.poll && !rmhark.deletedAt) {
      const totalVotes = rmhark.poll.options.reduce(
        (sum: number, o: any) => sum + (o._count?.votes ?? 0),
        0
      );
      pollData = {
        id: rmhark.poll.id,
        question: rmhark.poll.question,
        multiSelect: rmhark.poll.multiSelect,
        totalVotes,
        options: rmhark.poll.options.map((o: any) => ({
          id: o.id,
          text: o.text,
          voteCount: o._count?.votes ?? 0,
        })),
        myVotes: rmhark.poll.options
          .filter((o: any) => o.votes?.length > 0)
          .map((o: any) => o.id),
      };
    }

    const isDeleted = !!rmhark.deletedAt;
    const deletedMessage = rmhark.deletedByAdmin
      ? "[This RMHark was deleted by an admin]"
      : "[This RMHark was deleted by the user]";

    const locked = !isDeleted && isLocked(rmhark, userId);

    return Response.json({
      id: rmhark.id,
      type: "rmhark",
      createdAt: rmhark.createdAt.toISOString(),
      content: isDeleted ? deletedMessage : locked ? "" : rmhark.content,
      user: resolveUser(rmhark.user),
      likeCount: rmhark.likeCount,
      commentCount: rmhark.commentCount,
      repostCount: rmhark.repostCount,
      viewCount: rmhark.viewCount,
      liked: userId ? rmhark.likes.length > 0 : false,
      reposted: userId ? rmhark.reposts.length > 0 : false,
      poll: isDeleted || locked ? undefined : pollData,
      gifUrl: isDeleted || locked ? undefined : (rmhark.gifUrl ?? undefined),
      imageUrls: isDeleted || locked ? undefined : rmhark.imageUrls,
      locked,
      unlockPrice: rmhark.unlockPrice ?? undefined,
      deletedAt: rmhark.deletedAt?.toISOString() || null,
      deletedByAdmin: rmhark.deletedByAdmin,
      original: rmhark.original
        ? {
            id: rmhark.original.id,
            type: "rmhark",
            createdAt: rmhark.original.createdAt.toISOString(),
            content: rmhark.original.content,
            user: resolveUser(rmhark.original.user),
            likeCount: rmhark.original.likeCount,
            commentCount: rmhark.original.commentCount,
            repostCount: rmhark.original.repostCount,
            viewCount: rmhark.original.viewCount,
          }
        : undefined,
    });
  } catch (error) {
    console.error("Get RMHark error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
  DELETE: async ({ request, params }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;

    const rmhark = await prisma.rMHark.findUnique({
      where: { id },
      select: { userId: true, deletedAt: true },
    });

    if (!rmhark) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const isAdmin = !!(session.user as any).isAdmin;
    if (rmhark.userId !== session.user.id && !isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const deletedByAdmin = isAdmin && rmhark.userId !== session.user.id;
    const deletedAt = new Date();
    // Only the first delete transitions the post out of the feed; guard the
    // one-shot side effects (hashtag unlink, author post-count decrement) so a
    // re-delete (e.g. admin re-flagging a user-deleted post) can't double-count.
    const firstDelete = !rmhark.deletedAt;

    await prisma.$transaction(async (tx) => {
      await tx.rMHark.update({
        where: { id },
        data: { deletedAt, deletedByAdmin },
      });
      if (firstDelete) {
        // Drop the post's hashtag links (keeps trending counts accurate).
        await unlinkPostHashtags(tx, id);
        // Decrement the AUTHOR's denormalized post count (never below zero).
        await tx.user.updateMany({
          where: { id: rmhark.userId, postCount: { gt: 0 } },
          data: { postCount: { decrement: 1 } },
        });
      }
    });

    // Record admin moderation (deleting another user's post).
    if (deletedByAdmin) {
      await logAdminAction(session.user.id, 'rmhark.delete', {
        targetType: 'RMHark',
        targetId: id,
        detail: `author:${rmhark.userId}`,
      });
    }

    // Broadcast deletion via SSE
    const deletedMessage = deletedByAdmin
      ? "[This RMHark was deleted by an admin]"
      : "[This RMHark was deleted by the user]";
    feedEventBus.publishPostEngagement(id, {
      type: "rmhark.deleted",
      rmharkId: id,
      payload: {
        id,
        deletedAt: deletedAt.toISOString(),
        deletedByAdmin,
        content: deletedMessage,
      },
      timestamp: deletedAt.toISOString(),
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete RMHark error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
  PATCH: async ({ request, params }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await request.json().catch(() => ({}));
    const parsed = editRMHarkSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const content = parsed.data.content.trim();
    const gifUrlProvided = Object.prototype.hasOwnProperty.call(body, "gifUrl");
    const nextGifUrl = parsed.data.gifUrl ?? null;

    const existing = await prisma.rMHark.findUnique({
      where: { id },
      select: { userId: true, content: true, deletedAt: true, unlockPrice: true, gifUrl: true },
    });
    if (!existing || existing.deletedAt) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.userId !== session.user.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const existingHasGif = !!existing.gifUrl;
    if (!content && !(gifUrlProvided ? nextGifUrl : existingHasGif)) {
      return Response.json({ error: "Post cannot be empty" }, { status: 400 });
    }
    if (existing.content === content && (!gifUrlProvided || existing.gifUrl === nextGifUrl)) {
      return Response.json({ success: true, content, gifUrl: existing.gifUrl ?? undefined, editedAt: null });
    }

    // Snapshot the previous version, then apply the edit.
    const editedAt = new Date();
    await prisma.$transaction([
      prisma.rMHarkEdit.create({ data: { rmheetId: id, content: existing.content } }),
      prisma.rMHark.update({
        where: { id },
        data: { content, editedAt, ...(gifUrlProvided ? { gifUrl: nextGifUrl } : {}) },
      }),
    ]);

    feedEventBus.publishPostEngagement(id, {
      type: "rmhark.edited",
      rmharkId: id,
      // For paid posts, broadcast the locked teaser (no content) to followers.
      payload:
        existing.unlockPrice && existing.unlockPrice > 0
          ? { id, content: "", locked: true, unlockPrice: existing.unlockPrice, edited: true }
          : { id, content, edited: true },
      timestamp: editedAt.toISOString(),
    });

    return Response.json({ success: true, content, gifUrl: gifUrlProvided ? nextGifUrl ?? undefined : existing.gifUrl ?? undefined, editedAt: editedAt.toISOString() });
  } catch (error) {
    console.error("Edit RMHark error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
