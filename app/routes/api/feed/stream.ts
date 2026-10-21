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
import { hasSessionCookie } from '@/lib/session-cookie';
import { getFollowingIds } from '@/lib/social/follow-graph.server';
import { feedEventBus, type FeedSSEEvent } from '@/lib/feed-sse';
import { serializeWithDelivery } from '@/lib/feed-sse-serialize';
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
          // perf: anonymous streams (no session cookie) skip Better Auth entirely.
          if (hasSessionCookie(request.headers)) {
            const session = await auth.api.getSession({ headers: request.headers });
            viewerId = session?.user?.id ?? null;
          }
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

        // Idempotent teardown shared by every exit path: client cancel, request
        // abort, a failed write, and the max-lifetime timer. `cleanup` is assigned
        // in start(); `cancel()`/abort can only fire after it exists.
        let cleanup: (() => void) | null = null;

        const stream = new ReadableStream({
          start(controller) {
            let closed = false;
            let unsubCreated = () => {};
            let unsubUser = () => {};
            let pingInterval: ReturnType<typeof setInterval> | null = null;
            let lifetimeTimer: ReturnType<typeof setTimeout> | null = null;

            const teardown = () => {
              if (closed) return;
              closed = true;
              unsubCreated();
              unsubUser();
              if (pingInterval) clearInterval(pingInterval);
              if (lifetimeTimer) clearTimeout(lifetimeTimer);
              request.signal.removeEventListener('abort', teardown);
            };
            cleanup = teardown;

            // Helper to send an SSE message. A failed enqueue means the client is
            // gone: tear down immediately so the bus listener and timers don't leak
            // until a cancel() that may never arrive.
            const send = (event: string, data: string) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
              } catch {
                teardown();
              }
            };

            // Behind a proxy the request abort is the reliable disconnect signal.
            if (request.signal.aborted) {
              teardown();
              return;
            }
            request.signal.addEventListener('abort', teardown, { once: true });

            // Send initial connection confirmation
            send('connected', JSON.stringify({ ok: true }));

            // New posts: broadcast channel. Attach per-viewer delivery metadata so the
            // client can route the post into Following (auto-prepend) vs For You
            // ("N new" pill). The event payload shape is unchanged — only `delivery`
            // is added, exactly as before.
            unsubCreated = feedEventBus.subscribeCreated((event: FeedSSEEvent) => {
              try {
                const authorId = event.authorId;
                const delivery = {
                  followed: !!authorId && followingIds.has(authorId),
                  own: !!authorId && authorId === viewerId,
                };
                send(event.type, serializeWithDelivery(event, delivery));
              } catch {
                // Serialization failure for one event must not kill the stream.
              }
            });

            // Targeted events (e.g. mention notifications): only this viewer's own
            // per-user channel, never the global firehose. Anonymous viewers have no
            // per-user channel.
            if (viewerId) {
              unsubUser = feedEventBus.subscribeUser(viewerId, (event: FeedSSEEvent) => {
                try {
                  send(event.type, JSON.stringify(event));
                } catch {
                  // Serialization failure for one event must not kill the stream.
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
            pingInterval = setInterval(() => {
              send('ping', JSON.stringify({ t: Date.now() }));
            }, 20_000);

            // perf: cap connection lifetime (~30 min + jitter, as in
            // api/messages/stream.ts) so a half-dead connection that never errors
            // can't pin a bus listener + timers forever. The client's EventSource
            // handler (hooks/useFeedSSE.ts onerror) reconnects automatically with
            // backoff, re-resolving the session and follow graph; jitter spreads
            // the reconnects so long-lived tabs don't re-handshake together.
            const closeAfterMs = 30 * 60_000 + Math.floor(Math.random() * 5 * 60_000);
            lifetimeTimer = setTimeout(() => {
              teardown();
              try {
                controller.close();
              } catch {
                // Already closed
              }
            }, closeAfterMs);
          },
          cancel() {
            cleanup?.();
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
