import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { setSubscribed } from '@/lib/discovery/feeds.server';

/** POST / DELETE /api/feeds/$id/subscribe — subscribe to (or leave) a public feed (A4). */
export const Route = createFileRoute('/api/feeds/$id/subscribe')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const res = await setSubscribed(userId, params.id, true);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ ok: true });
      }),
      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const res = await setSubscribed(userId, params.id, false);
        if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
        return Response.json({ ok: true });
      }),
    },
  },
});
