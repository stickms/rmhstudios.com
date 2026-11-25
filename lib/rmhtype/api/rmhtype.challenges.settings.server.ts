/** `PUT /api/rmhtype/challenges/settings` — turn challenges on or off for the caller. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { setRmhTypeChallengeSettingsApi } from '@/lib/rmhtype/challenges.contract';
import { challengeSettingsBody } from '@/lib/rmhtype/challenges-schema';
import { setChallengesEnabled } from '@/lib/rmhtype/challenges.server';

export const route = apiRoute('/api/rmhtype/challenges/settings', {
  PUT: implement(
    setRmhTypeChallengeSettingsApi,
    { rateLimit: 'write', body: challengeSettingsBody },
    async ({ userId, body }) => ({
      success: true as const,
      enabled: await setChallengesEnabled(userId, body.enabled),
    }),
  ),
});
