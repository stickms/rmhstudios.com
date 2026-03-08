import { createFileRoute } from '@tanstack/react-router';
import { readFile } from "fs/promises";
import path from "path";
import { resolvePathUnder } from "@/lib/slice-it/upload-validation";

const DEFAULT_AVATAR = path.join(process.cwd(), "public", "images", "social", "default_avatar.png");

async function serveDefaultAvatar() {
  const buffer = await readFile(DEFAULT_AVATAR);
  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export const Route = createFileRoute('/api/profile/avatar/$filename')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
  try {
    const { filename } = params;
    const safeName = path.basename(filename);
    const avatarDir = path.join(process.cwd(), "db", "avatars");
    const filePath = resolvePathUnder(avatarDir, safeName);
    if (!filePath) {
      return serveDefaultAvatar();
    }

    const buffer = await readFile(filePath);

    const ext = path.extname(safeName).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".png") contentType = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    if (ext === ".webp") contentType = "image/webp";
    if (ext === ".gif") contentType = "image/gif";

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
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
