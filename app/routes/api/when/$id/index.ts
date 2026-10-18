import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { deletePoll, getPollView } from '@/lib/calendar/polls.server';

/**
 * GET    /api/when/:id — the poll, its heat map and ranked shortlist (K1).
 * DELETE /api/when/:id — organiser only.
 */
export const Route = createFileRoute('/api/when/$id/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId, params }) => {
        const poll = await getPollView(params.id, userId);
        if (!poll) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ poll }, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const result = await deletePoll(params.id, userId);
        if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
        return Response.json({ ok: true });
      }),
    },
  },
});
