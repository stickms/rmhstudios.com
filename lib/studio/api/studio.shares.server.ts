import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { createShareApi, listSharesApi } from '@/lib/studio/share.contract';
import { createShareBody } from '@/lib/studio/share-schema';
import { MAX_LIVE_SHARES } from '@/lib/studio/share';
import { createShare, listShares } from '@/lib/studio/share.server';

/** GET the member's own shares (with their tokens, for "Copy link"); POST shares a snapshot of a cloud project. */
export const route = apiRoute('/api/studio/shares', {
  GET: implement(listSharesApi, { rateLimit: 'read' }, async ({ userId }) => ({
    shares: await listShares(userId),
    limit: MAX_LIVE_SHARES,
  })),

  POST: implement(createShareApi, { rateLimit: 'write', body: createShareBody }, async ({ userId, body }) => {
    const result = await createShare(userId, body.projectId);
    if (result.ok) return { share: result.share };
    if (result.reason === 'limit')
      return Response.json(refusalBody('STUDIO_SHARE_LIMIT', { max: result.max }), { status: 409 });
    if (result.reason === 'too-large') return Response.json(refusalBody('INVALID_INPUT'), { status: 413 });
    return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
  }),
});
