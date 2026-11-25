import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { reviewCardApi } from '@/lib/study/decks.contract';
import { reviewCardBody } from '@/lib/study/decks-schema';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import type { Grade } from '@/lib/rmhstudy/srs';
import { reviewCard } from '@/lib/study/review.server';

/** POST /api/study/cards/$id/review — submit an SRS grade for a card. */
export const route = apiRoute('/api/study/cards/$id/review', {
  POST: implement(
    reviewCardApi,
    {
      body: reviewCardBody,
      invalid: () => Response.json({ error: 'Invalid grade' }, { status: 400 }),
    },
    async ({ request, params, session, body }) => {
      const userId = session.user.id;

      const ip = getClientIp(request);
      const { allowed } = rateLimit(ip, {
        limit: 120,
        windowMs: 60_000,
        prefix: 'card-review',
      });
      if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

      const result = await reviewCard(userId, params.id, body.grade as Grade, { rewards: true });
      if (!result.ok) return Response.json({ error: 'Not found' }, { status: 404 });

      return Response.json({
        success: true,
        dueAt: result.dueAt,
        intervalDays: result.intervalDays,
        leech: result.leech,
      });
    },
  ),
});
