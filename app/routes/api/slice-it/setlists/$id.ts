import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import {
  LIKED_SETLIST_ID,
  MAX_SETLIST_SONGS,
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
const PatchZ = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(300).nullish(),
  isPublic: z.boolean().optional(),
  songIds: z.array(z.string().min(1).max(64)).max(MAX_SETLIST_SONGS).optional(),
});

export const Route = createFileRoute('/api/slice-it/setlists/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
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

      PATCH: defineHandler(
        { rateLimit: 'write', body: PatchZ },
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

      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId, params }) => {
        const ok = await deleteSetlist(userId, params.id);
        if (!ok) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ ok: true });
      }),
    },
  },
});
