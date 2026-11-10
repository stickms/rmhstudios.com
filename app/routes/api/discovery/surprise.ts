import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { getSurpriseApi } from '@/lib/discovery/discovery.contract';
import { surpriseQuery } from '@/lib/discovery/schema';
import { surpriseMe } from '@/lib/discovery/surprise.server';

/** GET /api/discovery/surprise — one random game, app, library item, build or liked post (A1). */
export const Route = createFileRoute('/api/discovery/surprise')({
  server: {
    handlers: {
      GET: implement(
        getSurpriseApi,
        { auth: 'optional', rateLimit: 'read', query: surpriseQuery },
        async ({ userId, query }) => {
          const pick = await surpriseMe(userId, query.not);
          if (!pick) return Response.json({ error: 'Nothing to show yet' }, { status: 404 });
          return Response.json(pick, { headers: { 'Cache-Control': 'no-store' } });
        },
      ),
    },
  },
});
