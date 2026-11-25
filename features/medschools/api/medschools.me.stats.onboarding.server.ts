import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { putMedStatsOnboardingApi } from '@features/medschools/medschools.contract';
import { STATS_WRITE_LIMIT } from './me-http.server';
import { putOnboardingBody } from './stats-schemas';
import { skipOnboarding } from './stats.server';

/** `PUT /api/medschools/me/stats/onboarding`: "Skip for now", remembered on the account. Signed in, never cached. */
export const route = apiRoute('/api/medschools/me/stats/onboarding', {
  PUT: implement(putMedStatsOnboardingApi, { rateLimit: STATS_WRITE_LIMIT, body: putOnboardingBody }, async ({ userId }) =>
    skipOnboarding(userId),
  ),
});
