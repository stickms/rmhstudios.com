import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { giveAwardSchema, AWARD_ENTITY_TYPES, type AwardEntityType } from '@/lib/awards/catalog';
import { giveAward, listAwards, AwardError } from '@/lib/awards/awards.server';

/**
 * GET  /api/awards?entityType=&entityId= — grouped award summary for content.
 * POST /api/awards { awardId, entityType, entityId, anonymous? } — give an award.
 */
export const Route = createFileRoute('/api/awards/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ request }) => {
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
      }),

      POST: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'awards' } },
        async ({ request, session }) => {
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
        },
      ),
    },
  },
});
