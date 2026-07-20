import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { hideAward, AwardError } from '@/lib/awards/awards.server';

/** POST /api/awards/:id/hide — the recipient hides an award on their content. */
export const Route = createFileRoute('/api/awards/$id/hide')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          try {
            await hideAward(session.user.id, params.id);
          } catch (e) {
            if (e instanceof AwardError) {
              const status = e.message === 'FORBIDDEN' ? 403 : 404;
              return Response.json({ error: e.message }, { status });
            }
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Award hide error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
