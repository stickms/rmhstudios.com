import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getStudioOverview } from '@/lib/creator/studio.server';

export const Route = createFileRoute('/api/creator/studio-overview')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        return Response.json({ overview: await getStudioOverview(session.user.id) });
      }),
    },
  },
});
