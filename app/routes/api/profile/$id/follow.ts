import { createAPIFileRoute } from "@tanstack/react-start/api";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const APIRoute = createAPIFileRoute("/api/profile/$id/follow")({
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

    if (followingId === followerId) {
      return Response.json({ error: "Cannot follow yourself" }, { status: 400 });
    }

    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

    if (existingFollow) {
      await prisma.follow.delete({ where: { id: existingFollow.id } });
      return Response.json({ success: true, following: false });
    } else {
      await prisma.follow.create({
        data: { followerId, followingId },
      });
      return Response.json({ success: true, following: true });
    }
  } catch (error) {
    console.error("Toggle follow error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
});
