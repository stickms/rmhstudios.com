import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { guideUpdateSchema } from '@/lib/games/reviews';
import { getGuide, updateGuide, deleteGuide, GameMetaError } from '@/lib/games/meta.server';

/**
 * GET    /api/guides/:id — a guide (published, or the author's draft).
 * PUT    /api/guides/:id — edit (author); a changed body appends a revision.
 * DELETE /api/guides/:id — delete (author).
 */
export const Route = createFileRoute('/api/guides/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const guide = await getGuide(params.id, session?.user.id ?? null);
          if (!guide) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(guide);
        } catch (error) {
          console.error('Guide fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 30, windowMs: 60_000, prefix: 'guides' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = guideUpdateSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            await updateGuide(session.user.id, params.id, parsed.data);
          } catch (e) {
            if (e instanceof GameMetaError) {
              return Response.json({ error: e.message }, { status: e.message === 'FORBIDDEN' ? 403 : 404 });
            }
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Guide update error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          try {
            await deleteGuide(session.user.id, params.id);
          } catch (e) {
            if (e instanceof GameMetaError) return Response.json({ error: e.message }, { status: 404 });
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('Guide delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
