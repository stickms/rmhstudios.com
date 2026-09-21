/**
 * The GlobeSet share card — Wordle's trick, in GlobeSet's own vocabulary.
 *
 * Wordle's grid works because the squares are a *lossy* record: they say how
 * the run went without saying what the answer was, so posting one is a boast
 * rather than a spoiler. GlobeSet's equivalent is one square per GlobeSet taken,
 * coloured by how many cards it took — the shape of a run (a long tail of
 * three-card sets, or a couple of monsters) is exactly what players compare,
 * and none of it reveals a single card of the deal.
 *
 * Seven squares per row, the width of the board.
 */

import { formatDuration, type RunSummary } from './game';

/** Square per GlobeSet size. Beyond six, everything is the same "huge". */
const SIZE_EMOJI: Record<number, string> = {
  3: '🟩',
  4: '🟦',
  5: '🟪',
  6: '🟧',
};
const HUGE_EMOJI = '🟥';
const SOLVER_EMOJI = '⬛';

/** Squares per row — the board's width, so the grid reads as boards cleared. */
const ROW_WIDTH = 7;

/** The key the results panel prints beside the grid. */
export const SIZE_LEGEND: { emoji: string; size: string }[] = [
  { emoji: SIZE_EMOJI[3], size: '3' },
  { emoji: SIZE_EMOJI[4], size: '4' },
  { emoji: SIZE_EMOJI[5], size: '5' },
  { emoji: SIZE_EMOJI[6], size: '6' },
  { emoji: HUGE_EMOJI, size: '7+' },
];

export function sizeEmoji(size: number, bySolver = false): string {
  if (bySolver) return SOLVER_EMOJI;
  return SIZE_EMOJI[size] ?? HUGE_EMOJI;
}

/** The emoji grid on its own — the results panel renders this inline too. */
export function shareGrid(sizes: readonly number[], solverFrom = Number.POSITIVE_INFINITY): string {
  const rows: string[] = [];
  for (let i = 0; i < sizes.length; i += ROW_WIDTH) {
    rows.push(
      sizes
        .slice(i, i + ROW_WIDTH)
        .map((size, j) => sizeEmoji(size, i + j >= solverFrom))
        .join(''),
    );
  }
  return rows.join('\n');
}

/** Found ÷ attempted, as a whole percentage. 100% means no wrong submission. */
export function accuracy(summary: RunSummary): number {
  const attempts = summary.sizes.length + summary.misses;
  if (attempts === 0) return 0;
  return Math.round((summary.sizes.length / attempts) * 100);
}

export interface ShareOptions {
  /** Leaderboard position, when the run has already been ranked. */
  rank?: number | null;
  /** Day streak, shown only when it is worth showing. */
  streak?: number | null;
  /** Index of the first GlobeSet the auto-solver took, if it was used. */
  solverFrom?: number;
  /** Absolute URL printed on the last line. */
  url?: string;
}

const DEFAULT_URL = 'https://rmhstudios.com/daily/globeset';

/**
 * The full share text.
 *
 * Time comes first because time is what the leaderboard ranks, and a reader
 * scanning a group chat should get the comparable number before the art.
 */
export function generateGlobeSetShare(summary: RunSummary, options: ShareOptions = {}): string {
  const { rank = null, streak = null, solverFrom, url = DEFAULT_URL } = options;

  const headline = summary.solverUsed
    ? `🔮 RMH GlobeSet #${summary.puzzleNumber} — 🏳️ solved out`
    : `🔮 RMH GlobeSet #${summary.puzzleNumber} — ⏱️ ${formatDuration(summary.timeSeconds)}`;

  const stats = [
    `⚡ ${summary.sizes.length} sets`,
    summary.solverUsed ? null : `🎯 ${accuracy(summary)}%`,
    summary.hints > 0 ? `💡 ${summary.hints}` : null,
    rank != null && rank > 0 ? `🏅 #${rank}` : null,
    streak != null && streak > 1 ? `🔥 ${streak}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  // Blocks, separated by blank lines. An empty block (no GlobeSets taken, no
  // stats worth printing) drops out rather than leaving a hole in the card.
  return [headline, shareGrid(summary.sizes, solverFrom), stats, url]
    .filter((block) => block.length > 0)
    .join('\n\n');
}

/** The versus card, posted after a race rather than a solo run. */
export function generateRaceShare(
  placement: number,
  players: number,
  summary: RunSummary,
  url = DEFAULT_URL,
): string {
  const medal = placement === 1 ? '🥇' : placement === 2 ? '🥈' : placement === 3 ? '🥉' : '🏁';
  return [
    `🔮 RMH GlobeSet — Race ${medal} ${placement}/${players}`,
    shareGrid(summary.sizes),
    `⏱️ ${formatDuration(summary.timeSeconds)} · ⚡ ${summary.sizes.length} sets · 🎯 ${accuracy(summary)}%`,
    url,
  ]
    .filter((block) => block.length > 0)
    .join('\n\n');
}
