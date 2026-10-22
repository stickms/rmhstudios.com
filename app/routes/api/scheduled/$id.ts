import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-schema';
import {
  checkScheduledCommunityPost,
  logScheduledRemoval,
} from '@/lib/scheduled/community-gate.server';

const patchSchema = z.object({
  content: z.string().max(MAX_RMHARK_LENGTH).optional(),
  audience: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(),
  unlockPrice: z.number().int().min(0).max(1_000_000).nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

export const Route = createFileRoute('/api/scheduled/$id')({
  server: {
    handlers: {
      // Edit a draft/scheduled post.
      PATCH: defineHandler(
        { body: patchSchema, allowEmptyBody: true, verboseValidationErrors: true },
        async ({ params, session, body }) => {
          const existing = await prisma.scheduledPost.findUnique({ where: { id: params.id } });
          if (!existing || existing.userId !== session.user.id) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }
          if (existing.publishedId) {
            return Response.json({ error: 'Already published' }, { status: 409 });
          }

          // Z7: a sealed time capsule is cancelled (DELETE), never edited.
          if (existing.isCapsule) {
            return Response.json({ error: 'A time capsule is sealed' }, { status: 409 });
          }

          const d = body;

          let scheduledAt: Date | null | undefined;
          if (d.scheduledAt !== undefined) {
            if (d.scheduledAt === null) {
              scheduledAt = null;
            } else {
              scheduledAt = new Date(d.scheduledAt);
              if (scheduledAt.getTime() <= Date.now()) {
                return Response.json(
                  { error: 'Scheduled time must be in the future' },
                  { status: 400 },
                );
              }
            }
          }

          // Editing the text of (or scheduling) a community draft re-runs the
          // community gate, so a clean draft can't be edited into something
          // AutoMod would have refused.
          if (existing.communityId && (d.content !== undefined || scheduledAt)) {
            const content = d.content !== undefined ? d.content.trim() : existing.content;
            const verdict = await checkScheduledCommunityPost({
              userId: session.user.id,
              communityId: existing.communityId,
              content,
              gifUrl: existing.gifUrl,
              imageUrls: existing.imageUrls,
              hasPoll: !!existing.poll,
            });
            if (!verdict.ok) {
              if (verdict.removedBy) {
                await logScheduledRemoval(
                  { userId: session.user.id, communityId: existing.communityId, content },
                  verdict.removedBy,
                ).catch(() => {});
              }
              return Response.json(
                { error: verdict.error, code: verdict.code },
                { status: verdict.status },
              );
            }
          }

          const updated = await prisma.scheduledPost.update({
            where: { id: params.id },
            data: {
              ...(d.content !== undefined ? { content: d.content.trim() } : {}),
              ...(d.audience !== undefined ? { audience: d.audience } : {}),
              ...(d.unlockPrice !== undefined
                ? { unlockPrice: d.unlockPrice && d.unlockPrice > 0 ? d.unlockPrice : null }
                : {}),
              ...(scheduledAt !== undefined ? { scheduledAt } : {}),
            },
          });

          return Response.json(updated);
        },
      ),

      // Discard a draft/scheduled post.
      DELETE: defineHandler({}, async ({ params, session }) => {
        const existing = await prisma.scheduledPost.findUnique({ where: { id: params.id } });
        if (!existing || existing.userId !== session.user.id) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }

        await prisma.scheduledPost.delete({ where: { id: params.id } });
        return Response.json({ success: true });
      }),
    },
  },
});
