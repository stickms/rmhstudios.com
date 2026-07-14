/**
 * GET /api/profile/banner/:filename — serve a user profile banner.
 *
 * Local-dev / no-CDN fallback that streams the webp out of object storage (in
 * production, userBannerUrl points straight at the CDN). Returns 404 when the
 * object is missing or the filename is unsafe (there is no default banner).
 */

import { createFileRoute } from '@tanstack/react-router';
import { getObject } from "@/lib/storage/s3.server";
import { userBannerKey, isSafeFilename, contentTypeForFilename } from "@/lib/storage/keys";

export const Route = createFileRoute('/api/profile/banner/$filename')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { filename } = params;
          if (!isSafeFilename(filename)) {
            return new Response("Not found", { status: 404 });
          }
          const object = await getObject(userBannerKey(filename));
          if (!object) {
            return new Response("Not found", { status: 404 });
          }
          return new Response(new Uint8Array(object.body), {
            headers: {
              "Content-Type": object.contentType || contentTypeForFilename(filename),
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
