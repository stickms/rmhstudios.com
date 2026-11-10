/**
 * Slice It — score integrity.
 *
 * ## What this can and cannot be
 *
 * Slice It judges hits on the client, and it has to: what is being judged is the
 * alignment between a keypress and audio playing on the player's own machine,
 * and the server has neither. Anything that runs in a browser can be modified by
 * whoever it runs on, so **there is no check here that a determined attacker
 * with a debugger cannot defeat.** Claiming otherwise would be the actual
 * security failure.
 *
 * What is achievable is raising the cost from "paste a fetch call into the
 * console" to "write a program that plays the game", and making the difference
 * visible when someone does. That is the goal, and it is worth having: the
 * leaderboard's job is to be a credible ranking of people who played, and almost
 * everyone who would cheat will not build a bot.
 *
 * ## The four checks, cheapest first
 *
 * 1. **Bounds** (`maxPlausibleScore`, `maxPlausibleCombo` in `scoring.ts`). A
 *    ceiling from the song's real duration. Stops a typed-in number.
 * 2. **Internal consistency** ({@link checkConsistency}). Score, accuracy, combo
 *    and note count are four views of one run, and they constrain each other. A
 *    claim of 100% accuracy with a combo of 3 is not a good run, it is two
 *    numbers that were edited separately.
 * 3. **Wall-clock** ({@link checkElapsed}). A run cannot finish before the song
 *    does. The server issues a nonce when a run starts and reads the clock when
 *    the score arrives, so a replayed or instant submission is visible without
 *    trusting anything the client says about time.
 * 4. **Timing distribution** ({@link checkTiming}). The one that catches an
 *    actual auto-player. Human hit offsets scatter — even a top player's have a
 *    standard deviation around 10–25 ms, because hands are not clocks. A program
 *    pressing at `slice.time` has a standard deviation near zero. This is the
 *    same statistic every rhythm game's anti-cheat leans on, for the same
 *    reason: it is a property of *being human*, not of the software.
 *
 * ## Deliberate design choices
 *
 * **Flag, do not always reject.** A false positive on a legitimate record run is
 * worse than a false negative on one cheated score — the record holder is a real
 * person who will never trust the board again. Only checks that no honest run
 * can fail reject outright; the statistical one records a `suspicion` on the row
 * for review.
 *
 * **The client sends a summary, not samples.** Per-note offsets would be more
 * powerful and would also be a per-note payload for every score in the game.
 * Count/mean/standard deviation is three numbers and enough to separate a person
 * from a metronome.
 *
 * **The ceiling is loose where the game is generous.** The hold term assumes the
 * entire song could have been one held note at the highest combo reached, which
 * is true and far above any real chart — the server would have to read the
 * chart's actual hold durations to tighten it, and does not. So a cheat that
 * stays under a duration-scaled hold budget gets past this check and has to be
 * caught by one of the other three. Documented rather than hidden, because a
 * bound whose weakness is unknown is worse than one whose weakness is written
 * down.
 *
 * **Nothing here is secret.** An attacker reading this file learns to add
 * plausible jitter to their bot, and that is fine: a bot that has to emulate a
 * human timing distribution over a whole song is most of the way to a program
 * that plays the game, which is where the cost curve was supposed to end up.
 */

import type { Modifiers } from './types';
import {
  ACCURACY_WEIGHTS,
  HIT_POINTS,
  HOLD_RELEASE_POINTS,
  HOLD_TICK_POINTS_PER_SECOND,
} from './constants';
import { calculateScoreMultiplier } from './scoring';

/** A run's hit-timing distribution, summarised. Produced by the engine. */
export interface TimingSummary {
  /** How many hits it is computed from. */
  samples: number;
  /** Mean signed error in ms — negative is early. A calibration offset shows here. */
  meanMs: number;
  /** Standard deviation in ms. The number that separates a person from a bot. */
  stdDevMs: number;
}

/** Below this, the distribution says nothing and no check is made. */
export const MIN_TIMING_SAMPLES = 30;

/**
 * Standard deviation below which a run is flagged, ms.
 *
 * Published studies of rhythm-game timing put expert standard deviations around
 * 10–25 ms and no human population anywhere near 4. It is set low on purpose:
 * the cost of a false positive is a real player's record, and a bot author who
 * tunes their jitter up to 5 ms has been made to do work. Runs are flagged, not
 * rejected — see the module note.
 */
export const MIN_HUMAN_STDDEV_MS = 4;

/**
 * Mean offset beyond which a run is flagged, ms.
 *
 * A calibration offset legitimately shifts the mean, and the calibration screen
 * allows ±200 ms. Past 250 the claim is that every note was hit a quarter second
 * off and still judged as a hit, which the hit windows do not allow.
 */
export const MAX_HUMAN_MEAN_MS = 250;

export type SuspicionCode =
  | 'timing_too_precise'
  | 'timing_mean_impossible'
  | 'notes_exceed_chart'
  | 'accuracy_score_mismatch'
  | 'combo_exceeds_notes'
  | 'finished_too_fast';

export interface IntegrityVerdict {
  /** True when the run must not be recorded at all. */
  reject: boolean;
  /** Everything noticed, whether or not it rejects. */
  suspicions: SuspicionCode[];
}

const ok: IntegrityVerdict = { reject: false, suspicions: [] };

/**
 * Timing distribution: is this a person?
 *
 * Never rejects. A run whose timing is inhuman is *recorded and flagged*,
 * because the check is statistical and the population it is applied to includes
 * the best players on the platform.
 */
export function checkTiming(timing: TimingSummary | null | undefined): SuspicionCode[] {
  if (!timing || timing.samples < MIN_TIMING_SAMPLES) return [];
  const out: SuspicionCode[] = [];
  if (Number.isFinite(timing.stdDevMs) && timing.stdDevMs < MIN_HUMAN_STDDEV_MS) {
    out.push('timing_too_precise');
  }
  if (!Number.isFinite(timing.meanMs) || Math.abs(timing.meanMs) > MAX_HUMAN_MEAN_MS) {
    out.push('timing_mean_impossible');
  }
  return out;
}

/**
 * Do the numbers describe one run?
 *
 * Score, accuracy, combo and note count are four measurements of the same thing.
 * A cheat that edits one usually leaves the others alone, and this is where that
 * shows. These reject: they are arithmetic, not statistics, and an honest client
 * cannot produce a contradiction.
 */
export function checkConsistency(input: {
  score: number;
  accuracy: number;
  maxCombo: number;
  notesResolved?: number;
  /** Notes in the chart the player actually played, when the server knows it. */
  chartNotes?: number;
  durationSeconds: number;
  modifiers: Partial<Modifiers> | null | undefined;
}): IntegrityVerdict {
  const suspicions: SuspicionCode[] = [];
  const { score, maxCombo, notesResolved, chartNotes } = input;

  // You cannot resolve more notes than the chart contains. A little slack for a
  // chart that was re-generated between the run starting and the score landing.
  if (
    notesResolved !== undefined &&
    chartNotes !== undefined &&
    chartNotes > 0 &&
    notesResolved > chartNotes * 1.05 + 8
  ) {
    suspicions.push('notes_exceed_chart');
  }

  // Combo counts notes hit in a row, so it cannot exceed how many were resolved.
  if (notesResolved !== undefined && maxCombo > notesResolved) {
    suspicions.push('combo_exceeds_notes');
  }

  // The strongest arithmetic bound. Accuracy caps the judgements, judgements cap
  // the per-note points, and combo caps the multiplier chain — so a claimed
  // accuracy implies a ceiling on score for a given note count.
  if (notesResolved !== undefined && notesResolved > 0) {
    const ceiling = scoreCeilingFor(input, notesResolved);
    if (score > ceiling) suspicions.push('accuracy_score_mismatch');
  }

  return { reject: suspicions.length > 0, suspicions };
}

/**
 * The most a run of this shape could have scored.
 *
 * Deliberately generous — it is checking for a contradiction, not grading — but
 * it is bounded two independent ways and takes whichever is tighter.
 *
 * **By combo.** Score is `points x combo`, so a flawless run's combo climbs
 * `1..n` and the sum is the triangular number. This binds when accuracy is high.
 *
 * **By accuracy.** Accuracy is a weight budget: a run of `n` notes at accuracy
 * `a` banked `a x n x 100` weight in total. MARVELOUS is the most points per
 * unit of weight of any judgement (250 points for 100 weight; GOOD is 75 for
 * 50), so no arrangement of judgements beats `2.5 x weight`, and no note can be
 * worth more than `combo <= n` times that. This binds when accuracy is low —
 * which is exactly the shape of an edited submission, where the score was raised
 * and the accuracy left where it was.
 */
function scoreCeilingFor(
  input: {
    accuracy: number;
    maxCombo: number;
    durationSeconds: number;
    modifiers: Partial<Modifiers> | null | undefined;
  },
  notesResolved: number,
): number {
  const mult = calculateScoreMultiplier(input.modifiers);
  const n = notesResolved;
  // Every per-note payout is multiplied by the combo at that moment, and the
  // run states the highest combo it ever reached. Using `maxCombo` rather than
  // `n` everywhere below is what makes these bounds bite on a run that scored a
  // lot without ever chaining — which is what an edited score looks like.
  const combo = Math.max(1, Math.min(n, Math.floor(input.maxCombo) || 1));

  // The combo chain, capped by the highest combo actually claimed.
  const byCombo = HIT_POINTS.MARVELOUS * Math.min((n * (n + 1)) / 2, n * combo);

  const accuracy = Number.isFinite(input.accuracy) ? Math.max(0, Math.min(1, input.accuracy)) : 1;
  const bestPointsPerWeight = HIT_POINTS.MARVELOUS / ACCURACY_WEIGHTS.MARVELOUS;
  const byAccuracy = bestPointsPerWeight * (accuracy * n * 100) * combo;

  const releases = HOLD_RELEASE_POINTS * n;
  // Holds accrue per second of audio rather than per frame, so the bound is
  // "the whole song was one held note at the highest combo reached" — true as a
  // ceiling, and about 120x tighter than the old per-frame model.
  const duration = Number.isFinite(input.durationSeconds) ? Math.max(0, input.durationSeconds) : 0;
  const holds = HOLD_TICK_POINTS_PER_SECOND * duration * combo;

  return Math.ceil((Math.min(byCombo, byAccuracy) + releases + holds) * mult * 1.05);
}

/**
 * Did enough real time pass for this run to have happened?
 *
 * `elapsedMs` is measured by the server: the gap between issuing the run's nonce
 * and receiving its score. The song cannot be played faster than its own length
 * divided by the speed modifier, so anything much under that did not involve
 * listening to it. Rejects — this is a fact about physics, not a heuristic.
 *
 * The 15% allowance covers a legitimate early finish: a run can end before the
 * audio does when the last note is well before the end of the track.
 */
export function checkElapsed(input: {
  elapsedMs: number;
  durationSeconds: number;
  speed: number;
}): IntegrityVerdict {
  const speed = Number.isFinite(input.speed) && input.speed > 0 ? input.speed : 1;
  const duration = Number.isFinite(input.durationSeconds) ? Math.max(0, input.durationSeconds) : 0;
  if (duration <= 0) return ok;

  const requiredMs = (duration / speed) * 1000 * 0.85;
  if (input.elapsedMs < requiredMs) {
    return { reject: true, suspicions: ['finished_too_fast'] };
  }
  return ok;
}

/** Merge verdicts, preserving order and dropping duplicates. */
export function mergeVerdicts(...verdicts: IntegrityVerdict[]): IntegrityVerdict {
  const seen = new Set<SuspicionCode>();
  const suspicions: SuspicionCode[] = [];
  let reject = false;
  for (const verdict of verdicts) {
    if (verdict.reject) reject = true;
    for (const code of verdict.suspicions) {
      if (seen.has(code)) continue;
      seen.add(code);
      suspicions.push(code);
    }
  }
  return { reject, suspicions };
}
