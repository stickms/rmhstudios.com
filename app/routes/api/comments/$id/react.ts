import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { isValidReactionEmoji } from "@/lib/social/reactions";
import { toggleCommentReaction } from "@/lib/social/reactions.server";

/** POST /api/comments/$id/react — toggle an emoji reaction on a comment. */
export const Route = createFileRoute('/api/comments/$id/react')({
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
      limit: 60,
      windowMs: 60_000,
      prefix: "reaction",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { id } = params;
    const userId = session.user.id;

    const body = await request.json().catch(() => null);
    const parsed = z.object({ emoji: z.string().min(1).max(32) }).safeParse(body);
    if (!parsed.success || !isValidReactionEmoji(parsed.data.emoji)) {
      return Response.json({ error: "Invalid emoji" }, { status: 400 });
    }

    const result = await toggleCommentReaction(userId, id, parsed.data.emoji);
    if (!result.found) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ success: true, reacted: result.reacted, reactions: result.rows });
  } catch (error) {
    console.error("Toggle reaction error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
