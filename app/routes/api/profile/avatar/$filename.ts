/**
 * GET /api/profile/avatar/:filename — serve a user profile avatar.
 *
 * Local-dev / no-CDN fallback that streams the webp out of object storage (in
 * production, userAvatarUrl points straight at cdn.rmhstudios.com). Mirrors the
 * persona-avatar / feed-image proxy routes. Falls back to the default avatar
 * when the object is missing or the filename is unsafe.
 */

import { createFileRoute } from '@tanstack/react-router';
import { readFile } from "fs/promises";
import path from "path";
import { getObject } from "@/lib/storage/s3.server";
import { userAvatarKey, isSafeFilename, contentTypeForFilename } from "@/lib/storage/keys";

const DEFAULT_AVATAR = path.join(process.cwd(), "public", "images", "social", "default_avatar.png");

async function serveDefaultAvatar() {
  const buffer = await readFile(DEFAULT_AVATAR);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export const Route = createFileRoute('/api/profile/avatar/$filename')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { filename } = params;
          if (!isSafeFilename(filename)) {
            return serveDefaultAvatar();
          }
          const object = await getObject(userAvatarKey(filename));
          if (!object) {
            return serveDefaultAvatar();
          }
          return new Response(new Uint8Array(object.body), {
            headers: {
              "Content-Type": object.contentType || contentTypeForFilename(filename),
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        } catch {
          return serveDefaultAvatar();
        }
      },
    },
  },
});
