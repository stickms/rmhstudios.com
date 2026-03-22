import { createFileRoute } from '@tanstack/react-router';

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveUserDisplay } from "@/lib/user-display";

const MAX_COMMENT_LENGTH = 2000;

export const Route = createFileRoute('/api/slice-it/songs/$id/comments')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
    try {
        const { id } = params;
        const comments = await prisma.songComment.findMany({
            where: { songId: id },
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: { name: true, username: true, image: true, profile: { select: { displayName: true, customImage: true } } }
                }
            }
        });

        const formatted = comments.map((c: any) => {
            const resolved = resolveUserDisplay(c.user);
            return {
                id: c.id,
                content: c.content,
                createdAt: c.createdAt,
                user: {
                    name: resolved.name || c.user.username || "Unknown",
                    image: resolved.image
                }
            };
        });

        return Response.json(formatted);
    } catch (error) {
        console.error("Fetch comments error:", error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
},
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
            limit: 10,
            windowMs: 60_000,
            prefix: "slice-comments",
        });
        if (!allowed) {
            return Response.json(
                { error: "Too many requests" },
                { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
        }

        const { id } = params;
        const body = await request.json();
        const { content } = body;

        if (!content || typeof content !== "string") {
            return Response.json({ error: "Comment cannot be empty" }, { status: 400 });
        }
        const trimmed = content.trim();
        if (!trimmed) {
            return Response.json({ error: "Comment cannot be empty" }, { status: 400 });
        }
        if (trimmed.length > MAX_COMMENT_LENGTH) {
            return Response.json(
                { error: `Comment must be at most ${MAX_COMMENT_LENGTH} characters` },
                { status: 400 }
            );
        }

        const comment = await prisma.songComment.create({
            data: {
                content: trimmed,
                songId: id,
                userId: session.user.id
            },
            include: {
                user: {
                    select: { name: true, username: true, image: true, profile: { select: { displayName: true, customImage: true } } }
                }
            }
        });

        const resolved = resolveUserDisplay(comment.user);
        return Response.json({
            id: comment.id,
            content: comment.content,
            createdAt: comment.createdAt,
            user: {
                name: resolved.name || comment.user.username || "Unknown",
                image: resolved.image
            }
        });

    } catch (error) {
        console.error("Post comment error:", error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
},
    },
  },
});
