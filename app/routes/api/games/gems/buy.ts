import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { buyGems } from '@/lib/cards/gems.server';
import { gemsResponse } from '@/lib/cards/gems-api.server';

/** POST /api/games/gems/buy — buy gems with coins, 100 at a time (one coin each). */
export const Route = createFileRoute('/api/games/gems/buy')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ units: z.number().int().min(1).max(10) }) },
        ({ userId, body }) => gemsResponse(() => buyGems({ userId, units: body.units })),
      ),
    },
  },
});
