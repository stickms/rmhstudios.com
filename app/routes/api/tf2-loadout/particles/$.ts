import { createFileRoute } from '@tanstack/react-router';
import { apiError, defineHandler } from '@/lib/api/handler.server';
import { readParticleFile } from '@/lib/tf2-loadout/particles.server';

export const Route = createFileRoute('/api/tf2-loadout/particles/$')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', etag: false },
        async ({ params, request }) => {
          const path = (params as Record<string, string>)._splat ?? '';
          const file = await readParticleFile(path, request.headers.get('accept-encoding') ?? '');
          if (!file) return apiError('Not found', 404);
          return new Response(new Uint8Array(file.body), {
            headers: {
              'Content-Type': file.contentType,
              ...(file.contentEncoding ? { 'Content-Encoding': file.contentEncoding } : {}),
              Vary: 'Accept-Encoding',
              'Cache-Control':
                path === 'manifest.json'
                  ? 'public, max-age=300, stale-while-revalidate=3600'
                  : 'public, max-age=31536000, immutable',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        },
      ),
    },
  },
});
