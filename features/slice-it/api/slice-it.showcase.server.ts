/**
 * Slice It! showcase stats — `GET /api/slice-it/showcase?userId=`.
 *
 * Backs `components/profile/modules/SliceItModule.tsx` (X6). Public and read
 * rate-limited: the numbers it returns (skill rating, lamp counts, best
 * accuracy) are exactly what the leaderboard and the player page already show
 * to anyone, just pre-aggregated for a small card.
 */

import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import * as C from '@features/slice-it/engine/slice-it.contract';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { sliceItShowcaseStats } from '@features/slice-it/engine/showcase.server';

const QueryZ = z.object({ userId: z.string().min(1).max(64) });

export const route = apiRoute('/api/slice-it/showcase', {
  GET: implement(
    C.getSliceItShowcaseApi,
    {
      auth: 'none',
      rateLimit: 'read',
      query: QueryZ,
      // Leaderboard-grade numbers for the ?userId= player, which is in the key.
      // Opt out of the 30 s micro-cache: run writes call invalidateSliceItShowcase.
      microCache: false,
      cache: CACHE_POLICY.leaderboard,
    },
    async ({ query }) => {
      const stats = await sliceItShowcaseStats(query.userId);
      return Response.json({ stats });
    },
  ),
});
