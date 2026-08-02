import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listCreateSchema } from '@/lib/lists/constants';
import { getUserLists, createList, ListError } from '@/lib/lists/lists.server';

/**
 * GET  /api/lists — the caller's lists.
 * POST /api/lists { name, bio?, visibility? } — create a list.
 */
export const Route = createFileRoute('/api/lists/')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ request, session }) => {
        const member = new URL(request.url).searchParams.get('member') ?? undefined;
        return Response.json({ lists: await getUserLists(session.user.id, member) });
      }),
      POST: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'lists' }, body: listCreateSchema },
        async ({ session, body }) => {
          try {
            return Response.json({ list: await createList(session.user.id, body) });
          } catch (e) {
            if (e instanceof ListError) return Response.json({ error: e.message }, { status: 400 });
            throw e;
          }
        },
      ),
    },
  },
});
