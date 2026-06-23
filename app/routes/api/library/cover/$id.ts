import { createFileRoute } from '@tanstack/react-router';
import { getObject } from '@/lib/storage/s3.server';
import { libraryCoverKey, isSafeLibraryId } from '@/lib/library/keys';

/**
 * GET /api/library/cover/$id — stream an uploaded book's cover image from R2.
 */
export const Route = createFileRoute('/api/library/cover/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { id } = params;
          if (!isSafeLibraryId(id)) return new Response('Not Found', { status: 404 });
          const object = await getObject(libraryCoverKey(id));
          if (!object) return new Response('Not Found', { status: 404 });
          return new Response(new Uint8Array(object.body), {
            headers: {
              'Content-Type': object.contentType || 'image/jpeg',
              'Content-Length': String(object.body.length),
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        } catch (error) {
          console.error('Library cover serve error:', error);
          return new Response('Not Found', { status: 404 });
        }
      },
    },
  },
});
