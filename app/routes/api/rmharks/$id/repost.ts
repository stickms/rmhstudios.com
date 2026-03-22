import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";
import { feedEventBus } from "@/lib/feed-sse";

export const Route = createFileRoute('/api/rmharks/$id/repost')({
  server: {
    handlers: {
  GET: async ({ params }) => {
  try {
    const { id } = params;
    const reposts = await prisma.rMHarkRepost.findMany({
      where: { rmheetId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: userDisplaySelect } },
    });
    return Response.json(
      reposts.map((r) => ({ ...resolveUser(r.user), repostedAt: r.createdAt }))
    );
  } catch (error) {
    console.error("Fetch reposts error:", error);
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
      prefix: "rmhark-repost",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { id } = params;
    const userId = session.user.id;

    const existingRepost = await prisma.rMHarkRepost.findUnique({
      where: { rmheetId_userId: { rmheetId: id, userId } },
    });

    if (existingRepost) {
      await prisma.rMHarkRepost.delete({ where: { id: existingRepost.id } });

      const count = await prisma.rMHarkRepost.count({ where: { rmheetId: id } });
      feedEventBus.publish({
        type: "rmhark.unreposted",
        rmharkId: id,
        payload: { id, repostCount: count },
        timestamp: new Date().toISOString(),
      });

      return Response.json({ success: true, reposted: false });
    } else {
      await prisma.rMHarkRepost.create({ data: { rmheetId: id, userId } });

      const count = await prisma.rMHarkRepost.count({ where: { rmheetId: id } });
      feedEventBus.publish({
        type: "rmhark.reposted",
        rmharkId: id,
        payload: { id, repostCount: count },
        timestamp: new Date().toISOString(),
      });

      return Response.json({ success: true, reposted: true });
    }
  } catch (error) {
    console.error("Toggle repost error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
