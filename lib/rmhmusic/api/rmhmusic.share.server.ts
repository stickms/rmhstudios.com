import { apiRoute } from '@/lib/api/route.server';
import { apiError, badRequest } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { createShareApi, listSharesApi, stopAllSharesApi } from '@/lib/rmhmusic/social/share.contract';
import { createShareBody, shareListRes, shareSummarySchema, stopShareRes } from '@/lib/rmhmusic/learn/social/share-schema';
import { createShare, listShares, stopAllShares } from '@/lib/rmhmusic/learn/social/share.server';

/**
 * `/api/rmhmusic/share` — the learner's shared result links (Phase 6, plan 1.4).
 *
 * - `POST` makes a link to a scored Daily run (`{ kind: 'daily', date }`) or a song best (`{ kind:
 *   'song', songId, mode }`), with the name and picture only when `showName` is true; the server
 *   builds what the link shows from its own rows. Answers the live link already made for the same
 *   result and name choice. 400 when there is nothing to share, 409 past 50 live links. A bucket
 *   of its own, 20 an hour per learner.
 * - `GET` lists the learner's live links; `DELETE` stops all of them.
 */
export const route = apiRoute('/api/rmhmusic/share', {
  GET: implement(listSharesApi, { rateLimit: 'read', response: shareListRes }, async ({ userId }) => ({
    shares: await listShares(userId, Date.now()),
  })),
  POST: implement(
    createShareApi,
    {
      rateLimit: { policy: 'write', scope: 'user', limit: 20, windowMs: 3_600_000, prefix: 'rmhmusic-share' },
      body: createShareBody,
      response: shareSummarySchema,
    },
    async ({ userId, body }) => {
      const res = await createShare(userId, body, Date.now());
      if (res.ok) return res.share;
      return res.reason === 'cap'
        ? apiError('You have 50 shared links. Stop sharing one to share another.', 409)
        : badRequest('There is no saved result to share.');
    },
  ),
  DELETE: implement(stopAllSharesApi, { rateLimit: 'write', response: stopShareRes }, async ({ userId }) => ({
    ok: true as const,
    stopped: await stopAllShares(userId, Date.now()),
  })),
});
