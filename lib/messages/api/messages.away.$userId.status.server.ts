import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { awayStatusApi } from '@/lib/messages/away.contract';
import { awayStatusQuery } from '@/lib/messages/away-schema';
import { awayStatusFor } from '@/lib/messages/away.server';

/**
 * GET /api/messages/away/$userId/status - is this member away, and until when. Never the text, and nothing at all
 * unless the caller could message the member (blocks, mutes, DM privacy); the header needs an accepted conversation
 * and the profile line the member's opt-in.
 */
export const route = apiRoute('/api/messages/away/$userId/status', {
  GET: implement(awayStatusApi, { rateLimit: 'read', query: awayStatusQuery }, async ({ userId, params, query }) =>
    awayStatusFor(userId, params.userId, query.context),
  ),
});
