import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@features/slice-it/engine/setlists.contract';
import { SetlistBodyZ } from '@features/slice-it/engine/setlist-schema';
import {
  createSetlist,
  likedSongsSetlist,
  listOwnSetlists,
  listPublicSetlists,
} from '@features/slice-it/engine/setlist.server';

/**
 * S8 — list and create setlists.
 *
 * `GET` returns both the viewer's own lists and the public browse in one
 * response, because the panel renders both at once and two round trips for two
 * lists of thirty rows is two round trips too many. A signed-out viewer gets
 * `mine: []` and no liked-songs list; the public browse still works, which is
 * what makes a shared setlist link worth sending to somebody.
 */
export const route = apiRoute('/api/slice-it/setlists', {
  GET: implement(C.listSetlistsApi, { auth: 'optional', rateLimit: 'read' }, async ({ userId }) => {
    const [mine, published, liked] = await Promise.all([
      userId ? listOwnSetlists(userId) : Promise.resolve([]),
      listPublicSetlists(userId),
      userId ? likedSongsSetlist(userId) : Promise.resolve(null),
    ]);
    return Response.json({
      mine,
      public: published,
      liked: liked ? { id: liked.id, songCount: liked.songs.length } : null,
    });
  }),

  POST: implement(
    C.createSetlistApi,
    { rateLimit: 'write', body: SetlistBodyZ },
    async ({ userId, body }) => {
      const result = await createSetlist(userId, {
        name: body.name,
        description: body.description ?? null,
        isPublic: body.isPublic ?? false,
        songIds: body.songIds,
      });
      if (!result.ok) {
        return Response.json({ error: result.reason }, { status: 400 });
      }
      return Response.json(result.setlist, { status: 201 });
    },
  ),
});
