import { createFileRoute } from '@tanstack/react-router';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { gameAssetHeaders, readGameAsset } from '@/lib/tf2-game/assets/store.server';

// The browser game's maps, models, textures, sounds and particles (tf2-game/ in storage).
// Content-addressed files are immutable for a year; index files revalidate after 5 min.
export const Route = createFileRoute('/api/tf2-game/assets/$')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', etag: false },
        async ({ params, request }) => {
          const path = (params as Record<string, string>)._splat ?? '';
          const file = await readGameAsset(path, request.headers.get('accept-encoding') ?? '');
          if (!file) return apiError('Not found', 404);
          return new Response(new Uint8Array(file.body), {
            headers: gameAssetHeaders(path, file),
          });
        },
      ),
    },
  },
});
