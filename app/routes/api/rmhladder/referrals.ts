import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { createOfferSchema } from '@/lib/rmhladder/community';
import { createOffer, loadBoard } from '@/lib/rmhladder/community.server';

/**
 * GET  /api/rmhladder/referrals?q= — open offers from other members, plus the
 *      caller's own offers (with who asked) and the requests they have sent.
 * POST /api/rmhladder/referrals    — offer referrals at a company (F6).
 */
export const Route = createFileRoute('/api/rmhladder/referrals')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: 'read', query: z.object({ q: z.string().trim().max(120).optional() }) },
        async ({ userId, query }) =>
          Response.json(await loadBoard(userId, query.q), {
            headers: { 'Cache-Control': 'private, no-store' },
          }),
      ),
      POST: defineHandler(
        {
          rateLimit: { limit: 5, windowMs: 3_600_000, prefix: 'ladder-referral-offer' },
          body: createOfferSchema,
        },
        async ({ userId, body }) => {
          const result = await createOffer(userId, body);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(result.value, { status: 201 });
        },
      ),
    },
  },
});
