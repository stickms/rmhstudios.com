import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  validateImageBuffer,
  detectImageExt,
} from "@/lib/slice-it/upload-validation";
import { putObject } from "@/lib/storage/s3.server";
import { feedImageKey, feedImageUrl, contentTypeForFilename } from "@/lib/storage/keys";

const FEED_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per image
const MAX_IMAGES = 4;

export const Route = createFileRoute('/api/rmharks/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 10,
            windowMs: 60_000,
            prefix: "rmhark-image-upload",
          });
          if (!allowed) {
            return Response.json(
              { error: "Too many uploads. Try again later." },
              { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
          }

          const formData = await request.formData();
          const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
          if (files.length === 0) {
            return Response.json({ error: "No file provided" }, { status: 400 });
          }
          if (files.length > MAX_IMAGES) {
            return Response.json(
              { error: `At most ${MAX_IMAGES} images per post.` },
              { status: 400 }
            );
          }

          const urls: string[] = [];
          for (const file of files) {
            if (file.size > FEED_IMAGE_MAX_BYTES) {
              return Response.json(
                { error: `Image too large. Maximum size is ${FEED_IMAGE_MAX_BYTES / 1024 / 1024} MB.` },
                { status: 400 }
              );
            }
            const buffer = Buffer.from(await file.arrayBuffer());
            const validation = validateImageBuffer(buffer);
            if (!validation.ok) {
              return Response.json({ error: validation.error }, { status: 400 });
            }
            const ext = detectImageExt(buffer);
            if (!ext) {
              return Response.json({ error: "Unsupported image format." }, { status: 400 });
            }
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const filename = `${session.user.id}-${uniqueSuffix}${ext}`;
            await putObject(feedImageKey(filename), buffer, contentTypeForFilename(filename));
            urls.push(feedImageUrl(filename));
          }

          return Response.json({ urls });
        } catch (error) {
          console.error("Feed image upload error:", error);
          return Response.json({ error: "Internal Server Error" }, { status: 500 });
        }
      },
    },
  },
});
