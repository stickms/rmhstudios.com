import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { pollIcs } from '@/lib/calendar/polls.server';

/** GET /api/when/:id/ics — the locked-in time as an .ics file, for poll participants. */
export const Route = createFileRoute('/api/when/$id/ics')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId, params }) => {
        const ics = await pollIcs(params.id, userId);
        if (!ics) return Response.json({ error: 'Not found' }, { status: 404 });
        return new Response(ics, {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': 'attachment; filename="poll.ics"',
            'Cache-Control': 'private, no-store',
          },
        });
      }),
    },
  },
});
