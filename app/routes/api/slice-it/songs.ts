import { createFileRoute } from '@tanstack/react-router';
import type { Prisma } from '@prisma/client';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { SongListQueryZ } from '@/lib/slice-it/api-schemas';
import { songSelect, toSliceSong } from '@/lib/slice-it/songs.server';
import type { SongPage } from '@/lib/slice-it/types';

/**
 * `id` is the tiebreaker on every sort so a page boundary is stable — two songs
 * uploaded in the same millisecond would otherwise be free to swap places
 * between page 1 and page 2, showing one twice and hiding the other.
 */
const ORDER_BY: Record<string, Prisma.SongOrderByWithRelationInput[]> = {
  recent: [{ createdAt: 'desc' }, { id: 'desc' }],
  popular: [{ plays: 'desc' }, { id: 'desc' }],
  liked: [{ likes: { _count: 'desc' } }, { id: 'desc' }],
  title: [{ title: 'asc' }, { id: 'asc' }],
  duration: [{ duration: 'asc' }, { id: 'asc' }],
};

/**
 * The song library.
 *
 * Three things the previous version did not do, each a real limit on the
 * feature rather than a nicety:
 *
 * - **Pagination.** It returned `take: 50`, newest first, with no cursor. Song
 *   51 was unreachable — permanently, by any means the UI offered.
 * - **Server-side search and sort.** The client fetched those 50 and filtered
 *   them client-side over `title`/`artist`, so search only ever searched the
 *   page you already had.
 * - **A declared response shape.** It spread the Prisma row through `any` and
 *   picked fields by hand, which is how `uploadedBy` — a user id — ended up in
 *   a response served to anonymous visitors. `toSliceSong` is now the only way
 *   a song leaves the server, and `songSelect` deliberately omits
 *   `analysisData` (a chart is hundreds of KB; thirty of them was a
 *   multi-megabyte response on every library open).
 */
export const Route = createFileRoute('/api/slice-it/songs')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', query: SongListQueryZ, rateLimit: 'read' },
        async ({ userId, query }) => {
          const { q, sort, cursor, limit, mine } = query;

          const where: Record<string, unknown> = {};
          if (mine && userId) {
            // Your own uploads include your private ones; nobody else's do.
            where.uploadedBy = userId;
          } else {
            where.isPublic = true;
          }
          if (q) {
            where.OR = [
              { title: { contains: q, mode: 'insensitive' } },
              { artist: { contains: q, mode: 'insensitive' } },
              { album: { contains: q, mode: 'insensitive' } },
            ];
          }

          // Keyset pagination for the time-ordered sort, offset for the rest.
          // `recent` is the default and by far the hottest path, and the one
          // where a cursor is both correct (no rows skipped when someone
          // uploads mid-scroll) and cheap.
          const useKeyset = sort === 'recent';
          const skip = !useKeyset && cursor ? Number(cursor) || 0 : 0;
          if (useKeyset && cursor) {
            const since = new Date(cursor);
            if (!Number.isNaN(since.getTime())) where.createdAt = { lt: since };
          }

          const [rows, total] = await Promise.all([
            prisma.song.findMany({
              where,
              orderBy: ORDER_BY[sort],
              take: limit + 1,
              skip,
              select: {
                ...songSelect,
                ...(userId
                  ? {
                      likes: { where: { userId }, select: { id: true } },
                      songPlays: { where: { userId }, select: { count: true } },
                    }
                  : {}),
              },
            }),
            prisma.song.count({ where }),
          ]);

          const hasMore = rows.length > limit;
          const page = hasMore ? rows.slice(0, limit) : rows;

          const body: SongPage = {
            songs: page.map((row) => toSliceSong(row, userId)),
            nextCursor: hasMore
              ? useKeyset
                ? page[page.length - 1].createdAt.toISOString()
                : String(skip + limit)
              : null,
            total,
          };

          return Response.json(body);
        },
      ),
    },
  },
});
