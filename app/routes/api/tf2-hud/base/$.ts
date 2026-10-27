/**
 * GET /api/tf2-hud/base/<path> — a file of the HUD editor's base, as synced
 * from the game by the TF2 asset sync. 404 until a sync has published it, in
 * which case the editor uses the copy that ships in `public/tf2-hud/base`.
 */

import { createFileRoute } from '@tanstack/react-router';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { readBaseFile } from '@/lib/tf2-hud/base-store.server';

export const Route = createFileRoute('/api/tf2-hud/base/$')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', etag: false },
        async ({ params, request }) => {
          const path = (params as Record<string, string>)._splat ?? '';
          const file = await readBaseFile(path, request.headers.get('accept-encoding') ?? '');
          if (!file) return apiError('Not found', 404);
          return new Response(new Uint8Array(file.body), {
            headers: {
              ...(file.contentEncoding ? { 'Content-Encoding': file.contentEncoding } : {}),
              Vary: 'Accept-Encoding',
              'Content-Type': file.contentType,
              // The manifest names what a sync published; files only change on a game update.
              'Cache-Control':
                path === 'manifest.json'
                  ? 'public, max-age=300, stale-while-revalidate=3600'
                  : 'public, max-age=3600, stale-while-revalidate=86400',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        },
      ),
    },
  },
});
