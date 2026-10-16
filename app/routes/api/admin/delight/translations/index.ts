import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { isTargetLocale, reviewQueue } from '@/lib/delight/translate.server';

/** GET /api/admin/delight/translations?locale= — open suggestions, most-voted first. */
export const Route = createFileRoute('/api/admin/delight/translations/')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'admin', rateLimit: 'read', query: z.object({ locale: z.string().max(8) }) },
        async ({ query }) =>
          isTargetLocale(query.locale)
            ? Response.json({ suggestions: await reviewQueue(query.locale) })
            : Response.json({ error: 'Unknown locale' }, { status: 400 }),
      ),
    },
  },
});
