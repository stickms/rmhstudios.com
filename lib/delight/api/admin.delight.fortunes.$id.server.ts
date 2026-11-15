import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { fortuneReviewSchema } from '@/lib/delight/schema';
import { reviewFortune } from '@/lib/delight/fortune.server';

/** POST { status: 'approved' | 'rejected' } — approved ones run oldest first, one per UTC day. */
export const route = apiRoute('/api/admin/delight/fortunes/$id', {
  POST: defineHandler(
    { auth: 'admin', rateLimit: 'write', body: fortuneReviewSchema },
    async ({ params, body }) =>
      (await reviewFortune(params.id, body.status))
        ? Response.json({ ok: true })
        : Response.json({ error: 'Not found' }, { status: 404 }),
  ),
});
