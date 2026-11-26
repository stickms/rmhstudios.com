import { createFileRoute } from '@tanstack/react-router';

import { apiOptions, withDeveloperApi } from '@/lib/api/with-developer-api.server';
import { prisma } from '@/lib/prisma.server';
import { SLICE_CACHE, songMetaSelect, toSongV1 } from '@/lib/api/v1/slice-it.server';
import { SONG_GENRES } from '@features/slice-it/engine/taxonomy';

/**
 * GET /api/v1/slice-it/charts — public chart metadata (`X13`).
 *
 * Community stat sites are a load-bearing part of every rhythm game's
 * ecosystem, and the platform's developer API exposed nothing from Slice It!.
 *
 * `/api/v1/**` keeps its own wrapper rather than `defineHandler`: it speaks a
 * different error envelope, which is the one documented exception to the
 * repo-wide rule.
 *
 * ## What is deliberately not here
 *
 * **The chart blob.** `analysisData` is hundreds of kilobytes and is the
 * uploader's work; an API that hands it out turns every upload into a
 * redistributable asset. Metadata, ratings and counts only.
 *
 * **Anything about a private or taken-down song.** Both are filtered at the
 * query, not at the mapper — a filter in the mapper is one refactor away from
 * being skipped.
 */
export const Route = createFileRoute('/api/v1/slice-it/charts')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ json, error }) => {
            const url = new URL(request.url);
            const rawLimit = parseInt(url.searchParams.get('limit') || '25', 10);
            const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 25, 100);
            const rawOffset = parseInt(url.searchParams.get('offset') || '0', 10);
            const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

            const genre = url.searchParams.get('genre');
            if (genre && !(SONG_GENRES as readonly string[]).includes(genre)) {
              return error(
                'invalid_request',
                `Unknown genre. Supported: ${SONG_GENRES.join(', ')}.`,
                400,
              );
            }

            const where = {
              isPublic: true,
              takenDownAt: null,
              ...(genre ? { genre } : {}),
            };

            const [rows, total] = await Promise.all([
              prisma.song.findMany({
                where,
                orderBy: [{ plays: 'desc' }, { id: 'asc' }],
                take: limit,
                skip: offset,
                select: songMetaSelect,
              }),
              prisma.song.count({ where }),
            ]);

            return json(
              {
                data: rows.map(toSongV1),
                meta: { total, limit, offset },
              },
              200,
              SLICE_CACHE,
            );
          },
          { scope: 'read:slice-it' },
        ),
    },
  },
});
