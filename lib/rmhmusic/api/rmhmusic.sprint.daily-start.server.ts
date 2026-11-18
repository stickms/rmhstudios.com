import { apiRoute } from '@/lib/api/route.server';
import { badRequest } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { startSprintDaily } from '@/lib/rmhmusic/learn/sprint/sprint.server';
import { sprintDailyStartApi } from '@/lib/rmhmusic/learn/sprint/sprint.contract';
import {
  sprintDailyStartBody,
  sprintDailyStartRes,
} from '@/lib/rmhmusic/learn/sprint/sprint-schema';

/**
 * `POST /api/rmhmusic/sprint/daily-start` — the dealt date's scored run has started. The first
 * start of a date is the scored one; an abandoned run still counts, so it cannot be re-dealt.
 */
export const route =
  apiRoute(
    '/api/rmhmusic/sprint/daily-start',
    {
      POST: implement(
        sprintDailyStartApi,
        {
          rateLimit:
            'write',
          body: sprintDailyStartBody,
          response:
            sprintDailyStartRes,
        },
        async ({
          userId,
          body,
        }) => {
          const started =
            await startSprintDaily(
              userId,
              body.date,
              Date.now(),
            );
          if (
            !started
          )
            return badRequest(
              'Not a date this run can be dealt on',
            );
          return started;
        },
      ),
    },
  );
