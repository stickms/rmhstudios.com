import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  followGameApi,
  getGameFollowApi,
  unfollowGameApi,
} from '@/lib/arcade/updates.contract';
import {
  followGame,
  getFollowState,
  unfollowGame,
  updatesGame,
} from '@/lib/arcade/updates.server';

const notFound =
  () =>
    Response.json(
      {
        error:
          'Not found',
      },
      {
        status: 404,
      },
    );

/**
 * GET    /api/games/:gameId/follow — the follower count, and whether the caller follows.
 * PUT    /api/games/:gameId/follow — follow the game.
 * DELETE /api/games/:gameId/follow — unfollow it.
 * Session only: a write touches the caller's own row, never one named in the request.
 */
export const route =
  apiRoute(
    '/api/games/$gameId/follow',
    {
      GET: implement(
        getGameFollowApi,
        {
          auth: 'optional',
          rateLimit:
            'read',
        },
        async ({
          userId,
          params,
        }) =>
          updatesGame(
            params.gameId,
          )
            ? getFollowState(
                userId,
                params.gameId,
              )
            : notFound(),
      ),
      PUT: implement(
        followGameApi,
        {
          rateLimit:
            'write',
        },
        async ({
          userId,
          params,
        }) =>
          updatesGame(
            params.gameId,
          )
            ? followGame(
                userId,
                params.gameId,
              )
            : notFound(),
      ),
      DELETE:
        implement(
          unfollowGameApi,
          {
            rateLimit:
              'write',
          },
          async ({
            userId,
            params,
          }) =>
            // Unfollowing a title that stopped being listed still works: the row is the member's own.
            unfollowGame(
              userId,
              params.gameId,
            ),
        ),
    },
  );
