import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { ARTIST_KEY_MAX } from '@/lib/slice-it/artist';
import type { LibrarySong } from '@/lib/slice-it/library-filters';
import {
  libraryFieldsOf,
  songSelect,
  toSliceSong,
  viewerSongJoins,
} from '@/lib/slice-it/songs.server';
import { artistAggregate, type ArtistSummary } from '@/lib/slice-it/library-query.server';
import { listPacks } from '@/lib/slice-it/packs.server';
import type { PackSummary } from '@/lib/slice-it/packs';

/**
 * L15 — one artist: aggregate stats, their tracks, and their albums.
 *
 * Everything the artist page needs in one request. Three round trips from the
 * browser to render one page would be three chances to render half of it, and
 * the three queries here are independent so they run concurrently anyway.
 *
 * The `$key` param is a normalised `artistKey`, never a display name. That is
 * what makes this an indexed equality lookup instead of the substring search
 * the feature exists to replace — which missed "Artist feat. Someone" and
 * matched "Artist Two".
 *
 * `auth: 'optional'`: an artist page is public, but a signed-in viewer's own
 * lamps and likes ride along in each row exactly as they do in the library.
 */
const ParamsZ = z.object({ key: z.string().min(1).max(ARTIST_KEY_MAX) });

/** Tracks per artist page. An artist with more than this is paged by the library. */
const ARTIST_SONG_LIMIT = 60;

export interface ArtistPageResponse {
  artist: ArtistSummary;
  songs: LibrarySong[];
  albums: PackSummary[];
  /** True when the artist has more tracks than this response carries. */
  hasMore: boolean;
}

export const Route = createFileRoute('/api/slice-it/songs/artist/$key')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read' },
        async ({ userId, params }) => {
          const parsed = ParamsZ.safeParse(params);
          if (!parsed.success) {
            return Response.json({ error: 'Unknown artist.' }, { status: 404 });
          }
          const key = parsed.data.key;

          const [artist, rows, packs] = await Promise.all([
            artistAggregate(key),
            prisma.song.findMany({
              where: { artistKey: key, isPublic: true },
              // Most-played first: an artist page is a "what should I play"
              // surface, and upload order says nothing about that.
              orderBy: [{ plays: 'desc' }, { id: 'desc' }],
              take: ARTIST_SONG_LIMIT + 1,
              select: { ...songSelect, ...viewerSongJoins(userId) },
            }),
            listPacks(
              { scope: 'public', kind: 'album', artist: key, limit: 24 },
              userId,
            ),
          ]);

          // `artistAggregate` returns null for a key with no public songs,
          // which is also what an invented key looks like. 404 rather than an
          // empty page: a URL for an artist who does not exist is not found.
          if (!artist) return Response.json({ error: 'Unknown artist.' }, { status: 404 });

          const hasMore = rows.length > ARTIST_SONG_LIMIT;
          const page = hasMore ? rows.slice(0, ARTIST_SONG_LIMIT) : rows;

          const body: ArtistPageResponse = {
            artist,
            songs: page.map((row) => ({
              ...toSliceSong(row, userId),
              ...libraryFieldsOf(row),
              // The artist page does not show a score column, and fetching one
              // per row to leave it unrendered is the kind of join that quietly
              // doubles a page's cost. `LibrarySong` requires the field, so it
              // is present and honest about being absent.
              bestScore: null,
            })),
            albums: packs.packs,
            hasMore,
          };
          return Response.json(body);
        },
      ),
    },
  },
});
