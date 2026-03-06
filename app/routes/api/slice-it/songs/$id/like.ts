import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const Route = createFileRoute('/api/slice-it/songs/$id/like')({
  server: {
    handlers: {
  POST: async ({ request, params }) => {
    try {
        const session = await auth.api.getSession({
            headers: request.headers
        });
        
        if (!session) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
            limit: 20,
            windowMs: 60_000,
            prefix: "slice-like",
        });
        if (!allowed) {
            return Response.json(
                { error: "Too many requests" },
                { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
        }

        const { id } = params;
        const userId = session.user.id;

        // Check if already liked
        const existingLike = await prisma.songLike.findUnique({
            where: {
                songId_userId: {
                    songId: id,
                    userId: userId
                }
            }
        });

        if (existingLike) {
            // Unlike
            await prisma.songLike.delete({
                where: {
                    id: existingLike.id
                }
            });
            return Response.json({ success: true, liked: false });
        } else {
            // Like
            await prisma.songLike.create({
                data: {
                    songId: id,
                    userId: userId
                }
            });
            return Response.json({ success: true, liked: true });
        }

    } catch (error) {
        console.error("Toggle like error:", error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
},
    },
  },
});
