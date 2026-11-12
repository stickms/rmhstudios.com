import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { customizeLookApi } from '@/lib/cards/steam.contract';
import { customizeLookBody } from '@/lib/cards/steam-schema';
import { saveLook } from '@/lib/games/showcase.server';

/** POST /api/games/customize — choose your profile background and avatar frame (only ones your badges unlocked). */
export const route = apiRoute('/api/games/customize', {
  POST: implement(
    customizeLookApi,
    {
      rateLimit: 'write',
      body: customizeLookBody,
    },
    async ({ userId, body }) => Response.json(await saveLook(userId, body)),
  ),
});
