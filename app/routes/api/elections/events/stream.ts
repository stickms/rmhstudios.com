import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';
import { parseDay } from '@/lib/elections/calendar';
import { eventHistory, subscribeEvents } from '@/lib/elections/events.server';
import { getElectionSnapshot } from '@/lib/elections/source.server';

const query = z.object({ cycle: z.string().max(10) });
const KEEPALIVE_MS = 20_000;

/**
 * GET /api/elections/events/stream — the day's events as Server-Sent Events: `history` first, then
 * one `event` per call / flip / lead change / polls closing / headline. This is the feed the watch
 * room's auto-follow reacts to.
 *
 * Events only exist when snapshots are being built, so each connection also nudges the snapshot cache
 * on an interval; the snapshot's own TTL (20 s live) means that costs one upstream fetch no matter how
 * many viewers are connected.
 */
export const Route = createFileRoute('/api/elections/events/stream')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', query }, async ({ request, query: q }) => {
        const cycle = parseDay(q.cycle);
        if (!cycle) return new Response('Unknown election', { status: 400 });
        const rl = await checkRateLimit(`ip:${getClientIp(request)}`, { limit: 20, windowMs: 60_000, prefix: 'elections:events:stream' });
        if (!rl.allowed) return new Response('Too Many Connections', { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });

        // Build once up front so history reflects the current state and the diff engine is primed.
        await getElectionSnapshot(cycle).catch(() => undefined);

        const encoder = new TextEncoder();
        let unsubscribe = () => {};
        let keepalive: ReturnType<typeof setInterval> | null = null;
        let nudge: ReturnType<typeof setInterval> | null = null;

        const stream = new ReadableStream({
          start(controller) {
            const send = (event: string, data: unknown) => {
              try {
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
              } catch {
                /* reader gone */
              }
            };
            send('history', eventHistory(cycle.date));
            unsubscribe = subscribeEvents(cycle.date, (ev) => send('event', ev));
            keepalive = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(': ping\n\n'));
              } catch {
                /* as above */
              }
            }, KEEPALIVE_MS);
            nudge = setInterval(() => void getElectionSnapshot(cycle).catch(() => undefined), 20_000);
          },
          cancel() {
            unsubscribe();
            if (keepalive) clearInterval(keepalive);
            if (nudge) clearInterval(nudge);
          },
        });
        return new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
        });
      }),
    },
  },
});
