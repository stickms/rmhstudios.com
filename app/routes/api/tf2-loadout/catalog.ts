/**
 * GET /api/tf2-loadout/catalog — the item catalog the loadout builder reads.
 * Built from the game's own schema and refreshed automatically; see
 * `lib/tf2-loadout/catalog.server.ts`.
 */

import { createFileRoute } from '@tanstack/react-router';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { getCatalog } from '@/lib/tf2-loadout/catalog.server';

export const Route = createFileRoute('/api/tf2-loadout/catalog')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: 'read',
          // The snapshot changes only when the game does; the body is ~250 KB so
          // the route keeps its own strong ETag (the schema hash) instead of
          // having the wrapper hash it, and stays out of the URL-keyed micro-cache.
          cache: { visibility: 'public', maxAge: 900, sMaxAge: 900, staleWhileRevalidate: 86400 },
          etag: false,
          microCache: false,
        },
        async ({ request }) => {
          const served = await getCatalog();
          if (!served)
            return apiError('The item catalog is not available yet. Try again shortly.', 503);
          const etag = `"${served.hash}"`;
          const headers = { ETag: etag };
          if (request.headers.get('if-none-match') === etag) {
            return new Response(null, { status: 304, headers });
          }
          return new Response(served.json, {
            headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
          });
        },
      ),
    },
  },
});
