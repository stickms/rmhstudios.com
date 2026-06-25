import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { logAdminAction } from "@/lib/admin-audit.server";

export const Route = createFileRoute('/api/rmharks/$id/comment/$commentId')({
  server: {
    handlers: {
  DELETE: async ({ params, request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { commentId } = params;

    const comment = await prisma.rMHarkComment.findUnique({
      where: { id: commentId },
      select: { userId: true },
    });

    if (!comment) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const isAdmin = !!(session.user as any).isAdmin;
    if (comment.userId !== session.user.id && !isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const deletedByAdmin = isAdmin && comment.userId !== session.user.id;
    await prisma.rMHarkComment.update({
      where: { id: commentId },
      data: {
        deletedAt: new Date(),
        deletedByAdmin,
      },
    });

    if (deletedByAdmin) {
      await logAdminAction(session.user.id, 'rmhark.comment.delete', {
        targetType: 'RMHarkComment',
        targetId: commentId,
        detail: `author:${comment.userId}`,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete comment error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
