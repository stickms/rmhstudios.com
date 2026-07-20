import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { putObject } from '@/lib/storage/s3.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { createMediaFromUpload } from '@/lib/media/upload.server';
import { MEDIA_MAX_BYTES } from '@/lib/media/policy';
import { hasApiImageUpload } from '@/lib/entitlements';
import { keyedLimit, checkDailyUploadQuota } from '@/lib/media/quota.server';
import { optimizeImage } from '@/lib/image-optimize';
import { detectImageExt } from '@/lib/slice-it/upload-validation';

const MAX_DIMENSION = 2048;
const WEBP_QUALITY = 82;

/**
 * POST /api/v1/images — upload one image, get an opaque media_id back.
 * Attach it to a post via POST /api/v1/posts { media_ids: [...] }.
 */
export const Route = createFileRoute('/api/v1/images')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, tier, json, error }) => {
            // 1. Tier capability gate.
            if (!hasApiImageUpload(tier)) {
              return error(
                'feature_not_available',
                'Image upload requires a Starter plan or higher.',
                403,
              );
            }

            // 2. Dedicated tight per-key limit (far below the generic 120/min).
            const burst = await keyedLimit(`dev-api-image:${userId}`, 15, 60_000);
            if (!burst.allowed) {
              return error('rate_limited', 'Too many uploads. Slow down.', 429, {
                'Retry-After': String(burst.retryAfter),
              });
            }

            // 3. Tier-scaled daily quota.
            const quota = await checkDailyUploadQuota({ limit: keyedLimit }, { userId, tier });
            if (!quota.allowed) {
              return error('quota_exceeded', 'Daily image upload limit reached.', 429, {
                'Retry-After': String(quota.retryAfter),
              });
            }

            // 4. Reject oversize bodies before reading them into memory.
            const declared = Number(request.headers.get('content-length') ?? '0');
            if (declared > MEDIA_MAX_BYTES) {
              return error(
                'payload_too_large',
                `Image too large. Maximum size is ${MEDIA_MAX_BYTES / 1024 / 1024} MB.`,
                413,
              );
            }

            let form: FormData;
            try {
              form = await request.formData();
            } catch {
              return error(
                'invalid_request',
                'Expected multipart/form-data with an `image` field.',
                400,
              );
            }
            const file = form.get('image');
            if (!(file instanceof File) || file.size === 0) {
              return error(
                'invalid_request',
                'No image provided. Send one file in the `image` field.',
                400,
              );
            }
            if (file.size > MEDIA_MAX_BYTES) {
              return error(
                'invalid_request',
                `Image too large. Maximum size is ${MEDIA_MAX_BYTES / 1024 / 1024} MB.`,
                400,
              );
            }

            const rawBuffer = Buffer.from(await file.arrayBuffer());
            // Compress to WebP before storing (consistent with the rest of the
            // platform). validateUpload downstream re-detects the format, so the
            // stored object gets a .webp key + content type. Fall back to the
            // original bytes if conversion fails so a valid upload never breaks.
            let buffer: Buffer = rawBuffer;
            try {
              const isGif = detectImageExt(rawBuffer) === '.gif';
              const optimized = await optimizeImage(rawBuffer, {
                width: MAX_DIMENSION,
                height: MAX_DIMENSION,
                quality: WEBP_QUALITY,
                format: 'webp',
                animated: isGif,
                autoOrient: !isGif,
              });
              buffer = optimized.buffer;
            } catch (err) {
              console.warn('[v1/images] webp conversion failed, storing original:', err);
            }
            try {
              const { id, expiresAt } = await createMediaFromUpload(
                { prisma, putObject },
                { userId, buffer },
              );
              return json({ id, type: 'image', expires_at: expiresAt.toISOString() }, 201);
            } catch (err) {
              return error(
                'invalid_request',
                err instanceof Error ? err.message : 'Invalid image.',
                400,
              );
            }
          },
          // Image upload is heavy (decode + WebP re-encode + object store), so
          // it draws down the per-key daily quota faster than a cheap read.
          { scope: 'write:media', cost: 8 },
        ),
    },
  },
});
