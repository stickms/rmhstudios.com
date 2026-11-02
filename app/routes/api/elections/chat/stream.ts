import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';
import { parseCycle } from '@/lib/elections/calendar';
import { chatHistory, subscribeChat } from '@/lib/elections/chat.server';

const query = z.object({ cycle: z.string().max(10) });

/** Below the 30–60s idle timeout of every proxy in the path (Apache, Cloudflare). */
const KEEPALIVE_MS = 20_000;

/**
 * GET /api/elections/chat/stream — the live room as Server-Sent Events: a `history`
 * event with the recent messages, then `msg` / `del` events as they happen.
 * Public to read (the room is a public conversation); writing needs an account.
 */
export const Route = createFileRoute('/api/elections/chat/stream')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', query }, async ({ request, query: q }) => {
        const cycle = parseCycle(q.cycle);
        if (!cycle) return new Response('Unknown election', { status: 400 });

        const rl = await checkRateLimit(`ip:${getClientIp(request)}`, {
          limit: 20,
          windowMs: 60_000,
          prefix: 'elections:chat:stream',
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
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
              } catch {
                // Reader gone; `cancel` cleans up.
              }
            };
            send('history', chatHistory(cycle.date));
            unsubscribe = subscribeChat(cycle.date, (ev) => send(ev.type, ev.type === 'msg' ? ev.msg : { id: ev.id }));
            keepalive = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(': ping\n\n'));
              } catch {
                // as above
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
