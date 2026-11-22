import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { applyDeckUpdatesApi, deckUpdatesApi } from '@/lib/study/deck-sync.contract';
import { applyUpdatesBody } from '@/lib/study/deck-sync-schema';
import { applyUpdates, deckUpdates } from '@/lib/study/deck-sync.server';

/**
 * GET  /api/study/decks/$id/updates — what the author of the original changed (copy's owner).
 * POST /api/study/decks/$id/updates — apply the chosen rows in place, keeping review progress.
 */
export const route = apiRoute('/api/study/decks/$id/updates', {
  GET: implement(
    deckUpdatesApi,
    {
      rateLimit: 'read',
    },
    async ({ userId, params }) => {
      const result = await deckUpdates(userId, params.id);
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
            ...refusalCodeOf(result),
          },
          {
            status: result.status,
          },
        );
      return {
        state: result.state,
        diff: result.diff,
      };
    },
  ),

  POST: implement(
    applyDeckUpdatesApi,
    {
      rateLimit: 'write',
      body: applyUpdatesBody,
    },
    async ({ userId, params, body }) => {
      const result = await applyUpdates(userId, params.id, body.items);
      if (!result.ok)
        return Response.json(
          {
            error: result.error,
            ...refusalCodeOf(result),
          },
          {
            status: result.status,
          },
        );
      return {
        success: true as const,
        applied: result.applied,
        skipped: result.skipped,
        leftOut: result.leftOut,
      };
    },
  ),
});
