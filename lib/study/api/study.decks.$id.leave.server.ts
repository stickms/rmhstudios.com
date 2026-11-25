import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { leaveDeckApi } from '@/lib/study/deck-editors.contract';
import { leaveDeck } from '@/lib/study/deck-editors.server';

/** POST /api/study/decks/$id/leave — an editor leaves a deck; their reviews stay theirs. */
export const route = apiRoute('/api/study/decks/$id/leave', {
  POST: implement(leaveDeckApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const result = await leaveDeck(userId, params.id);
    if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
    return { success: true as const };
  }),
});
