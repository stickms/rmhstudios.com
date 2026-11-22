import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getQuietCountsApi, setQuietCountsApi } from '@/lib/feed/quiet-counts.contract';
import { quietCountsUpdateSchema } from '@/lib/feed/quiet-counts-schema';
import { getQuietCounts, setQuietCounts } from '@/lib/feed/quiet-counts.server';

/**
 * `/api/settings/quiet-counts` — the caller's two switches: hide the counts on their own posts from everyone
 * else (enforced server-side in every read path) and hide counts while they browse. Only ever the caller's row.
 */
export const route = apiRoute('/api/settings/quiet-counts', {
  GET: implement(getQuietCountsApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json(await getQuietCounts(userId), { headers: { 'Cache-Control': 'private, no-store' } }),
  ),
  PUT: implement(setQuietCountsApi, { rateLimit: 'write', body: quietCountsUpdateSchema }, async ({ userId, body }) =>
    Response.json(await setQuietCounts(userId, body)),
  ),
});
