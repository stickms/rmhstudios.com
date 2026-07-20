import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { listUpdateSchema } from '@/lib/lists/constants';
import { getListDetail, updateList, deleteList, ListError } from '@/lib/lists/lists.server';

/**
 * GET    /api/lists/:id — list detail + members (honors visibility).
 * PATCH  /api/lists/:id — update name/bio/visibility/pinned (owner).
 * DELETE /api/lists/:id — delete (owner).
 */
export const Route = createFileRoute('/api/lists/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const detail = await getListDetail(params.id, session?.user.id ?? null);
          if (!detail) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(detail);
        } catch (error) {
          console.error('List detail error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      PATCH: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 30, windowMs: 60_000, prefix: 'lists' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = listUpdateSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            await updateList(session.user.id, params.id, parsed.data);
          } catch (e) {
            if (e instanceof ListError) {
              return Response.json({ error: e.message }, { status: e.message === 'NOT_FOUND' ? 404 : 400 });
            }
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('List update error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          try {
            await deleteList(session.user.id, params.id);
          } catch (e) {
            if (e instanceof ListError) return Response.json({ error: e.message }, { status: 404 });
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('List delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
