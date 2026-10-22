import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { docQuerySchema } from '@/lib/reading/schema';
import { getDocBundle } from '@/lib/reading/highlights.server';

/**
 * GET /api/reading/doc?kind=&key= — everything the reading enhancements need for
 * one document in a single request (L1 highlights, L6 glossary, L8 popular
 * passages). Fetched after hydration on idle; anonymous callers get the glossary
 * and popular passages only.
 */
export const Route = createFileRoute('/api/reading/doc')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: docQuerySchema },
        async ({ userId, query }) => {
          const bundle = await getDocBundle(query.kind, query.key, userId);
          return Response.json(bundle, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
    },
  },
});
