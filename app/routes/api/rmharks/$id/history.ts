import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { canViewPost } from '@/lib/feed/audience.server';
import { buildVersions } from '@/lib/feed/word-diff';

/**
 * GET /api/rmharks/:id/history — the post's public edit history (F23).
 *
 * Two rules the spec is explicit about, both enforced here rather than in the
 * component:
 *
 *  1. **History follows the post's visibility.** It runs through the same
 *     `canViewPost` predicate the post itself does, so a FOLLOWERS-only post's
 *     previous drafts are not a side door around the audience setting.
 *  2. **A deleted post's history goes with it.** A tombstoned post 404s here
 *     even though the `RMHarkEdit` rows physically survive until the cascade —
 *     otherwise "delete" would leave every earlier version readable, which is
 *     the opposite of what deleting means.
 *
 * The response is a version LIST, not a diff: diffing is pure and client-safe
 * (`lib/feed/word-diff.ts`), so the server ships text once and the reader's
 * browser renders whichever pair they are looking at.
 */
export const Route = createFileRoute('/api/rmharks/$id/history')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', label: 'GET /api/rmharks/$id/history' },
        async ({ params, userId }) => {
          const post = await prisma.rMHark.findUnique({
            where: { id: params.id },
            select: {
              id: true,
              userId: true,
              audience: true,
              content: true,
              createdAt: true,
              editedAt: true,
              deletedAt: true,
            },
          });

          if (!post || post.deletedAt) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }
          if (!(await canViewPost({ userId: post.userId, audience: post.audience }, userId))) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }

          const edits = await prisma.rMHarkEdit.findMany({
            where: { rmheetId: post.id },
            orderBy: { createdAt: 'asc' },
            select: { content: true, createdAt: true },
          });

          const versions = buildVersions(
            {
              content: post.content,
              createdAt: post.createdAt.toISOString(),
              editedAt: post.editedAt ? post.editedAt.toISOString() : null,
            },
            edits.map((edit) => ({
              content: edit.content,
              createdAt: edit.createdAt.toISOString(),
            })),
          );

          return Response.json({ postId: post.id, versions });
        },
      ),
    },
  },
});
