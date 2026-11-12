import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { rateJamEntryApi } from '@/lib/competitive/jams.contract';
import { rateEntry } from '@/lib/competitive/jams.server';

const score = z.number().int().min(1).max(5);
const schema = z.object({
  entryId: z.string().min(1).max(64),
  fun: score,
  creativity: score,
  theme: score,
  polish: score,
});

/** POST /api/jams/:slug/rate — 1–5 in four categories; one rating per member per entry, never your own. */
export const route = apiRoute('/api/jams/$slug/rate', {
  POST: implement(
    rateJamEntryApi,
    { rateLimit: 'write', body: schema },
    async ({ params, userId, body }) => {
      const { entryId, ...scores } = body;
      const res = await rateEntry(params.slug, userId, entryId, scores);
      if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
      return Response.json({ ok: true });
    },
  ),
});
