import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteMedStatsApi, getMedStatsApi, putMedStatsApi } from '@features/medschools/medschools.contract';
import { READ_LIMIT, STATS_WRITE_LIMIT } from './me-http.server';
import { putStatsBody } from './stats-schemas';
import { clearStats, getStats, putStats } from './stats.server';

/**
 * `/api/medschools/me/stats`: the caller's own applicant stats (phase D). Signed in and private: no `cache` of any kind,
 * no id parameter, and nothing here is aggregated or read by any public path. GET reads, PUT replaces, DELETE removes
 * every stat the caller entered.
 */
export const route = apiRoute('/api/medschools/me/stats', {
  GET: implement(getMedStatsApi, { rateLimit: READ_LIMIT }, async ({ userId }) => getStats(userId)),
  PUT: implement(putMedStatsApi, { rateLimit: STATS_WRITE_LIMIT, body: putStatsBody }, async ({ userId, body }) =>
    putStats(userId, body),
  ),
  DELETE: implement(deleteMedStatsApi, { rateLimit: STATS_WRITE_LIMIT }, async ({ userId }) => clearStats(userId)),
});
