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

import { auth } from '@/lib/auth';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { feedEventBus, type FeedSSEEvent } from '@/lib/feed-sse';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';

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
          // Anonymous viewer — only the broadcast `feed:created` channel applies.
        }

        // Per-identity connection cap so a client can't open unlimited streams. The
        // client uses a singleton EventSource with exponential backoff, so real users
        // (even with many tabs + reconnects) stay far under these ceilings; the cap
        // only stops connection-flooding. Limits are intentionally generous and the
        // ×4 RATE_LIMIT_MULTIPLIER applies on top:
        //   - authed: 30 → ~120 new connections / min per user
        //   - anon:   15 → ~60  new connections / min per IP (capped harder)
        const ip = getClientIp(request);
        const identity = viewerId ?? `ip:${ip}`;
        const rl = await checkRateLimit(identity, {
          limit: viewerId ? 30 : 15,
          windowMs: 60_000,
          prefix: 'feed:stream',
        });
        if (!rl.allowed) {
          return new Response('Too Many Connections', {
            status: 429,
            headers: { 'Retry-After': String(rl.retryAfter || 60) },
          });
        }

        let followingIds = new Set<string>();
        if (viewerId) {
          try {
            // Shared cached follow graph (30s TTL). The connection captures the set
            // once, as before — a new follow is reflected on reconnect.
            followingIds = new Set(await getFollowingIds(viewerId));
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
            send('connected', JSON.stringify({ ok: true }));

            // New posts: broadcast channel. Attach per-viewer delivery metadata so the
            // client can route the post into Following (auto-prepend) vs For You
            // ("N new" pill). The event payload shape is unchanged — only `delivery`
            // is added, exactly as before.
            const unsubCreated = feedEventBus.subscribeCreated((event: FeedSSEEvent) => {
              try {
                const authorId = event.authorId;
                const delivery = {
                  followed: !!authorId && followingIds.has(authorId),
                  own: !!authorId && authorId === viewerId,
                };
                send(event.type, JSON.stringify({ ...event, delivery }));
              } catch {
                // Client disconnected — will be cleaned up by cancel()
              }
            });

            // Targeted events (e.g. mention notifications): only this viewer's own
            // per-user channel, never the global firehose. Anonymous viewers have no
            // per-user channel.
            let unsubUser = () => {};
            if (viewerId) {
              unsubUser = feedEventBus.subscribeUser(viewerId, (event: FeedSSEEvent) => {
                try {
                  send(event.type, JSON.stringify(event));
                } catch {
                  // Client disconnected — cleaned up by cancel()
                }
              });
            }

            // NOTE: engagement patches (like/comment/repost/edit/delete counts) now
            // ride per-post `feed:post:<id>` channels. This connection does NOT
            // subscribe to them, because the server cannot know which posts this
            // viewer currently has on screen without input the client does not yet
            // send. Consequently, passive live count updates for strangers' posts are
            // no longer pushed to every client (they reconcile on refetch, and the
            // viewer's own actions already update optimistically). To restore live
            // counts for on-screen posts, the client should report its visible post
            // ids so the endpoint can `feedEventBus.subscribePost(id, …)` for exactly
            // those — see the client follow-up flagged in the change notes.

            // Keepalive ping every 20s to prevent proxy/CDN timeouts
            const pingInterval = setInterval(() => {
              try {
                send('ping', JSON.stringify({ t: Date.now() }));
              } catch {
                clearInterval(pingInterval);
              }
            }, 20_000);

            // Store cleanup refs on the controller for cancel()
            (controller as any).__feedCleanup = () => {
              unsubCreated();
              unsubUser();
              clearInterval(pingInterval);
            };
          },
          cancel(controller) {
            (controller as any)?.__feedCleanup?.();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
          },
        });
      },
    },
  },
});
