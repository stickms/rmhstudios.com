import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { toggleFollow } from "@/lib/social/engagement.server";

export const Route = createFileRoute('/api/profile/$id/follow')({
  server: {
    handlers: {
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
      prefix: "follow-toggle",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { id: idOrHandle } = params;
    const resolvedUser = await prisma.user.findUnique({ where: { handle: idOrHandle }, select: { id: true } });
    const followingId = resolvedUser?.id ?? idOrHandle;
    const followerId = session.user.id;
    const followerHandle = (session.user as { handle?: string }).handle ?? null;

    const result = await toggleFollow({ followerId, followingId, followerHandle });
    if (result.selfFollow) return Response.json({ error: "Cannot follow yourself" }, { status: 400 });
    if (!result.found) return Response.json({ error: "User not found" }, { status: 404 });
    return Response.json({ success: true, following: result.following });
  } catch (error) {
    console.error("Toggle follow error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
