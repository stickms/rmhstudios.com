import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { guideCreateSchema } from '@/lib/games/reviews';
import { createGuide, GameMetaError } from '@/lib/games/meta.server';

/** POST /api/guides { gameId, title, body } — create a draft guide. */
export const Route = createFileRoute('/api/guides/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 10, windowMs: 3_600_000, prefix: 'guides' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = guideCreateSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            const id = await createGuide(session.user.id, parsed.data);
            return Response.json({ id });
          } catch (e) {
            if (e instanceof GameMetaError) return Response.json({ error: e.message }, { status: 400 });
            throw e;
          }
        } catch (error) {
          console.error('Guide create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
