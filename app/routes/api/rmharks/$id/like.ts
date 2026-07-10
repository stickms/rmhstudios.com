import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";
import { togglePostLike } from "@/lib/social/engagement.server";

export const Route = createFileRoute('/api/rmharks/$id/like')({
  server: {
    handlers: {
  GET: async ({ params }) => {
  try {
    const { id } = params;
    const likes = await prisma.rMHarkLike.findMany({
      where: { rmheetId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: userDisplaySelect } },
    });
    return Response.json(
      likes.map((l) => ({ ...resolveUser(l.user), likedAt: l.createdAt }))
    );
  } catch (error) {
    console.error("Fetch likes error:", error);
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
      prefix: "rmhark-like",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { id } = params;
    const userId = session.user.id;

    // Toggle via the shared engagement service (counters, SSE, notifications,
    // XP, quests, achievements, and webhooks all live there).
    const result = await togglePostLike(userId, id);
    if (!result.found) {
      return Response.json({ error: "Post not found" }, { status: 404 });
    }
    return Response.json({ success: true, liked: result.liked });
  } catch (error) {
    console.error("Toggle like error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
