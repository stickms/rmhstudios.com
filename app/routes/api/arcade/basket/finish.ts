import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { finishBasket } from '@/lib/arcade/basket.server';

const bodySchema = z.object({
  score: z.number().int().min(0).max(1_000_000),
  detail: z.object({
    sorted: z.number().int().min(0).max(10_000),
    wrong: z.number().int().min(0).max(10_000),
    missed: z.number().int().min(0).max(10_000),
    bestCombo: z.number().int().min(0).max(10_000),
  }),
});

/** POST /api/arcade/basket/finish — file the counted attempt's score. */
export const Route = createFileRoute('/api/arcade/basket/finish')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'basket-finish' }, body: bodySchema },
        async ({ userId, body }) => {
          const r = await finishBasket(userId, body.score, body.detail);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ counted: r.counted });
        },
      ),
    },
  },
});
