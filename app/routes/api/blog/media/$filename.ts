import { createFileRoute } from '@tanstack/react-router';
import { getObject } from '@/lib/storage/s3.server';
import { blogMediaKey, isSafeFilename, contentTypeForFilename } from '@/lib/storage/keys';

/**
 * GET /api/blog/media/<filename> — stream blog/announcement media from object
 * storage. Prod serves these from the CDN; this covers dev / no-CDN.
 */
export const Route = createFileRoute('/api/blog/media/$filename')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { filename } = params;
          if (!isSafeFilename(filename)) return new Response('Not Found', { status: 404 });
          const object = await getObject(blogMediaKey(filename));
          if (!object) return new Response('Not Found', { status: 404 });
          return new Response(new Uint8Array(object.body), {
            headers: {
              'Content-Type': object.contentType || contentTypeForFilename(filename),
              'Cache-Control': 'public, max-age=31536000, immutable',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        } catch (error) {
          console.error('Blog media serve error:', error);
          return new Response('Not Found', { status: 404 });
        }
      },
    },
  },
});
