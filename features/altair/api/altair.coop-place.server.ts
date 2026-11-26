import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@features/altair/engine/altair.contract';
import { COOP_BOARD_KINDS } from '@features/altair/engine/coop-record';
import { coopOwnPlace } from '@features/altair/engine/coop-record.server';

/**
 * GET — where the signed-in caller stands on a co-op board when they are outside the ten it lists ("You: 34th").
 * It is per caller, so it is its own route, declared private and never stored (`Vary: Cookie`); the public board route
 * stays cacheable. Signed out, hidden from boards, unranked or inside the ten: `null`. The board-privacy filter
 * (`leaderboardHiddenUserIds()`) runs in `coopOwnPlace`, which is why this file is a `via` exemption in
 * `lib/game/leaderboard-privacy.ts`.
 */
export const route = apiRoute('/api/altair/coop-place', {
  GET: implement(
    C.getAltairCoopPlaceApi,
    {
      auth: 'optional',
      query: z.object({ type: z.enum(COOP_BOARD_KINDS) }),
      rateLimit: 'read',
      cache: { visibility: 'private', maxAge: 0 },
    },
    async ({ userId, query }) => Response.json(userId ? await coopOwnPlace(userId, query.type) : null),
  ),
});
