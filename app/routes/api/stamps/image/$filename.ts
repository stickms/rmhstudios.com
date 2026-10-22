/**
 * GET /api/stamps/image/:filename — serve a stamp image (P5).
 *
 * Local-dev / no-CDN fallback that streams the WebP out of object storage (with
 * a CDN configured, `stampUrl` points straight at it). Mirrors the avatar proxy.
 */
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getObject } from '@/lib/storage/s3.server';
import { isSafeFilename } from '@/lib/storage/keys';
import { stampKey } from '@/lib/profile/stamps';

export const Route = createFileRoute('/api/stamps/image/$filename')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none', rateLimit: 'read', etag: false }, async ({ params }) => {
        const { filename } = params;
        if (!isSafeFilename(filename) || !filename.endsWith('.webp')) {
          return new Response('Not found', { status: 404 });
        }
        const object = await getObject(stampKey(filename));
        if (!object) return new Response('Not found', { status: 404 });
        return new Response(new Uint8Array(object.body), {
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }),
    },
  },
});
