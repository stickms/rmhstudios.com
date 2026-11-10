import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/slice-it/setlists.contract';
import { SetlistPatchZ } from '@/lib/slice-it/setlist-schema';
import {
  LIKED_SETLIST_ID,
  deleteSetlist,
  likedSongsSetlist,
  resolveSetlist,
  updateSetlist,
} from '@/lib/slice-it/setlist.server';

/**
 * S8 — read, replace or delete one setlist.
 *
 * `PATCH` replaces the whole list rather than offering insert/move/remove
 * operations. That is not laziness: `songIds` is an array column whose order is
 * the data, so "move item 3 to position 1" is expressible as the new array and
 * nothing else. A positional API over an array column is a positional API with
 * a lost-update bug.
 *
 * `GET /liked` is intercepted before the database: the liked-songs list is
 * virtual (assembled from `SongLike` at read time) and has no row to find.
 */
export const Route = createFileRoute('/api/slice-it/setlists/$id')({
  server: {
    handlers: {
      GET: implement(C.getSetlistApi, { auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
        const id = params.id;
        if (id === LIKED_SETLIST_ID) {
          if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          return Response.json(await likedSongsSetlist(userId));
        }
        const setlist = await resolveSetlist(id, userId);
        // Private-and-not-yours is indistinguishable from missing, deliberately
        // — a 403 would confirm to a stranger that the id exists.
        if (!setlist) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(setlist);
      }),

      PATCH: implement(C.updateSetlistApi, 
        { rateLimit: 'write', body: SetlistPatchZ },
        async ({ userId, params, body }) => {
          const result = await updateSetlist(userId, params.id, {
            ...(body.name === undefined ? {} : { name: body.name }),
            ...(body.description === undefined ? {} : { description: body.description ?? null }),
            ...(body.isPublic === undefined ? {} : { isPublic: body.isPublic }),
            ...(body.songIds === undefined ? {} : { songIds: body.songIds }),
          });
          if (!result.ok) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(result.setlist);
        },
      ),

      DELETE: implement(C.deleteSetlistApi, { rateLimit: 'write' }, async ({ userId, params }) => {
        const ok = await deleteSetlist(userId, params.id);
        if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ ok: true });
      }),
    },
  },
});
