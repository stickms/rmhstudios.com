import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { giveAwardSchema, AWARD_ENTITY_TYPES, type AwardEntityType } from '@/lib/awards/catalog';
import { giveAward, listAwards, AwardError } from '@/lib/awards/awards.server';

/**
 * GET  /api/awards?entityType=&entityId= — grouped award summary for content.
 * POST /api/awards { awardId, entityType, entityId, anonymous? } — give an award.
 */
export const Route = createFileRoute('/api/awards/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const entityType = url.searchParams.get('entityType');
          const entityId = url.searchParams.get('entityId');
          if (
            !entityId ||
            !entityType ||
            !(AWARD_ENTITY_TYPES as readonly string[]).includes(entityType)
          ) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }
          return Response.json(await listAwards(entityType as AwardEntityType, entityId));
        } catch (error) {
          console.error('Awards list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 20,
            windowMs: 60_000,
            prefix: 'awards',
          });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => null);
          const parsed = giveAwardSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          try {
            const result = await giveAward(session.user.id, parsed.data);
            return Response.json({ ok: true, balance: result.balance });
          } catch (e) {
            if (e instanceof AwardError) {
              const status =
                e.message === 'INSUFFICIENT_COINS'
                  ? 400
                  : e.message === 'SELF_AWARD'
                    ? 400
                    : e.message === 'ENTITY_NOT_FOUND'
                      ? 404
                      : 400;
              return Response.json({ error: e.message }, { status });
            }
            throw e;
          }
        } catch (error) {
          console.error('Award give error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
