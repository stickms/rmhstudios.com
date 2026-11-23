import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { createMedListApi, getMedListsApi } from '@features/medschools/medschools.contract';
import { LIMITS } from '../engine/tracker';
import { createListBody } from './me-schemas';
import { LISTS_WRITE_LIMIT, READ_LIMIT, badInput } from './me-http.server';
import { createList, listLists } from './lists.server';

/** GET the caller's lists with their items (the one query every list surface shares); POST creates a list. */
export const route = apiRoute('/api/medschools/me/lists', {
  GET: implement(getMedListsApi, { rateLimit: READ_LIMIT }, async ({ session }) => ({
    lists: await listLists(session.user.id),
  })),
  POST: implement(
    createMedListApi,
    { rateLimit: LISTS_WRITE_LIMIT, body: createListBody },
    async ({ session, body }) => {
      const r = await createList(session.user.id, body.name);
      if (r === 'bad-name') return badInput();
      if (r === 'cap')
        return Response.json({ ...refusalBody('MEDSCHOOLS_LIST_CAP', { max: LIMITS.lists }) }, { status: 409 });
      return r;
    },
  ),
});
