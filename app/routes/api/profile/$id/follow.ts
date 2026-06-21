import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createNotification, removeNotification } from "@/lib/notifications.server";
import { progressAchievement } from "@/lib/achievements/engine.server";

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
      await removeNotification({
        userId: followingId,
        actorId: followerId,
        type: "FOLLOW",
        entityType: "user",
        entityId: followerId,
      });
      return Response.json({ success: true, following: false });
    } else {
      await prisma.follow.create({
        data: { followerId, followingId },
      });
      const followerHandle = (session.user as { handle?: string }).handle;
      await createNotification({
        userId: followingId,
        actorId: followerId,
        type: "FOLLOW",
        entityType: "user",
        entityId: followerId,
        link: followerHandle ? `/u/${followerHandle}` : undefined,
        dedupeUnread: true,
      });

      // Follower-count milestones for the user who was followed.
      try {
        const followerCount = await prisma.follow.count({ where: { followingId } });
        await progressAchievement(followingId, "social.first_follower", { setProgress: followerCount });
        await progressAchievement(followingId, "social.followers_50", { setProgress: followerCount });
        await progressAchievement(followingId, "social.followers_500", { setProgress: followerCount });
      } catch (e) {
        console.error("follow achievement error:", e);
      }

      return Response.json({ success: true, following: true });
    }
  } catch (error) {
    console.error("Toggle follow error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
