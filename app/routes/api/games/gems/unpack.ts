import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { unpackCards } from '@/lib/cards/gems.server';
import { gemsResponse } from '@/lib/cards/gems-api.server';

/** POST /api/games/gems/unpack — destroy cards you hold for gems. */
export const Route = createFileRoute('/api/games/gems/unpack')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({
            gameId: z.string().min(1).max(64),
            cardIndex: z.number().int().min(0).max(63),
            foil: z.boolean().default(false),
            qty: z.number().int().min(1).max(99).default(1),
          }),
        },
        ({ userId, body }) => gemsResponse(() => unpackCards({ userId, ...body })),
      ),
    },
  },
});
