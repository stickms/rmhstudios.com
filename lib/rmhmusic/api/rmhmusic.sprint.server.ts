import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { loadSprintOverview } from '@/lib/rmhmusic/learn/sprint/sprint.server';
import { sprintOverviewApi } from '@/lib/rmhmusic/learn/sprint/sprint.contract';
import { sprintOverviewQuery, sprintOverviewRes } from '@/lib/rmhmusic/learn/sprint/sprint-schema';

/**
 * `GET /api/rmhmusic/sprint?date=YYYY-MM-DD` — the learner's sight reading bests per level, where
 * that date's daily challenge stands (`open`, `started`, `scored`) and the daily streak. Never
 * writes.
 */
export const route = apiRoute('/api/rmhmusic/sprint', {
  GET: implement(
    sprintOverviewApi,
    { rateLimit: 'read', query: sprintOverviewQuery, response: sprintOverviewRes },
    async ({ userId, query }) => loadSprintOverview(userId, query.date, Date.now()),
  ),
});
