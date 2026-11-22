import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { communityEventsApi } from '@/lib/communities/events.contract';
import { communityEventsQuery } from '@/lib/communities/events-schema';
import { communityWithRole } from '@/lib/communities/guard.server';
import { canViewCommunityEvents, listCommunityPastEvents, listEvents } from '@/lib/events.server';

/**
 * GET /api/communities/$slug/events?when=upcoming|past — a community's events for its Events tab.
 *
 * An unknown slug and a private community the caller is not in answer the same empty list. `listEvents` and
 * `listCommunityPastEvents` each apply `canViewCommunityEvents` themselves; it is asserted here too, so the check does
 * not depend on either. Hosting stays `POST /api/events` (its `canModerate` gate and the shared `event-create:<userId>`
 * budget), and RSVPs stay on their own routes with their sanction check.
 */
export const route = apiRoute('/api/communities/$slug/events', {
  GET: implement(
    communityEventsApi,
    { auth: 'optional', rateLimit: 'read', query: communityEventsQuery },
    async ({ params, userId, query }) => {
      const community = await communityWithRole(params.slug, userId);
      if (!community || !(await canViewCommunityEvents(community.id, userId))) {
        return Response.json({ events: [] });
      }
      const events =
        query.when === 'past'
          ? await listCommunityPastEvents(community.id, userId)
          : await listEvents({ scope: 'community', communityId: community.id, userId });
      return { events };
    },
  ),
});
