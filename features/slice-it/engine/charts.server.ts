/**
 * Slice It — the charts on a song (`C2`).
 *
 * `Song.analysisData` is one JSON blob holding one generated chart set, so a
 * song has exactly one interpretation forever. The `Chart` model added a second
 * shape without connecting it to the play path: nothing lists a song's charts,
 * so nothing can pick between them.
 *
 * The contract this module exists to establish: **there is always at least one
 * chart.** Callers never branch on "does this song have charts" — when no
 * `Chart` rows are visible, the generated fallback is synthesised as a row with
 * a null id. That is what lets the picker, the leaderboard key and the details
 * panel all be written once.
 */

import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect, type ResolvedUser } from '@/lib/user-display';
import { DIFFICULTIES, type Difficulty } from './constants';

export interface ChartSummary {
  /**
   * `null` for the generated fallback.
   *
   * A null id is the honest representation: `analysisData` is not a row, it has
   * no identity, and inventing one would be a claim about which notes were
   * played that nothing can support — the same reasoning `SongLeaderboard`
   * documents for its nullable `chartId`.
   */
  id: string | null;
  difficulty: Difficulty;
  keys: number;
  name: string;
  rating: number | null;
  status: string;
  rankStatus: string;
  chartHash: string | null;
  isGenerated: boolean;
  author: ResolvedUser | null;
}

/**
 * Charts a viewer may play on this song.
 *
 * Public and ranked charts for everyone, plus the viewer's own drafts. Ordering
 * puts ranked first, then public, then drafts — and within each, hardest first,
 * because a picker whose top entry is Easy makes the song look easier than it
 * is to anyone who does not scroll.
 */
export async function chartsForSong(
  songId: string,
  viewerId: string | null,
): Promise<ChartSummary[]> {
  const rows = await prisma.chart.findMany({
    where: {
      songId,
      OR: [
        { status: { in: ['public', 'ranked'] } },
        // `?? ''` rather than omitting the clause: an anonymous viewer must
        // match no author, and `authorId: undefined` would drop the filter and
        // return every draft on the song.
        { authorId: viewerId ?? '' },
      ],
    },
    select: {
      id: true,
      difficulty: true,
      keys: true,
      name: true,
      rating: true,
      status: true,
      rankStatus: true,
      chartHash: true,
      isGenerated: true,
      author: { select: userDisplaySelect },
    },
  });

  if (rows.length === 0) return [generatedFallback()];

  return rows
    .map((row) => ({
      summary: {
        id: row.id,
        difficulty: toDifficulty(row.difficulty),
        keys: row.keys,
        name: row.name,
        rating: row.rating,
        status: row.status,
        rankStatus: row.rankStatus,
        chartHash: row.chartHash,
        isGenerated: row.isGenerated,
        author: row.author ? resolveUser(row.author) : null,
      } satisfies ChartSummary,
      // Computed once per row rather than inside the comparator, which a `find`
      // by id would have made quadratic.
      rank: row.rankStatus === 'ranked' ? 0 : row.status === 'public' ? 1 : 2,
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (b.summary.rating ?? -1) - (a.summary.rating ?? -1) ||
        DIFFICULTIES.indexOf(b.summary.difficulty) - DIFFICULTIES.indexOf(a.summary.difficulty),
    )
    .map((entry) => entry.summary);
}

/**
 * The generated chart, as a row.
 *
 * `expert` rather than `normal`: `analysisData` carries all four difficulties
 * and the client picks with `resolveSlices`, so the tier named here is the
 * label on a picker entry that actually means "the generated set". Naming the
 * hardest one keeps the ordering rule above honest.
 */
function generatedFallback(): ChartSummary {
  return {
    id: null,
    difficulty: 'expert',
    keys: 2,
    name: 'Generated',
    rating: null,
    status: 'public',
    rankStatus: 'unranked',
    chartHash: null,
    isGenerated: true,
    author: null,
  };
}

function toDifficulty(value: string): Difficulty {
  return (DIFFICULTIES as readonly string[]).includes(value) ? (value as Difficulty) : 'normal';
}
