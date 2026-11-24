import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getClientIp } from '@/lib/rate-limit.server';
import { subscribeLiveSignal } from '@features/medschools/live-signal.server';
import { createLiveStream } from '@features/medschools/api/live-stream.server';

/**
 * GET /api/medschools/live/stream — the "new reported events" signal of RMH Med Schools as Server-Sent Events: one
 * `event: new` (no data) whenever the worker commits new Admit or SDN events, a heartbeat comment every 25 s.
 * Anonymous and user-independent; the stream and its caps are `features/medschools/api/live-stream.server.ts`.
 */
const live = createLiveStream({ subscribe: subscribeLiveSignal, clientIp: getClientIp });

export const Route = createFileRoute('/api/medschools/live/stream')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ request }) =>
        live.handle(request, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          // The same for every caller and never stored: no shared cache may hold or transform a stream.
          'Cache-Control': 'no-store, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        }),
      ),
    },
  },
});
