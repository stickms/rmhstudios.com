import { apiRoute } from '@/lib/api/route.server';
import { badRequest, defineHandler } from '@/lib/api/handler.server';
import { completeLesson, UnknownLessonError } from '@/lib/rmhmusic/learn/progress.server';
import { recordPractice } from '@/lib/rmhmusic/history.server';
import { lessonCompleteSchema } from '@/lib/rmhmusic/learn/schemas';

/**
 * `POST /api/rmhmusic/learn/lesson-complete` — bank a lesson result and pay XP for new stars, then
 * log the finished lesson in the practice log (a failure to log never fails the save).
 */
export const route = apiRoute('/api/rmhmusic/learn/lesson-complete', {
  POST: defineHandler(
    { rateLimit: 'write', body: lessonCompleteSchema },
    async ({ userId, body }) => {
      try {
        const result = await completeLesson(userId, body);
        await recordPractice(userId, {
          kind: 'lesson',
          refId: body.lessonId,
          score: body.score,
          durationMs: body.durationMs,
        });
        return Response.json(result);
      } catch (err) {
        if (err instanceof UnknownLessonError) return badRequest('Unknown lesson');
        throw err;
      }
    },
  ),
});
