/**
 * Bum's Rush — binding defaults, serialisation/migration, and conflict
 * detection (§4.5). The load-bearing claim under test: a corrupt or
 * unrecognised stored binding set can never leave a player unable to move,
 * and a remap can never silently steal another action's key.
 */

import { describe, expect, it } from 'vitest';
import {
  ACTION_IDS,
  DEADZONE_MAX,
  DEADZONE_MIN,
  SATURATION_MAX,
  SATURATION_MIN,
  bindAction,
  clampDeadzone,
  clampRumble,
  clampSaturation,
  defaultBindingSetFor,
  deserialiseBindingSet,
  findConflicts,
  migrateBindingSet,
  resetBindingsToDefault,
  serialiseBindingSet,
  unbindAction,
  type Binding,
} from '../input/bindings';

describe("Bum's Rush bindings", () => {
  describe('defaults', () => {
    it('gives player 1 keyboard every action', () => {
      const set = defaultBindingSetFor('keyboard-p1');
      for (const action of ACTION_IDS) {
        expect(set.bindings[action]?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it('gives the gamepad profile both a trigger and a bumper alternate for each grab', () => {
      const set = defaultBindingSetFor('gamepad');
      expect(set.bindings.grabLeft).toEqual([{ source: 'gamepad', code: 'button6' }, { source: 'gamepad', code: 'button4' }]);
      expect(set.bindings.grabRight).toEqual([{ source: 'gamepad', code: 'button7' }, { source: 'gamepad', code: 'button5' }]);
    });

    it('seeds the gamepad profile assist preset off for grab assist, on for analog triggers (§4.7)', () => {
      const set = defaultBindingSetFor('gamepad');
      expect(set.assist.grabAssist).toBe(false);
      expect(set.assist.analogTriggers).toBe(true);
    });

    it('seeds keyboard and touch with grab assist on (§4.7)', () => {
      expect(defaultBindingSetFor('keyboard-p1').assist.grabAssist).toBe(true);
      expect(defaultBindingSetFor('touch').assist.grabAssist).toBe(true);
    });

    it('seeds touch with auto-grab on', () => {
      expect(defaultBindingSetFor('touch').assist.autoGrab).toBe(true);
    });

    it('player 2 keyboard deliberately omits item/drop/tags/pause/objectives', () => {
      const set = defaultBindingSetFor('keyboard-p2');
      expect(set.bindings.aimLeft?.length).toBeGreaterThan(0);
      expect(set.bindings.grabLeft?.length).toBeGreaterThan(0);
      expect(set.bindings.emote?.length).toBeGreaterThan(0);
      expect(set.bindings.useItem ?? []).toHaveLength(0);
      expect(set.bindings.pause ?? []).toHaveLength(0);
    });

    it('gives each profile independent, mutable copies', () => {
      const a = defaultBindingSetFor('gamepad');
      const b = defaultBindingSetFor('gamepad');
      a.deadzone = 0.05;
      expect(b.deadzone).not.toBe(0.05);
    });
  });

  describe('range clamps', () => {
    it('clamps deadzone to 0.05–0.40', () => {
      expect(clampDeadzone(-1)).toBe(DEADZONE_MIN);
      expect(clampDeadzone(999)).toBe(DEADZONE_MAX);
      expect(clampDeadzone(0.2)).toBe(0.2);
    });

    it('clamps saturation within its own range and never lets it fall below deadzone', () => {
      expect(clampSaturation(0)).toBeGreaterThanOrEqual(SATURATION_MIN);
      expect(clampSaturation(2)).toBe(SATURATION_MAX);
      // A deadzone near the saturation floor must still leave saturation above it.
      const highDeadzone = 0.4;
      expect(clampSaturation(0.41, highDeadzone)).toBeGreaterThan(highDeadzone);
    });

    it('clamps rumble to 0..1', () => {
      expect(clampRumble(-0.5)).toBe(0);
      expect(clampRumble(1.5)).toBe(1);
      expect(clampRumble(0.6)).toBe(0.6);
    });
  });

  describe('serialisation and migration', () => {
    const fallback = defaultBindingSetFor('gamepad');

    it('round-trips a valid set', () => {
      const set = defaultBindingSetFor('keyboard-p1');
      set.deadzone = 0.3;
      const restored = deserialiseBindingSet(serialiseBindingSet(set), fallback);
      expect(restored).toEqual(set);
    });

    it('falls back whole-cloth on unparseable JSON', () => {
      const restored = deserialiseBindingSet('{not json', fallback);
      expect(restored).toEqual(fallback);
    });

    it('falls back whole-cloth on a non-object payload', () => {
      expect(migrateBindingSet(null, fallback)).toEqual(fallback);
      expect(migrateBindingSet('a string', fallback)).toEqual(fallback);
      expect(migrateBindingSet([1, 2, 3], fallback)).toEqual(fallback);
    });

    it('falls back whole-cloth on a version this build has no migration path from', () => {
      const restored = migrateBindingSet({ version: -1 }, fallback);
      expect(restored).toEqual(fallback);
    });

    it('recovers per-field: one corrupted action keeps the rest of a valid custom set', () => {
      const custom = defaultBindingSetFor('keyboard-p1');
      custom.bindings.emote = [{ source: 'keyboard', code: 'KeyZ' }];
      const raw = JSON.parse(serialiseBindingSet(custom));
      raw.bindings.aimLeft = 'not an array'; // corrupt exactly one field

      const restored = migrateBindingSet(raw, fallback);
      // The untouched customisation survives corruption elsewhere in the payload.
      expect(restored.bindings.emote).toEqual([{ source: 'keyboard', code: 'KeyZ' }]);
      // The corrupted field falls back rather than taking down the whole profile.
      expect(restored.bindings.aimLeft).toEqual(fallback.bindings.aimLeft);
    });

    it('rejects an individually malformed binding within an otherwise-valid action array', () => {
      const raw = JSON.parse(serialiseBindingSet(defaultBindingSetFor('gamepad')));
      raw.bindings.grabLeft = [{ source: 'gamepad', code: 'button6' }, { source: 'made-up-source', code: 'x' }];
      const restored = migrateBindingSet(raw, fallback);
      expect(restored.bindings.grabLeft).toEqual(fallback.bindings.grabLeft);
    });

    it('clamps an out-of-range stored deadzone/saturation/rumble rather than rejecting the whole set', () => {
      const raw = JSON.parse(serialiseBindingSet(defaultBindingSetFor('gamepad')));
      raw.deadzone = 5;
      raw.rumble = -3;
      const restored = migrateBindingSet(raw, fallback);
      expect(restored.deadzone).toBe(DEADZONE_MAX);
      expect(restored.rumble).toBe(0);
    });

    it('always stamps version 1 on the way out', () => {
      const restored = migrateBindingSet({ version: 1, profileName: 'x' }, fallback);
      expect(restored.version).toBe(1);
    });
  });

  describe('conflict detection (never silently steal)', () => {
    it('finds no conflict against a fresh binding set', () => {
      const set = defaultBindingSetFor('keyboard-p1');
      const candidate: Binding = { source: 'keyboard', code: 'KeyZ' };
      expect(findConflicts(set.bindings, 'emote', candidate)).toEqual([]);
    });

    it('flags the same physical key already bound to a different action', () => {
      const set = defaultBindingSetFor('keyboard-p1');
      // KeyG is dropItem by default.
      const candidate: Binding = { source: 'keyboard', code: 'KeyG' };
      const conflicts = findConflicts(set.bindings, 'emote', candidate);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].action).toBe('dropItem');
    });

    it('does not flag the same code already bound to the SAME action (re-binding a slot)', () => {
      const set = defaultBindingSetFor('keyboard-p1');
      const candidate: Binding = { source: 'keyboard', code: 'KeyQ' }; // already grabLeft's own binding
      expect(findConflicts(set.bindings, 'grabLeft', candidate)).toEqual([]);
    });

    it('ignores axis polarity when comparing physical identity — same key, opposite sign, still collides', () => {
      const set = defaultBindingSetFor('keyboard-p1'); // KeyW is aimLeft's "up" (axis 1, sign -1)
      const candidate: Binding = { source: 'keyboard', code: 'KeyW', axis: { index: 1, sign: 1 } };
      const conflicts = findConflicts(set.bindings, 'aimRight', candidate);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].action).toBe('aimLeft');
    });

    it('bindAction refuses to apply a conflicting binding without swapConflicts', () => {
      const set = defaultBindingSetFor('keyboard-p1');
      const candidate: Binding = { source: 'keyboard', code: 'KeyG' }; // dropItem's key
      const result = bindAction(set, 'emote', 0, candidate);
      expect(result.applied).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      // Nothing changed.
      expect(result.set.bindings.emote).toEqual(set.bindings.emote);
      expect(result.set.bindings.dropItem).toEqual(set.bindings.dropItem);
    });

    it('bindAction removes the old binding and applies the new one when swapConflicts is set', () => {
      const set = defaultBindingSetFor('keyboard-p1');
      const candidate: Binding = { source: 'keyboard', code: 'KeyG' };
      const result = bindAction(set, 'emote', 0, candidate, { swapConflicts: true });
      expect(result.applied).toBe(true);
      expect(result.set.bindings.emote).toContainEqual(candidate);
      expect(result.set.bindings.dropItem ?? []).not.toContainEqual(candidate);
    });

    it('bindAction never mutates the input set', () => {
      const set = defaultBindingSetFor('keyboard-p1');
      const before = serialiseBindingSet(set);
      bindAction(set, 'emote', 0, { source: 'keyboard', code: 'KeyG' }, { swapConflicts: true });
      expect(serialiseBindingSet(set)).toBe(before);
    });

    it('appends a new alternate when the slot index is out of range', () => {
      const set = defaultBindingSetFor('keyboard-p1');
      const before = set.bindings.emote?.length ?? 0;
      const result = bindAction(set, 'emote', 99, { source: 'keyboard', code: 'KeyZ' });
      expect(result.set.bindings.emote).toHaveLength(before + 1);
    });

    it('unbindAction removes exactly one alternate, leaving the others', () => {
      const set = defaultBindingSetFor('gamepad'); // grabLeft has 2 alternates
      const result = unbindAction(set, 'grabLeft', 0);
      expect(result.bindings.grabLeft).toEqual([{ source: 'gamepad', code: 'button4' }]);
    });
  });

  describe('reset to defaults', () => {
    it('matches a fresh default set for the same profile kind', () => {
      expect(resetBindingsToDefault('touch')).toEqual(defaultBindingSetFor('touch'));
    });
  });

  it('BindingSet round-trips through JSON exactly for every default profile', () => {
    for (const kind of ['keyboard-p1', 'keyboard-p2', 'gamepad', 'touch'] as const) {
      const set = defaultBindingSetFor(kind);
      expect(deserialiseBindingSet(serialiseBindingSet(set), set)).toEqual(set);
    }
  });
});
