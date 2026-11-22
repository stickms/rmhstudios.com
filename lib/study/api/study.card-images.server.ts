import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { uploadCardImageApi } from '@/lib/study/card-images.contract';
import { uploadCardImage } from '@/lib/study/card-images.server';

/**
 * POST /api/study/card-images  one flashcard picture (signed in; 20 a minute)
 *
 * Stored through the `flashcard` ingest surface: re-encoded to WebP with every metadata block dropped, and recorded
 * as a pending upload that the media sweep reclaims unless a card is saved with it.
 */
export const route = apiRoute('/api/study/card-images', {
  POST: implement(
    uploadCardImageApi,
    {
      rateLimit: {
        limit: 20,
        windowMs: 60_000,
        prefix: 'card-image',
        message: 'Too many uploads. Try again later.',
      },
    },
    async ({ request, userId }) => {
      const form = await request.formData().catch(() => null);
      const file = form?.get('image');
      const result = await uploadCardImage(userId, file instanceof File ? file : null);
      if (!result.ok)
        return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
      return { url: result.url, width: result.width, height: result.height };
    },
  ),
});
