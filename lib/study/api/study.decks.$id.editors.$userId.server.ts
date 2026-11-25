import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { removeDeckEditorApi } from '@/lib/study/deck-editors.contract';
import { removeEditor } from '@/lib/study/deck-editors.server';

/** DELETE /api/study/decks/$id/editors/$userId — the owner removes an editor or withdraws an invitation. */
export const route = apiRoute('/api/study/decks/$id/editors/$userId', {
  DELETE: implement(removeDeckEditorApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const result = await removeEditor(userId, params.id, params.userId);
    if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
    return { success: true as const };
  }),
});
