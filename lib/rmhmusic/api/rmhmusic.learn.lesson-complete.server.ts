import { apiRoute } from '@/lib/api/route.server';
import { badRequest, defineHandler } from '@/lib/api/handler.server';
import { completeLesson, UnknownLessonError } from '@/lib/rmhmusic/learn/progress.server';
import { lessonCompleteSchema } from '@/lib/rmhmusic/learn/schemas';

/** `POST /api/rmhmusic/learn/lesson-complete` — bank a lesson result and pay XP for new stars. */
export const route = apiRoute('/api/rmhmusic/learn/lesson-complete', {
  POST: defineHandler(
    { rateLimit: 'write', body: lessonCompleteSchema },
    async ({ userId, body }) => {
      try {
        return Response.json(await completeLesson(userId, body));
      } catch (err) {
        if (err instanceof UnknownLessonError) return badRequest('Unknown lesson');
        throw err;
      }
    },
  ),
});
