import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { notifyAdminsOfReview } from '@/lib/admin-review.server';
import { z } from 'zod';

/**
 * POST /api/moderation/report — file a content report for admin review.
 * Deduplicates: a user can only have one open report per entity.
 */
const reportSchema = z.object({
  entityType: z.enum(['rmhark', 'comment', 'user', 'build', 'dm']),
  entityId: z.string().min(1).max(64),
  reason: z.enum([
    'SPAM', 'HARASSMENT', 'HATE', 'VIOLENCE', 'SEXUAL',
    'SELF_HARM', 'MISINFORMATION', 'ILLEGAL', 'OTHER',
  ]),
  details: z.string().max(1000).optional(),
});

/** Best-effort lookup of who owns the reported content, for triage. */
async function resolveTargetUser(entityType: string, entityId: string): Promise<string | null> {
  try {
    switch (entityType) {
      case 'rmhark': {
        const r = await prisma.rMHark.findUnique({ where: { id: entityId }, select: { userId: true } });
        return r?.userId ?? null;
      }
      case 'comment': {
        const c = await prisma.rMHarkComment.findUnique({ where: { id: entityId }, select: { userId: true } });
        return c?.userId ?? null;
      }
      case 'build': {
        const b = await prisma.userBuild.findUnique({ where: { id: entityId }, select: { userId: true } });
        return b?.userId ?? null;
      }
      case 'user':
        return entityId;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export const Route = createFileRoute('/api/moderation/report')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 10,
            windowMs: 60_000,
            prefix: 'moderation-report',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many reports. Please slow down.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
          }

          const body = await request.json().catch(() => ({}));
          const parsed = reportSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 }
            );
          }

          const { entityType, entityId, reason, details } = parsed.data;

          // One open report per (reporter, entity) — silently succeed if it exists.
          const existing = await prisma.contentReport.findFirst({
            where: {
              reporterId: session.user.id,
              entityType,
              entityId,
              status: { in: ['PENDING', 'REVIEWING'] },
            },
            select: { id: true },
          });
          if (existing) {
            return Response.json({ success: true, alreadyReported: true });
          }

          const targetUserId = await resolveTargetUser(entityType, entityId);

          await prisma.contentReport.create({
            data: {
              reporterId: session.user.id,
              entityType,
              entityId,
              reason,
              details: details?.trim() || null,
              targetUserId,
            },
          });

          // Ping admins (grouped, non-blocking) that the moderation queue has
          // something new.
          void notifyAdminsOfReview({
            preview: `New ${entityType} report needs review`,
            kind: 'reports',
          });

          return Response.json({ success: true });
        } catch (error) {
          console.error('File report error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
