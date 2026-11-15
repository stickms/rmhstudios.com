/**
 * Works out how a figure is moving from where it has been seen, for people whose motion we are only told about in
 * jumps: other players (their position changes whenever the host last heard from them) and officers (a mover that
 * advances in 50 ms ticks). The figure's drawn position eases toward the latest sighting, and speed, heading and
 * vertical velocity are read off the DRAWN motion, so the animation matches what the eye sees whatever the update rate.
 * Pure and unit-tested.
 */

import type { AirState } from './animator';

const wrapAngle =
  (
    a: number,
  ) =>
    Math.atan2(
      Math.sin(
        a,
      ),
      Math.cos(
        a,
      ),
    );
const ease =
  (
    dt: number,
    rate: number,
  ) =>
    1 -
    Math.exp(
      -rate *
        dt,
    );

/** Beyond this many tiles from the drawn position a sighting is a teleport (a respawn, a loaded save): snap, do not run there. */
export const SNAP_DISTANCE = 6;

export interface MotionSample {
  x: number;
  y: number;
  z: number;
  /** Direction faced: 0 faces +z, increasing toward +x. */
  yaw: number;
  /** Smoothed ground speed of the drawn motion, tiles/s. */
  speed: number;
  /** Smoothed vertical velocity of the drawn motion, units/s. */
  vy: number;
  air: AirState;
}

export interface MotionOptions {
  /** How fast the drawn position follows the sighting (1/s). */
  follow?: number;
  /** Same for height, which is quicker so a step up or down reads as a hop (1/s). */
  followY?: number;
  /** Time constant rate of the speed smoothing (1/s). */
  speedRate?: number;
  /** Turn rate toward the heading while moving (1/s). */
  turnRate?: number;
}

/** Vertical speed (units/s) that counts as leaving the ground, and the lower one at which it counts as landed. */
export const AIR_ENTER = 2.2;
export const AIR_EXIT = 1.0;

/** Jump / fall / ground from vertical velocity, with hysteresis so a ledge hop does not flicker between states. */
export function airFromVelocity(
  prev: AirState,
  vy: number,
): AirState {
  if (
    !Number.isFinite(
      vy,
    )
  )
    return 'ground';
  if (
    prev ===
    'jump'
  )
    return vy >
      AIR_EXIT
      ? 'jump'
      : vy <
          -AIR_ENTER
        ? 'fall'
        : 'ground';
  if (
    prev ===
    'fall'
  )
    return vy <
      -AIR_EXIT
      ? 'fall'
      : vy >
          AIR_ENTER
        ? 'jump'
        : 'ground';
  return vy >
    AIR_ENTER
    ? 'jump'
    : vy <
        -AIR_ENTER
      ? 'fall'
      : 'ground';
}

export class MotionEstimator {
  private tx = 0;
  private ty = 0;
  private tz = 0;
  private ready = false;
  private readonly follow: number;
  private readonly followY: number;
  private readonly speedRate: number;
  private readonly turnRate: number;
  readonly sample: MotionSample =
    {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      speed: 0,
      vy: 0,
      air: 'ground',
    };

  constructor(
    opts: MotionOptions = {},
  ) {
    this.follow =
      opts.follow ??
      12;
    this.followY =
      opts.followY ??
      18;
    this.speedRate =
      opts.speedRate ??
      10;
    this.turnRate =
      opts.turnRate ??
      12;
  }

  /** Where the figure has just been seen (call whenever the source position is read; same value again is fine). */
  observe(
    x: number,
    y: number,
    z: number,
  ): void {
    if (
      ![
        x,
        y,
        z,
      ].every(
        Number.isFinite,
      )
    )
      return;
    this.tx =
      x;
    this.ty =
      y;
    this.tz =
      z;
    const s =
      this
        .sample;
    if (
      !this
        .ready ||
      Math.hypot(
        x -
          s.x,
        z -
          s.z,
      ) >
        SNAP_DISTANCE
    ) {
      this.ready = true;
      s.x =
        x;
      s.y =
        y;
      s.z =
        z;
      s.speed = 0;
      s.vy = 0;
      s.air =
        'ground';
    }
  }

  /** Advance the drawn motion by `dt` seconds. */
  step(
    dt: number,
  ): MotionSample {
    const s =
      this
        .sample;
    if (
      !this
        .ready ||
      !(
        dt >
        0
      )
    )
      return s;
    const step =
      Math.min(
        dt,
        0.1,
      );
    const k =
      ease(
        step,
        this
          .follow,
      );
    const px =
      s.x;
    const py =
      s.y;
    const pz =
      s.z;
    s.x +=
      (this
        .tx -
        s.x) *
      k;
    s.y +=
      (this
        .ty -
        s.y) *
      ease(
        step,
        this
          .followY,
      );
    s.z +=
      (this
        .tz -
        s.z) *
      k;
    const dx =
      s.x -
      px;
    const dz =
      s.z -
      pz;
    const ground =
      Math.hypot(
        dx,
        dz,
      ) /
      step;
    const v =
      (s.y -
        py) /
      step;
    const sk =
      ease(
        step,
        this
          .speedRate,
      );
    s.speed +=
      (ground -
        s.speed) *
      sk;
    if (
      s.speed <
        0.02 &&
      ground ===
        0
    )
      s.speed = 0;
    s.vy +=
      (v -
        s.vy) *
      ease(
        step,
        22,
      );
    if (
      ground >
        0.25 &&
      s.speed >
        0.15
    )
      s.yaw =
        wrapAngle(
          s.yaw +
            wrapAngle(
              Math.atan2(
                dx,
                dz,
              ) -
                s.yaw,
            ) *
              ease(
                step,
                this
                  .turnRate,
              ),
        );
    s.air =
      airFromVelocity(
        s.air,
        s.vy,
      );
    return s;
  }
}
