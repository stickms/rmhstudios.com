/**
 * A1, A3, A5, A7 and H9 — the accessibility suite.
 *
 * `lib/game-capabilities.ts` declared Slice It's `accessibility` array as
 * EMPTY and its descriptors as `['flashing', 'user-content']`. That was an
 * accurate self-assessment. These tests pin the three properties that make it
 * no longer true, and one of them — that an assist modifier is worth nothing —
 * is a design commitment rather than an implementation detail: a mod that eases
 * the game and then charges a score penalty punishes the player for needing it.
 */

import { describe, expect, it } from 'vitest';
import {
  ASSIST_MODIFIERS,
  DEFAULT_MODIFIERS,
  applyExclusions,
  isRankedModifierSet,
} from '../modifiers';
import { calculateScoreMultiplier } from '../scoring';
import {
  LANE_PALETTES,
  LANE_PALETTE_IDS,
  contrastRatio,
  laneColor,
  resolvePalette,
} from '../palettes';

describe('A1 — the assist family', () => {
  it('is worth no score bonus, every one of them', () => {
    const base = calculateScoreMultiplier(DEFAULT_MODIFIERS);
    for (const key of ASSIST_MODIFIERS) {
      const withAssist = calculateScoreMultiplier({ ...DEFAULT_MODIFIERS, [key]: true });
      expect(withAssist).toBe(base);
    }
  });

  it('makes a run unranked', () => {
    expect(isRankedModifierSet(DEFAULT_MODIFIERS)).toBe(true);
    for (const key of ASSIST_MODIFIERS) {
      expect(isRankedModifierSet({ ...DEFAULT_MODIFIERS, [key]: true })).toBe(false);
    }
  });

  it('lets No Fail win over the mods that would end the run early', () => {
    // A player who ticked No Fail asked for a run they can finish. Honouring
    // Sudden Death alongside it would be the cruellest reading of the two.
    const both = applyExclusions({
      ...DEFAULT_MODIFIERS,
      noFail: true,
      suddenDeath: true,
      perfectionist: true,
    });
    expect(both.suddenDeath).toBe(false);
    expect(both.perfectionist).toBe(false);
    expect(both.noFail).toBe(true);
  });
});

describe('A3 — lane palettes', () => {
  it('falls back rather than throwing on an unknown persisted id', () => {
    expect(resolvePalette('nonsense')).toBe(LANE_PALETTES.default);
    expect(resolvePalette(null)).toBe(LANE_PALETTES.default);
    expect(resolvePalette(undefined)).toBe(LANE_PALETTES.default);
  });

  it('wraps rather than returning undefined for a lane past the palette', () => {
    const palette = LANE_PALETTES.default;
    expect(laneColor(palette, 99)).toBe(palette.lanes[99 % palette.lanes.length]);
    expect(typeof laneColor(palette, 99)).toBe('string');
  });

  // `default` is the shipped look and is deliberately NOT held to these bars.
  // It is kept byte-identical so nobody's game changes under them, and it is
  // also the reason the other three exist — see the assertion at the bottom,
  // which pins the defect rather than pretending it is not there.
  const ACCESSIBLE = LANE_PALETTE_IDS.filter((id) => id !== 'default');

  it('separates the first two lanes by luminance, not only hue', () => {
    // Two colours of the same brightness are indistinguishable under
    // monochromacy and hard for everyone at the speed a note crosses the
    // screen. 1.6:1 is modest on purpose — these are large moving shapes, not
    // body text — but it is not 1:1.
    //
    // This assertion has already earned its place: the first `tritanopia`
    // draft was Okabe-Ito orange against green, hue-correct and 1.13:1.
    for (const id of ACCESSIBLE) {
      expect(contrastRatio(LANE_PALETTES[id].lanes[0], LANE_PALETTES[id].lanes[1])).toBeGreaterThan(
        1.6,
      );
    }
  });

  it('keeps every bomb colour clear of both lanes it could be confused with', () => {
    for (const id of ACCESSIBLE) {
      const palette = LANE_PALETTES[id];
      expect(contrastRatio(palette.bomb, palette.lanes[0])).toBeGreaterThan(1.5);
      expect(contrastRatio(palette.bomb, palette.lanes[1])).toBeGreaterThan(1.5);
    }
  });

  it('documents why the default palette needs an alternative at all', () => {
    // The shipped default puts a red bomb (#ef4444) against a blue lane
    // (#3b82f6) at 1.02:1 — very nearly identical luminance. Colour is doing
    // ALL the work of distinguishing the one object that ends your run, which
    // is why bombs are also drawn as a spiked polygon rather than a pill, and
    // why the three palettes above exist. If someone ever fixes the default,
    // this test should fail and be deleted.
    const d = LANE_PALETTES.default;
    expect(contrastRatio(d.bomb, d.lanes[0])).toBeLessThan(1.2);
  });
});

describe('A5 — one-handed play', () => {
  it('is the existing oneTrack mechanic, unchanged and still earning its bonus', () => {
    // A5 is a framing change, not a mechanical one: the accessibility panel
    // offers the same flag without the challenge language. Asserting the
    // multiplier is untouched is what stops a well-meaning "make it free"
    // refactor from silently rebalancing every existing oneTrack score.
    const withOneTrack = calculateScoreMultiplier({ ...DEFAULT_MODIFIERS, oneTrack: true });
    expect(withOneTrack).toBeGreaterThan(calculateScoreMultiplier(DEFAULT_MODIFIERS));
  });
});
