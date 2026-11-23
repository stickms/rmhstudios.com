import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getMedPrefsApi, putMedPrefsApi } from '@features/medschools/medschools.contract';
import { putPrefsBody } from './me-schemas';
import { LISTS_WRITE_LIMIT, READ_LIMIT } from './me-http.server';
import { getPrefs, putPrefs } from './prefs.server';

/** GET the caller's preferences (the defaults with no row); PUT replaces them. Personal: never cached anywhere. */
export const route = apiRoute('/api/medschools/me/prefs', {
  GET: implement(getMedPrefsApi, { rateLimit: READ_LIMIT }, async ({ session }) => getPrefs(session.user.id)),
  PUT: implement(putMedPrefsApi, { rateLimit: LISTS_WRITE_LIMIT, body: putPrefsBody }, async ({ session, body }) =>
    putPrefs(session.user.id, body),
  ),
});
