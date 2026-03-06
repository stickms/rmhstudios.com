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

import { feedEventBus, type FeedSSEEvent } from "@/lib/feed-sse";

export const Route = createFileRoute('/api/feed/stream')({
  server: {
    handlers: {
  GET: async () => {
  const encoder = new TextEncoder();

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
          send(event.type, JSON.stringify(event));
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
