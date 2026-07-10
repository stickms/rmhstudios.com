import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { apiAuthorSelect, serializeAuthor, parsePage, page } from '@/lib/api/serializers.server';
import { createComment } from '@/lib/social/engagement.server';
import { MAX_COMMENT_LENGTH } from '@/lib/rmhark-schema';

const bodySchema = z.object({
  content: z.string().min(1).max(MAX_COMMENT_LENGTH),
  parent_id: z.string().max(64).optional(),
});

/**
 * GET  /api/v1/posts/{id}/comments — top-level comments, newest first.
 * POST /api/v1/posts/{id}/comments — add a comment or threaded reply.
 */
export const Route = createFileRoute('/api/v1/posts/$id/comments')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ json }) => {
            const { limit, cursor } = parsePage(new URL(request.url));
            const comments = await prisma.rMHarkComment.findMany({
              where: { rmheetId: params.id, parentId: null, deletedAt: null, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
              orderBy: { createdAt: 'desc' },
              take: limit,
              select: { id: true, content: true, createdAt: true, parentId: true, user: { select: apiAuthorSelect } },
            });
            const data = comments.map((c) => ({
              id: c.id, content: c.content, createdAt: c.createdAt, parentId: c.parentId, author: serializeAuthor(c.user),
            }));
            return json(page(data, limit, (c) => c.createdAt.toISOString()));
          },
          { scope: 'read:feed' }
        ),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const body = await request.json().catch(() => null);
            const parsed = bodySchema.safeParse(body);
            if (!parsed.success) return error('invalid_request', parsed.error.issues[0]?.message ?? 'Invalid request body', 400);

            const result = await createComment({ userId, postId: params.id, content: parsed.data.content, parentId: parsed.data.parent_id ?? null });
            if (!result.found || !result.comment) return error('not_found', 'Post not found.', 404);
            const c = result.comment;
            return json({ id: c.id, content: c.content, createdAt: c.createdAt, parentId: c.parentId, author: serializeAuthor(c.user) }, 201);
          },
          { scope: 'write:comments', idempotent: true }
        ),
    },
  },
});
