/**
 * Neon Driftway — driver head look.
 *
 * Turns a raw {@link GyroSample} into the rotation applied to the in-car
 * camera, and provides the graceful fallback when there is no sensor: a
 * locked, forward-facing view with a small steering-driven lean so it still
 * feels like a car rather than a slideshow.
 *
 * The device→world conversion is the standard one (three.js's retired
 * `DeviceOrientationControls`): build a YXZ euler from (beta, alpha, -gamma),
 * rotate it into the screen-facing frame, then undo the screen rotation so a
 * phone in landscape looks down the road rather than at the kerb.
 *
 * Recentering is the part that matters for playability. Raw `alpha` is
 * arbitrary (relative) or compass-referenced (absolute) — neither points at
 * the road — so we capture the yaw at calibration and subtract it, which makes
 * "forward" wherever the player was pointing when the run began.
 */

import * as THREE from 'three';
import type { GyroSample } from './gyro';

const DEG = Math.PI / 180;

/** Rotates the device frame so +Z out of the screen becomes "look forward". */
const SCREEN_TRANSFORM = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);

const scratchEuler = new THREE.Euler();
const scratchQuat = new THREE.Quaternion();
const scratchQuat2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const ROLL_AXIS = new THREE.Vector3(0, 0, 1);
const FORWARD = new THREE.Vector3(0, 0, -1);
const scratchVec = new THREE.Vector3();

/**
 * Device orientation → world rotation, written into `out`.
 *
 * @param alpha rotation about the screen normal, degrees
 * @param beta front-to-back tilt, degrees
 * @param gamma left-to-right tilt, degrees
 * @param screenAngle current screen rotation, degrees
 */
export function deviceQuaternion(
  out: THREE.Quaternion,
  alpha: number,
  beta: number,
  gamma: number,
  screenAngle: number,
): THREE.Quaternion {
  scratchEuler.set(beta * DEG, alpha * DEG, -gamma * DEG, 'YXZ');
  out.setFromEuler(scratchEuler);
  // Camera looks along -Z; the device frame looks along +Z out of the screen.
  out.multiply(SCREEN_TRANSFORM);
  // Undo the screen rotation so landscape and portrait agree on "forward".
  out.multiply(scratchQuat.setFromAxisAngle(ROLL_AXIS, -screenAngle * DEG));
  return out;
}

/**
 * Yaw (rotation about world up) of a rotation, in radians.
 *
 * Taken from where the rotation sends "forward" rather than from euler
 * decomposition, so it stays stable when the player looks steeply up or down —
 * exactly the case where a naive YXZ extraction flips by 180°.
 */
export function yawOf(q: THREE.Quaternion): number {
  scratchVec.copy(FORWARD).applyQuaternion(q);
  // Looking straight up/down leaves no horizontal component to read a yaw from.
  if (Math.abs(scratchVec.x) < 1e-6 && Math.abs(scratchVec.z) < 1e-6) return 0;
  return Math.atan2(-scratchVec.x, -scratchVec.z);
}

/** Vertical look limits — you can glance at the roof, not roll your neck off. */
const PITCH_LIMIT = 1.15;

export interface LookOptions {
  /** Smoothing half-life in seconds. Lower = snappier, higher = calmer. */
  smoothing: number;
  /** Extra lean applied from the car's lateral velocity, radians. */
  steerLean: number;
}

const DEFAULT_OPTIONS: LookOptions = { smoothing: 0.055, steerLean: 0.09 };

/**
 * Owns the camera rotation for a run: gyro when it is live, a locked forward
 * view otherwise, with recentering and frame-rate-independent smoothing.
 */
export class LookController {
  /** The rotation to hand the camera. Read after {@link update}. */
  readonly quaternion = new THREE.Quaternion();

  private readonly target = new THREE.Quaternion();
  private readonly yawCorrection = new THREE.Quaternion();
  private yawOffset = 0;
  private calibrated = false;
  private options: LookOptions;
  /** True on the frame gyro data was applied — the renderer mirrors this. */
  private live = false;

  constructor(options: Partial<LookOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /** Whether the last update was driven by real sensor data. */
  get isLive(): boolean {
    return this.live;
  }

  /** Re-point "forward" at wherever the device is aimed on the next sample. */
  recenter(): void {
    this.calibrated = false;
  }

  /** Drop the calibration and snap back to the locked forward view. */
  reset(): void {
    this.calibrated = false;
    this.live = false;
    this.target.identity();
    this.quaternion.identity();
  }

  /**
   * Advance the look rotation.
   *
   * @param dt seconds since the previous frame
   * @param sample latest gyro reading, or null for the static camera
   * @param steerNorm car's lateral velocity as -1…1, used for the fallback lean
   */
  update(dt: number, sample: GyroSample | null, steerNorm: number): void {
    if (sample) {
      deviceQuaternion(this.target, sample.alpha, sample.beta, sample.gamma, sample.screenAngle);

      if (!this.calibrated) {
        this.yawOffset = yawOf(this.target);
        this.yawCorrection.setFromAxisAngle(UP, -this.yawOffset);
        this.calibrated = true;
        // Land on the recentred pose immediately — no swing on the first frame.
        this.target.premultiply(this.yawCorrection);
        this.quaternion.copy(this.clampPitch(this.target));
        this.live = true;
        return;
      }

      this.target.premultiply(this.yawCorrection);
      this.clampPitch(this.target);
      this.live = true;
    } else {
      // No sensor: a locked forward view that leans a little into the steering.
      this.target.setFromAxisAngle(UP, -steerNorm * this.options.steerLean);
      scratchQuat2.setFromAxisAngle(ROLL_AXIS, steerNorm * this.options.steerLean * 0.35);
      this.target.multiply(scratchQuat2);
      this.live = false;
    }

    // Exponential smoothing that behaves the same at 30 and 120 fps.
    const alpha = 1 - Math.exp(-dt / Math.max(this.options.smoothing, 1e-4));
    this.quaternion.slerp(this.target, Math.min(alpha, 1));
  }

  /** Keep the pitch inside a comfortable band, in place. */
  private clampPitch(q: THREE.Quaternion): THREE.Quaternion {
    scratchVec.copy(FORWARD).applyQuaternion(q);
    const pitch = Math.asin(THREE.MathUtils.clamp(scratchVec.y, -1, 1));
    if (Math.abs(pitch) <= PITCH_LIMIT) return q;

    const excess = pitch - Math.sign(pitch) * PITCH_LIMIT;
    // Rotate back about the camera's own right axis so yaw/roll are untouched.
    scratchVec.set(1, 0, 0).applyQuaternion(q);
    q.premultiply(scratchQuat.setFromAxisAngle(scratchVec, -excess));
    return q;
  }
}
