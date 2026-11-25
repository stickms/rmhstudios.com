import { describe, it, expect } from 'vitest';

/**
 * The cross-game assist layer (P7).
 *
 * Two things are being protected. The first is the leaderboard rule, which the
 * difficulty director established and this inherits: a board mixing assisted
 * and unassisted runs measures nothing. The second is the honesty rule — a
 * game cannot be listed as honouring assists without also claiming the
 * matching accessibility features, and cannot claim them without being listed.
 * Those two halves shipping apart is precisely how the capabilities registry
 * would start lying.
 */

import {
  ASSIST_CAPABLE,
  ASSIST_DEFAULTS,
  ASSIST_FEATURES,
  HONOURED_SETTINGS,
  OWN_ASSIST_IMPLEMENTATION,
  MIN_SPEED_FLOOR,
  NO_ASSISTS,
  hasAnyAssist,
  normalizeAssists,
  profileFor,
  profileIsRanked,
  type AssistSettings,
} from '@/lib/game/assist';
import { GAME_CAPABILITIES } from '@/lib/game-capabilities';

const assisted: AssistSettings = {
  ...ASSIST_DEFAULTS,
  calmVisuals: true,
};

describe('the leaderboard rule', () => {
  it('has exactly one ranked profile', () => {
    expect(profileIsRanked(NO_ASSISTS)).toBe(true);
    expect(
      profileIsRanked({
        ranked: false,
        ...assisted,
      }),
    ).toBe(false);
  });

  it('never ranks a run with an assist on, for an adopting game', () => {
    // Simulated adoption: if a game were in the set, an assisted run must be
    // unranked. Asserting it against the live (empty) set would pass
    // vacuously, which is the same as not testing it.
    const profile = ASSIST_CAPABLE.has('x')
      ? profileFor('x', assisted)
      : {
          ranked: false as const,
          ...assisted,
        };
    expect(profile.ranked).toBe(false);
  });

  it('keeps a run ranked in a game that has not adopted the layer', () => {
    // The important direction: somebody with assists on must not silently lose
    // leaderboard eligibility in a game that was never going to honour them.
    expect(profileFor('not-adopted', assisted)).toEqual(NO_ASSISTS);
  });

  it('keeps a run ranked when no assist is actually switched on', () => {
    expect(profileFor('anything', ASSIST_DEFAULTS)).toEqual(NO_ASSISTS);
  });
});

describe('hasAnyAssist', () => {
  it('is false for the defaults', () => {
    expect(hasAnyAssist(ASSIST_DEFAULTS)).toBe(false);
  });

  it('notices each switch', () => {
    for (const key of ['holdToPress', 'calmVisuals', 'colorSafe', 'noTimedInput'] as const) {
      expect(
        hasAnyAssist({
          ...ASSIST_DEFAULTS,
          [key]: true,
        }),
      ).toBe(true);
    }
  });

  it('notices a reduced speed floor', () => {
    expect(
      hasAnyAssist({
        ...ASSIST_DEFAULTS,
        speedFloor: 0.75,
      }),
    ).toBe(true);
  });
});

describe('normalizeAssists', () => {
  it('returns the defaults for null', () => {
    expect(normalizeAssists(null)).toEqual(ASSIST_DEFAULTS);
  });

  it('clamps the speed floor into range rather than rejecting it', () => {
    // These arrive from a form and from rows written by older versions of this
    // file; neither is worth a 400.
    expect(
      normalizeAssists({
        speedFloor: 0.1,
      }).speedFloor,
    ).toBe(MIN_SPEED_FLOOR);
    expect(
      normalizeAssists({
        speedFloor: 5,
      }).speedFloor,
    ).toBe(1);
  });

  it('survives a non-numeric speed floor', () => {
    expect(
      normalizeAssists({
        speedFloor: NaN,
      }).speedFloor,
    ).toBe(1);
    expect(
      normalizeAssists({
        speedFloor: undefined,
      }).speedFloor,
    ).toBe(1);
  });

  it('coerces truthiness on the switches', () => {
    expect(
      normalizeAssists({
        calmVisuals: 1 as unknown as boolean,
      }).calmVisuals,
    ).toBe(true);
  });
});

/**
 * Assist features a game does not honour, with the reason, so claiming it would be a lie.
 * Sprint 09 17: Neon Driftway has no tap input or reaction window to extend; Laundry Sort has
 * no flash or shake to remove. Everything else in ASSIST_FEATURES is required of an adopter.
 */
const NOT_HONOURED: Record<string, readonly string[]> = {
  'neon-driftway': ['no-timed-input'],
  'laundry-sort': ['reduced-flashing'],
};

describe('the honesty rule', () => {
  it('lists exactly the games whose client reads a profile', () => {
    // A game added here without client support trades its players' leaderboard
    // eligibility for nothing at all. Each entry changes in the same commit that
    // teaches its client to honour the settings.
    expect([...ASSIST_CAPABLE].sort()).toEqual([
      'dream-rift',
      'laundry-sort',
      'neon-driftway',
      'nightrail',
      'synapse-storm',
      'vega',
      'void-breaker',
    ]);
  });

  it('Vega honours four of the five settings (it has no held input) and claims all four features', () => {
    expect(HONOURED_SETTINGS.vega).toEqual(['speedFloor', 'calmVisuals', 'colorSafe', 'noTimedInput']);
    expect(GAME_CAPABILITIES.vega?.accessibility).toEqual(
      expect.arrayContaining(['assist-mode', 'reduced-flashing', 'colorblind-safe', 'no-timed-input']),
    );
    // Hold to press alone costs a Vega player nothing: the run stays ranked.
    expect(profileFor('vega', { ...ASSIST_DEFAULTS, holdToPress: true }).ranked).toBe(true);
    expect(profileFor('vega', { ...ASSIST_DEFAULTS, speedFloor: 0.5 }).ranked).toBe(false);
  });

  it('every adopting game is a real game in the catalog', () => {
    for (const id of ASSIST_CAPABLE) {
      expect({
        id,
        known: id in GAME_CAPABILITIES,
      }).toEqual({
        id,
        known: true,
      });
    }
  });

  it('NOT_HONOURED agrees with HONOURED_SETTINGS: a feature is waived only when its settings are dropped', () => {
    const settingsFor: Record<string, readonly string[]> = {
      'reduced-flashing': ['calmVisuals'],
      'colorblind-safe': ['colorSafe'],
      'no-timed-input': ['holdToPress', 'noTimedInput'],
      'assist-mode': [],
    };
    for (const id of ASSIST_CAPABLE) {
      const honoured: readonly string[] = HONOURED_SETTINGS[id] ?? [
        'holdToPress',
        'speedFloor',
        'calmVisuals',
        'colorSafe',
        'noTimedInput',
      ];
      const waived = new Set<string>(NOT_HONOURED[id] ?? []);
      for (const feature of ASSIST_FEATURES) {
        const needs = settingsFor[feature] ?? [];
        if (needs.length === 0) continue;
        const honoursAny = needs.some((n) => honoured.includes(n));
        expect({ id, feature, waived: waived.has(feature) }).toEqual({ id, feature, waived: !honoursAny });
      }
    }
  });

  it('every adopting game claims the accessibility features it now has', () => {
    for (const id of ASSIST_CAPABLE) {
      const declared = new Set(GAME_CAPABILITIES[id]?.accessibility ?? []);
      const notHonoured = new Set<string>(NOT_HONOURED[id] ?? []);
      const missing = ASSIST_FEATURES.filter((f) => !notHonoured.has(f) && !declared.has(f));
      expect({
        id,
        missing,
      }).toEqual({
        id,
        missing: [],
      });
      // The other direction: a feature a game says it does not honour is not claimed either.
      expect({
        id,
        overclaimed: [...notHonoured].filter((f) => declared.has(f as never)),
      }).toEqual({
        id,
        overclaimed: [],
      });
    }
  });

  it('no game claims assist-mode without an implementation behind it', () => {
    // The other direction. A game claiming `assist-mode` while ignoring every
    // setting is the capabilities registry lying, which is the one thing that
    // file exists not to do.
    //
    // Two ways to have an implementation: this shared layer, or the game's own.
    // Slice It is the only one with its own, and OWN_ASSIST_IMPLEMENTATION is
    // one-directional — it shrinks when a game moves onto the shared layer and
    // never grows.
    for (const [id, caps] of Object.entries(GAME_CAPABILITIES)) {
      if (!caps.accessibility.includes('assist-mode')) continue;
      const backed = ASSIST_CAPABLE.has(id) || OWN_ASSIST_IMPLEMENTATION.has(id);
      expect({
        id,
        backed,
      }).toEqual({
        id,
        backed: true,
      });
    }
  });

  it('the pre-existing implementations are real games that really claim it', () => {
    for (const id of OWN_ASSIST_IMPLEMENTATION) {
      expect({
        id,
        known: id in GAME_CAPABILITIES,
      }).toEqual({
        id,
        known: true,
      });
      expect({
        id,
        claims: GAME_CAPABILITIES[id]?.accessibility.includes('assist-mode') ?? false,
      }).toEqual({
        id,
        claims: true,
      });
    }
  });
});
