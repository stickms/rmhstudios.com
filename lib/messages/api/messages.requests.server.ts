import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listMessageRequestsApi } from '@/lib/messages/requests.contract';
import { listRequestsQuery } from '@/lib/messages/requests-schema';
import { listRequests } from '@/lib/messages/requests.server';

/** GET /api/messages/requests — the Requests folder: pending message requests waiting for the viewer */

export const route = apiRoute('/api/messages/requests', {
  GET: implement(listMessageRequestsApi, { rateLimit: 'read', query: listRequestsQuery }, async ({ userId, query }) =>
    listRequests(userId, { cursor: query.cursor }),
  ),
});
