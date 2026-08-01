import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getArcadeState } from '@/lib/game/results.server';

/** GET /api/arcade/ — today's arcade challenges + streak for the viewer. */
export const Route = createFileRoute('/api/arcade/')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const state = await getArcadeState(session.user.id);
        return Response.json(state);
      }),
    },
  },
});
