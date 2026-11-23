import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { saveMedListItemApi } from '@features/medschools/medschools.contract';
import { LIMITS } from '../engine/tracker';
import { saveListItemBody } from './me-schemas';
import { LISTS_WRITE_LIMIT, badInput, notFound } from './me-http.server';
import { saveItem } from './lists.server';

/** POST saves a school to a list (`listId`, `newListName`, or the caller's default list, created on first use). */
export const route = apiRoute('/api/medschools/me/list-items', {
  POST: implement(
    saveMedListItemApi,
    { rateLimit: LISTS_WRITE_LIMIT, body: saveListItemBody },
    async ({ session, body }) => {
      const r = await saveItem(session.user.id, body);
      if (r === 'bad-name') return badInput();
      if (r === 'cap')
        return Response.json({ ...refusalBody('MEDSCHOOLS_ITEM_CAP', { max: LIMITS.itemsPerList }) }, { status: 409 });
      if (r === 'list-cap')
        return Response.json({ ...refusalBody('MEDSCHOOLS_LIST_CAP', { max: LIMITS.lists }) }, { status: 409 });
      if (r === 'school-missing') return notFound();
      return r ?? notFound();
    },
  ),
});
