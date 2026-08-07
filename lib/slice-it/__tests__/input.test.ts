/**
 * I1 and I9 — binding resolution and ghosting.
 *
 * The ghosting helpers exist because the failure they describe is invisible: a
 * membrane keyboard silently drops the third simultaneous key, the player sees
 * a missed note they know they hit, and nothing on screen suggests hardware.
 */

import { describe, expect, it } from 'vitest';
import {
  bindsForLane,
  conflictingBinds,
  evaluateGhosting,
  laneForKey,
  suggestGhostSafe,
} from '../input';

const BINDS = { lane1: 'KeyF', lane2: 'KeyJ' };

describe('I1 — multiple bindings per lane', () => {
  it('resolves the primary binding with no extras configured', () => {
    expect(laneForKey(BINDS, undefined, 'KeyF')).toBe(0);
    expect(laneForKey(BINDS, undefined, 'KeyJ')).toBe(1);
    expect(laneForKey(BINDS, undefined, 'KeyQ')).toBeNull();
  });

  it('resolves an alternate key on the same lane', () => {
    // The whole point: alternating two keys on ONE lane is how a fast jack is
    // played, and one-binding-per-lane made it physically impossible.
    const extra = [['KeyD'], ['KeyK']];
    expect(laneForKey(BINDS, extra, 'KeyD')).toBe(0);
    expect(laneForKey(BINDS, extra, 'KeyK')).toBe(1);
  });

  it('de-duplicates a key bound as both primary and extra', () => {
    expect(bindsForLane(BINDS, [['KeyF', 'KeyD'], []], 0)).toEqual(['KeyF', 'KeyD']);
  });

  it('resolves a double-bound key deterministically rather than by call order', () => {
    const extra = [['KeyX'], ['KeyX']];
    expect(laneForKey(BINDS, extra, 'KeyX')).toBe(0);
    expect(conflictingBinds(BINDS, extra)).toEqual(['KeyX']);
  });

  it('reports no conflict for a clean set', () => {
    expect(conflictingBinds(BINDS, [['KeyD'], ['KeyK']])).toEqual([]);
  });
});

describe('I9 — ghosting', () => {
  it('names the keys that never arrived', () => {
    const result = evaluateGhosting(['KeyF', 'KeyJ', 'KeyD'], ['KeyF', 'KeyJ']);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['KeyD']);
  });

  it('passes when every key registered', () => {
    expect(evaluateGhosting(['KeyF', 'KeyJ'], ['KeyJ', 'KeyF']).ok).toBe(true);
  });

  it('suggests keys that are not already taken', () => {
    const suggestions = suggestGhostSafe(['ShiftLeft', 'Space']);
    expect(suggestions).not.toContain('ShiftLeft');
    expect(suggestions).not.toContain('Space');
    expect(suggestions.length).toBeGreaterThan(0);
  });
});
