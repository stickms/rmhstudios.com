import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { auth } from '@/lib/auth';
import { listGuides, isValidGame } from '@/lib/games/meta.server';

/** GET /api/games/:id/guides — published guides (+ the caller's own drafts). */
export const Route = createFileRoute('/api/games/$id/guides')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ request, params }) => {
        if (!isValidGame(params.id)) return Response.json({ error: 'Not found' }, { status: 404 });
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        return Response.json({ guides: await listGuides(params.id, session?.user.id ?? null) });
      }),
    },
  },
});
