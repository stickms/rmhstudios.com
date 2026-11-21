import { apiRoute } from '@/lib/api/route.server';
import { badRequest } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { isValidTimeZone } from '@/lib/calendar/tz';
import {
  clearPracticeApi,
  getPracticeSummaryApi,
} from '@/lib/rmhmusic/history.contract';
import { summaryQuery } from '@/lib/rmhmusic/history-schema';
import {
  clearPractice,
  getPracticeSummary,
} from '@/lib/rmhmusic/history.server';

/**
 * `/api/rmhmusic/history` — the signed-in learner's own practice log. GET is the summary
 * (`?tz=&week=&firstDay=`: minutes this week and last, goal days, the selected week's days, a year
 * of days). DELETE is Clear history: it deletes the entries and nothing else, so bests, lesson
 * progress and the streak stay.
 */
export const route =
  apiRoute(
    '/api/rmhmusic/history',
    {
      GET: implement(
        getPracticeSummaryApi,
        {
          rateLimit:
            'read',
          query:
            summaryQuery,
        },
        async ({
          userId,
          query,
        }) => {
          const timeZone =
            query.tz ??
            'UTC';
          if (
            !isValidTimeZone(
              timeZone,
            )
          )
            return badRequest(
              'Invalid time zone',
            );
          return getPracticeSummary(
            userId,
            {
              timeZone,
              weekOffset:
                query.week ??
                0,
              firstDay:
                query.firstDay ??
                1,
            },
          );
        },
      ),
      DELETE:
        implement(
          clearPracticeApi,
          {
            rateLimit:
              'write',
          },
          async ({
            userId,
          }) => ({
            deleted:
              await clearPractice(
                userId,
              ),
          }),
        ),
    },
  );
