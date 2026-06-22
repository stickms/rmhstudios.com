import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { withDeveloperApi, apiJson, apiError, apiOptions } from '@/lib/api/with-developer-api.server';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-schema';
import { awardXp } from '@/lib/xp/engine.server';
import { progressQuests } from '@/lib/quests/engine.server';
import { resolveMediaForPost } from '@/lib/media/attach.server';

const createSchema = z
  .object({
    content: z.string().max(MAX_RMHARK_LENGTH).optional(),
    media_ids: z.array(z.string()).max(4).optional(),
    audience: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(),
  })
  .refine((v) => (v.content?.trim().length ?? 0) > 0 || (v.media_ids?.length ?? 0) > 0, {
    message: 'A post needs text content or at least one image.',
  });

/**
 * GET  /api/v1/posts — your recent posts (keyset by ?cursor=<ISO createdAt>).
 * POST /api/v1/posts — create a text post on your account.
 */
export const Route = createFileRoute('/api/v1/posts')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(request, async ({ userId }) => {
          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 50);

          const posts = await prisma.rMHark.findMany({
            where: { userId, deletedAt: null, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: { id: true, content: true, createdAt: true, likeCount: true, commentCount: true, repostCount: true, viewCount: true, audience: true },
          });

          const nextCursor = posts.length === limit ? posts[posts.length - 1].createdAt.toISOString() : null;
          return apiJson({
            data: posts.map((p) => ({
              id: p.id,
              content: p.content,
              audience: p.audience,
              createdAt: p.createdAt,
              metrics: { likes: p.likeCount, comments: p.commentCount, reposts: p.repostCount, views: p.viewCount },
            })),
            nextCursor,
          });
        }),

      POST: ({ request }) =>
        withDeveloperApi(request, async ({ userId }) => {
          const body = await request.json().catch(() => null);
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) {
            return apiError('invalid_request', parsed.error.issues[0]?.message ?? 'Invalid request body', 400);
          }

          const content = parsed.data.content?.trim() ?? "";
          const mediaIds = parsed.data.media_ids ?? [];

          // Create the post first so we have its id to attach media to.
          const post = await prisma.rMHark.create({
            data: { userId, content, audience: parsed.data.audience ?? 'PUBLIC' },
            select: { id: true, content: true, createdAt: true, audience: true },
          });

          if (mediaIds.length > 0) {
            const attached = await resolveMediaForPost({ prisma }, { userId, mediaIds, postId: post.id });
            if (!attached.ok) {
              // Roll back the just-created post so a bad media ref doesn't leave an empty post.
              await prisma.rMHark.delete({ where: { id: post.id } }).catch(() => {});
              return apiError('invalid_media', attached.error, 400);
            }
            await prisma.rMHark.update({ where: { id: post.id }, data: { imageUrls: attached.urls } });
          }

          await awardXp(userId, 25).catch(() => {});
          await progressQuests(userId, 'post').catch(() => {});

          return apiJson(
            { id: post.id, content: post.content, audience: post.audience, createdAt: post.createdAt },
            201
          );
        }),
    },
  },
});
