import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { uploadBuildImageApi } from '@/lib/builds/screenshots.contract';
import { findScreenshotBuild, uploadBuildImage } from '@/lib/builds/screenshots.server';

/**
 * POST /api/user-builds/[id]/images  one cover or screenshot picture for a build (owner only; 20 a minute)
 *
 * Stored through the `build` ingest surface: re-encoded to one 1280 px WebP with every metadata block dropped, and
 * recorded as a pending upload that the media sweep reclaims unless the owner saves it as the cover or a screenshot.
 */
export const route = apiRoute('/api/user-builds/$id/images', {
  POST: implement(
    uploadBuildImageApi,
    {
      rateLimit: {
        limit: 20,
        windowMs: 60_000,
        prefix: 'build-image',
        message: 'Too many uploads. Try again later.',
      },
    },
    async ({ request, params, userId }) => {
      const form = await request.formData().catch(() => null);
      const file = form?.get('image');
      const result = await uploadBuildImage(
        await findScreenshotBuild(params.id),
        userId,
        file instanceof File ? file : null,
      );
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
            ...refusalCodeOf(result),
          },
          {
            status: result.status,
          },
        );
      return {
        url: result.url,
        width: result.width,
        height: result.height,
      };
    },
  ),
});
