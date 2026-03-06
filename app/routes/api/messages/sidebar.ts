import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUserDisplay } from "@/lib/user-display";

/** GET /api/messages/sidebar — previously messaged + suggested users */

export const Route = createFileRoute('/api/messages/sidebar')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ recent: [], suggested: [] });
    }

    const userId = session.user.id;

    // Previously messaged: users from recent conversations
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { participantOneId: userId },
          { participantTwoId: userId },
        ],
      },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
      include: {
        participantOne: {
          select: {
            id: true,
            name: true,
            image: true,
            username: true,
            profile: { select: { displayName: true, customImage: true } },
          },
        },
        participantTwo: {
          select: {
            id: true,
            name: true,
            image: true,
            username: true,
            profile: { select: { displayName: true, customImage: true } },
          },
        },
      },
    });

    const recentUserIds = new Set<string>();
    const recent = conversations.map((conv) => {
      const other =
        conv.participantOneId === userId
          ? conv.participantTwo
          : conv.participantOne;
      recentUserIds.add(other.id);
      const resolved = resolveUserDisplay(other);
      return {
        id: other.id,
        name: resolved.name,
        image: resolved.image,
        username: other.username,
      };
    });

    // Suggested: users the current user follows but hasn't messaged
    const excludeIds = [userId, ...recentUserIds];
    const following = await prisma.follow.findMany({
      where: {
        followerId: userId,
        followingId: { notIn: excludeIds },
      },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        following: {
          select: {
            id: true,
            name: true,
            image: true,
            username: true,
            profile: { select: { displayName: true, customImage: true } },
          },
        },
      },
    });

    const suggested = following.map((f) => {
      const resolved = resolveUserDisplay(f.following);
      return {
        id: f.following.id,
        name: resolved.name,
        image: resolved.image,
        username: f.following.username,
      };
    });

    return Response.json({ recent, suggested });
  } catch (error) {
    console.error("Messages sidebar error:", error);
    return Response.json({ recent: [], suggested: [] });
  }
},
    },
  },
});
