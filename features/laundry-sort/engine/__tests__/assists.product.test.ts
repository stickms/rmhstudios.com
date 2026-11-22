/**
 * Laundry Sort's assists (sprint 09 17): a unique glyph per colour, an untimed round that never
 * ends on time, and flags that give versus colour-safe only. Pure: the match and the cloth solver
 * have no DOM.
 */
import { describe, expect, it } from 'vitest';
import { NO_ASSISTS, type AssistProfile } from '@/lib/game/assist';
import {
  NO_LAUNDRY_ASSIST,
  UNTIMED_SCHEDULE_SEC,
  endsOnTime,
  glyphFor,
  laundryAssistFlags,
  laundryVersusFlags,
} from '@features/laundry-sort/engine/assist-profile';
import { FIXED_DT, WASH_COLORS } from '@features/laundry-sort/engine/constants';
import { LaundryMatch } from '@features/laundry-sort/engine/match';

function assisted(over: Partial<Extract<AssistProfile, { ranked: false }>> = {}): AssistProfile {
  return {
    ranked: false,
    holdToPress: false,
    speedFloor: 1,
    calmVisuals: false,
    colorSafe: false,
    noTimedInput: false,
    ...over,
  };
}

/** Feed `seconds` of simulated time in 1/60 s frames. */
function run(match: LaundryMatch, seconds: number): void {
  const frames = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < frames; i++) match.advance(FIXED_DT);
}

describe('glyphs', () => {
  it('every wash colour carries a different glyph', () => {
    const glyphs = WASH_COLORS.map((_, i) => glyphFor(i));
    expect(new Set(glyphs).size).toBe(WASH_COLORS.length);
  });

  it('a garment and its bin read the same glyph', () => {
    WASH_COLORS.forEach((wash, i) => expect(glyphFor(i)).toBe(wash.weave));
  });

  it('an unknown colour falls back to the first glyph rather than none', () => {
    expect(glyphFor(99)).toBe(glyphFor(0));
  });
});

describe('flags from a profile', () => {
  it('a ranked profile, or none, is the plain game', () => {
    expect(laundryAssistFlags(NO_ASSISTS)).toBe(NO_LAUNDRY_ASSIST);
    expect(laundryAssistFlags(null)).toBe(NO_LAUNDRY_ASSIST);
  });

  it('carries colour-safe and the untimed round, and nothing else', () => {
    expect(laundryAssistFlags(assisted({ colorSafe: true, noTimedInput: true, calmVisuals: true }))).toEqual({
      active: true,
      colorSafe: true,
      untimed: true,
    });
    expect(laundryAssistFlags(assisted({ colorSafe: true }))).toEqual({
      active: true,
      colorSafe: true,
      untimed: false,
    });
  });

  it('an assist this game does not honour switches nothing on', () => {
    expect(laundryAssistFlags(assisted({ calmVisuals: true, holdToPress: true, speedFloor: 0.5 }))).toBe(
      NO_LAUNDRY_ASSIST,
    );
  });

  it('versus applies colour-safe only, and keeps the shared clock', () => {
    expect(laundryVersusFlags({ colorSafe: true })).toEqual({ active: true, colorSafe: true, untimed: false });
    expect(laundryVersusFlags({ colorSafe: false })).toBe(NO_LAUNDRY_ASSIST);
    expect(laundryVersusFlags(null)).toBe(NO_LAUNDRY_ASSIST);
  });

  it('a match ends on time unless it is untimed', () => {
    expect(endsOnTime(NO_LAUNDRY_ASSIST)).toBe(true);
    expect(endsOnTime({ untimed: true })).toBe(false);
  });
});

describe('the untimed round', () => {
  const base = { seed: 12345, durationSec: 5, difficulty: 'relaxed' as const };

  it('a timed match ends when its clock runs out', () => {
    const match = new LaundryMatch(base);
    run(match, 6);
    expect(match.finished).toBe(true);
    expect(match.untimed).toBe(false);
  });

  it('an untimed match never ends on time, however long it runs', () => {
    const match = new LaundryMatch({ ...base, untimed: true });
    run(match, 12);
    expect(match.finished).toBe(false);
    expect(match.untimed).toBe(true);
    expect(match.remaining).toBe(Number.POSITIVE_INFINITY);
    // Past the timed length, so the clock would have ended it twice over.
    expect(match.elapsed).toBeGreaterThan(base.durationSec * 2);
  });

  it('keeps dealing garments past the timed length', () => {
    const timed = new LaundryMatch(base);
    const untimed = new LaundryMatch({ ...base, untimed: true });
    const lastTimedDrop = timed.drops[timed.drops.length - 1].at;
    expect(untimed.drops.length).toBeGreaterThan(timed.drops.length);
    expect(untimed.drops[untimed.drops.length - 1].at).toBeGreaterThan(lastTimedDrop);
    expect(untimed.drops[untimed.drops.length - 1].at).toBeLessThan(UNTIMED_SCHEDULE_SEC);
  });

  it('ends only when the player finishes it, and then stays ended', () => {
    const match = new LaundryMatch({ ...base, untimed: true });
    run(match, 2);
    expect(match.finished).toBe(false);
    match.finish();
    expect(match.finished).toBe(true);
    const score = match.stats.score;
    run(match, 1);
    expect(match.stats.score).toBe(score);
  });

  it('finishing a match twice is harmless', () => {
    const match = new LaundryMatch({ ...base, untimed: true });
    match.finish();
    expect(() => match.finish()).not.toThrow();
    expect(match.finished).toBe(true);
  });
});
