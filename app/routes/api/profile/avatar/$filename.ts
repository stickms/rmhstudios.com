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
const DEFAULT_AVATAR_PATH = "/images/social/default_avatar.png";

/**
 * Serve the fallback avatar. Reads the file off disk when possible (dev / any
 * runtime whose CWD contains `public/`), but the bundled Nitro server runs with
 * a CWD that may not — so a failed read must NEVER surface as a 500. In that
 * case we redirect to the statically-served asset, which Nitro serves reliably
 * regardless of CWD. This keeps a missing/errored avatar rendering the default
 * instead of a broken image + logged 500 (previously this threw in both the try
 * and catch paths, so any storage miss became an uncaught 500).
 */
async function serveDefaultAvatar() {
  try {
    const buffer = await readFile(DEFAULT_AVATAR);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response(null, {
      status: 302,
      headers: {
        Location: DEFAULT_AVATAR_PATH,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
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
