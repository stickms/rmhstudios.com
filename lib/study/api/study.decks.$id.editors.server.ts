import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { inviteDeckEditorApi, listDeckEditorsApi } from '@/lib/study/deck-editors.contract';
import { inviteEditorBody } from '@/lib/study/deck-editors-schema';
import { inviteEditor, listEditors } from '@/lib/study/deck-editors.server';

/**
 * GET  /api/study/decks/$id/editors — the owner reads every editor, an editor reads the owner and a count.
 * POST /api/study/decks/$id/editors — the owner invites a member by handle (up to ten editors, fifty open invitations).
 */
export const route = apiRoute('/api/study/decks/$id/editors', {
  GET: implement(listDeckEditorsApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const result = await listEditors(userId, params.id);
    if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
    return result.view;
  }),

  POST: implement(
    inviteDeckEditorApi,
    { rateLimit: { limit: 30, windowMs: 60 * 60 * 1000, prefix: 'deck-editor-invite' }, body: inviteEditorBody },
    async ({ userId, params, body }) => {
      const result = await inviteEditor(userId, params.id, body.handle);
      if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
      return Response.json({ success: true as const, editor: result.editor }, { status: 201 });
    },
  ),
});
