/**
 * GET /api/tf2-loadout/paintkits/<path> — a war paint pattern script (`kits/<script>.json`) or a texture
 * it reads (`tex/<path>.webp`), as synced from the game by the TF2 asset sync. 404 until synced.
 */

import { createFileRoute } from '@tanstack/react-router';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { readPaintkitFile } from '@/lib/tf2-loadout/paintkits.server';

export const Route = createFileRoute('/api/tf2-loadout/paintkits/$')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', etag: false },
        async ({ params, request }) => {
          const path = (params as Record<string, string>)._splat ?? '';
          const file = await readPaintkitFile(path, request.headers.get('accept-encoding') ?? '');
          if (!file) return apiError('Not found', 404);
          return new Response(new Uint8Array(file.body), {
            headers: {
              ...(file.contentEncoding ? { 'Content-Encoding': file.contentEncoding } : {}),
              Vary: 'Accept-Encoding',
              'Content-Type': file.contentType,
              // These change only when the game does.
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        },
      ),
    },
  },
});
