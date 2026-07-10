import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-schema';
import { createPost } from '@/lib/social/engagement.server';
import { parsePage, page, serializeOwnPost } from '@/lib/api/serializers.server';

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
 * POST /api/v1/posts — create a post on your account.
 */
export const Route = createFileRoute('/api/v1/posts')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json }) => {
            const { limit, cursor } = parsePage(new URL(request.url));
            const posts = await prisma.rMHark.findMany({
              where: { userId, deletedAt: null, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
              orderBy: { createdAt: 'desc' },
              take: limit,
              select: { id: true, content: true, createdAt: true, likeCount: true, commentCount: true, repostCount: true, viewCount: true, audience: true, imageUrls: true },
            });
            return json(page(posts.map(serializeOwnPost), limit, (p) => p.createdAt.toISOString()));
          },
          { scope: 'read:posts' }
        ),

      POST: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const body = await request.json().catch(() => null);
            const parsed = createSchema.safeParse(body);
            if (!parsed.success) {
              return error('invalid_request', parsed.error.issues[0]?.message ?? 'Invalid request body', 400);
            }

            const result = await createPost({
              userId,
              content: parsed.data.content ?? '',
              audience: parsed.data.audience ?? 'PUBLIC',
              mediaIds: parsed.data.media_ids ?? [],
            });
            if (!result.ok || !result.post) {
              return error('invalid_media', result.error ?? 'Could not create post', 400);
            }
            const p = result.post;
            return json({ id: p.id, content: p.content, audience: p.audience, createdAt: p.createdAt }, 201);
          },
          { scope: 'write:posts', idempotent: true }
        ),
    },
  },
});
