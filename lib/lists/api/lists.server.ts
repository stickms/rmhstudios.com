import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createListApi, getUserListsApi } from '@/lib/lists/lists.contract';
import { listCreateSchema } from '@/lib/lists/constants';
import { getUserLists, createList, ListError } from '@/lib/lists/lists.server';

/**
 * GET  /api/lists — the caller's lists.
 * POST /api/lists { name, bio?, visibility? } — create a list.
 */
export const route = apiRoute('/api/lists', {
  GET: implement(getUserListsApi, {}, async ({ request, session }) => {
    const member = new URL(request.url).searchParams.get('member') ?? undefined;
    return { lists: await getUserLists(session.user.id, member) };
  }),
  POST: implement(
    createListApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'lists' }, body: listCreateSchema },
    async ({ session, body }) => {
      try {
        return { list: await createList(session.user.id, body) };
      } catch (e) {
        if (e instanceof ListError) return Response.json({ error: e.message }, { status: 400 });
        throw e;
      }
    },
  ),
});
