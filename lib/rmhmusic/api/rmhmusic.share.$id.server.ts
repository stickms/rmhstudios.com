import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { stopShareApi } from '@/lib/music-social/share.contract';
import { stopShareRes } from '@/lib/rmhmusic/learn/social/share-schema';
import { stopShare } from '@/lib/rmhmusic/learn/social/share.server';

/**
 * `DELETE /api/rmhmusic/share/$id` — stop one shared result link (Phase 6). Owner-scoped: another
 * learner's id stops nothing and answers `stopped: 0`, so the answer does not say whether an id
 * exists. The link and its card read as gone from then on.
 */
export const route = apiRoute('/api/rmhmusic/share/$id', {
  DELETE: implement(stopShareApi, { rateLimit: 'write', response: stopShareRes }, async ({ userId, params }) => ({
    ok: true as const,
    stopped: await stopShare(userId, params.id, Date.now()),
  })),
});
