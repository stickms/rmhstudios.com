import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { requireMod } from '@/lib/communities/guard.server';
import { noteCountsApi } from '@/lib/communities/member-notes.contract';
import { noteCountsQuery } from '@/lib/communities/member-notes-schema';
import { parseIdList } from '@/lib/communities/member-notes';
import { countNotes } from '@/lib/communities/member-notes.server';

/** GET /api/communities/$slug/notes/counts?userIds=a,b,c — live note counts for a page of members (moderators only, at most 50). */
export const route = apiRoute('/api/communities/$slug/notes/counts', {
  GET: implement(noteCountsApi, { rateLimit: 'read', query: noteCountsQuery }, async ({ params, userId, query }) => {
    const guard = await requireMod(params.slug, userId);
    if (!guard.ok) return guard.response;
    return { counts: await countNotes(guard.value.id, parseIdList(query.userIds)) };
  }),
});
