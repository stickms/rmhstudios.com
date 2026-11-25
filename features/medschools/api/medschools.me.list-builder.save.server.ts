import { implement } from '@/lib/api/implement.server';
import { apiRoute } from '@/lib/api/route.server';
import { refusalBody } from '@/lib/errors/codes';
import { saveMedBuiltListApi } from '@features/medschools/medschools.contract';
import { LIMITS } from '../engine/tracker';
import { createListWithItems } from './lists.server';
import { LISTS_WRITE_LIMIT, badInput } from './me-http.server';
import { saveBuiltListBody } from './stats-schemas';

/**
 * `POST /api/medschools/me/list-builder/save`: the member pressed "Save as a list" on a build. An ordinary private list
 * is created with the ticked schools (named by slug, checked to be active schools); nothing of the build is kept.
 */
export const route = apiRoute('/api/medschools/me/list-builder/save', {
  POST: implement(
    saveMedBuiltListApi,
    { rateLimit: LISTS_WRITE_LIMIT, body: saveBuiltListBody },
    async ({ userId, body }) => {
      const r = await createListWithItems(userId, body.name, body.items);
      if (r === 'bad-name' || r === 'no-schools') return badInput();
      if (r === 'cap') return Response.json({ ...refusalBody('MEDSCHOOLS_LIST_CAP', { max: LIMITS.lists }) }, { status: 409 });
      return r;
    },
  ),
});
