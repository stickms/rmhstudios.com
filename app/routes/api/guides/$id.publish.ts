import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { publishGuide, GameMetaError } from '@/lib/games/meta.server';

const schema = z.object({ published: z.boolean() });

/** POST /api/guides/:id/publish { published } — publish/unpublish (author). */
export const Route = createFileRoute('/api/guides/$id/publish')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const body = await request.json().catch(() => null);
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            await publishGuide(session.user.id, params.id, parsed.data.published);
          } catch (e) {
            if (e instanceof GameMetaError) return Response.json({ error: e.message }, { status: 404 });
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Guide publish error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
