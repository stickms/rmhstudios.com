/**
 * Slice It! showcase stats — `GET /api/slice-it/showcase?userId=`.
 *
 * Backs `components/profile/modules/SliceItModule.tsx` (X6). Public and read
 * rate-limited: the numbers it returns (skill rating, lamp counts, best
 * accuracy) are exactly what the leaderboard and the player page already show
 * to anyone, just pre-aggregated for a small card.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { sliceItShowcaseStats } from '@/lib/slice-it/showcase.server';

const QueryZ = z.object({ userId: z.string().min(1).max(64) });

export const Route = createFileRoute('/api/slice-it/showcase')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: QueryZ },
        async ({ query }) => {
          const stats = await sliceItShowcaseStats(query.userId);
          return Response.json({ stats });
        },
      ),
    },
  },
});
