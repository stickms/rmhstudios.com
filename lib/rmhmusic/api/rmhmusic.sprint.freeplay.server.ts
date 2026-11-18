import { apiRoute } from '@/lib/api/route.server';
import { badRequest } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { saveSprintFreeplay } from '@/lib/rmhmusic/learn/sprint/sprint.server';
import { sprintFreeplayApi } from '@/lib/rmhmusic/learn/sprint/sprint.contract';
import {
  sprintFreeplayBody,
  sprintFreeplayRes,
} from '@/lib/rmhmusic/learn/sprint/sprint-schema';

/**
 * `POST /api/rmhmusic/sprint/freeplay` — keep a freeplay run. The server checks every prompt
 * against the level and recomputes the score from the times (`record.ts`), then keeps the best.
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
          return {
            outcome:
              'saved' as const,
            best,
          };
        },
      ),
    },
  );
