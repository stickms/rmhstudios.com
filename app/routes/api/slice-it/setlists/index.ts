import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import {
  MAX_SETLIST_SONGS,
  createSetlist,
  likedSongsSetlist,
  listOwnSetlists,
  listPublicSetlists,
} from '@/lib/slice-it/setlist.server';

/**
 * S8 — list and create setlists.
 *
 * `GET` returns both the viewer's own lists and the public browse in one
 * response, because the panel renders both at once and two round trips for two
 * lists of thirty rows is two round trips too many. A signed-out viewer gets
 * `mine: []` and no liked-songs list; the public browse still works, which is
 * what makes a shared setlist link worth sending to somebody.
 */
const SetlistBodyZ = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullish(),
  isPublic: z.boolean().optional(),
  songIds: z.array(z.string().min(1).max(64)).max(MAX_SETLIST_SONGS).default([]),
});

export const Route = createFileRoute('/api/slice-it/setlists/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) => {
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

      POST: defineHandler({ rateLimit: 'write', body: SetlistBodyZ }, async ({ userId, body }) => {
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
      }),
    },
  },
});
