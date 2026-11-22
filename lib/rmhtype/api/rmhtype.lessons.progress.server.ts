/**
 * `/api/rmhtype/lessons/progress` - the member's touch-typing course progress.
 *
 * GET lists their rows. POST records one finished run: the body is a lesson id and
 * two bounded numbers, and the server decides the stars (`starsFor`) and keeps the
 * bests. Lesson runs never reach a leaderboard.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getLessonProgressApi, recordLessonRunApi } from '@/lib/rmhtype/lessons.contract';
import { lessonRunBody } from '@/lib/rmhtype/lessons-schema';
import { getLessonProgress, recordLessonRun } from '@/lib/rmhtype/lessons.server';

export const route = apiRoute('/api/rmhtype/lessons/progress', {
  GET: implement(
    getLessonProgressApi,
    {
      rateLimit: 'read',
    },
    async ({ userId }) => ({
      progress: await getLessonProgress(userId),
    }),
  ),

  POST: implement(
    recordLessonRunApi,
    {
      rateLimit: 'write',
      body: lessonRunBody,
    },
    async ({ userId, body }) => {
      const recorded = await recordLessonRun(userId, body);
      if (!recorded)
        return Response.json(
          {
            error: 'Unknown lesson',
          },
          {
            status: 400,
          },
        );
      return recorded;
    },
  ),
});
