import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getStudioOverview } from '@/lib/creator/studio.server';

/** GET /api/studio/overview — the caller's Create/Earnings dashboard model. */
export const Route = createFileRoute('/api/studio/overview')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        return Response.json(await getStudioOverview(session.user.id));
      }),
    },
  },
});
