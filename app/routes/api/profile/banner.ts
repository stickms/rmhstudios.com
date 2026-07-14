import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateImageBuffer } from "@/lib/slice-it/upload-validation";
import { optimizeImage } from "@/lib/image-optimize";
import { putObject, deleteObject, s3Configured } from "@/lib/storage/s3.server";
import { userBannerKey, userBannerUrl, userBannerFilename } from "@/lib/storage/keys";
import { purgeFromCdn } from "@/lib/storage/cdn.server";

const BANNER_MAX_BYTES = 8 * 1024 * 1024; // 8 MB per image
const TOTAL_BANNER_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
// Wide 3:1 cover, downscaled + re-encoded to WebP.
const BANNER_WIDTH = 1500;
const BANNER_HEIGHT = 500;

/** Best-effort removal of a banner object from storage + CDN edge, by stored URL. */
async function removeStoredBanner(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const filename = userBannerFilename(url);
  if (!filename) return;
  const key = userBannerKey(filename);
  try {
    await deleteObject(key);
  } catch {
    // Object may already be gone — non-fatal.
  }
  await purgeFromCdn(key);
}

export const Route = createFileRoute('/api/profile/banner')({
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
            limit: 5,
            windowMs: 60_000,
            prefix: "banner-upload",
          });
          if (!allowed) {
            return Response.json(
              { error: "Too many uploads. Try again later." },
              { status: 429, headers: { "Retry-After": String(retryAfter) } }
            );
          }

          const formData = await request.formData();
          const file = formData.get("banner") as File;
          if (!file || file.size === 0) {
            return Response.json({ error: "No file provided" }, { status: 400 });
          }
          if (file.size > BANNER_MAX_BYTES) {
            return Response.json(
              { error: `Banner too large. Maximum size is ${BANNER_MAX_BYTES / 1024 / 1024} MB.` },
              { status: 400 }
            );
          }

          const rawBuffer = Buffer.from(await file.arrayBuffer());
          const validation = validateImageBuffer(rawBuffer);
          if (!validation.ok) {
            return Response.json({ error: validation.error }, { status: 400 });
          }

          if (process.env.NODE_ENV === "production" && !s3Configured()) {
            console.error("Banner upload blocked: object storage (S3_*) is not configured.");
            return Response.json(
              { error: "Banner storage is not configured. Please try again later." },
              { status: 500 }
            );
          }

          // Compress every upload to a wide WebP regardless of source format —
          // shrinks storage/bandwidth and normalizes the content type.
          const { buffer, contentType } = await optimizeImage(rawBuffer, {
            width: BANNER_WIDTH,
            height: BANNER_HEIGHT,
            format: "webp",
            quality: 82,
            autoOrient: true,
          });

          // Enforce total banner storage cap against the COMPRESSED size.
          const { _sum } = await prisma.userProfile.aggregate({
            _sum: { bannerSizeBytes: true },
          });
          const currentTotal = _sum?.bannerSizeBytes ?? 0;
          if (currentTotal + buffer.length > TOTAL_BANNER_STORAGE_LIMIT_BYTES) {
            return Response.json(
              { error: "Total banner storage limit reached. Please try again later." },
              { status: 413 }
            );
          }

          // Remove the previous banner object (if any) so storage doesn't accumulate.
          const existingProfile = await prisma.userProfile.findUnique({
            where: { userId: session.user.id },
            select: { bannerUrl: true },
          });
          await removeStoredBanner(existingProfile?.bannerUrl);

          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const fileName = `${session.user.id}-${uniqueSuffix}.webp`;
          await putObject(userBannerKey(fileName), buffer, contentType);
          const bannerUrl = userBannerUrl(fileName);

          await prisma.userProfile.upsert({
            where: { userId: session.user.id },
            create: {
              userId: session.user.id,
              bannerUrl,
              bannerSizeBytes: buffer.length,
            },
            update: {
              bannerUrl,
              bannerSizeBytes: buffer.length,
            },
          });

          return Response.json({ bannerUrl });
        } catch (error) {
          console.error("Banner upload error:", error);
          return Response.json({ error: "Internal Server Error" }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }

          const profile = await prisma.userProfile.findUnique({
            where: { userId: session.user.id },
            select: { bannerUrl: true },
          });
          if (!profile?.bannerUrl) {
            return Response.json({ bannerUrl: null });
          }

          await removeStoredBanner(profile.bannerUrl);
          await prisma.userProfile.update({
            where: { userId: session.user.id },
            data: { bannerUrl: null, bannerSizeBytes: null },
          });

          return Response.json({ bannerUrl: null });
        } catch (error) {
          console.error("Banner reset error:", error);
          return Response.json({ error: "Internal Server Error" }, { status: 500 });
        }
      },
    },
  },
});
