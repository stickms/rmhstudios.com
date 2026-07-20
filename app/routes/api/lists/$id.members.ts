import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { listMemberSchema } from '@/lib/lists/constants';
import { addMember, removeMember, ListError } from '@/lib/lists/lists.server';

/**
 * PUT    /api/lists/:id/members { userId } — add a member (owner).
 * DELETE /api/lists/:id/members { userId } — remove (owner, or self "remove me").
 */
export const Route = createFileRoute('/api/lists/$id/members')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 60, windowMs: 60_000, prefix: 'lists-member' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = listMemberSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            await addMember(session.user.id, params.id, parsed.data.userId);
          } catch (e) {
            if (e instanceof ListError) {
              return Response.json({ error: e.message }, { status: e.message === 'NOT_FOUND' ? 404 : 400 });
            }
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('List member add error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const body = await request.json().catch(() => null);
          const parsed = listMemberSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            await removeMember(session.user.id, params.id, parsed.data.userId);
          } catch (e) {
            if (e instanceof ListError) {
              return Response.json({ error: e.message }, { status: e.message === 'FORBIDDEN' ? 403 : 404 });
            }
            throw e;
          }
          return Response.json({ ok: true });
        } catch (error) {
          console.error('List member remove error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
