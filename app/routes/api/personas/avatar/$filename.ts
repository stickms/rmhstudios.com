/**
 * GET /api/personas/avatar/:filename — serve a generated persona avatar.
 *
 * Local-dev / no-CDN fallback that streams the webp out of object storage (in
 * production, personaAvatarUrl points straight at the CDN). Mirrors the feed
 * image proxy route.
 */

import { createFileRoute } from '@tanstack/react-router';
import { getObject } from '@/lib/storage/s3.server';
import { personaAvatarKey, isSafeFilename, contentTypeForFilename } from '@/lib/storage/keys';

export const Route = createFileRoute('/api/personas/avatar/$filename')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { filename } = params;
          if (!isSafeFilename(filename)) {
            return new Response('Not Found', { status: 404 });
          }
          const object = await getObject(personaAvatarKey(filename));
          if (!object) {
            return new Response('Not Found', { status: 404 });
          }
          return new Response(new Uint8Array(object.body), {
            headers: {
              'Content-Type': object.contentType || contentTypeForFilename(filename),
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        } catch (error) {
          console.error('Persona avatar serve error:', error);
          return new Response('Not Found', { status: 404 });
        }
      },
    },
  },
});
