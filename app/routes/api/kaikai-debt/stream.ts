/**
 * GET /api/kaikai-debt/stream — live additions to the counter.
 *
 * SSE. One event type (`entry.added`), carrying the new row **and** the
 * authoritative post-insert totals, so a client that missed an event converges
 * on the next one it sees rather than drifting further out with each miss.
 *
 * Note what does NOT come down this stream: the ticking. The counter's motion is
 * `e^(r·t)` evaluated in the browser against a basis it already has, so a reader
 * whose connection drops still sees a live, correct counter — they just stop
 * hearing about other people's additions until it comes back. Pushing the number
 * itself would be tens of frames a second per reader for something arithmetic
 * gets right for free.
 *
 * Public: watching the pile grow needs no account. The connection cap is
 * per-identity and generous — it exists to stop connection flooding, not to
 * ration a person with several tabs open.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';
import { DEBT_CHANNEL, debtBus } from '@/lib/kaikai-debt/ledger.server';
import type { DebtStreamEvent } from '@/lib/kaikai-debt/debt';

/** Below the 30–60s idle timeout of every proxy in the path (Apache, Cloudflare). */
const KEEPALIVE_MS = 20_000;

export const Route = createFileRoute('/api/kaikai-debt/stream')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ request, userId }) => {
        const identity = userId ?? `ip:${getClientIp(request)}`;
        const rl = await checkRateLimit(identity, {
          limit: userId ? 30 : 15,
          windowMs: 60_000,
          prefix: 'kaikai-debt:stream',
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
            const send = (event: string, data: unknown) => {
              try {
                controller.enqueue(
                  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
                );
              } catch {
                // Reader is gone; `cancel` will clean up.
              }
            };

            send('connected', { ok: true });

            unsubscribe = debtBus.subscribe(DEBT_CHANNEL, (event: DebtStreamEvent) => {
              send(event.type, event);
            });

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
