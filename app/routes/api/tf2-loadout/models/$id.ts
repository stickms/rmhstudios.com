/**
 * GET /api/tf2-loadout/models/:id — one item's GLB model (`:id` is the defindex, or `<defindex>_<class>`; `.glb` optional).
 * Also a class body (`class_<class>`), an animation clip (`anim_<class>_<clip>`) and the clip index (`anims.json`).
 */

import { createFileRoute } from '@tanstack/react-router';
import { apiError, defineHandler, ifNoneMatchMatches } from '@/lib/api/handler.server';
import { readAnimIndex, readModel } from '@/lib/tf2-loadout/models.server';

export const Route = createFileRoute('/api/tf2-loadout/models/$id')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', etag: false },
        async ({ params, request }) => {
          if (params.id === 'anims.json') {
            const index = await readAnimIndex();
            if (!index) return apiError('Not found', 404);
            return new Response(index, {
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
                'X-Content-Type-Options': 'nosniff',
              },
            });
          }
          const m =
            /^(\d{1,7}(?:_[a-z]{3,10})?(?:_s\d{1,3})?|class_[a-z]{3,10}|anim_[a-z]{3,10}_[a-z0-9_]{1,64})(?:\.glb)?$/.exec(
              params.id,
            );
          if (!m) return apiError('Not found', 404);
          const model = await readModel(m[1], request.headers.get('accept-encoding') ?? '');
          if (!model) return apiError('Not found', 404);
          const etag = `"${model.etag}"`;
          // The URL carries the builder version, and a sync that changes a model changes its ETag: a browser
          // keeps the file for a day, then revalidates (a 304 with no body) while it keeps showing the old one.
          const cache = {
            ETag: etag,
            Vary: 'Accept-Encoding',
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          };
          const match = request.headers.get('if-none-match');
          if (match && ifNoneMatchMatches(match, etag))
            return new Response(null, { status: 304, headers: cache });
          return new Response(new Uint8Array(model.body), {
            headers: {
              ...cache,
              ...(model.contentEncoding ? { 'Content-Encoding': model.contentEncoding } : {}),
              'Content-Type': 'model/gltf-binary',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        },
      ),
    },
  },
});
