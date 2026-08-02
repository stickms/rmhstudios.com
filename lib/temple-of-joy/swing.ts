/**
 * Bowling by swinging the phone.
 *
 * The gesture is the real one: wind back, swing the arm forward, and let go at
 * the bottom — except there is nothing to let go of, so the *release* has to be
 * inferred. This module is that inference, and nothing else: it takes raw
 * accelerometer samples and answers "was that a throw, and how hard".
 *
 * ## Why the peak, and why the fall-off
 *
 * A phone swung on the end of an arm reads a rising acceleration through the
 * downswing, a maximum around the bottom of the arc — which is exactly where a
 * bowler's hand opens — and then a fall as the arm follows through. So the
 * throw is detected by **watching for the peak and firing on the way down**:
 * arm above a floor, track the maximum, and release once the reading has
 * dropped to a fraction of it. Firing on the peak itself is impossible (you
 * cannot know it was the peak until it is past) and firing on a fixed threshold
 * makes every swing the same strength.
 *
 * The **twist at the peak** becomes the hook, because that is where a real
 * bowler's wrist turn happens and because it costs nothing to read: the same
 * event carries `rotationRate`.
 *
 * ## Why the magnitude rather than an axis
 *
 * Which way a phone is pointing during a swing depends on how it is being held
 * — screen in, screen out, upright, flat — and asking people to hold a phone a
 * particular way to bowl is asking them not to bowl. The magnitude of the
 * gravity-free acceleration is the same however it is gripped.
 *
 * Everything here is pure: samples in, an optional throw out, no clock of its
 * own and no listeners. The wiring lives in `BowlOverlay`, and this can be
 * driven from a test with a made-up swing.
 */

/** Below this, in m/s², nothing is happening. A hand at rest reads ~0.3. */
const ARM_THRESHOLD = 5.5;
/** A swing has to reach this to count as a throw rather than a fidget. */
const MIN_PEAK = 7.5;
/** The peak that reads as everything you have got. */
const FULL_PEAK = 26;
/**
 * How far the reading must fall from its peak before the ball leaves the hand.
 *
 * Low enough that the release lands near the bottom of the arc rather than
 * halfway up the follow-through, high enough that the jitter of a real
 * accelerometer at 60Hz does not fire it mid-downswing.
 */
const RELEASE_FRACTION = 0.55;
/** Twist at the peak, in deg/s, that reads as a full hook. */
const FULL_TWIST = 260;
/**
 * Longest a single swing may last before it is released anyway.
 *
 * Somebody who shakes the phone gently for a second and stops would otherwise
 * hold an armed swing open indefinitely, and the ball would go on the next
 * unrelated jolt.
 */
const MAX_SWING_MS = 1100;
/**
 * How quickly the gravity estimate follows the device, per second.
 *
 * Only used where the platform gives no gravity-free reading. Slow — gravity
 * turns as fast as the phone does, but a swing is over in under a second, so a
 * fast filter would absorb the swing itself and report nothing.
 */
const GRAVITY_RATE = 1.6;

export interface SwingSample {
  /** Acceleration on the device's three axes, m/s². */
  x: number;
  y: number;
  z: number;
  /** Whether the reading already has gravity removed (`event.acceleration`). */
  gravityFree: boolean;
  /** Rotation about the screen's normal, deg/s. The wrist turn. */
  twist: number;
  /** Milliseconds, monotonic. */
  t: number;
}

export interface SwingState {
  /** The low-passed gravity estimate, for platforms that give no clean reading. */
  gx: number;
  gy: number;
  gz: number;
  /** Whether a filter estimate exists yet. */
  primed: boolean;
  /** Whether a swing is in progress. */
  swinging: boolean;
  /** ms when the current swing crossed the arming threshold. */
  startedAt: number;
  /** Highest magnitude seen this swing, and the twist at that instant. */
  peak: number;
  peakTwist: number;
  /** ms of the last sample, so a caller can tell whether the sensor is live. */
  lastAt: number;
}

export interface Throw {
  /** 0…1. */
  power: number;
  /** −1…1, from the wrist turn at the peak. */
  spin: number;
  /** The raw peak, m/s² — for the readout, so a player can feel the scale. */
  peak: number;
}

export function createSwing(): SwingState {
  return {
    gx: 0,
    gy: 0,
    gz: 0,
    primed: false,
    swinging: false,
    startedAt: 0,
    peak: 0,
    peakTwist: 0,
    lastAt: 0,
  };
}

/**
 * Feed one sample.
 *
 * Mutates `state` — this runs on every `devicemotion` event, which fires at
 * 60Hz on most phones, and allocating a fresh state object per sample for a
 * gesture that lasts under a second is work with no benefit.
 *
 * @returns the throw, if this sample completed one.
 */
export function feedSwing(state: SwingState, sample: SwingSample): Throw | null {
  const dt = state.lastAt ? Math.min(0.25, (sample.t - state.lastAt) / 1000) : 1 / 60;
  state.lastAt = sample.t;

  let { x, y, z } = sample;
  if (!sample.gravityFree) {
    // No clean reading on this platform: estimate gravity as the slow-moving
    // part of the signal and subtract it. Seeded from the first sample, or the
    // filter spends its first half-second reporting a 9.8 m/s² "swing".
    if (!state.primed) {
      state.gx = x;
      state.gy = y;
      state.gz = z;
      state.primed = true;
    } else {
      const k = 1 - Math.exp(-GRAVITY_RATE * dt);
      state.gx += (x - state.gx) * k;
      state.gy += (y - state.gy) * k;
      state.gz += (z - state.gz) * k;
    }
    x -= state.gx;
    y -= state.gy;
    z -= state.gz;
  }

  const magnitude = Math.hypot(x, y, z);

  if (!state.swinging) {
    if (magnitude < ARM_THRESHOLD) return null;
    state.swinging = true;
    state.startedAt = sample.t;
    state.peak = magnitude;
    state.peakTwist = sample.twist;
    return null;
  }

  if (magnitude > state.peak) {
    state.peak = magnitude;
    state.peakTwist = sample.twist;
  }

  const spent = sample.t - state.startedAt > MAX_SWING_MS;
  const released = magnitude < state.peak * RELEASE_FRACTION;
  if (!released && !spent) return null;

  // Both readings are taken BEFORE the state is cleared for the next swing —
  // reading `state.peakTwist` after zeroing it reported every hook as straight.
  const peak = state.peak;
  const twist = state.peakTwist;
  state.swinging = false;
  state.peak = 0;
  state.peakTwist = 0;

  // A wave of the hand is not a throw. Below the floor the swing is simply
  // discarded and the detector re-arms, so a player fiddling with the phone
  // never loses a ball to it.
  if (peak < MIN_PEAK) return null;

  return {
    power: clamp01((peak - MIN_PEAK) / (FULL_PEAK - MIN_PEAK)),
    spin: clamp(twist / FULL_TWIST, -1, 1),
    peak,
  };
}

/** Forget any swing in progress, keeping the gravity estimate. */
export function resetSwing(state: SwingState): void {
  state.swinging = false;
  state.peak = 0;
  state.peakTwist = 0;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Exported for the tests and for the readout that explains the scale. */
export const SWING = {
  ARM_THRESHOLD,
  MIN_PEAK,
  FULL_PEAK,
  RELEASE_FRACTION,
  FULL_TWIST,
  MAX_SWING_MS,
} as const;
