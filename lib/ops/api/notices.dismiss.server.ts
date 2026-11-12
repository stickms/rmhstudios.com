import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { dismissNotice } from '@/lib/ops/notices.server';

/** POST /api/notices/dismiss — record that the caller dismissed a notice. */
export const route = apiRoute('/api/notices/dismiss', {
  POST: defineHandler(
    { rateLimit: 'write', body: z.object({ id: z.string().min(1).max(40) }) },
    async ({ userId, body }) => {
      const ok = await dismissNotice(userId, body.id);
      return ok
        ? Response.json({ ok: true })
        : Response.json({ error: 'Not found' }, { status: 404 });
    },
  ),
});
