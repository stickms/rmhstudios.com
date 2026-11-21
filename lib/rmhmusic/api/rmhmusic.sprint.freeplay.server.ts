import { apiRoute } from '@/lib/api/route.server';
import { badRequest } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { recordPractice } from '@/lib/rmhmusic/history.server';
import { checkFreeplayRun } from '@/lib/rmhmusic/learn/sprint/record';
import { saveSprintFreeplay } from '@/lib/rmhmusic/learn/sprint/sprint.server';
import { sprintFreeplayApi } from '@/lib/rmhmusic/learn/sprint/sprint.contract';
import {
  sprintFreeplayBody,
  sprintFreeplayRes,
} from '@/lib/rmhmusic/learn/sprint/sprint-schema';

/**
 * `POST /api/rmhmusic/sprint/freeplay` — keep a freeplay run. The server checks every prompt
 * against the level and recomputes the score from the times (`record.ts`), then keeps the best.
 * The run is also logged in the practice log, with its own (recomputed) score.
 */
export const route =
  apiRoute(
    '/api/rmhmusic/sprint/freeplay',
    {
      POST: implement(
        sprintFreeplayApi,
        {
          rateLimit:
            'write',
          body: sprintFreeplayBody,
          response:
            sprintFreeplayRes,
        },
        async ({
          userId,
          body,
        }) => {
          const best =
            await saveSprintFreeplay(
              userId,
              body.level,
              body.results,
            );
          if (
            !best
          )
            return badRequest(
              'Not a possible run of this level',
            );
          await recordPractice(
            userId,
            {
              kind: 'sprint',
              refId:
                body.level,
              mode: 'free',
              score:
                checkFreeplayRun(
                  body.level,
                  body.results,
                )
                  ?.summary
                  .score,
              durationMs:
                body.durationMs,
            },
          );
          return {
            outcome:
              'saved' as const,
            best,
          };
        },
      ),
    },
  );
