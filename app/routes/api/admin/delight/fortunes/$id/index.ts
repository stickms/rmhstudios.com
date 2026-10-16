import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { fortuneReviewSchema } from '@/lib/delight/schema';
import { reviewFortune } from '@/lib/delight/fortune.server';

/** POST { status: 'approved' | 'rejected' } — approved ones run oldest first, one per UTC day. */
export const Route = createFileRoute('/api/admin/delight/fortunes/$id/')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: fortuneReviewSchema },
        async ({ params, body }) =>
          (await reviewFortune(params.id, body.status))
            ? Response.json({ ok: true })
            : Response.json({ error: 'Not found' }, { status: 404 }),
      ),
    },
  },
});
