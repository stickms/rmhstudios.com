import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { submitEntry } from '@/lib/studio/challenge/challenge.server';
import { entrySchema } from '@/lib/studio/challenge/shared';

/** POST /api/studio/challenges/:id/entry — submit (or replace) your flip while the window is open (F12). */
export const route = apiRoute('/api/studio/challenges/$id/entry', {
  POST: defineHandler(
    {
      rateLimit: { limit: 10, windowMs: 60_000, prefix: 'studio-challenge-entry' },
      body: entrySchema,
    },
    async ({ userId, params, body }) => {
      const r = await submitEntry(userId, params.id, body);
      if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
      return Response.json({ id: r.id }, { status: 201 });
    },
  ),
});
