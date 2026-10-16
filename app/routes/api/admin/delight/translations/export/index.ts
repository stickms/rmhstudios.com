import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { exportAccepted } from '@/lib/delight/translate.server';

/**
 * GET /api/admin/delight/translations/export[?locale=] — accepted translations as
 * { locale: { ns: { key: text } } } JSON, for an admin to merge into locales/ by hand.
 */
export const Route = createFileRoute('/api/admin/delight/translations/export/')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'admin',
          rateLimit: 'read',
          query: z.object({ locale: z.string().max(8).optional() }),
        },
        async ({ query }) =>
          new Response(JSON.stringify(await exportAccepted(query.locale), null, 2), {
            headers: {
              'Content-Type': 'application/json',
              'Content-Disposition': 'attachment; filename="community-translations.json"',
            },
          }),
      ),
    },
  },
});
