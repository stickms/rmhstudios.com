/**
 * GET /api/settings/blocked — the signed-in member's own blocks or mutes, newest first (s05-14).
 *
 * Owner-only by construction: the member id comes from the session, never from the request. Unblock and unmute use
 * the existing `/api/moderation/{block,mute}` endpoints with an explicit intent.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listBlockedMutedApi } from '@/lib/moderation/blocked-muted.contract';
import { blockedMutedQuery } from '@/lib/moderation/blocked-muted-schema';
import { BlockedMutedCursorError, listBlockedMuted } from '@/lib/moderation/blocked-muted.server';

export const route = apiRoute('/api/settings/blocked', {
  GET: implement(
    listBlockedMutedApi,
    { rateLimit: 'read', query: blockedMutedQuery },
    async ({ userId, query }) => {
      try {
        const page = await listBlockedMuted(userId, query.tab, { q: query.q, after: query.after });
        return Response.json(page, { headers: { 'Cache-Control': 'private, no-store' } });
      } catch (err) {
        if (err instanceof BlockedMutedCursorError) {
          return Response.json({ error: 'Invalid cursor' }, { status: 400 });
        }
        throw err;
      }
    },
  ),
});
