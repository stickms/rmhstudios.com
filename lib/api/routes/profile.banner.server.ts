import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { uploadBannerApi } from '@/lib/profile.contract';
import { prisma } from '@/lib/prisma.server';
import { validateImageBuffer } from '@features/slice-it/engine/upload-validation';
import { putObject, s3Configured } from '@/lib/storage/s3.server';
import { userBannerKey, userBannerUrl } from '@/lib/storage/keys';
import { PROFILE_BANNER_MAX_MB } from '@/lib/profile/banner';
import { encodeBannerSource, renderBannerRendition } from '@/lib/profile/banner-image.server';
import {
  bannerSourceKey,
  readBannerSource,
  removeStoredBanner,
} from '@/lib/profile/banner-store.server';

const BANNER_MAX_BYTES = PROFILE_BANNER_MAX_MB * 1024 * 1024; // per image
const TOTAL_BANNER_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

const tooLarge = `Banner too large. Maximum size is ${PROFILE_BANNER_MAX_MB} MB.`;
const imagePart = z
  .instanceof(File, { message: 'No file provided' })
  .refine((f) => f.size > 0, 'No file provided')
  .refine((f) => f.size <= BANNER_MAX_BYTES, tooLarge);

/**
 * The multipart parts (the contract's `body` is `FormData`, so they are parsed here):
 *  - `banner`: the picture as the owner framed it. Cut to the banner ratio and size here regardless.
 *  - `original`: the whole picture it was framed from, kept as the source for later re-crops.
 *  - `source=keep`: this is a re-crop of the banner already stored, so its source stays.
 * With neither `original` nor `source=keep`, `banner` is itself the whole picture and becomes the source.
 */
const uploadParts = z.object({
  banner: imagePart,
  original: imagePart.optional(),
  source: z.enum(['keep']).optional(),
});

export const route = apiRoute('/api/profile/banner', {
  POST: implement(
    uploadBannerApi,
    {
      rateLimit: {
        limit: 5,
        windowMs: 60_000,
        prefix: 'banner-upload',
        message: 'Too many uploads. Try again later.',
      },
    },
    async ({ request, session }) => {
      const formData = await request.formData();
      const parsed = uploadParts.safeParse({
        banner: formData.get('banner') ?? undefined,
        original: formData.get('original') ?? undefined,
        source: formData.get('source') ?? undefined,
      });
      if (!parsed.success) {
        return Response.json(
          { error: parsed.error.issues[0]?.message ?? 'Invalid upload' },
          { status: 400 },
        );
      }
      const parts = parsed.data;

      const cropBuffer = Buffer.from(await parts.banner.arrayBuffer());
      const originalBuffer = parts.original
        ? Buffer.from(await parts.original.arrayBuffer())
        : null;
      for (const buffer of originalBuffer ? [cropBuffer, originalBuffer] : [cropBuffer]) {
        const validation = validateImageBuffer(buffer);
        if (!validation.ok) {
          return Response.json({ error: validation.error }, { status: 400 });
        }
      }

      if (process.env.NODE_ENV === 'production' && !s3Configured()) {
        console.error('Banner upload blocked: object storage (S3_*) is not configured.');
        return Response.json(
          { error: 'Banner storage is not configured. Please try again later.' },
          { status: 500 },
        );
      }

      // The client's crop is not trusted: every upload is cut to the banner ratio and
      // re-encoded to WebP here, so a stored banner always has the one shape.
      const rendition = await renderBannerRendition(cropBuffer);
      if (!rendition) {
        return Response.json({ error: 'Banner image is too small.' }, { status: 400 });
      }

      const existingProfile = await prisma.userProfile.findUnique({
        where: { userId: session.user.id },
        select: { bannerUrl: true, bannerSizeBytes: true },
      });

      // The source the next re-crop starts from: the picture sent with this crop; or, for
      // a re-crop, the one already kept (a banner from before sources were kept has only
      // its rendition, which then becomes the source so later re-crops stop narrowing).
      let source: { buffer: Buffer; contentType: string } | null = null;
      if (originalBuffer) {
        source = await encodeBannerSource(originalBuffer);
      } else if (parts.source === 'keep') {
        const kept = await readBannerSource(existingProfile?.bannerUrl);
        if (kept) source = { buffer: kept.body, contentType: kept.contentType };
      }
      source ??= await encodeBannerSource(cropBuffer);

      // `bannerSizeBytes` counts both objects. The cap is checked against the stored
      // sizes, with this user's current banner taken out because it is being replaced.
      const storedBytes = rendition.buffer.length + source.buffer.length;
      const { _sum } = await prisma.userProfile.aggregate({
        _sum: { bannerSizeBytes: true },
      });
      const othersTotal = (_sum?.bannerSizeBytes ?? 0) - (existingProfile?.bannerSizeBytes ?? 0);
      if (othersTotal + storedBytes > TOTAL_BANNER_STORAGE_LIMIT_BYTES) {
        return Response.json(
          { error: 'Total banner storage limit reached. Please try again later.' },
          { status: 413 },
        );
      }

      // A new name every time: the rendition is served `immutable`, so a re-crop must
      // change the URL. The source is stored under the name derived from it.
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const fileName = `${session.user.id}-${uniqueSuffix}.webp`;
      const sourceKey = bannerSourceKey(fileName);
      if (sourceKey) await putObject(sourceKey, source.buffer, source.contentType);
      await putObject(userBannerKey(fileName), rendition.buffer, rendition.contentType);
      const bannerUrl = userBannerUrl(fileName);
      const bannerSizeBytes = rendition.buffer.length + (sourceKey ? source.buffer.length : 0);

      await prisma.userProfile.upsert({
        where: { userId: session.user.id },
        create: { userId: session.user.id, bannerUrl, bannerSizeBytes },
        update: { bannerUrl, bannerSizeBytes },
      });

      // Only once the row points at the new banner: a failed upload leaves the old one whole.
      await removeStoredBanner(existingProfile?.bannerUrl);

      return Response.json({ bannerUrl });
    },
  ),

  DELETE: defineHandler(
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:profile/banner' } },
    async ({ session }) => {
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
    },
  ),
});
