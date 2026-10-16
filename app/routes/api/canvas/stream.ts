import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';
import { canvasBus } from '@/lib/canvas/live.server';
import { canvasEventQuery, type CanvasBatch } from '@/lib/canvas/shared';

/** Below the idle timeout of every proxy in the path. */
const KEEPALIVE_MS = 20_000;

/** GET /api/canvas/stream?id= — SSE of batched pixel placements (at most 4 frames/sec). */
export const Route = createFileRoute('/api/canvas/stream')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', query: canvasEventQuery },
        async ({ request, userId, query }) => {
          const identity = userId ?? `ip:${getClientIp(request)}`;
          const rl = await checkRateLimit(identity, {
            limit: 20,
            windowMs: 60_000,
            prefix: 'canvas:stream',
          });
          if (!rl.allowed) {
            return new Response('Too Many Connections', {
              status: 429,
              headers: { 'Retry-After': String(rl.retryAfter || 60) },
            });
          }
          const encoder = new TextEncoder();
          let unsubscribe = () => {};
          let keepalive: ReturnType<typeof setInterval> | null = null;
          const stream = new ReadableStream({
            start(controller) {
              const write = (chunk: string) => {
                try {
                  controller.enqueue(encoder.encode(chunk));
                } catch {
                  // Reader is gone; `cancel` cleans up.
                }
              };
              write('event: connected\ndata: {}\n\n');
              unsubscribe = canvasBus.subscribe(query.id, (batch: CanvasBatch) =>
                write(`event: pixels\ndata: ${JSON.stringify(batch)}\n\n`),
              );
              keepalive = setInterval(() => write(': ping\n\n'), KEEPALIVE_MS);
            },
            cancel() {
              unsubscribe();
              if (keepalive) clearInterval(keepalive);
            },
          });
          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            },
          });
        },
      ),
    },
  },
});
