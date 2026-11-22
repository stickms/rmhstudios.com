import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listRepostMutesApi, setRepostMuteApi } from '@/lib/feed/repost-mutes.contract';
import { repostMuteBodySchema, repostMuteListQuerySchema } from '@/lib/feed/repost-mutes-schema';
import { REPOST_MUTE_LIMIT } from '@/lib/feed/repost-mutes';
import { listRepostMutes, RepostMuteError, toggleRepostMute } from '@/lib/feed/repost-mutes.server';
import { invalidateViewerFeedPages } from '@/lib/feed/timeline';

/**
 * `/api/feed/repost-mutes` — the caller's "turn off reposts" list (sprint 05 #07). GET pages it (or answers whether one
 * person is off); POST turns a person's reposts off or back on. Only ever the caller's own rows. Turning a person back
 * on drops the caller's cached first page so their reposts return on the next read; turning one off is reconciled when
 * a cached page is served (`page-reconcile.server.ts`).
 */
export const route = apiRoute('/api/feed/repost-mutes', {
  GET: implement(
    listRepostMutesApi,
    {
      rateLimit: 'read',
      query: repostMuteListQuerySchema,
    },
    async ({ userId, query }) =>
      Response.json(await listRepostMutes(userId, query), {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      }),
  ),
  POST: implement(
    setRepostMuteApi,
    {
      rateLimit: 'write',
      body: repostMuteBodySchema,
    },
    async ({ userId, body }) => {
      try {
        const result = await toggleRepostMute(userId, body.targetUserId, body.off);
        if (!body.off) await invalidateViewerFeedPages(userId);
        return Response.json({
          off: result.off,
        });
      } catch (err) {
        if (err instanceof RepostMuteError) {
          if (err.code === 'self') {
            return Response.json(
              {
                error: 'You cannot turn off your own reposts',
              },
              {
                status: 400,
              },
            );
          }
          if (err.code === 'not-found')
            return Response.json(
              {
                error: 'Member not found',
              },
              {
                status: 404,
              },
            );
          return Response.json(
            {
              error: `You can turn off reposts from at most ${REPOST_MUTE_LIMIT.toLocaleString('en-US')} people`,
            },
            {
              status: 409,
            },
          );
        }
        throw err;
      }
    },
  ),
});
