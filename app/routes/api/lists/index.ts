import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { listCreateSchema } from '@/lib/lists/constants';
import { getUserLists, createList, ListError } from '@/lib/lists/lists.server';

/**
 * GET  /api/lists — the caller's lists.
 * POST /api/lists { name, bio?, visibility? } — create a list.
 */
export const Route = createFileRoute('/api/lists/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const member = new URL(request.url).searchParams.get('member') ?? undefined;
          return Response.json({ lists: await getUserLists(session.user.id, member) });
        } catch (error) {
          console.error('Lists list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'lists',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => null);
          const parsed = listCreateSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          try {
            return Response.json({ list: await createList(session.user.id, parsed.data) });
          } catch (e) {
            if (e instanceof ListError) return Response.json({ error: e.message }, { status: 400 });
            throw e;
          }
        } catch (error) {
          console.error('List create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
