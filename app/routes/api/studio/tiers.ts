import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import {
  listTiers,
  saveTiers,
  TierError,
  MAX_TIERS,
  TIER_PRICE_MIN,
  TIER_PRICE_MAX,
} from '@/lib/creator/tiers.server';

const tierSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(40),
  priceCoins: z.number().int().min(TIER_PRICE_MIN).max(TIER_PRICE_MAX),
  // Perk keys are validated (unknowns dropped) server-side in saveTiers.
  perks: z.array(z.string().max(32)).max(8).default([]),
  sortOrder: z.number().int().min(0).max(99),
});

const putSchema = z.object({ tiers: z.array(tierSchema).min(1).max(MAX_TIERS) });

/**
 * GET  /api/studio/tiers — the caller's active membership tiers.
 * PUT  /api/studio/tiers — replace the caller's tier set (1–3).
 */
export const Route = createFileRoute('/api/studio/tiers')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        return Response.json({ tiers: await listTiers(session.user.id) });
      }),

      PUT: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'studio-tiers' },
          body: putSchema,
          allowEmptyBody: true,
          invalid: () => Response.json({ error: 'Invalid input' }, { status: 400 }),
        },
        async ({ session, body }) => {
          try {
            const tiers = await saveTiers(session.user.id, body.tiers);
            return Response.json({ tiers });
          } catch (error) {
            if (error instanceof TierError) {
              return Response.json({ error: error.message }, { status: 400 });
            }
            throw error;
          }
        },
      ),
    },
  },
});
