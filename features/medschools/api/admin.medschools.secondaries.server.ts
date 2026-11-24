import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { postMedSecondariesAdminApi } from '@features/medschools/medschools.contract';
import { notFound } from './me-http.server';
import { adminSecondariesBody } from './secondaries-schemas';
import { recordSchoolPrompts } from './secondaries-admin.server';

/** POST /api/admin/medschools/secondaries: an admin's correction of a school's own prompts. The URL is stored, never fetched. */
export const route = apiRoute('/api/admin/medschools/secondaries', {
  POST: implement(
    postMedSecondariesAdminApi,
    { auth: 'admin', rateLimit: 'write', body: adminSecondariesBody },
    async ({ body }) => {
      const r = await recordSchoolPrompts(body);
      return r === 'not-found' ? notFound() : r;
    },
  ),
});
