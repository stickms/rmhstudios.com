import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { translateQuerySchema } from '@/lib/delight/schema';
import { isTargetLocale, listStrings, summary } from '@/lib/delight/translate.server';

/** GET /api/translate?locale=&ns=&offset= — per-namespace gaps, and (with ns) one page of missing/weak strings. */
export const Route = createFileRoute('/api/translate/')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: 'read', query: translateQuerySchema },
        async ({ userId, query }) => {
          if (!isTargetLocale(query.locale)) {
            return Response.json({ error: 'Unknown locale' }, { status: 400 });
          }
          const namespaces = await summary(query.locale);
          const page = query.ns
            ? await listStrings(query.locale, query.ns, query.offset, userId)
            : null;
          return Response.json(
            { namespaces, page },
            { headers: { 'Cache-Control': 'private, no-store' } },
          );
        },
      ),
    },
  },
});
