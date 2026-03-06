import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";

export const Route = createFileRoute('/api/rmharks/$id/comment/$commentId/like')({
  server: {
    handlers: {
  GET: async ({ params }) => {
  try {
    const { commentId } = params;
    const likes = await prisma.rMHarkCommentLike.findMany({
      where: { commentId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: userDisplaySelect } },
    });
    return Response.json(
      likes.map((l) => ({ ...resolveUser(l.user), likedAt: l.createdAt }))
    );
  } catch (error) {
    console.error("Fetch comment likes error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
  POST: async ({ request, params }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 30,
      windowMs: 60_000,
      prefix: "comment-like",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { commentId } = params;
    const userId = session.user.id;

    const existing = await prisma.rMHarkCommentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (existing) {
      await prisma.rMHarkCommentLike.delete({ where: { id: existing.id } });
      return Response.json({ success: true, liked: false });
    } else {
      await prisma.rMHarkCommentLike.create({ data: { commentId, userId } });
      return Response.json({ success: true, liked: true });
    }
  } catch (error) {
    console.error("Toggle comment like error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
