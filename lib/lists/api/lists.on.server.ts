import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listsOnApi } from '@/lib/lists/lists-on.contract';
import { listsIAmOn } from '@/lib/lists/lists-on.server';

/** GET /api/lists/on?cursor= — the public and unlisted lists that include the caller (never private ones). */
export const route = apiRoute('/api/lists/on', {
  GET: implement(
    listsOnApi,
    { rateLimit: 'read', query: z.object({ cursor: z.string().max(100).optional() }) },
    async ({ userId, query }) =>
      Response.json(await listsIAmOn(userId, query.cursor), { headers: { 'Cache-Control': 'private, no-store' } }),
  ),
});
