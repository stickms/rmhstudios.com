/**
 * Slice It — the pre-play features. Server-only. (Features 4 and 5.)
 *
 * Both answer a question the player has while looking at a song they have not
 * played: *what is this going to ask of me*, and *what should I turn on*.
 *
 * They are two calls rather than one because they are read at different moments
 * and have very different cache lives. A chart brief depends only on the chart,
 * so it is the same for every player and worth caching hard. A loadout depends
 * on the chart **and** on who is asking, so it is per-player and cannot be
 * shared. Fusing them would drag the brief down to the loadout's cacheability
 * and pay for a personalised model call every time anyone opened a song page.
 */

import { SLICE_IT_CHART_BRIEF, SLICE_IT_LOADOUT } from '@/lib/ai/prompts';
import type { Difficulty } from '../constants';
import type { TimingSummary } from '../integrity';
import { attempt } from './run.server';
import { chartBriefSchema, loadoutSchema, type ChartBrief, type LoadoutAdvice } from './types';
import { canHoldStrictTiming, chartFactsToText, mmss, type ChartFacts } from './facts';

/* -------------------------------------------------------------------------- */
/* 4. Chart brief                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Brief a player on a chart before they play it.
 *
 * Depends on nothing but the chart, which is what makes the caller's cache
 * sound: the same song and difficulty produce the same brief for everybody, so
 * it is computed once and served from `apiCache` after that.
 */
export async function briefChart(
  input: {
    songTitle: string;
    songArtist: string;
    difficulty: Difficulty;
    facts: ChartFacts;
  },
  opts: { userId?: string | null } = {},
): Promise<ChartBrief | null> {
  const text = [
    `song: ${input.songTitle} by ${input.songArtist}`,
    `difficulty: ${input.difficulty}`,
    chartFactsToText(input.facts),
  ].join('\n');

  const brief = await attempt(SLICE_IT_CHART_BRIEF, chartBriefSchema, text, opts);
  if (!brief) return null;

  const duration = input.facts.durationSec;
  return {
    ...brief,
    watchFor: brief.watchFor
      // A timestamp past the end of the track is a hallucinated one, and it
      // renders as a cue for a moment that never arrives.
      .filter((w) => w.note !== '' && (w.atSec === undefined || w.atSec <= duration + 1))
      .map((w) => (w.atSec === undefined ? w : { ...w, atSec: Math.round(w.atSec) })),
  };
}

/* -------------------------------------------------------------------------- */
/* 5. Modifier loadout advisor                                                */
/* -------------------------------------------------------------------------- */

/** What the advisor knows about the player asking. */
export interface PlayerProfile {
  /** Best accuracy this player has reached on any chart, 0–1. */
  bestAccuracy: number | null;
  /** Difficulty they most often clear. */
  usualDifficulty: Difficulty | null;
  /** Pooled hit timing across their recent runs. */
  timing: TimingSummary | null;
  /** Their previous best on THIS chart, if they have played it. */
  bestOnThisChart: { score: number; accuracy: number; difficulty: Difficulty } | null;
  /** How many runs they have finished overall. */
  runsPlayed: number;
}

/**
 * Recommend a modifier loadout for one chart and one player.
 *
 * Two guardrails are applied to whatever comes back, because both failure modes
 * are worse than no recommendation:
 *
 *  - **Strict Timing is removed when the player's spread cannot survive it.**
 *    The modifier shrinks every window to 70%; recommending it to someone whose
 *    hits already scatter wider than the shrunken window is recommending they
 *    fail. `canHoldStrictTiming` is the check, and it is arithmetic.
 *  - **Sudden Death is never on.** It is not in the schema at all. A run that
 *    ends on the first miss is a fine thing to *choose* and a terrible thing to
 *    be handed by an advisor you asked for help.
 */
export async function recommendLoadout(
  input: {
    songTitle: string;
    songArtist: string;
    facts: ChartFacts;
    player: PlayerProfile;
  },
  opts: { userId?: string | null } = {},
): Promise<LoadoutAdvice | null> {
  const { player } = input;
  const lines = [
    `song: ${input.songTitle} by ${input.songArtist}`,
    chartFactsToText(input.facts),
    '',
    'the player:',
    `  runs finished: ${player.runsPlayed}`,
    `  usual difficulty: ${player.usualDifficulty ?? 'unknown'}`,
    `  best accuracy achieved: ${
      player.bestAccuracy === null ? 'unknown' : `${(player.bestAccuracy * 100).toFixed(1)}%`
    }`,
  ];

  if (player.timing) {
    lines.push(
      `  hit timing spread: ${Math.round(player.timing.stdDevMs)} ms over ` +
        `${player.timing.samples} hits`,
    );
    lines.push(
      `  can they hold Strict Timing: ${canHoldStrictTiming(player.timing) ? 'yes' : 'no'}`,
    );
  } else {
    lines.push('  hit timing spread: unknown');
  }

  if (player.bestOnThisChart) {
    const best = player.bestOnThisChart;
    lines.push(
      `  their best on THIS chart: ${best.score} at ${(best.accuracy * 100).toFixed(1)}% ` +
        `on ${best.difficulty}`,
    );
  } else {
    lines.push('  they have never finished this chart');
  }

  const advice = await attempt(SLICE_IT_LOADOUT, loadoutSchema, lines.join('\n'), opts);
  if (!advice) return null;

  return {
    ...advice,
    strictTiming: advice.strictTiming && canHoldStrictTiming(player.timing),
  };
}

/**
 * A one-line difficulty readout, computed with no model at all.
 *
 * This is what the song panel shows when AI is switched off, and it is why the
 * chart-brief panel never renders empty. It says less than a brief and it is
 * never wrong.
 */
export function describeChartPlainly(facts: ChartFacts): string {
  if (facts.noteCount === 0) return 'No chart generated yet.';
  const peak = `peaks at ${facts.peakNps} notes/sec around ${mmss(facts.peakAtSec)}`;
  const streams =
    facts.longestStream >= 8
      ? `, longest alternating run ${facts.longestStream} notes`
      : facts.jackRatio > 0.4
        ? `, heavy on same-lane repeats`
        : '';
  return `${facts.noteCount} notes, ${facts.averageNps} notes/sec average, ${peak}${streams}.`;
}
