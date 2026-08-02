import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getProgressSummary } from '@/lib/progress-summary.server';

/** GET /api/progress — the signed-in user's level, quests, and season summary. */
export const Route = createFileRoute('/api/progress')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        return Response.json(await getProgressSummary(session.user.id));
      }),
    },
  },
});
