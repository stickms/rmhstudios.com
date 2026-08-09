/**
 * Bum's Rush — touch reading (§12.2): relative virtual sticks, Auto-Grab's
 * implicit grip, multi-touch identifier isolation, and tilt-assist.
 */

import { describe, expect, it } from 'vitest';
import {
  TOUCH_GRIP_BREAK_PX,
  TOUCH_STICK_DEAD_RADIUS_PX,
  TOUCH_STICK_FULL_DEFLECTION_PX,
  applyTiltToAim,
  armForTouchX,
  createTouchArmState,
  hasDraggedPastGripBreak,
  onTouchDown,
  onTouchMove,
  onTouchUp,
  resolveTouchArmFrame,
  resolveTouchFrame,
  resolveVirtualStick,
} from '../input/touch';
import type { GyroSample } from '@/lib/neon-driftway/gyro';

describe("Bum's Rush touch", () => {
  describe('resolveVirtualStick (relative, never absolute)', () => {
    it('reads as centred inside the dead radius', () => {
      expect(resolveVirtualStick({ x: 100, y: 100 }, { x: 100 + TOUCH_STICK_DEAD_RADIUS_PX - 1, y: 100 })).toEqual({
        x: 0,
        y: 0,
      });
    });

    it('reaches full deflection at the configured radius, preserving direction', () => {
      const result = resolveVirtualStick({ x: 0, y: 0 }, { x: TOUCH_STICK_FULL_DEFLECTION_PX, y: 0 });
      expect(result.x).toBeCloseTo(1, 5);
      expect(result.y).toBeCloseTo(0, 5);
    });

    it('never exceeds unit magnitude past full deflection', () => {
      const result = resolveVirtualStick({ x: 0, y: 0 }, { x: 500, y: 500 });
      expect(Math.hypot(result.x, result.y)).toBeCloseTo(1, 5);
    });

    it('is relative to the origin, not the screen — the same drag from a different origin gives the same vector', () => {
      const a = resolveVirtualStick({ x: 0, y: 0 }, { x: 32, y: 0 });
      const b = resolveVirtualStick({ x: 500, y: 500 }, { x: 532, y: 500 });
      expect(a).toEqual(b);
    });

    it('dead radius and full deflection are settings-adjustable', () => {
      const result = resolveVirtualStick({ x: 0, y: 0 }, { x: 20, y: 0 }, 4, 24);
      // (20 - 4) / (24 - 4) = 0.8
      expect(result.x).toBeCloseTo(0.8, 5);
    });
  });

  describe('hasDraggedPastGripBreak', () => {
    it('is false within the break radius', () => {
      expect(hasDraggedPastGripBreak({ x: 0, y: 0 }, { x: TOUCH_GRIP_BREAK_PX, y: 0 })).toBe(false);
    });

    it('is true once past the break radius ("pulling free", §12.2)', () => {
      expect(hasDraggedPastGripBreak({ x: 0, y: 0 }, { x: TOUCH_GRIP_BREAK_PX + 1, y: 0 })).toBe(true);
    });
  });

  describe('armForTouchX', () => {
    it('splits the stage exactly in half', () => {
      expect(armForTouchX(0, 800)).toBe('l');
      expect(armForTouchX(399, 800)).toBe('l');
      expect(armForTouchX(400, 800)).toBe('r');
      expect(armForTouchX(800, 800)).toBe('r');
    });
  });

  describe('multi-touch tracking (identifier isolation)', () => {
    it('a touch-down in the left half claims the left arm only', () => {
      const state = onTouchDown(createTouchArmState(), 1, { x: 100, y: 100 }, 800);
      expect(state.left?.pointerId).toBe(1);
      expect(state.right).toBeNull();
    });

    it('a second finger in an ALREADY-CLAIMED half is ignored — no palm can steal an arm', () => {
      let state = onTouchDown(createTouchArmState(), 1, { x: 100, y: 100 }, 800);
      state = onTouchDown(state, 2, { x: 150, y: 150 }, 800);
      expect(state.left?.pointerId).toBe(1); // unchanged
    });

    it('a second finger in the OTHER half claims that arm independently', () => {
      let state = onTouchDown(createTouchArmState(), 1, { x: 100, y: 100 }, 800);
      state = onTouchDown(state, 2, { x: 700, y: 100 }, 800);
      expect(state.left?.pointerId).toBe(1);
      expect(state.right?.pointerId).toBe(2);
    });

    it('move only updates the arm owned by that pointerId', () => {
      let state = onTouchDown(createTouchArmState(), 1, { x: 100, y: 100 }, 800);
      state = onTouchDown(state, 2, { x: 700, y: 100 }, 800);
      state = onTouchMove(state, 1, { x: 120, y: 100 });
      expect(state.left?.current).toEqual({ x: 120, y: 100 });
      expect(state.right?.current).toEqual({ x: 700, y: 100 }); // untouched
    });

    it('move from an unrecognised pointerId changes nothing', () => {
      const before = onTouchDown(createTouchArmState(), 1, { x: 100, y: 100 }, 800);
      const after = onTouchMove(before, 999, { x: 0, y: 0 });
      expect(after).toEqual(before);
    });

    it('lifting a finger frees its half for a new touch', () => {
      let state = onTouchDown(createTouchArmState(), 1, { x: 100, y: 100 }, 800);
      state = onTouchUp(state, 1);
      expect(state.left).toBeNull();
      state = onTouchDown(state, 5, { x: 50, y: 50 }, 800);
      expect(state.left?.pointerId).toBe(5);
    });

    it('cancel is treated identically to a deliberate lift', () => {
      const down = onTouchDown(createTouchArmState(), 1, { x: 100, y: 100 }, 800);
      // onTouchUp is the same handler used for pointercancel — verifying the release path is singular.
      expect(onTouchUp(down, 1).left).toBeNull();
    });
  });

  describe('resolveTouchArmFrame — Auto-Grab (default, §12.2 scheme A)', () => {
    it('an untouched arm is inactive with a centred stick', () => {
      expect(resolveTouchArmFrame(null, 'auto-grab')).toEqual({ aim: { x: 0, y: 0 }, gripRequested: false, active: false });
    });

    it('finger down = reach and hold: grip is requested as soon as a touch exists', () => {
      const frame = resolveTouchArmFrame({ pointerId: 1, origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } }, 'auto-grab');
      expect(frame.active).toBe(true);
      expect(frame.gripRequested).toBe(true);
    });

    it('grip releases once the finger drags decisively away from the origin ("pulling free")', () => {
      const touch = { pointerId: 1, origin: { x: 0, y: 0 }, current: { x: TOUCH_GRIP_BREAK_PX + 5, y: 0 } };
      const frame = resolveTouchArmFrame(touch, 'auto-grab');
      expect(frame.gripRequested).toBe(false);
      // Aim still tracks the drag even though the grip let go.
      expect(frame.aim.x).toBeGreaterThan(0);
    });
  });

  describe('resolveTouchArmFrame — two-stick (advanced, §12.2 scheme B)', () => {
    it('never requests a grip from the stick itself — grip is a separate button', () => {
      const touch = { pointerId: 1, origin: { x: 0, y: 0 }, current: { x: 0, y: 0 } };
      expect(resolveTouchArmFrame(touch, 'two-stick').gripRequested).toBe(false);
    });
  });

  describe('resolveTouchFrame', () => {
    it('resolves both arms independently from one state', () => {
      let state = createTouchArmState();
      state = onTouchDown(state, 1, { x: 100, y: 100 }, 800);
      state = onTouchMove(state, 1, { x: 100 + TOUCH_STICK_FULL_DEFLECTION_PX, y: 100 });
      const frame = resolveTouchFrame(state, 'auto-grab');
      expect(frame.left.active).toBe(true);
      expect(frame.left.aim.x).toBeCloseTo(1, 5);
      expect(frame.right.active).toBe(false);
    });
  });

  describe('applyTiltToAim (§12.2 scheme C, off by default)', () => {
    const sample: GyroSample = { alpha: 0, beta: 45, gamma: 22.5, screenAngle: 0, absolute: false };

    it('is a no-op when disabled', () => {
      const aim = { x: 0.1, y: 0 };
      expect(applyTiltToAim(aim, sample, false)).toEqual(aim);
    });

    it('is a no-op with no sample yet', () => {
      const aim = { x: 0.1, y: 0 };
      expect(applyTiltToAim(aim, null, true)).toEqual(aim);
    });

    it('contributes up to the configured strength, not more', () => {
      // gamma 22.5 / 45 = 0.5 normalised; at default strength 0.2 that's +0.1 on x.
      const result = applyTiltToAim({ x: 0, y: 0 }, sample, true, 0.2);
      expect(result.x).toBeCloseTo(0.1, 5);
    });

    it('never pushes the combined vector past unit magnitude', () => {
      const result = applyTiltToAim({ x: 0.95, y: 0.3 }, sample, true, 0.2);
      expect(Math.hypot(result.x, result.y)).toBeLessThanOrEqual(1 + 1e-9);
    });
  });
});
