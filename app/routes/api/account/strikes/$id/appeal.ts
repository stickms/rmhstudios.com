/**
 * POST /api/account/strikes/$id/appeal — contest a strike issued against you.
 *
 * One appeal per strike, inside the appeal window, on a strike you actually
 * own. The ownership check is part of the same conditional update that files
 * the appeal (`updateMany` with userId + appealStatus NONE in the `where`), so
 * two concurrent submissions can't both land and a strike belonging to someone
 * else can't be reached by guessing its id.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { withRateLimit } from '@/lib/rate-limit';
import { notifyAdminsOfReview } from '@/lib/admin-review.server';
import { APPEAL_WINDOW_DAYS } from '@/lib/moderation/standing.server';

const schema = z.object({
  text: z.string().trim().min(20).max(2000),
});

export const Route = createFileRoute('/api/account/strikes/$id/appeal')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          // Appeals are cheap to write and expensive to review — keep the
          // per-user rate well under the generic write policy.
          const limited = withRateLimit(request, 'write', {
            scope: session.user.id,
            limit: 5,
            windowMs: 60 * 60 * 1000,
            prefix: 'appeal',
          });
          if (limited) return limited;

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: 'Your appeal must be between 20 and 2000 characters.' },
              { status: 400 }
            );
          }

          const strike = await prisma.userStrike.findFirst({
            where: { id: params.id, userId: session.user.id },
            select: { id: true, createdAt: true, appealStatus: true },
          });
          if (!strike) return Response.json({ error: 'Strike not found' }, { status: 404 });

          if (strike.appealStatus !== 'NONE') {
            return Response.json(
              { error: 'This strike has already been appealed.' },
              { status: 409 }
            );
          }

          const windowMs = APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
          if (Date.now() - strike.createdAt.getTime() > windowMs) {
            return Response.json(
              { error: `Appeals close ${APPEAL_WINDOW_DAYS} days after a strike is issued.` },
              { status: 409 }
            );
          }

          // Conditional update = the atomic guard. If a concurrent request got
          // here first, appealStatus is no longer NONE and this matches 0 rows.
          const { count } = await prisma.userStrike.updateMany({
            where: { id: params.id, userId: session.user.id, appealStatus: 'NONE' },
            data: {
              appealStatus: 'PENDING',
              appealText: parsed.data.text,
              appealedAt: new Date(),
            },
          });
          if (count === 0) {
            return Response.json(
              { error: 'This strike has already been appealed.' },
              { status: 409 }
            );
          }

          // Fire-and-forget: an appeal nobody is told about is a queue that
          // silently grows. `dedupeUnread` inside collapses a burst into one.
          await notifyAdminsOfReview({
            preview: 'A user has appealed a moderation strike.',
            kind: 'appeals',
            link: '/admin/appeals',
          });

          return Response.json({ success: true, appealStatus: 'PENDING' });
        } catch (error) {
          console.error('strike appeal error:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
