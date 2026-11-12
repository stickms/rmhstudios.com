import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { openPack } from '@/lib/cards/gems.server';
import { gemsResponse } from '@/lib/cards/gems-api.server';

/** POST /api/games/gems/pack — spend a pack's worth of gems on a booster pack for a title. */
export const route = apiRoute('/api/games/gems/pack', {
  POST: defineHandler(
    { rateLimit: 'write', body: z.object({ gameId: z.string().min(1).max(64) }) },
    ({ userId, body }) => gemsResponse(() => openPack({ userId, gameId: body.gameId })),
  ),
});
