import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { shelfPrefsSchema } from '@/lib/reading/schema';
import { setPrefs } from '@/lib/reading/shelves.server';

/** PUT /api/reading/shelves/prefs — make a shelf public or private (default private). */
export const route = apiRoute('/api/reading/shelves/prefs', {
  PUT: defineHandler({ rateLimit: 'write', body: shelfPrefsSchema }, async ({ userId, body }) => {
    return Response.json({ prefs: await setPrefs(userId, body) });
  }),
});
