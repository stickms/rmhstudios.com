import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteMedListApi, patchMedListApi } from '@features/medschools/medschools.contract';
import { patchListBody } from './me-schemas';
import { LISTS_WRITE_LIMIT, badInput, notFound } from './me-http.server';
import { deleteList, renameList } from './lists.server';

/** PATCH renames a list; DELETE removes it with its items. Another user's list is a 404. */
export const route = apiRoute('/api/medschools/me/lists/$id', {
  PATCH: implement(
    patchMedListApi,
    { rateLimit: LISTS_WRITE_LIMIT, body: patchListBody },
    async ({ session, body, params }) => {
      const r = await renameList(session.user.id, params.id ?? '', body.name);
      if (r === 'bad-name') return badInput();
      return r ?? notFound();
    },
  ),
  DELETE: implement(deleteMedListApi, { rateLimit: LISTS_WRITE_LIMIT }, async ({ session, params }) =>
    (await deleteList(session.user.id, params.id ?? '')) ? { ok: true as const } : notFound(),
  ),
});
