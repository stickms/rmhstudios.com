/**
 * RMHHomes — the private note on a saved listing (s12 10).
 *
 *   PUT /api/homes/listings/$id/favorite/note   → { note } on the caller's own favourite (404 when not saved);
 *                                                  an empty note clears it
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { normalizeNote } from '@/lib/homes/compare';
import { favoriteNoteBody } from '@/lib/homes/compare-schema';
import { setHomeFavoriteNoteApi } from '@/lib/homes/compare.contract';
import { setFavoriteNote } from '@/lib/homes/listings.server';

export const route = apiRoute('/api/homes/listings/$id/favorite/note', {
  PUT: implement(
    setHomeFavoriteNoteApi,
    { rateLimit: 'write', body: favoriteNoteBody },
    async ({ params, session, body }) => {
      const note = normalizeNote(body.note);
      const ok = await setFavoriteNote(session.user.id, params.id, note);
      if (!ok) return Response.json(refusalBody('NOT_FOUND'), { status: 404 });
      return Response.json({ ok: true as const, note });
    },
  ),
});
