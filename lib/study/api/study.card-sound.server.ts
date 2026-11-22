import { refusalBody, refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { uploadCardSoundApi } from '@/lib/study/card-sound.contract';
import { soundBodyTooLarge, uploadCardSound } from '@/lib/study/card-sound.server';

/**
 * POST /api/study/card-sound  one flashcard sound (signed in; 6 a minute, as the pronunciation clip)
 *   multipart/form-data: `audio`, `durationMs`.
 *
 * The size is judged from `Content-Length` before the body is read, then on the file and its bytes; the bytes
 * decide the type. Stored privately as a pending upload that the media sweep reclaims unless a card is saved
 * with it within a day.
 */
export const route = apiRoute('/api/study/card-sound', {
  POST: implement(
    uploadCardSoundApi,
    {
      rateLimit: {
        limit: 6,
        windowMs: 60_000,
        prefix: 'card-sound',
        message: 'Too many uploads. Try again in a minute.',
      },
    },
    async ({ request, userId }) => {
      if (soundBodyTooLarge(Number(request.headers.get('content-length') ?? 0))) {
        return Response.json({ ...refusalBody('STUDY_SOUND_TOO_LARGE') }, { status: 413 });
      }
      const form = await request.formData().catch(() => null);
      if (!form) return Response.json({ error: 'Invalid input' }, { status: 400 });
      const audio = form.get('audio');
      const result = await uploadCardSound(userId, {
        audio: audio instanceof File ? audio : null,
        durationMs: Number(form.get('durationMs')),
      });
      if (!result.ok)
        return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
      return { url: result.url, durationMs: result.durationMs, bytes: result.bytes };
    },
  ),
});
