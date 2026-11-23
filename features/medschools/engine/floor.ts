import { K_FLOOR, utcDayOf } from './public-read';
import type { MedSource } from './types';

/**
 * The one public floor, shared by the request tier (`api/read.server.ts`) and the forecast job
 * (`scrape/run-forecast.ts`). A plain object builder: no Prisma import, so the worker needs nothing from the API tier.
 * A forecast built on a different floor than the charts would publish an unpublished or sub-k RMH figure through a band.
 */

/**
 * The k floor as a where clause. An RMH row is public only through its daily snapshot (Q2): `publishedContributors >=
 * K_FLOOR` (null, never published, fails closed) and a date before today UTC. The live `count` / `contributors` follow
 * the tracker minute by minute and are never read for a public figure. Same rule as applyKFloor.
 */
export const floorWhere = (now: Date) => ({
  OR: [
    { source: { not: 'RMH' as const } },
    {
      source: 'RMH' as const,
      publishedContributors: { gte: K_FLOOR },
      date: { lt: new Date(`${utcDayOf(now)}T00:00:00.000Z`) },
    },
  ],
});

/** A summed groupBy row as one public figure: an RMH row's published total, any other source's `count`. */
export const publicSum = (source: MedSource, s: { count: number | null; publishedCount: number | null }): number =>
  (source === 'RMH' ? s.publishedCount : s.count) ?? 0;
