import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  validateImageBuffer,
  detectImageExt,
} from "@/lib/slice-it/upload-validation";
import { putObject } from "@/lib/storage/s3.server";
import { feedImageKey, feedImageUrl, contentTypeForFilename } from "@/lib/storage/keys";
import { optimizeImage } from "@/lib/image-optimize";

// Cap stored dimensions; feed images never need to be larger than this.
const MAX_DIMENSION = 2048;
const WEBP_QUALITY = 82;

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

            // Compress to WebP before storing (smaller files, faster loads).
            // Animated GIFs become animated WebP; static images are auto-oriented
            // from EXIF. Fall back to the original bytes if conversion fails so an
            // upload never breaks on an odd image.
            let outBuffer: Buffer = buffer;
            let outExt: string = ext;
            let outContentType = contentTypeForFilename(`x${ext}`);
            try {
              const optimized = await optimizeImage(buffer, {
                width: MAX_DIMENSION,
                height: MAX_DIMENSION,
                quality: WEBP_QUALITY,
                format: "webp",
                animated: ext === ".gif",
                autoOrient: ext !== ".gif",
              });
              outBuffer = optimized.buffer;
              outExt = ".webp";
              outContentType = optimized.contentType;
            } catch (err) {
              console.warn("[rmhark-image] webp conversion failed, storing original:", err);
            }

            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const filename = `${session.user.id}-${uniqueSuffix}${outExt}`;
            await putObject(feedImageKey(filename), outBuffer, outContentType);
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
