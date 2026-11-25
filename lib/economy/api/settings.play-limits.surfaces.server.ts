import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { isSelfExcluded } from '@/lib/economy/play-limits.server';
import { getRiskSurfacesApi } from '@/lib/economy/play-limits.contract';

/**
 * `/api/settings/play-limits/surfaces` — the one bit the navigation and search filters need (W8).
 *
 * `{ hidden }` is true only while the member is self-excluded; a cool-off does not hide anything. It carries no date
 * (the settings panel owns those) and is false for a signed-out caller, who cannot be excluded. Private and brief:
 * the answer follows the member, and the client sets it directly when they change a limit.
 */
export const route = apiRoute('/api/settings/play-limits/surfaces', {
  GET: implement(
    getRiskSurfacesApi,
    { auth: 'optional', rateLimit: 'read', cache: { visibility: 'private', maxAge: 60 } },
    async ({ userId }) => ({ hidden: userId ? await isSelfExcluded(userId) : false }),
  ),
});
