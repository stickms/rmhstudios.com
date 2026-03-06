import { createAPIFileRoute } from "@tanstack/react-start/api";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";

export const APIRoute = createAPIFileRoute("/api/rmharks/$id/comment/$commentId/repost")({
  GET: async ({ params }) => {
  try {
    const { commentId } = params;
    const reposts = await prisma.rMHarkCommentRepost.findMany({
      where: { commentId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: userDisplaySelect } },
    });
    return Response.json(
      reposts.map((r) => ({ ...resolveUser(r.user), repostedAt: r.createdAt }))
    );
  } catch (error) {
    console.error("Fetch comment reposts error:", error);
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
      limit: 20,
      windowMs: 60_000,
      prefix: "comment-repost",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { commentId } = params;
    const userId = session.user.id;

    const existing = await prisma.rMHarkCommentRepost.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (existing) {
      await prisma.rMHarkCommentRepost.delete({ where: { id: existing.id } });
      return Response.json({ success: true, reposted: false });
    } else {
      await prisma.rMHarkCommentRepost.create({ data: { commentId, userId } });
      return Response.json({ success: true, reposted: true });
    }
  } catch (error) {
    console.error("Toggle comment repost error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
});
