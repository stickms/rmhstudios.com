import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';
import { readCurrentTick, subscribeToWatchState } from '@/lib/sohumtracker/stream.server';
import type { WatchTickDTO } from '@/lib/sohumtracker/types';

/**
 * GET /api/sohumtracker/stream — live pushes for the dossier.
 *
 * SSE rather than the page polling: the whole premise is watching a number go
 * up, and a poll is either too slow to feel live or too frequent to be cheap.
 * One shared watcher (`stream.server.ts`) reads the database and fans out to
 * every connection, so a room full of viewers costs one query per tick.
 *
 * The first message is the current state, so a page that connects mid-session
 * is correct immediately rather than after the first change.
 *
 * `auth: 'none'`: the page is public and every viewer gets the same bytes.
 * The rate limit is per-identity and generous — it exists to stop connection
 * flooding, not to ration someone with a few tabs open.
 */

/** Below the 30–60s idle timeout of every proxy in the path (Apache, Cloudflare). */
const KEEPALIVE_MS = 20_000;

export const Route = createFileRoute('/api/sohumtracker/stream')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ request }) => {
        const identity = `ip:${getClientIp(request)}`;
        const rl = await checkRateLimit(identity, {
          limit: 15,
          windowMs: 60_000,
          prefix: 'sohumtracker:stream',
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
          async start(controller) {
            const send = (event: string, data: unknown) => {
              try {
                controller.enqueue(
                  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
                );
              } catch {
                // Reader is gone; `cancel` will clean up.
              }
            };

            // Seed with the current state before subscribing, so a connection
            // opened between two changes is not blank until the next one.
            try {
              send('tick', await readCurrentTick());
            } catch {
              // The page still has its server-rendered state; the next tick
              // will correct it.
            }

            unsubscribe = subscribeToWatchState((tick: WatchTickDTO) => send('tick', tick));

            keepalive = setInterval(() => {
              try {
                // A comment frame: valid SSE, ignored by EventSource, and enough
                // traffic to stop an idle proxy reaping the connection.
                controller.enqueue(encoder.encode(': ping\n\n'));
              } catch {
                // Same as above.
              }
            }, KEEPALIVE_MS);
          },
          // Fires when the client disconnects — a closed tab, a navigation, or
          // an EventSource.close(). This is what releases the shared watcher's
          // refcount, so the last viewer leaving really does stop the polling.
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
      }),
    },
  },
});
