import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { hideAward, AwardError } from '@/lib/awards/awards.server';

/** POST /api/awards/:id/hide — the recipient hides an award on their content. */
export const Route = createFileRoute('/api/awards/$id/hide')({
  server: {
    handlers: {
      POST: defineHandler({}, async ({ params, session }) => {
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
      }),
    },
  },
});
