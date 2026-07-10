import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-schema';

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
      PATCH: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const existing = await prisma.scheduledPost.findUnique({ where: { id: params.id } });
          if (!existing || existing.userId !== session.user.id) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }
          if (existing.publishedId) {
            return Response.json({ error: 'Already published' }, { status: 409 });
          }

          const body = await request.json().catch(() => ({}));
          const parsed = patchSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
          }
          const d = parsed.data;

          let scheduledAt: Date | null | undefined;
          if (d.scheduledAt !== undefined) {
            if (d.scheduledAt === null) {
              scheduledAt = null;
            } else {
              scheduledAt = new Date(d.scheduledAt);
              if (scheduledAt.getTime() <= Date.now()) {
                return Response.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
              }
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
        } catch (error) {
          console.error('Scheduled patch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      // Discard a draft/scheduled post.
      DELETE: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const existing = await prisma.scheduledPost.findUnique({ where: { id: params.id } });
          if (!existing || existing.userId !== session.user.id) {
            return Response.json({ error: 'Not found' }, { status: 404 });
          }

          await prisma.scheduledPost.delete({ where: { id: params.id } });
          return Response.json({ success: true });
        } catch (error) {
          console.error('Scheduled delete error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
