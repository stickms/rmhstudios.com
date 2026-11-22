import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getSecurityActivityApi } from '@/lib/auth/security-log.contract';
import { securityActivityQuery } from '@/lib/auth/security-log-schema';
import { listSecurityEvents } from '@/lib/auth/security-log.server';

/**
 * GET /api/settings/security/activity?cursor=&filter= — a page of the signed-in member's own
 * security log, newest first. Session only: the user id comes from the session, never the request.
 */
export const route = apiRoute('/api/settings/security/activity', {
  GET: implement(
    getSecurityActivityApi,
    { rateLimit: 'read', query: securityActivityQuery },
    async ({ userId, session, query }) =>
      listSecurityEvents(userId, {
        ...query,
        currentSessionId: session.session?.id ?? null,
      }),
  ),
});
