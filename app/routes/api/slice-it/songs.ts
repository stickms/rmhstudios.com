import { createFileRoute } from '@tanstack/react-router';
import { Prisma } from '@prisma/client';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import {
  DEFAULT_SORT_DIRECTION,
  LibrarySongsQueryZ,
  RECENTLY_PLAYED_LIMIT,
  effectiveLibrarySort,
  type LibrarySong,
  type LibrarySongPage,
  type LibrarySort,
  type SortDirection,
} from '@/lib/slice-it/library-filters';
import { libraryFieldsOf, songSelect, toSliceSong } from '@/lib/slice-it/songs.server';
import { countSearchMatches, searchSongIds } from '@/lib/slice-it/library-query.server';
import { packSongIds } from '@/lib/slice-it/packs.server';

/**
 * The song library — list, random pick, and recently-played shelf.
 *
 * ## What changed (original)
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
 *
 * ## What changed (this pass — L13, L17, L18, S9)
 *
 * - **A table needs more sorts than a dropdown did.** `artist`, `bpm`, `plays`
 *   and `yourScore` join {@link LibrarySort} on top of the base `SongSort`
 *   vocabulary, each mapped to a real `ORDER BY` here — see
 *   `lib/slice-it/library-filters.ts` for why they live there and not in
 *   `constants.ts`. Sorting stays entirely server-side: the client-side-filter
 *   bug this file's history already documents once would be trivial to
 *   reintroduce one virtualized column-click at a time, and this route does not.
 * - **`yourScore` needs a join `orderBy` can't express.** `SongLeaderboard` is
 *   unique per `(songId, userId)`, so "your best score" is a LEFT JOIN filtered
 *   to one user, not a plain column. Prisma's declarative `orderBy` has no way
 *   to order by an aggregate of a *filtered* to-many relation, so that one sort
 *   runs as raw SQL that selects an ordered id list, then a normal `findMany`
 *   fetches the full rows and JS re-threads them onto that id order — the same
 *   two-step shape `lib/search/posts.server.ts` uses for full-text rank. The
 *   ORDER BY runs in Postgres; JS only restores an order SQL already computed.
 * - **`random=1` (S9).** `count` + a random `skip`, never `ORDER BY random()` —
 *   the latter sorts the entire filtered set to return one row, a full table
 *   scan on every button press.
 * - **`shelf=recent` (L17).** `SongPlay` already records `{songId, userId,
 *   count, lastPlayedAt}` on every play and was never read as a list. This
 *   assumes an `@@index([userId, lastPlayedAt(sort: Desc)])` on `SongPlay` that
 *   does not exist yet (this change does not own `prisma/schema.prisma` — see
 *   `docs/_handoff/library-requests.md`); the query is correct today, just an
 *   unindexed sort over one user's rows until that index lands.
 */

/**
 * The sorts a plain `orderBy` can express. `yourScore` needs a filtered join
 * and `relevance` needs a ranking expression; both run as raw SQL below.
 */
type SortableColumn = Exclude<LibrarySort, 'yourScore' | 'relevance'>;

/**
 * `id` is the tiebreaker on every sort so a page boundary is stable — two songs
 * uploaded in the same millisecond would otherwise be free to swap places
 * between page 1 and page 2, showing one twice and hiding the other.
 */
const ORDER_BY: Record<
  SortableColumn,
  (dir: SortDirection) => Prisma.SongOrderByWithRelationInput[]
> = {
  recent: (dir) => [{ createdAt: dir }, { id: 'desc' }],
  popular: (dir) => [{ plays: dir }, { id: 'desc' }],
  liked: (dir) => [{ likes: { _count: dir } }, { id: 'desc' }],
  title: (dir) => [{ title: dir }, { id: 'asc' }],
  duration: (dir) => [{ duration: dir }, { id: 'asc' }],
  // C3 — `docs/_handoff/rating-requests.md` §1. NULLS LAST is the whole
  // subtlety: a song with no rated chart is not a trivially easy song, and
  // Postgres sorts NULLs FIRST on DESC by default, which would fill the top of
  // "hardest first" with every unrated song in the library.
  difficulty: (dir) => [{ chartRating: { sort: dir, nulls: 'last' } }, { id: 'asc' }],
  artist: (dir) => [{ artist: dir }, { id: 'asc' }],
  bpm: (dir) => [{ bpm: dir }, { id: 'asc' }],
  plays: (dir) => [{ plays: dir }, { id: 'desc' }],
};

/** The viewer-scoped select fields, added only when a caller is signed in. */
function viewerSelect(userId: string | null) {
  return userId
    ? {
        likes: { where: { userId }, select: { id: true } },
        songPlays: { where: { userId }, select: { count: true } },
        /** Unique per `(songId, userId)` — at most one row. */
        scores: { where: { userId }, select: { score: true } },
      }
    : {};
}

/** `SongLeaderboard` is unique per `(songId, userId)`; the first row IS the row. */
function bestScoreOf(row: { scores?: { score: number }[] }): number | null {
  return Array.isArray(row.scores) && row.scores.length > 0 ? row.scores[0].score : null;
}

export const Route = createFileRoute('/api/slice-it/songs')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', query: LibrarySongsQueryZ, rateLimit: 'read' },
        async ({ userId, query }) => {
          /* ── L17: recently played shelf ─────────────────────────────── */
          if (query.shelf === 'recent') {
            if (!userId) return Response.json({ songs: [] } satisfies { songs: LibrarySong[] });

            const plays = await prisma.songPlay.findMany({
              where: { userId },
              orderBy: { lastPlayedAt: 'desc' },
              take: RECENTLY_PLAYED_LIMIT,
              select: {
                lastPlayedAt: true,
                song: { select: { ...songSelect, ...viewerSelect(userId) } },
              },
            });

            const songs: LibrarySong[] = plays.map((p) => ({
              ...toSliceSong(p.song, userId),
              ...libraryFieldsOf(p.song),
              bestScore: bestScoreOf(p.song),
              lastPlayedAt: p.lastPlayedAt.toISOString(),
            }));
            return Response.json({ songs } satisfies { songs: LibrarySong[] });
          }

          /* ── S9: random / roulette pick ─────────────────────────────── */
          if (query.random === '1') {
            const { durationMin, durationMax, unplayedOnly, likedOnly } = query;
            // Nobody signed out has a like, so the honest answer is "no song
            // matches" rather than quietly ignoring the constraint.
            if (likedOnly && !userId) {
              return Response.json({ song: null } satisfies { song: LibrarySong | null });
            }

            const where: Prisma.SongWhereInput = { isPublic: true };
            if (durationMin !== undefined || durationMax !== undefined) {
              where.duration = {
                ...(durationMin !== undefined ? { gte: durationMin } : {}),
                ...(durationMax !== undefined ? { lte: durationMax } : {}),
              };
            }
            if (unplayedOnly && userId) where.songPlays = { none: { userId } };
            if (likedOnly && userId) where.likes = { some: { userId } };

            const total = await prisma.song.count({ where });
            if (total === 0) {
              return Response.json({ song: null } satisfies { song: LibrarySong | null });
            }

            const [pick] = await prisma.song.findMany({
              where,
              take: 1,
              // Random by OFFSET, not `ORDER BY random()` (see the module doc).
              // `orderBy` still needs a deterministic tiebreak so `skip` lands on
              // a stable row rather than depending on incidental scan order.
              skip: Math.floor(Math.random() * total),
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              select: { ...songSelect, ...viewerSelect(userId) },
            });

            const song: LibrarySong | null = pick
              ? {
                  ...toSliceSong(pick, userId),
                  ...libraryFieldsOf(pick),
                  bestScore: bestScoreOf(pick),
                }
              : null;
            return Response.json({ song } satisfies { song: LibrarySong | null });
          }

          /* ── The paged, sorted, searched list ───────────────────────── */
          const { q, sort, dir, cursor, limit, mine, artist, packId } = query;
          // L1's facets, destructured separately so the line above stays the
          // one that reads as "the browse query".
          const { genre, tags, bpmMin, bpmMax, ratingMin, ratingMax } = query;
          // `yourScore` with nobody signed in has nothing to sort by — fall
          // back rather than run a join keyed on a null userId (every row would
          // simply go unmatched, making the "sort" a no-op).
          //
          // `effectiveLibrarySort` then applies L14's two rules: a typed query
          // with the default sort still selected means "rank these by
          // relevance", and `relevance` with no query degrades to `recent`
          // because there is nothing to be relevant to.
          const authSort: LibrarySort = sort === 'yourScore' && !userId ? 'recent' : sort;
          const effectiveSort: LibrarySort = effectiveLibrarySort(authSort, q);
          const effectiveDir: SortDirection = dir ?? DEFAULT_SORT_DIRECTION[effectiveSort];

          const where: Record<string, unknown> = {};
          if (mine && userId) {
            // Your own uploads include your private ones; nobody else's do.
            where.uploadedBy = userId;
          } else {
            where.isPublic = true;
          }
          // L15 — the artist facet is an equality filter on the normalised key,
          // not a substring match on the display string. That is the entire
          // difference between "everything by this artist" and "every artist
          // whose name contains these letters".
          if (artist) where.artistKey = artist;
          // L1 — the facets. A library of a thousand charts is otherwise
          // navigable only by remembering a name.
          //
          // `hasEvery` for tags, not `hasSome`: adding a tag must NARROW the
          // result, or a second click feels like it did nothing.
          if (genre) where.genre = genre;
          if (tags && tags.length > 0) where.tags = { hasEvery: tags };
          if (bpmMin !== undefined || bpmMax !== undefined) {
            where.bpm = {
              ...(bpmMin !== undefined ? { gte: bpmMin } : {}),
              ...(bpmMax !== undefined ? { lte: bpmMax } : {}),
            };
          }
          if (ratingMin !== undefined || ratingMax !== undefined) {
            // `chartRating` is the song's denormalised max across its charts
            // (C3), so this filters songs that HAVE something at that level —
            // which is what "show me 12s" means. A null sorts and filters out,
            // correctly: an unrated song is not a 12.
            where.chartRating = {
              ...(ratingMin !== undefined ? { gte: ratingMin } : {}),
              ...(ratingMax !== undefined ? { lte: ratingMax } : {}),
            };
          }
          // L16 — restrict to one pack's members. The pack read is separate
          // (`/api/slice-it/packs/$id`); this is the library filtered by it, so
          // the same card, lamp and score machinery serves a pack view.
          // Read once and reused by all three branches below — the raw-SQL
          // sorts build their own WHERE and would otherwise each re-fetch the
          // same membership list.
          const packIds = packId ? await packSongIds(packId) : null;
          if (packIds) {
            if (packIds.length === 0) {
              return Response.json({
                songs: [],
                nextCursor: null,
                total: 0,
              } satisfies LibrarySongPage);
            }
            where.id = { in: packIds };
          }
          if (q && effectiveSort !== 'relevance') {
            // A non-relevance sort still has to *filter*. Kept as the original
            // substring predicate rather than reusing the full-text recall: the
            // two would disagree about what matched depending on which column
            // you happened to be sorting by, and "the result set changed
            // because I clicked BPM" is a worse bug than an unindexed scan.
            where.OR = [
              { title: { contains: q, mode: 'insensitive' } },
              { artist: { contains: q, mode: 'insensitive' } },
              { album: { contains: q, mode: 'insensitive' } },
            ];
          }

          const select = { ...songSelect, ...viewerSelect(userId) };

          /* ── L14: ranked search ─────────────────────────────────────── */
          if (effectiveSort === 'relevance' && q) {
            const scope = {
              query: q,
              mine: Boolean(mine && userId),
              viewerId: userId,
              artistKey: artist ?? null,
            };
            const skip = cursor ? Number(cursor) || 0 : 0;

            // Ranking runs in Postgres and returns ids; the rows are then
            // fetched normally and re-threaded onto that order. Same two-step
            // as `yourScore` below and as `lib/search/posts.server.ts` — JS
            // restores an order SQL computed, it never sorts.
            const [ranked, total] = await Promise.all([
              searchSongIds(scope, limit + 1, skip),
              cursor ? Promise.resolve(null) : countSearchMatches(scope),
            ]);

            const hasMore = ranked.length > limit;
            const window = hasMore ? ranked.slice(0, limit) : ranked;
            // A pack filter narrows the ranked set rather than the other way
            // round: the ranking is over the library and the pack is a view of
            // it, so intersecting after ranking keeps the order meaningful.
            const packFilter = packIds ? new Set(packIds) : null;
            const picked = packFilter ? window.filter((r) => packFilter.has(r.id)) : window;

            const rows = await prisma.song.findMany({
              where: { id: { in: picked.map((r) => r.id) } },
              select,
            });
            const byId = new Map(rows.map((r) => [r.id, r]));

            // Re-threaded onto the SQL-computed order — a lookup, not a sort.
            const songs: LibrarySong[] = [];
            for (const { id, relevance } of picked) {
              const row = byId.get(id);
              if (!row) continue;
              songs.push({
                ...toSliceSong(row, userId),
                ...libraryFieldsOf(row),
                bestScore: bestScoreOf(row),
                relevance,
              });
            }

            const body: LibrarySongPage = {
              songs,
              nextCursor: hasMore ? String(skip + limit) : null,
              ...(total === null ? {} : { total }),
            };
            return Response.json(body);
          }

          if (effectiveSort === 'yourScore') {
            // Non-null by construction — see the fallback assigned above.
            const viewerId = userId as string;
            const skip = cursor ? Number(cursor) || 0 : 0;

            const filters: Prisma.Sql[] =
              mine && userId
                ? [Prisma.sql`s."uploadedBy" = ${userId}`]
                : [Prisma.sql`s."isPublic" = true`];
            if (q) {
              const like = `%${q}%`;
              filters.push(
                Prisma.sql`(s.title ILIKE ${like} OR s.artist ILIKE ${like} OR s.album ILIKE ${like})`,
              );
            }
            // The two facets have to be repeated here rather than read off
            // `where`: this branch bypasses `findMany` entirely, and a filter
            // that exists in only one of the two paths is a filter that
            // silently stops applying when you sort by your best score.
            if (artist) filters.push(Prisma.sql`s."artistKey" = ${artist}`);
            // Non-empty by construction — an empty pack returned above.
            if (packIds) filters.push(Prisma.sql`s.id IN (${Prisma.join(packIds)})`);
            const orderDirection =
              effectiveDir === 'asc' ? Prisma.sql`ASC NULLS FIRST` : Prisma.sql`DESC NULLS LAST`;

            // Candidate id list, ordered by the viewer's own score. `findMany`
            // cannot express "order by this to-many relation filtered to one
            // row", so the ordering runs here and the ids are re-threaded onto
            // full rows below — see the module doc.
            const candidates = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
              SELECT s.id
              FROM "Song" s
              LEFT JOIN "SongLeaderboard" sl ON sl."songId" = s.id AND sl."userId" = ${viewerId}
              WHERE ${Prisma.join(filters, ' AND ')}
              ORDER BY sl.score ${orderDirection}, s.id DESC
              LIMIT ${limit + 1} OFFSET ${skip}
            `);

            const hasMore = candidates.length > limit;
            const ids = (hasMore ? candidates.slice(0, limit) : candidates).map((c) => c.id);

            const rows = await prisma.song.findMany({ where: { id: { in: ids } }, select });
            const byId = new Map(rows.map((r) => [r.id, r]));
            // Re-thread onto the SQL-computed order — a lookup, not a sort.
            const page = ids
              .map((id) => byId.get(id))
              .filter((r): r is (typeof rows)[number] => r != null);

            const total = cursor ? null : await prisma.song.count({ where });

            const body: LibrarySongPage = {
              songs: page.map((row) => ({
                ...toSliceSong(row, userId),
                ...libraryFieldsOf(row),
                bestScore: bestScoreOf(row),
              })),
              nextCursor: hasMore ? String(skip + limit) : null,
              ...(total === null ? {} : { total }),
            };
            return Response.json(body);
          }

          // Keyset pagination for the default time-ordered sort, offset for the
          // rest. `recent`+`desc` (the default) is both the hottest path and the
          // one where a cursor is correct (no rows skipped when someone uploads
          // mid-scroll) and cheap; an explicit `dir=asc` on `recent` is not a
          // shape any UI in this codebase asks for, so it falls back to offset
          // paging rather than inverting the cursor comparison for a case
          // nothing exercises.
          const useKeyset = effectiveSort === 'recent' && effectiveDir === 'desc';
          const skip = !useKeyset && cursor ? Number(cursor) || 0 : 0;
          if (useKeyset && cursor) {
            const since = new Date(cursor);
            if (!Number.isNaN(since.getTime())) where.createdAt = { lt: since };
          }

          // The count is only for the "Load more (N total)" label, and under a
          // `q` it is an unindexable `ILIKE '%…%'` scan of the table. Paying for
          // it once, on the first page, gives the label the same number it would
          // have had — every later page is the same query — for a fraction of
          // the work on the scroll path that runs most.
          const [rows, total] = await Promise.all([
            prisma.song.findMany({
              where,
              // `relevance` and `yourScore` both returned above, so what is
              // left is exactly the set `ORDER_BY` covers. The cast is what
              // says so; the two `if`s above are what make it true.
              orderBy: ORDER_BY[effectiveSort as SortableColumn](effectiveDir),
              take: limit + 1,
              skip,
              select,
            }),
            cursor ? Promise.resolve(null) : prisma.song.count({ where }),
          ]);

          const hasMore = rows.length > limit;
          const page = hasMore ? rows.slice(0, limit) : rows;

          const body: LibrarySongPage = {
            songs: page.map((row) => ({
              ...toSliceSong(row, userId),
              ...libraryFieldsOf(row),
              bestScore: bestScoreOf(row),
            })),
            nextCursor: hasMore
              ? useKeyset
                ? page[page.length - 1].createdAt.toISOString()
                : String(skip + limit)
              : null,
            ...(total === null ? {} : { total }),
          };

          return Response.json(body);
        },
      ),
    },
  },
});
