import { createFileRoute } from '@tanstack/react-router';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { gameAssetHeaders, readGameAsset } from '@/lib/tf2-game/assets/store.server';

// The Half-Life 2 demo's maps, models and textures (hl2-game/ in storage), served exactly
// like the TF2 game's (app/routes/api/tf2-game/assets/$.ts).
export const Route = createFileRoute('/api/hl2-game/assets/$')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', etag: false },
        async ({ params, request }) => {
          const path = (params as Record<string, string>)._splat ?? '';
          const file = await readGameAsset(
            path,
            request.headers.get('accept-encoding') ?? '',
            'hl2',
          );
          if (!file) return apiError('Not found', 404);
          return new Response(new Uint8Array(file.body), {
            headers: gameAssetHeaders(path, file),
          });
        },
      ),
    },
  },
});
