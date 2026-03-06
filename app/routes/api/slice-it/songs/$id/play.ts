import { createFileRoute } from '@tanstack/react-router';
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const Route = createFileRoute('/api/slice-it/songs/$id/play')({
  server: {
    handlers: {
  POST: async ({ request, params }) => {
    try {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
            limit: 5,
            windowMs: 60_000,
            prefix: "slice-play",
        });

        if (!allowed) {
            return Response.json(
                { error: "Too many requests" },
                { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
        }

        const { id } = params;

        const session = await auth.api.getSession({ headers: request.headers });
        const userId = session?.user?.id;

        const [song] = await Promise.all([
            prisma.song.update({
                where: { id },
                data: { plays: { increment: 1 } }
            }),
            userId
                ? prisma.songPlay.upsert({
                    where: { songId_userId: { songId: id, userId } },
                    create: { songId: id, userId, count: 1, lastPlayedAt: new Date() },
                    update: { count: { increment: 1 }, lastPlayedAt: new Date() }
                })
                : Promise.resolve(null)
        ]);

        return Response.json({ success: true, plays: song.plays });

    } catch (error) {
        console.error("Increment play error:", error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
},
    },
  },
});
