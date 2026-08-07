/**
 * Slice It — the competitive features. Server-only. (Features 10 and 12.)
 *
 * Both take a result the player can already see and say what it means.
 *
 * ## Feature 10: match recap
 *
 * A versus result screen is a sorted table. It tells you who won and hides
 * everything interesting: that the margin was 400 points on a four-minute
 * chart, that the winner took it on combo while losing on accuracy, that third
 * place had the best accuracy in the room. Those are all in the table and none
 * of them are legible at a glance.
 *
 * The prompt is explicit that the model **did not watch the match** — it has
 * final standings, not a timeline. Without that framing a narrative prompt
 * invents lead changes, and a recap describing a comeback that never happened
 * is worse than no recap: everyone in the lobby was there and knows.
 *
 * ## Feature 12: rival plan
 *
 * "You are 2,400 points behind" is a fact nobody can act on, because score in
 * this game is a product of judgement quality and the combo standing behind it,
 * multiplied by difficulty and speed. The deficit might be one dropped note in
 * a chain, or it might be that the rival is running Expert at 1.2x and you are
 * not. Those need opposite responses, and {@link diffRuns} works out which it
 * is before the model writes a word.
 */

import { SLICE_IT_MATCH_RECAP, SLICE_IT_RIVAL } from '@/lib/ai/prompts';
import { attempt } from './run.server';
import { matchRecapSchema, rivalPlanSchema, type MatchRecap, type RivalPlan } from './types';
import { calculateScoreMultiplier } from '../scoring';
import type { Modifiers } from '../types';

/* -------------------------------------------------------------------------- */
/* 10. Match recap                                                            */
/* -------------------------------------------------------------------------- */

/** One player's line in the final standings. */
export interface MatchStanding {
  name: string;
  rank: number;
  score: number;
  maxCombo: number;
  /** 0–1. */
  accuracy: number;
}

/**
 * Recap a finished multiplayer match.
 *
 * Returns `null` when AI is unavailable, or when there is nothing to recap —
 * a "match" with one player in it is a solo run with extra steps.
 */
export async function recapMatch(
  input: {
    songTitle: string;
    songArtist: string;
    durationSec: number;
    standings: readonly MatchStanding[];
  },
  opts: { userId?: string | null } = {},
): Promise<MatchRecap | null> {
  if (input.standings.length < 2) return null;

  const ordered = [...input.standings].sort((a, b) => a.rank - b.rank);
  const winner = ordered[0]!;
  const runnerUp = ordered[1]!;
  const margin = winner.score - runnerUp.score;

  const lines = [
    `song: ${input.songTitle} by ${input.songArtist}`,
    `players: ${ordered.length}`,
    // Stated rather than left to be derived: a margin as a share of the winning
    // score is the difference between "took it on the line" and "ran away with
    // it", and it is the judgement the recap most often gets wrong.
    `winning margin: ${margin} points` +
      (winner.score > 0 ? ` (${((margin / winner.score) * 100).toFixed(1)}% of the win)` : ''),
    'final standings:',
    ...ordered.map(
      (s) =>
        `  #${s.rank} ${s.name}: ${s.score} points, ${(s.accuracy * 100).toFixed(2)}% accuracy, ` +
        `${s.maxCombo} max combo`,
    ),
  ];

  const best = ordered.reduce((a, b) => (b.accuracy > a.accuracy ? b : a), ordered[0]!);
  if (best.rank !== 1) {
    // The most common interesting fact in a rhythm match, and the one a sorted
    // table hides completely.
    lines.push(
      `note: the highest accuracy in the room was ${best.name} at ` +
        `${(best.accuracy * 100).toFixed(2)}%, who finished #${best.rank}`,
    );
  }

  return attempt(SLICE_IT_MATCH_RECAP, matchRecapSchema, lines.join('\n'), opts);
}

/* -------------------------------------------------------------------------- */
/* 12. Rival plan                                                             */
/* -------------------------------------------------------------------------- */

/** A leaderboard row, either the player's or the one above them. */
export interface RivalRow {
  name: string;
  score: number;
  maxCombo: number;
  /** 0–1, or null on rows recorded before accuracy was stored. */
  accuracy: number | null;
  speedMod: number;
  modifiers: Partial<Modifiers> | null;
}

/**
 * Where the deficit actually comes from. Pure, and useful with AI switched off.
 *
 * The key output is `multiplierGap`: if the rival's score multiplier is higher,
 * some of the deficit is a *setting*, not a performance, and closing it by
 * playing better means closing a larger gap than the raw numbers suggest.
 */
export function diffRuns(
  player: RivalRow,
  rival: RivalRow,
): {
  scoreGap: number;
  comboGap: number;
  accuracyGap: number | null;
  playerMultiplier: number;
  rivalMultiplier: number;
  /** Positive when the rival is running a richer multiplier than the player. */
  multiplierGap: number;
} {
  const playerMultiplier = calculateScoreMultiplier({
    ...player.modifiers,
    speed: player.speedMod,
  });
  const rivalMultiplier = calculateScoreMultiplier({
    ...rival.modifiers,
    speed: rival.speedMod,
  });

  return {
    scoreGap: rival.score - player.score,
    comboGap: rival.maxCombo - player.maxCombo,
    accuracyGap:
      player.accuracy !== null && rival.accuracy !== null ? rival.accuracy - player.accuracy : null,
    playerMultiplier: round2(playerMultiplier),
    rivalMultiplier: round2(rivalMultiplier),
    multiplierGap: round2(rivalMultiplier - playerMultiplier),
  };
}

/**
 * Explain how to overtake the score above you.
 *
 * Returns `null` when AI is unavailable, or when the player is already ahead —
 * there is no plan to write for a gap that does not exist.
 */
export async function planAgainstRival(
  input: {
    songTitle: string;
    difficultyNote?: string;
    player: RivalRow;
    rival: RivalRow;
  },
  opts: { userId?: string | null } = {},
): Promise<RivalPlan | null> {
  const diff = diffRuns(input.player, input.rival);
  if (diff.scoreGap <= 0) return null;

  const describe = (row: RivalRow, label: string) =>
    `  ${label} (${row.name}): ${row.score} points, ${row.maxCombo} max combo, ` +
    `${row.accuracy === null ? 'accuracy not recorded' : `${(row.accuracy * 100).toFixed(2)}% accuracy`}, ` +
    `${row.speedMod}x speed, modifiers: ${activeNames(row.modifiers) || 'none'}`;

  const lines = [
    `chart: ${input.songTitle}`,
    ...(input.difficultyNote ? [`chart shape: ${input.difficultyNote}`] : []),
    'the two rows:',
    describe(input.player, 'the player'),
    describe(input.rival, 'the rival, one place above'),
    '',
    `score gap to close: ${diff.scoreGap}`,
    `combo gap: ${diff.comboGap}`,
    ...(diff.accuracyGap !== null
      ? [`accuracy gap: ${(diff.accuracyGap * 100).toFixed(2)} percentage points`]
      : []),
    `player score multiplier: ${diff.playerMultiplier}x`,
    `rival score multiplier: ${diff.rivalMultiplier}x`,
    diff.multiplierGap > 0
      ? `note: ${diff.multiplierGap}x of the gap is the rival's modifiers and speed, not their playing`
      : diff.multiplierGap < 0
        ? `note: the player already runs the richer multiplier, so the whole gap is performance`
        : 'note: both rows run the same multiplier, so the whole gap is performance',
  ];

  return attempt(SLICE_IT_RIVAL, rivalPlanSchema, lines.join('\n'), opts);
}

/** The on-modifiers of a partial set, for a prompt line. */
function activeNames(modifiers: Partial<Modifiers> | null): string {
  if (!modifiers) return '';
  const labels: [keyof Modifiers, string][] = [
    ['invisible', 'Invisible'],
    ['suddenDeath', 'Sudden Death'],
    ['bombs', 'Bombs'],
    ['switching', 'Switching'],
    ['spin', 'Spin'],
    ['strictTiming', 'Strict Timing'],
    ['oneTrack', 'One Track'],
  ];
  return labels
    .filter(([key]) => modifiers[key] === true)
    .map(([, label]) => label)
    .join(', ');
}

function round2(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
