import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { MAX_TRACKED } from '@/lib/achievements/tracking';
import {
  trackAchievementApi,
  untrackAchievementApi,
} from '@/lib/achievements/tracking.contract';
import { trackedState } from '@/lib/achievements/tracking-schema';
import {
  listTracked,
  track,
  untrack,
} from '@/lib/achievements/tracking.server';

/**
 * PUT / DELETE /api/achievements/tracked/$achievementId — track or stop tracking one achievement. Both act on the
 * caller's own set only and are idempotent. The cap of five is enforced inside the write (`track`).
 */
export const route =
  apiRoute(
    '/api/achievements/tracked/$achievementId',
    {
      PUT: implement(
        trackAchievementApi,
        {
          rateLimit:
            'write',
          response:
            trackedState,
        },
        async ({
          userId,
          params,
        }) => {
          const result =
            await track(
              userId,
              params.achievementId,
            );
          if (
            result ===
            'unknown'
          )
            return Response.json(
              {
                error:
                  'Achievement not found',
              },
              {
                status: 404,
              },
            );
          if (
            result ===
            'unlocked'
          ) {
            return Response.json(
              {
                error:
                  'That achievement is already unlocked',
                code: 'unlocked',
              },
              {
                status: 409,
              },
            );
          }
          if (
            result ===
            'limit'
          ) {
            return Response.json(
              {
                error: `You can track at most ${MAX_TRACKED} achievements`,
                code: 'limit',
              },
              {
                status: 409,
              },
            );
          }
          return listTracked(
            userId,
          );
        },
      ),
      DELETE:
        implement(
          untrackAchievementApi,
          {
            rateLimit:
              'write',
            response:
              trackedState,
          },
          async ({
            userId,
            params,
          }) => {
            await untrack(
              userId,
              params.achievementId,
            );
            return listTracked(
              userId,
            );
          },
        ),
    },
  );
