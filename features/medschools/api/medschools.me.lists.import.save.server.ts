import { implement } from '@/lib/api/implement.server';
import { apiRoute } from '@/lib/api/route.server';
import { refusalBody } from '@/lib/errors/codes';
import { saveMedListImportApi } from '@features/medschools/medschools.contract';
import { LIMITS } from '../engine/tracker';
import { listImportSaveBody } from './import-schemas';
import { LISTS_WRITE_LIMIT, badInput, notFound } from './me-http.server';
import { importListItems } from './lists.server';

/**
 * `POST /api/medschools/me/lists/import/save` (owner 2026-11-24): the member's ticked preview rows, by slug and program,
 * into one of their lists or a new one (`importListItems`). The body never names a user, an item or a school id (strict
 * schema); another member's list is a 404, never a 403. Over the list cap or the 200-school cap nothing is written.
 */
export const route = apiRoute('/api/medschools/me/lists/import/save', {
  POST: implement(
    saveMedListImportApi,
    { rateLimit: LISTS_WRITE_LIMIT, body: listImportSaveBody },
    async ({ session, body }) => {
      const r = await importListItems(session.user.id, body.target, body.items);
      if (r === 'bad-name') return badInput();
      if (r === 'cap')
        return Response.json({ ...refusalBody('MEDSCHOOLS_ITEM_CAP', { max: LIMITS.itemsPerList }) }, { status: 409 });
      if (r === 'list-cap')
        return Response.json({ ...refusalBody('MEDSCHOOLS_LIST_CAP', { max: LIMITS.lists }) }, { status: 409 });
      return r ?? notFound();
    },
  ),
});
