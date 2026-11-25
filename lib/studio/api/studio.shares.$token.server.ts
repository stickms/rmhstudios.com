import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { readShareApi, revokeShareApi } from '@/lib/studio/share.contract';
import { shareTokenSchema } from '@/lib/studio/share-schema';
import { readShare, revokeShare } from '@/lib/studio/share.server';

/** One answer for a revoked, hidden, unknown or malformed token, so a token cannot be probed. */
const notFound = () =>
  Response.json(refusalBody('NOT_FOUND'), { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

/**
 * GET a share by its token (a visitor, signed in or not); DELETE stops sharing (the sharer only). The token is the
 * only handle and is never logged.
 */
export const route = apiRoute('/api/studio/shares/$token', {
  GET: implement(
    readShareApi,
    { auth: 'optional', rateLimit: { limit: 30, windowMs: 60_000, prefix: 'studio-share-read' } },
    async ({ userId, params }) => {
      const token = shareTokenSchema.safeParse(params.token);
      if (!token.success) return notFound();
      const share = await readShare(token.data, userId);
      if (!share) return notFound();
      return Response.json({ share }, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),

  DELETE: implement(revokeShareApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const token = shareTokenSchema.safeParse(params.token);
    if (!token.success) return notFound();
    return (await revokeShare(userId, token.data)) ? { success: true as const } : notFound();
  }),
});
