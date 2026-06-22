import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getObject } from '@/lib/storage/s3.server';
import { isSafeFilename, contentTypeForFilename } from '@/lib/storage/keys';
import { licenseKey } from '@/lib/rideshare/license-storage';

export const Route = createFileRoute('/api/admin/rideshare/license/$filename')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return new Response('Unauthorized', { status: 401 });
          }
          const { filename } = params;
          if (!isSafeFilename(filename)) {
            return new Response('Not Found', { status: 404 });
          }
          const object = await getObject(licenseKey(filename));
          if (!object) {
            return new Response('Not Found', { status: 404 });
          }
          return new Response(new Uint8Array(object.body), {
            headers: {
              'Content-Type': object.contentType || contentTypeForFilename(filename),
              // Identity documents must never be cached by shared caches.
              'Cache-Control': 'private, no-store, max-age=0',
            },
          });
        } catch (error) {
          console.error('Rideshare licence serve error:', error);
          return new Response('Not Found', { status: 404 });
        }
      },
    },
  },
});
