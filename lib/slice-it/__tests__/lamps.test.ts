/**
 * Slice It — clear lamps (`H8`).
 *
 * `SliceSong` carried `userPlays` — how often you played a track and nothing
 * about how it went — so a library gave no sense of what a player had actually
 * conquered. `lampOf` is the whole of that feature's logic, and the two things
 * worth pinning are both about *distinctions the escalation is supposed to
 * preserve*:
 *
 *  - `none` (never played) is not `failed` (played, and the chart won). Those
 *    are different facts about a library, and a lamp exists to tell them apart.
 *  - the headline lamp is the BEST across tiers, not the latest. "I have
 *    full-combo'd this" is a fact about the player and the song; losing it
 *    because they went back and failed an Expert run would be a strange thing
 *    for a library to do.
 */

import { describe, expect, it } from 'vitest';
import { bestLamp, lampOf } from '../songs.server';
import { LAMPS } from '../types';

const row = (
  over: Partial<{ cleared: boolean; isFullCombo: boolean; isPerfect: boolean }> = {},
) => ({
  cleared: true,
  isFullCombo: false,
  isPerfect: false,
  ...over,
});

describe('lampOf', () => {
  it('is `none` for a song that was never played', () => {
    expect(lampOf(null)).toBe('none');
    expect(lampOf(undefined)).toBe('none');
  });

  it('distinguishes a failed run from an unplayed one', () => {
    expect(lampOf(row({ cleared: false }))).toBe('failed');
  });

  it('escalates cleared → fc → perfect', () => {
    expect(lampOf(row())).toBe('cleared');
    expect(lampOf(row({ isFullCombo: true }))).toBe('fc');
    expect(lampOf(row({ isFullCombo: true, isPerfect: true }))).toBe('perfect');
  });

  it('lets the higher flag win a contradictory row', () => {
    // The flags are client-declared, so a run can arrive claiming a perfect it
    // did not clear. Rendering the best claim is the right call for a decorative
    // badge — the alternative is a lamp that disagrees with the score beside it.
    expect(lampOf(row({ cleared: false, isPerfect: true }))).toBe('perfect');
    expect(lampOf(row({ cleared: false, isFullCombo: true }))).toBe('fc');
  });

  it('only ever produces a lamp the UI knows how to draw', () => {
    for (const cleared of [true, false]) {
      for (const isFullCombo of [true, false]) {
        for (const isPerfect of [true, false]) {
          expect(LAMPS).toContain(lampOf({ cleared, isFullCombo, isPerfect }));
        }
      }
    }
  });
});

describe('bestLamp', () => {
  it('orders the escalation', () => {
    expect(bestLamp('none', 'failed')).toBe('failed');
    expect(bestLamp('failed', 'cleared')).toBe('cleared');
    expect(bestLamp('cleared', 'fc')).toBe('fc');
    expect(bestLamp('fc', 'perfect')).toBe('perfect');
  });

  it('is order-independent', () => {
    for (const a of LAMPS) {
      for (const b of LAMPS) expect(bestLamp(a, b)).toBe(bestLamp(b, a));
    }
  });

  it('keeps a full combo when a later run on the same song failed', () => {
    expect(bestLamp('fc', 'failed')).toBe('fc');
  });
});
