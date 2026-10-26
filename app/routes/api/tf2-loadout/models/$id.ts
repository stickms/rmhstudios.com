/**
 * GET /api/tf2-loadout/models/:id — one item's GLB model (`:id` is the defindex, `.glb` optional).
 */

import { createFileRoute } from '@tanstack/react-router';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { readModel } from '@/lib/tf2-loadout/models.server';

export const Route = createFileRoute('/api/tf2-loadout/models/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read', etag: false }, async ({ params }) => {
        const m = /^(\d{1,7})(?:\.glb)?$/.exec(params.id);
        if (!m) return apiError('Not found', 404);
        const body = await readModel(Number(m[1]));
        if (!body) return apiError('Not found', 404);
        return new Response(new Uint8Array(body), {
          headers: {
            'Content-Type': 'model/gltf-binary',
            // A converted model changes only when it is re-uploaded; a day is a fair trade.
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }),
    },
  },
});
