import { refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { moveDeckApi } from '@/lib/study/folders.contract';
import { moveDeckBody } from '@/lib/study/folders-schema';
import { moveDeck } from '@/lib/study/folders.server';

/** PUT /api/study/decks/$id/folder — put your deck in one of your folders, or none (`folderId: null`). */
export const route = apiRoute('/api/study/decks/$id/folder', {
  PUT: implement(moveDeckApi, { rateLimit: 'write', body: moveDeckBody }, async ({ userId, params, body }) => {
    const result = await moveDeck(userId, params.id, body.folderId);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return { success: true as const };
  }),
});
