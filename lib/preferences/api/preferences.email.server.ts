import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  getEmailPrefs,
  setEmailPrefs,
} from '@/lib/email/preferences.server';
import { emailPrefsSchema } from '@/lib/email/preferences-schema';
import {
  getEmailPrefsApi,
  setEmailPrefsApi,
} from '@/lib/preferences/preferences.contract';

/**
 * GET /api/preferences/email — the caller's email categories, defaults filled in
 *     (security and announcements on, product news and the digest off).
 * PUT /api/preferences/email — save any subset of them.
 */
export const route =
  apiRoute(
    '/api/preferences/email',
    {
      GET: implement(
        getEmailPrefsApi,
        {},
        async ({
          userId,
        }) =>
          getEmailPrefs(
            userId,
          ),
      ),
      PUT: implement(
        setEmailPrefsApi,
        {
          rateLimit:
            {
              limit: 20,
              windowMs: 60_000,
              prefix:
                'email-prefs',
            },
          body: emailPrefsSchema,
        },
        async ({
          userId,
          body,
        }) =>
          setEmailPrefs(
            userId,
            body,
          ),
      ),
    },
  );
