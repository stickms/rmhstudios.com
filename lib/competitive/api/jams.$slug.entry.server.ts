import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { enterJamApi } from '@/lib/competitive/jams.contract';
import { submitEntry } from '@/lib/competitive/jams.server';

/** POST /api/jams/:slug/entry — enter (or swap) your own User Build during the window. */
export const route = apiRoute('/api/jams/$slug/entry', {
  POST: implement(
    enterJamApi,
    { rateLimit: 'write', body: z.object({ buildId: z.string().min(1).max(64) }) },
    async ({ params, userId, body }) => {
      const res = await submitEntry(params.slug, userId, body.buildId);
      if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
      return Response.json({ ok: true });
    },
  ),
});
