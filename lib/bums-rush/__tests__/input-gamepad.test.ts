/**
 * Bum's Rush — gamepad reading (§4.1): brand detection, radial deadzone,
 * analog trigger grip mapping, and rumble feature-detection.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyRadialDeadzone,
  detectPadBrand,
  hashPadId,
  padHasAnyButtonPressed,
  playGamepadRumble,
  pollGamepads,
  readGamepadAxisPair,
  readGamepadButtonPressed,
  readGamepadGripStrength,
  resolvePadBrand,
  supportsGamepadRumble,
  triggerGripStrength,
} from '../input/gamepad';
import { PHYSICS } from '../constants';

function button(pressed: boolean, value = pressed ? 1 : 0): GamepadButton {
  return { pressed, touched: pressed, value } as GamepadButton;
}

/** A minimal stand-in for the W3C "standard" mapping — only what the code under test reads. */
function fakePad(overrides?: { axes?: number[]; buttons?: GamepadButton[]; id?: string; vibrationActuator?: unknown }): Gamepad {
  return {
    id: overrides?.id ?? 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
    axes: overrides?.axes ?? [0, 0, 0, 0],
    buttons: overrides?.buttons ?? Array.from({ length: 17 }, () => button(false)),
    connected: true,
    index: 0,
    mapping: 'standard',
    timestamp: 0,
    vibrationActuator: overrides?.vibrationActuator,
  } as unknown as Gamepad;
}

describe("Bum's Rush gamepad", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('brand detection (§4.1)', () => {
    it('detects PlayStation from vendor 054c', () => {
      expect(detectPadBrand('DUALSHOCK 4 (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('playstation');
    });

    it('detects Nintendo from vendor 057e', () => {
      expect(detectPadBrand('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('nintendo');
    });

    it('detects Xbox from "xinput" or "xbox" in the id, case-insensitively', () => {
      expect(detectPadBrand('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
      expect(detectPadBrand('XBOX Wireless Controller')).toBe('xbox');
    });

    it('falls back to generic for anything unrecognised', () => {
      expect(detectPadBrand('Some Random USB Gamepad')).toBe('generic');
    });

    it('is a hint, not a lock — an explicit override always wins', () => {
      expect(resolvePadBrand('DUALSHOCK 4 (Vendor: 054c)', 'xbox')).toBe('xbox');
    });

    it('"auto" defers to detection', () => {
      expect(resolvePadBrand('DUALSHOCK 4 (Vendor: 054c)', 'auto')).toBe('playstation');
    });
  });

  describe('hashPadId', () => {
    it('is deterministic', () => {
      const id = 'Xbox 360 Controller (XInput STANDARD GAMEPAD)';
      expect(hashPadId(id)).toBe(hashPadId(id));
    });

    it('differs for different ids (in practice, not guaranteed)', () => {
      expect(hashPadId('pad-a')).not.toBe(hashPadId('pad-b'));
    });

    it('is an 8-character hex string', () => {
      expect(hashPadId('anything')).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe('radial deadzone (§4.1)', () => {
    it('reads as centred inside the deadzone', () => {
      expect(applyRadialDeadzone(0.1, 0.1, 0.22, 0.92)).toEqual({ x: 0, y: 0 });
    });

    it('saturates to unit magnitude at or beyond the saturation radius, preserving direction', () => {
      const result = applyRadialDeadzone(1, 0, 0.22, 0.92);
      expect(result.x).toBeCloseTo(1, 5);
      expect(result.y).toBeCloseTo(0, 5);
    });

    it('re-normalises the outer range rather than leaving a jump at the deadzone edge', () => {
      // Halfway between deadzone (0.22) and saturation (0.92) should read as
      // ~half strength, not ~78% (which is what an un-renormalised deadzone
      // subtraction alone would give).
      const mid = (0.22 + 0.92) / 2;
      const result = applyRadialDeadzone(mid, 0, 0.22, 0.92);
      expect(result.x).toBeCloseTo(0.5, 5);
    });

    it('lets a square-gated diagonal (magnitude > 1) still saturate to unit length', () => {
      const result = applyRadialDeadzone(1, 1, 0.22, 0.92);
      expect(Math.hypot(result.x, result.y)).toBeCloseTo(1, 5);
      // Direction preserved: still on the diagonal.
      expect(result.x).toBeCloseTo(result.y, 5);
    });

    it('readGamepadAxisPair resolves stick0/stick1 to the right axis pairs and ignores unknown codes', () => {
      const pad = fakePad({ axes: [1, 0, 0, -1] });
      expect(readGamepadAxisPair(pad, 'stick0', 0.22, 0.92).x).toBeCloseTo(1, 5);
      expect(readGamepadAxisPair(pad, 'stick1', 0.22, 0.92).y).toBeCloseTo(-1, 5);
      expect(readGamepadAxisPair(pad, 'not-a-stick', 0.22, 0.92)).toEqual({ x: 0, y: 0 });
    });
  });

  describe('buttons', () => {
    it('readGamepadButtonPressed reads the indexed button and ignores malformed codes', () => {
      const pad = fakePad({ buttons: [button(true), button(false)] });
      expect(readGamepadButtonPressed(pad, 'button0')).toBe(true);
      expect(readGamepadButtonPressed(pad, 'button1')).toBe(false);
      expect(readGamepadButtonPressed(pad, 'button99')).toBe(false);
      expect(readGamepadButtonPressed(pad, 'stick0')).toBe(false);
    });
  });

  describe('analog trigger grip strength (§4.1, PHYSICS contract)', () => {
    it('reports no grip below TRIGGER_GRIP_FLOOR', () => {
      expect(triggerGripStrength(PHYSICS.TRIGGER_GRIP_FLOOR - 0.01)).toBe(0);
      expect(triggerGripStrength(0)).toBe(0);
    });

    it('maps the floor to TRIGGER_GRIP_MIN_SCALE and full pull to 1', () => {
      expect(triggerGripStrength(PHYSICS.TRIGGER_GRIP_FLOOR)).toBeCloseTo(PHYSICS.TRIGGER_GRIP_MIN_SCALE, 5);
      expect(triggerGripStrength(1)).toBeCloseTo(1, 5);
    });

    it('interpolates linearly between the floor and full pull', () => {
      const midPull = (PHYSICS.TRIGGER_GRIP_FLOOR + 1) / 2;
      const expected = PHYSICS.TRIGGER_GRIP_MIN_SCALE + 0.5 * (1 - PHYSICS.TRIGGER_GRIP_MIN_SCALE);
      expect(triggerGripStrength(midPull)).toBeCloseTo(expected, 5);
    });

    it('readGamepadGripStrength applies the analog curve to trigger indices when enabled', () => {
      const pad = fakePad({ buttons: Array.from({ length: 8 }, (_, i) => (i === 6 ? button(true, 0.625) : button(false))) });
      expect(readGamepadGripStrength(pad, 'button6', true)).toBeCloseTo(0.8, 5);
    });

    it('readGamepadGripStrength is binary for a trigger when analogTriggers is disabled (the assist)', () => {
      const pad = fakePad({ buttons: Array.from({ length: 8 }, (_, i) => (i === 6 ? button(true, 0.3) : button(false))) });
      // 0.3 would be a partial grip under the analog curve, but the assist
      // demands full strength while merely pressed.
      expect(readGamepadGripStrength(pad, 'button6', false)).toBe(1);
    });

    it('bumpers (alternates with no analog value) are always binary, regardless of analogTriggers', () => {
      const pad = fakePad({ buttons: Array.from({ length: 8 }, (_, i) => (i === 4 ? button(true) : button(false))) });
      expect(readGamepadGripStrength(pad, 'button4', true)).toBe(1);
      expect(readGamepadGripStrength(pad, 'button4', false)).toBe(1);
    });

    it('an unpressed grab binding contributes nothing either way', () => {
      const pad = fakePad();
      expect(readGamepadGripStrength(pad, 'button6', true)).toBe(0);
      expect(readGamepadGripStrength(pad, 'button4', false)).toBe(0);
    });
  });

  describe('rumble (feature-detected)', () => {
    it('reports unsupported for a pad with no vibrationActuator', () => {
      expect(supportsGamepadRumble(fakePad())).toBe(false);
      expect(supportsGamepadRumble(null)).toBe(false);
    });

    it('reports supported when playEffect exists', () => {
      const pad = fakePad({ vibrationActuator: { playEffect: vi.fn().mockResolvedValue(undefined) } });
      expect(supportsGamepadRumble(pad)).toBe(true);
    });

    it('scales weak/strong magnitude by the caller-supplied intensity and clamps duration', () => {
      const playEffect = vi.fn().mockResolvedValue(undefined);
      const pad = fakePad({ vibrationActuator: { playEffect } });

      playGamepadRumble(pad, { durationMs: 120.6, weak: 0.5, strong: 1 }, 0.5);

      expect(playEffect).toHaveBeenCalledTimes(1);
      const [type, params] = playEffect.mock.calls[0];
      expect(type).toBe('dual-rumble');
      expect(params.duration).toBe(121);
      expect(params.weakMagnitude).toBeCloseTo(0.25, 5);
      expect(params.strongMagnitude).toBeCloseTo(0.5, 5);
    });

    it('never throws or calls playEffect when the pad has no actuator', () => {
      expect(() => playGamepadRumble(fakePad(), { durationMs: 10, weak: 1, strong: 1 }, 1)).not.toThrow();
    });

    it('does nothing at zero intensity', () => {
      const playEffect = vi.fn().mockResolvedValue(undefined);
      const pad = fakePad({ vibrationActuator: { playEffect } });
      playGamepadRumble(pad, { durationMs: 10, weak: 1, strong: 1 }, 0);
      expect(playEffect).not.toHaveBeenCalled();
    });

    it('swallows a rejected playEffect rather than producing an unhandled rejection', async () => {
      const playEffect = vi.fn().mockRejectedValue(new Error('no actuator'));
      const pad = fakePad({ vibrationActuator: { playEffect } });
      expect(() => playGamepadRumble(pad, { durationMs: 10, weak: 1, strong: 1 }, 1)).not.toThrow();
      // Let the rejection's .catch() run before the test process moves on.
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  describe('SSR safety and the user-gesture catch', () => {
    it('pollGamepads returns [] when navigator.getGamepads is unavailable', () => {
      vi.stubGlobal('navigator', {});
      expect(pollGamepads()).toEqual([]);
    });

    it('pollGamepads delegates to navigator.getGamepads when present', () => {
      const pad = fakePad();
      vi.stubGlobal('navigator', { getGamepads: () => [pad, null] });
      expect(pollGamepads()).toEqual([pad, null]);
    });

    it('padHasAnyButtonPressed is true only when some button reports pressed', () => {
      expect(padHasAnyButtonPressed(fakePad())).toBe(false);
      expect(padHasAnyButtonPressed(fakePad({ buttons: [button(false), button(true)] }))).toBe(true);
    });
  });
});
