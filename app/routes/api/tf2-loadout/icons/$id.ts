/**
 * GET /api/tf2-loadout/icons/:id — one item's inventory icon (`:id` is the defindex; `.webp` optional).
 */

import { createFileRoute } from '@tanstack/react-router';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { readIcon } from '@/lib/tf2-loadout/icons.server';

export const Route = createFileRoute('/api/tf2-loadout/icons/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read', etag: false }, async ({ params }) => {
        const m = /^(\d{1,7})(?:\.webp)?$/.exec(params.id);
        if (!m) return apiError('Not found', 404);
        const icon = await readIcon(m[1]);
        if (!icon) return apiError('Not found', 404);
        return new Response(new Uint8Array(icon), {
          headers: {
            'Content-Type': 'image/webp',
            // An icon changes only when the sync re-publishes it.
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }),
    },
  },
});
