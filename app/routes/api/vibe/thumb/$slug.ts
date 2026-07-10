/**
 * GET /api/vibe/thumb/$slug
 *
 * Serves the server-rendered gallery thumbnail for a vibe page. Thumbnails are
 * stored as WebP in object storage (vibe-thumbs/<slug>.webp); in production
 * vibeThumbUrl points straight at the CDN, so this proxy is the dev / no-CDN
 * fallback that streams the object out of storage. The URL is versioned with a
 * `?v=` query by the capture step, so responses are safe to cache immutably.
 */

import { createFileRoute } from '@tanstack/react-router';
import { getObject } from '@/lib/storage/s3.server';
import { vibeThumbKey } from '@/lib/storage/keys';

const SLUG_RE = /^[A-Za-z0-9._-]+$/;

export const Route = createFileRoute('/api/vibe/thumb/$slug')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { slug } = params;
        if (!slug || slug === '.' || slug === '..' || !SLUG_RE.test(slug)) {
          return new Response('Not found', { status: 404 });
        }
        try {
          const object = await getObject(vibeThumbKey(slug));
          if (!object) {
            return new Response('Not found', { status: 404 });
          }
          return new Response(new Uint8Array(object.body), {
            headers: {
              'Content-Type': object.contentType || 'image/webp',
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        } catch {
          return new Response('Not found', { status: 404 });
        }
      },
    },
  },
});
