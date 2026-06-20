import { createFileRoute } from '@tanstack/react-router';
/**
 * SSE stream endpoint for real-time feed updates.
 *
 * GET /api/feed/stream
 *
 * Returns a `text/event-stream` response that pushes feed events
 * (new rmharks, likes, comments, deletes, reposts) to connected clients.
 * Sends a keepalive ping every 20 seconds to prevent proxy timeouts.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { feedEventBus, type FeedSSEEvent } from "@/lib/feed-sse";

export const Route = createFileRoute('/api/feed/stream')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  const encoder = new TextEncoder();

  // Identify the viewer and load their follow graph once per connection so
  // we can target `rmhark.created` events instead of broadcasting every
  // stranger's post to everyone (Phase 3 of docs/feed/plan.md).
  let viewerId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    viewerId = session?.user?.id ?? null;
  } catch {
    // Anonymous viewer — only engagement (idempotent) events apply.
  }

  let followingIds = new Set<string>();
  if (viewerId) {
    try {
      const follows = await prisma.follow.findMany({
        where: { followerId: viewerId },
        select: { followingId: true },
      });
      followingIds = new Set(follows.map((f) => f.followingId));
    } catch {
      // Best-effort; fall back to no targeting boost.
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      // Helper to send an SSE message
      const send = (event: string, data: string) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      };

      // Send initial connection confirmation
      send("connected", JSON.stringify({ ok: true }));

      // Subscribe to the feed event bus
      const unsubscribe = feedEventBus.subscribe((event: FeedSSEEvent) => {
        try {
          if (event.targetUserIds) {
            // Targeted event (e.g. a mention notification): deliver only to the
            // named viewers, never broadcast to anyone else.
            if (viewerId && event.targetUserIds.includes(viewerId)) {
              send(event.type, JSON.stringify(event));
            }
            return;
          }
          if (event.type === "rmhark.created") {
            // Attach per-viewer delivery metadata so the client can route the
            // post into Following (auto-prepend) vs For You ("N new" pill).
            const authorId = event.authorId;
            const delivery = {
              followed: !!authorId && followingIds.has(authorId),
              own: !!authorId && authorId === viewerId,
            };
            send(event.type, JSON.stringify({ ...event, delivery }));
          } else {
            // Engagement / delete events are idempotent patches keyed by post
            // id — cheap to broadcast to everyone.
            send(event.type, JSON.stringify(event));
          }
        } catch {
          // Client disconnected — will be cleaned up by cancel()
        }
      });

      // Keepalive ping every 20s to prevent proxy/CDN timeouts
      const pingInterval = setInterval(() => {
        try {
          send("ping", JSON.stringify({ t: Date.now() }));
        } catch {
          clearInterval(pingInterval);
        }
      }, 20_000);

      // Store cleanup refs on the controller for cancel()
      (controller as any).__feedCleanup = () => {
        unsubscribe();
        clearInterval(pingInterval);
      };
    },
    cancel(controller) {
      (controller as any)?.__feedCleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
},
    },
  },
});
