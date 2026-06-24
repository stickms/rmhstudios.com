import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateImageBuffer, resolvePathUnder } from "@/lib/slice-it/upload-validation";
import { optimizeImage } from "@/lib/image-optimize";

const BUILD_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
// Build thumbnails render at card size — cap the long edge and store as WebP.
const BUILD_THUMB_MAX_DIM = 1280;

export const Route = createFileRoute('/api/admin/curated-builds/image')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session || !(session.user as any).isAdmin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 10,
      windowMs: 60_000,
      prefix: "build-image-upload",
    });
    
    if (!allowed) {
      return Response.json(
        { error: "Too many uploads. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const formData = await request.formData();
    const file = formData.get("image") as File;
    if (!file || file.size === 0) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > BUILD_IMAGE_MAX_BYTES) {
      return Response.json(
        {
          error: `Image too large. Maximum size is ${BUILD_IMAGE_MAX_BYTES / 1024 / 1024} MB.`,
        },
        { status: 400 }
      );
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const validation = validateImageBuffer(rawBuffer);
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    // Compress to WebP (preserve aspect ratio, cap the long edge) before storing.
    const { buffer } = await optimizeImage(rawBuffer, {
      width: BUILD_THUMB_MAX_DIM,
      height: BUILD_THUMB_MAX_DIM,
      format: "webp",
      quality: 82,
      autoOrient: true,
    });

    // Write new file
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileName = `build-${uniqueSuffix}.webp`;

    const buildsDir = path.join(process.cwd(), "db", "builds");
    await mkdir(buildsDir, { recursive: true });
    const filePath = path.join(buildsDir, fileName);
    await writeFile(filePath, buffer);

    // Delete old image file if provided
    const oldImageUrl = formData.get("oldImageUrl") as string | null;
    if (oldImageUrl) {
      const prefix = "/api/admin/curated-builds/image/";
      if (oldImageUrl.startsWith(prefix)) {
        const oldFilename = oldImageUrl.slice(prefix.length);
        const oldPath = resolvePathUnder(buildsDir, oldFilename);
        if (oldPath) {
          try { await unlink(oldPath); } catch { /* already gone */ }
        }
      }
    }

    const imageUrl = `/api/admin/curated-builds/image/${fileName}`;

    return Response.json({ image: imageUrl });
  } catch (error) {
    console.error("Build image upload error:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
},
    },
  },
});
