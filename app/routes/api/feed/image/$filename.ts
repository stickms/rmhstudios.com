import { createFileRoute } from '@tanstack/react-router';
import { getObject } from "@/lib/storage/s3.server";
import { feedImageKey, isSafeFilename, contentTypeForFilename } from "@/lib/storage/keys";

export const Route = createFileRoute('/api/feed/image/$filename')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { filename } = params;
          if (!isSafeFilename(filename)) {
            return new Response("Not Found", { status: 404 });
          }
          const object = await getObject(feedImageKey(filename));
          if (!object) {
            return new Response("Not Found", { status: 404 });
          }
          return new Response(object.body, {
            headers: {
              "Content-Type": object.contentType || contentTypeForFilename(filename),
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        } catch (error) {
          console.error("Feed image serve error:", error);
          return new Response("Not Found", { status: 404 });
        }
      },
    },
  },
});
