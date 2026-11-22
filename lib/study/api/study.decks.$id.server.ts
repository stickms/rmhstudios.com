import { refusalBody, refusalCodeOf } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  addDeckCardApi,
  deleteDeckApi,
  getDeckApi,
  updateDeckApi,
} from '@/lib/study/decks.contract';
import { addCardBody, updateDeckBody } from '@/lib/study/decks-schema';
import { addCard, deleteDeck, updateDeck } from '@/lib/study/deck-editor.server';
import { getDeck } from '@/lib/study.server';

/**
 * GET    /api/study/decks/$id — deck detail with cards (owner or public).
 * POST   /api/study/decks/$id — add a card (owner).
 * PATCH  /api/study/decks/$id — title, description, public (owner).
 * DELETE /api/study/decks/$id — delete the deck (owner).
 */
export const route = apiRoute('/api/study/decks/$id', {
  GET: implement(getDeckApi, { auth: 'optional' }, async ({ params, session }) => {
    const detail = await getDeck(params.id, { id: session?.user?.id ?? null });
    if (!detail) return Response.json({ error: 'Not found' }, { status: 404 });
    return detail;
  }),

  POST: implement(addDeckCardApi, {}, async ({ request, params, session }) => {
    const body = await request.json().catch(() => ({}));
    const parsed = addCardBody.safeParse(body);
    if (!parsed.success) return Response.json({ ...refusalBody('STUDY_CARD_INVALID') }, { status: 400 });

    // Owner check, the deck cap (generated cards count) and the insert run under one deck lock.
    const result = await addCard(session.user.id, params.id, parsed.data);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return Response.json({ success: true, card: result.card }, { status: 201 });
  }),

  PATCH: implement(
    updateDeckApi,
    { rateLimit: 'write', body: updateDeckBody },
    async ({ userId, params, body }) => {
      const result = await updateDeck(userId, params.id, body);
      if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
      return { success: true as const };
    },
  ),

  DELETE: implement(deleteDeckApi, {}, async ({ params, session }) => {
    const result = await deleteDeck(session.user.id, params.id);
    if (!result.ok) return Response.json({ error: result.error, ...refusalCodeOf(result) }, { status: result.status });
    return { success: true as const };
  }),
});
