/**
 * The anti-cheat checks, and — as much as anything — the boundaries of what they
 * claim. Each test names the run it is supposed to catch or spare.
 *
 * The false-positive cases matter more than the true positives here. A check
 * that rejects a legitimate record run costs a real player their score and the
 * leaderboard its credibility, which is a worse outcome than the cheat it was
 * trying to stop, so "an exceptional but honest run survives" is tested for
 * every check that can reject.
 */

import { describe, it, expect } from 'vitest';
import {
  MIN_HUMAN_STDDEV_MS,
  MIN_TIMING_SAMPLES,
  checkConsistency,
  checkElapsed,
  checkTiming,
  mergeVerdicts,
} from '../integrity';
import { DEFAULT_MODIFIERS } from '../modifiers';

const mods = (over: Record<string, unknown> = {}) => ({ ...DEFAULT_MODIFIERS, ...over });

describe('checkTiming', () => {
  it('flags a distribution too precise for hands', () => {
    // An auto-player pressing at the note: essentially zero scatter.
    const codes = checkTiming({ samples: 400, meanMs: 0.1, stdDevMs: 0.4 });
    expect(codes).toContain('timing_too_precise');
  });

  it('leaves an expert human alone', () => {
    // ~12 ms standard deviation with a small consistent lead — a very good
    // player on a calibrated setup, which is exactly who sets records.
    expect(checkTiming({ samples: 800, meanMs: -6, stdDevMs: 12 })).toEqual([]);
    // And a merely decent one.
    expect(checkTiming({ samples: 200, meanMs: 14, stdDevMs: 31 })).toEqual([]);
  });

  it('says nothing when there are too few hits to have a distribution', () => {
    // A four-note run with perfect timing is luck, not a bot.
    expect(checkTiming({ samples: MIN_TIMING_SAMPLES - 1, meanMs: 0, stdDevMs: 0 })).toEqual([]);
    expect(checkTiming(null)).toEqual([]);
    expect(checkTiming(undefined)).toEqual([]);
  });

  it('flags a mean no hit window could have produced', () => {
    expect(checkTiming({ samples: 100, meanMs: 900, stdDevMs: 20 })).toContain(
      'timing_mean_impossible',
    );
  });

  it('tolerates a calibration offset, which legitimately shifts the mean', () => {
    // The calibration screen allows +/-200 ms; a player who uses it is not a cheat.
    expect(checkTiming({ samples: 100, meanMs: -180, stdDevMs: 22 })).toEqual([]);
  });

  it('never rejects on its own — it is statistical, and the population is players', () => {
    const codes = checkTiming({ samples: 500, meanMs: 0, stdDevMs: MIN_HUMAN_STDDEV_MS / 2 });
    expect(codes.length).toBeGreaterThan(0);
    // The verdict shape a caller merges is non-rejecting.
    expect(mergeVerdicts({ reject: false, suspicions: codes }).reject).toBe(false);
  });
});

describe('checkConsistency', () => {
  const base = {
    accuracy: 0.97,
    durationSeconds: 120,
    modifiers: mods(),
  };

  it('accepts a strong, coherent run', () => {
    const verdict = checkConsistency({
      ...base,
      score: 900_000,
      maxCombo: 400,
      notesResolved: 420,
      chartNotes: 430,
    });
    expect(verdict).toEqual({ reject: false, suspicions: [] });
  });

  it('catches a combo larger than the notes it was built from', () => {
    const verdict = checkConsistency({
      ...base,
      score: 10_000,
      maxCombo: 900,
      notesResolved: 100,
      chartNotes: 500,
    });
    expect(verdict.reject).toBe(true);
    expect(verdict.suspicions).toContain('combo_exceeds_notes');
  });

  it('catches more notes resolved than the chart contains', () => {
    const verdict = checkConsistency({
      ...base,
      score: 10_000,
      maxCombo: 50,
      notesResolved: 5000,
      chartNotes: 400,
    });
    expect(verdict.suspicions).toContain('notes_exceed_chart');
  });

  it('allows a little slack for a chart re-generated mid-run', () => {
    const verdict = checkConsistency({
      ...base,
      score: 10_000,
      maxCombo: 50,
      notesResolved: 404,
      chartNotes: 400,
    });
    expect(verdict.suspicions).not.toContain('notes_exceed_chart');
  });

  it('catches a score that its own note count cannot reach', () => {
    // Twenty notes cannot be worth ten million, whatever the accuracy claims.
    const verdict = checkConsistency({
      ...base,
      score: 10_000_000,
      maxCombo: 20,
      notesResolved: 20,
      chartNotes: 400,
    });
    expect(verdict.reject).toBe(true);
    expect(verdict.suspicions).toContain('accuracy_score_mismatch');
  });

  it('checks only what it was told — a client that sends less is not punished', () => {
    // No `notesResolved` means the note-count bounds simply do not apply; the
    // duration ceiling in `scoring.ts` still does.
    const verdict = checkConsistency({ ...base, score: 900_000, maxCombo: 400 });
    expect(verdict).toEqual({ reject: false, suspicions: [] });
  });
});

describe('checkElapsed', () => {
  it('rejects a run that finished before the song could have played', () => {
    const verdict = checkElapsed({ elapsedMs: 3_000, durationSeconds: 180, speed: 1 });
    expect(verdict.reject).toBe(true);
    expect(verdict.suspicions).toEqual(['finished_too_fast']);
  });

  it('accepts a run that took about as long as the song', () => {
    expect(checkElapsed({ elapsedMs: 181_000, durationSeconds: 180, speed: 1 }).reject).toBe(false);
  });

  it('accounts for the speed modifier', () => {
    // 180 s at 2x is 90 s of real time — legitimate, and a naive check would
    // have called it half a song.
    expect(checkElapsed({ elapsedMs: 91_000, durationSeconds: 180, speed: 2 }).reject).toBe(false);
    // But 30 s is too fast even at 2x.
    expect(checkElapsed({ elapsedMs: 30_000, durationSeconds: 180, speed: 2 }).reject).toBe(true);
  });

  it('allows an early finish, because the last note is not the last second', () => {
    // 10% short: a track that ends on a long outro.
    expect(checkElapsed({ elapsedMs: 162_000, durationSeconds: 180, speed: 1 }).reject).toBe(false);
  });

  it('says nothing about a song with no recorded duration', () => {
    expect(checkElapsed({ elapsedMs: 1, durationSeconds: 0, speed: 1 }).reject).toBe(false);
  });
});

describe('mergeVerdicts', () => {
  it('rejects if anything rejected, and dedupes the reasons', () => {
    const merged = mergeVerdicts(
      { reject: false, suspicions: ['timing_too_precise'] },
      { reject: true, suspicions: ['combo_exceeds_notes', 'timing_too_precise'] },
    );
    expect(merged.reject).toBe(true);
    expect(merged.suspicions).toEqual(['timing_too_precise', 'combo_exceeds_notes']);
  });

  it('is clean when everything is clean', () => {
    expect(mergeVerdicts({ reject: false, suspicions: [] })).toEqual({
      reject: false,
      suspicions: [],
    });
  });
});

describe('the accuracy bound', () => {
  /**
   * The shape an edited submission actually has: the score was raised and the
   * accuracy was left alone, because they are separate fields and a cheat only
   * cares about one of them. The combo bound alone does not see this — the
   * score is well inside what a flawless run of that length could reach — so
   * this is the case the weight-budget bound exists for.
   */
  it('catches a huge score sitting next to a mediocre accuracy', () => {
    const shared = {
      maxCombo: 300,
      notesResolved: 400,
      chartNotes: 420,
      durationSeconds: 120,
      modifiers: mods(),
    };
    // 15% accuracy cannot bank the weight a 9,000,000 score needs.
    const cheated = checkConsistency({ ...shared, score: 9_000_000, accuracy: 0.15 });
    expect(cheated.reject).toBe(true);
    expect(cheated.suspicions).toContain('accuracy_score_mismatch');

    // The same score at the accuracy that would produce it is fine — and the
    // combo bound alone would have accepted BOTH, which is the point.
    const honest = checkConsistency({ ...shared, score: 9_000_000, accuracy: 0.98 });
    expect(honest.suspicions).not.toContain('accuracy_score_mismatch');
  });

  it('still allows a low-accuracy run to score what a low-accuracy run scores', () => {
    const verdict = checkConsistency({
      score: 40_000,
      accuracy: 0.15,
      maxCombo: 40,
      notesResolved: 400,
      chartNotes: 420,
      durationSeconds: 120,
      modifiers: mods(),
    });
    expect(verdict).toEqual({ reject: false, suspicions: [] });
  });
});
