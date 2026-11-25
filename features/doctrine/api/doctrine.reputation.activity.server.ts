import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getDoctrineActivityApi } from '@features/doctrine/engine/doctrine.contract';
import { activityDays } from '@features/doctrine/engine/ledger.server';

/** GET: the days the caller earned XP in the last 16 weeks. `tz` is an IANA name; anything else buckets in UTC. */
const query = z.object({
  tz: z.string().max(64).optional(),
});

export const route = apiRoute('/api/doctrine/reputation/activity', {
  GET: implement(getDoctrineActivityApi, { rateLimit: 'read', query }, async ({ userId, query }) =>
    activityDays(userId, new Date(), query.tz),
  ),
});
