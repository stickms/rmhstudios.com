import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  getLeaderboardPrivacyApi,
  setLeaderboardPrivacyApi,
} from '@/lib/game/leaderboard-privacy.contract';
import { setLeaderboardPrivacyBody } from '@/lib/game/leaderboard-privacy-schema';
import { getLeaderboardPrivacy, setLeaderboardHidden } from '@/lib/game/leaderboard-privacy-settings.server';

/**
 * `/api/settings/leaderboard-privacy` — the caller's "show me on game leaderboards" switch. Only ever
 * the caller's own row; the boards enforce it (`lib/game/leaderboard-privacy.server.ts`), this route
 * only reads and writes the preference. No endpoint lists the hidden members.
 */
export const route = apiRoute('/api/settings/leaderboard-privacy', {
  GET: implement(getLeaderboardPrivacyApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json(await getLeaderboardPrivacy(userId), {
      headers: { 'Cache-Control': 'private, no-store' },
    }),
  ),
  PUT: implement(
    setLeaderboardPrivacyApi,
    { rateLimit: 'write', body: setLeaderboardPrivacyBody },
    async ({ userId, body }) => Response.json(await setLeaderboardHidden(userId, body.hidden)),
  ),
});
