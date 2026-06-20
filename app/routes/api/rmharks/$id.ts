import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";
import { feedEventBus } from "@/lib/feed-sse";

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

    return Response.json({
      id: rmhark.id,
      type: "rmhark",
      createdAt: rmhark.createdAt.toISOString(),
      content: isDeleted ? deletedMessage : rmhark.content,
      user: resolveUser(rmhark.user),
      likeCount: rmhark.likeCount,
      commentCount: rmhark.commentCount,
      repostCount: rmhark.repostCount,
      viewCount: rmhark.viewCount,
      liked: userId ? rmhark.likes.length > 0 : false,
      reposted: userId ? rmhark.reposts.length > 0 : false,
      poll: isDeleted ? undefined : pollData,
      gifUrl: isDeleted ? undefined : (rmhark.gifUrl ?? undefined),
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
      select: { userId: true },
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

    await prisma.rMHark.update({
      where: { id },
      data: { deletedAt, deletedByAdmin },
    });

    // Broadcast deletion via SSE
    const deletedMessage = deletedByAdmin
      ? "[This RMHark was deleted by an admin]"
      : "[This RMHark was deleted by the user]";
    feedEventBus.publish({
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
    },
  },
});
