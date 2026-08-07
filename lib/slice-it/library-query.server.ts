/**
 * Slice It — the library's ranked/faceted reads (L14, L15).
 *
 * Split out of `songs.server.ts` rather than living beside `songSelect` for one
 * concrete reason: everything here needs the Prisma client, and
 * `lib/prisma.server.ts` constructs it at module scope. `songs.server.ts` also
 * holds pure functions (`densityStrip`, `lampOf`, `toSliceSong`) that the unit
 * tests import directly, and importing Prisma from that module made every one
 * of those tests require a `DATABASE_URL`. The split keeps the pure half
 * importable without a database.
 *
 * Server-only.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { artistDisplayName } from './artist';

/* ─── L14: search ranking ───────────────────────────────────────────────── */

/**
 * How much each signal is worth in the combined score.
 *
 * `POPULARITY` multiplies `ln(1 + plays)`, **not** `plays`. With raw plays the
 * most-played track in the library wins every query it appears in at all — a
 * song with 40 000 plays and a description mention outranks an exact title
 * match with 12. The log turns "an order of magnitude more popular" into a
 * constant nudge, which is the only thing popularity should ever be in a
 * search: a tiebreak between things that already match, never the thing that
 * decides what matched.
 *
 * `TEXT` is 3× the fuzzy term so that a real lexeme match always beats a
 * coincidental trigram overlap.
 */
const RANK_WEIGHTS = { TEXT: 3, FUZZY: 1, POPULARITY: 0.15 } as const;

/**
 * Trigram threshold for the typo path. 0.25 is loose enough for one
 * transposition or a dropped vowel in a short title and tight enough that a
 * three-letter query does not return the library.
 */
const FUZZY_THRESHOLD = 0.25;

export interface SearchScope {
  /** Free text. Callers must not pass an empty string — see `searchSongIds`. */
  query: string;
  /** `true` restricts to `uploadedBy = viewerId`; otherwise public rows only. */
  mine: boolean;
  viewerId: string | null;
  /** L15 — restrict to one normalised artist. */
  artistKey?: string | null;
}

/** The WHERE fragments shared by the search list and its count. */
function searchFilters(scope: SearchScope): Prisma.Sql[] {
  const filters: Prisma.Sql[] =
    scope.mine && scope.viewerId
      ? [Prisma.sql`s."uploadedBy" = ${scope.viewerId}`]
      : [Prisma.sql`s."isPublic" = true`];
  if (scope.artistKey) filters.push(Prisma.sql`s."artistKey" = ${scope.artistKey}`);
  return filters;
}

/**
 * The recall clause: what counts as a match at all.
 *
 * Three arms, and every one of them is served by an index this migration
 * creates:
 *
 * - **`@@` against the generated `tsvector`** — the GIN index. This is the
 *   real search.
 * - **`%` (trigram similarity)** — the `gin_trgm_ops` indexes on `title` and
 *   `artist`. This is the typo path: "eufori" finds "Euphoria", which a lexeme
 *   match cannot do because they are different lexemes.
 * - **`ILIKE '%…%'`** — also served by the trigram indexes, and kept
 *   deliberately. It is the exact predicate the old implementation used, so
 *   including it guarantees that **nothing that used to be findable stops
 *   being findable**. A search change that silently drops results is much
 *   worse than one that adds them in the wrong order, and this arm costs
 *   nothing now that an index can answer it.
 */
function searchRecall(query: string, like: string): Prisma.Sql {
  return Prisma.sql`(
    s."searchVector" @@ websearch_to_tsquery('simple', ${query})
    OR s.title % ${query}
    OR s.artist % ${query}
    OR s.title ILIKE ${like}
    OR s.artist ILIKE ${like}
    OR s.album ILIKE ${like}
  )`;
}

/**
 * Ranked candidate ids for a text query, most relevant first.
 *
 * Returns ids rather than rows for the same reason the `yourScore` sort does:
 * the ordering is an expression Prisma's declarative `orderBy` cannot name, so
 * Postgres computes the order and a normal `findMany` fetches the rows, which
 * JS then re-threads onto the order SQL already decided. JS never sorts.
 *
 * The `relevance` value comes back with each id so the route can attach it to
 * the response — "why is that first?" is otherwise unanswerable without
 * re-running the query by hand.
 */
export async function searchSongIds(
  scope: SearchScope,
  limit: number,
  offset: number,
): Promise<{ id: string; relevance: number }[]> {
  const { query } = scope;
  const like = `%${query}%`;
  const relevance = Prisma.sql`(
    ts_rank(s."searchVector", websearch_to_tsquery('simple', ${query})) * ${RANK_WEIGHTS.TEXT}
    + GREATEST(
        similarity(s.title, ${query}),
        similarity(s.artist, ${query}),
        similarity(s.title || ' ' || s.artist, ${query})
      ) * ${RANK_WEIGHTS.FUZZY}
    + ln(1 + GREATEST(s.plays, 0)) * ${RANK_WEIGHTS.POPULARITY}
  )`;

  return prisma.$queryRaw<{ id: string; relevance: number }[]>(Prisma.sql`
    SELECT s.id, ${relevance} AS relevance
    FROM "Song" s
    WHERE ${Prisma.join(searchFilters(scope), ' AND ')}
      AND ${searchRecall(query, like)}
    ORDER BY relevance DESC, s.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
}

/** How many rows the same query matches, for the "N total" label. */
export async function countSearchMatches(scope: SearchScope): Promise<number> {
  const like = `%${scope.query}%`;
  const rows = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
    SELECT count(*)::bigint AS count
    FROM "Song" s
    WHERE ${Prisma.join(searchFilters(scope), ' AND ')}
      AND ${searchRecall(scope.query, like)}
  `);
  return Number(rows[0]?.count ?? 0);
}

/**
 * Exposed for the tests, which cannot run SQL: the threshold and the weights
 * are the parts of L14 worth pinning, and they are otherwise unreachable.
 */
export const SEARCH_TUNING = { ...RANK_WEIGHTS, FUZZY_THRESHOLD } as const;

/* ─── L15: artists ──────────────────────────────────────────────────────── */

export interface ArtistSummary {
  key: string;
  /** The spelling to show — see `artistDisplayName` for how it is chosen. */
  display: string;
  songCount: number;
  totalPlays: number;
  /** Mean BPM across the artist's songs, or null when none carry one. */
  avgBpm: number | null;
  /** The hardest rated chart across the artist's songs (C3), or null. */
  topRating: number | null;
}

/**
 * One artist's aggregate stats.
 *
 * Aggregates come from **one grouped query**, not one query per artist — the
 * library shows a row of artist chips and N+1 there is a dozen round trips on
 * every open.
 */
export async function artistAggregate(artistKey: string): Promise<ArtistSummary | null> {
  const [agg, names] = await Promise.all([
    prisma.song.aggregate({
      where: { artistKey, isPublic: true },
      _sum: { plays: true },
      _count: { _all: true },
      _avg: { bpm: true },
      _max: { chartRating: true },
    }),
    // Bounded by `take`: the display name is decided by a vote among spellings
    // and 200 rows is far more than enough to decide one. Reading every row of
    // a 900-track artist to pick a string would not be.
    prisma.song.findMany({
      where: { artistKey, isPublic: true },
      select: { artist: true },
      take: 200,
    }),
  ]);

  if (agg._count._all === 0) return null;
  return {
    key: artistKey,
    display: artistDisplayName(names.map((n) => n.artist)) || artistKey,
    songCount: agg._count._all,
    totalPlays: agg._sum.plays ?? 0,
    avgBpm: agg._avg.bpm ?? null,
    topRating: agg._max.chartRating ?? null,
  };
}

/**
 * The artist facet: the artists with the most public songs.
 *
 * `groupBy` rather than a raw query, and rather than reading songs and
 * grouping in JS — the whole point of the facet is that it costs one indexed
 * aggregate instead of the library.
 *
 * The display name needs a spelling per group, which `groupBy` cannot give
 * (`artist` is not the grouping column). One extra query fetches candidate
 * spellings for the handful of keys that made the cut, which is two round
 * trips total regardless of how many chips are shown.
 */
export async function topArtists(limit = 12): Promise<ArtistSummary[]> {
  const groups = await prisma.song.groupBy({
    by: ['artistKey'],
    where: { isPublic: true, artistKey: { not: null } },
    _count: { _all: true },
    _sum: { plays: true },
    _avg: { bpm: true },
    _max: { chartRating: true },
    orderBy: { _count: { artistKey: 'desc' } },
    take: limit,
  });

  const keys = groups.map((g) => g.artistKey).filter((k): k is string => k != null);
  if (keys.length === 0) return [];

  const names = await prisma.song.findMany({
    where: { artistKey: { in: keys }, isPublic: true },
    select: { artistKey: true, artist: true },
    take: keys.length * 25,
  });
  const byKey = new Map<string, string[]>();
  for (const row of names) {
    if (!row.artistKey) continue;
    const list = byKey.get(row.artistKey);
    if (list) list.push(row.artist);
    else byKey.set(row.artistKey, [row.artist]);
  }

  return groups
    .filter((g): g is typeof g & { artistKey: string } => g.artistKey != null)
    .map((g) => ({
      key: g.artistKey,
      display: artistDisplayName(byKey.get(g.artistKey) ?? []) || g.artistKey,
      songCount: g._count._all,
      totalPlays: g._sum.plays ?? 0,
      avgBpm: g._avg.bpm ?? null,
      topRating: g._max.chartRating ?? null,
    }));
}
