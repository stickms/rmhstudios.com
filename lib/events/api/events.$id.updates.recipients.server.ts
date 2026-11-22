import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { updateRecipientsApi } from '@/lib/events/updates.contract';
import { recipientsQuery } from '@/lib/events/updates-schema';
import { recipientCount, refused } from '@/lib/events/updates.server';

/** GET /api/events/$id/updates/recipients?occurrenceAt=… — how many people a post would tell (host, co-host, admin). */
export const route = apiRoute('/api/events/$id/updates/recipients', {
  GET: implement(
    updateRecipientsApi,
    { rateLimit: 'read', query: recipientsQuery },
    async ({ params, userId, isAdmin, query }) => {
      try {
        const requested =
          query.occurrenceAt === undefined
            ? undefined
            : query.occurrenceAt === 'series'
              ? null
              : new Date(query.occurrenceAt);
        return { count: await recipientCount(params.id, userId, isAdmin, requested) };
      } catch (error) {
        return refused(error);
      }
    },
  ),
});
