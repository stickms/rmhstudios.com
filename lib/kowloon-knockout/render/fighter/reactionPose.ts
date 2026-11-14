// How an ImpactBus `Reaction` (impact.ts) is applied to a fighter: where the root goes, how the body is
// squashed and leaned, and what colour the hit flash is. Pure, so the maths is tested without a renderer.
import type {
  ImpactKind,
  Reaction,
} from '@/lib/kowloon-knockout/render/impact';

export interface ReactionPose {
  /** World-space offset to add to the root's ground position. */
  dx: number;
  dz: number;
  /** Body scale (about the feet): squash flattens and widens, keeping a little volume. */
  sx: number;
  sy: number;
  sz: number;
  /** Lean: a rotation of `angle` about `axis` (a unit vector in the ROOT's local space, horizontal). */
  axisX: number;
  axisZ: number;
  angle: number;
}

/** `rootYaw`: the root group's rotation about +Y (so the lean axis, defined in the world, can be given in local space). */
export function reactionPose(
  r: Pick<
    Reaction,
    | 'ox'
    | 'oz'
    | 'squash'
    | 'lean'
    | 'dirX'
    | 'dirZ'
  >,
  rootYaw: number,
): ReactionPose {
  // The lean axis is Y × dir = (dirZ, 0, -dirX) in the world; rotate it by -rootYaw into the root's frame.
  const kx =
    r.dirZ;
  const kz =
    -r.dirX;
  const c =
    Math.cos(
      rootYaw,
    );
  const s =
    Math.sin(
      rootYaw,
    );
  const sy =
    1 -
    r.squash;
  const sxz =
    1 +
    r.squash *
      0.5;
  return {
    dx: r.ox,
    dz: r.oz,
    sx: sxz,
    sy,
    sz: sxz,
    axisX:
      kx *
        c -
      kz *
        s,
    axisZ:
      kx *
        s +
      kz *
        c,
    angle:
      r.lean,
  };
}

export type FlashRgb =
  [
    number,
    number,
    number,
  ];
const RED: FlashRgb =
  [
    1,
    0.13,
    0.27,
  ]; // the existing hit flash
const WHITE_HOT: FlashRgb =
  [
    1,
    0.96,
    0.9,
  ]; // the instant of a heavy hit
const GUARD: FlashRgb =
  [
    0.62,
    0.88,
    1,
  ]; // a block: cool, not red

export interface FlashStyle {
  color: FlashRgb;
  amount: number;
}

/**
 * The emissive flash for a fighter this frame. `legacy` is the sim's own `hitFlash` (0..8 frames, red); the
 * bus's flash (0..1) starts white-hot and settles to red for a hit, or stays cool for a block. Whichever is
 * stronger wins; `amount` is the emissive multiplier (0..~0.9).
 */
export function flashStyle(
  busFlash: number,
  kind: ImpactKind,
  legacy: number,
): FlashStyle {
  const legacyAmt =
    Math.min(
      1,
      Math.max(
        0,
        legacy /
          8,
      ),
    );
  const bus =
    Math.min(
      1,
      Math.max(
        0,
        busFlash,
      ),
    );
  if (
    bus >=
      legacyAmt &&
    bus >
      0
  ) {
    if (
      kind ===
      'block'
    )
      return {
        color:
          GUARD,
        amount:
          bus *
          0.42,
      };
    // above ~0.55 the colour runs from red toward white-hot, so a fresh heavy hit pops white then cools to red
    const hot =
      Math.min(
        1,
        Math.max(
          0,
          (bus -
            0.55) /
            0.45,
        ),
      );
    const color: FlashRgb =
      [
        RED[0] +
          (WHITE_HOT[0] -
            RED[0]) *
            hot,
        RED[1] +
          (WHITE_HOT[1] -
            RED[1]) *
            hot,
        RED[2] +
          (WHITE_HOT[2] -
            RED[2]) *
            hot,
      ];
    // capped well under 1: a fully white emissive turns the model into a flat cut-out, the texture must show through
    return {
      color,
      amount:
        bus *
        0.6,
    };
  }
  return {
    color:
      RED,
    amount:
      legacyAmt *
      0.75,
  };
}
