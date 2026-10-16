import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { reviewSuggestion } from '@/lib/delight/translate.server';

/** POST { status: 'accepted' | 'rejected' } — accepting replaces any earlier accepted wording for that string. */
export const Route = createFileRoute('/api/admin/delight/translations/$id/')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'admin',
          rateLimit: 'write',
          body: z.object({ status: z.enum(['accepted', 'rejected']) }),
        },
        async ({ params, body }) =>
          (await reviewSuggestion(params.id, body.status))
            ? Response.json({ ok: true })
            : Response.json({ error: 'Not found' }, { status: 404 }),
      ),
    },
  },
});
