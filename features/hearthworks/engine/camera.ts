/**
 * The camera between the two views. One perspective camera does both jobs: the isometric view is a
 * very narrow field of view from far away (it reads as orthographic), the third-person view a wide
 * field of view over the avatar's shoulder. Moving between them is a "dolly zoom" — distance and FOV
 * change together on one smooth curve — which is what makes the transition feel like a lens pull
 * rather than a cut.
 *
 * `progress` runs 0 → 1 at a constant rate toward the requested view; the pose follows
 * `easeProgress(progress)` (a curve that leaves and lands at zero speed, the site's EASE.smooth).
 * Because the rate is constant and the curve is a function of the position, flipping the target
 * mid-flight turns around from exactly the frame it is on — no jump, no restart.
 */

import { EASE } from '@/lib/app-motion';
import { lerp } from '@/lib/core/math';

export type Vec3 =
  readonly [
    number,
    number,
    number,
  ];
export interface CameraPose {
  position: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
}

export type ViewKind =
  | 'iso'
  | 'third';

export const ISO_FOV = 6;
export const THIRD_FOV = 58;
/** Time for a full transition at constant rate. */
export const VIEW_BLEND_MS = 1200;

/** Isometric look direction: from the board's centre toward the camera (azimuth 45°, a touch over 30° up). */
const ISO_DIR: Vec3 =
  normalise(
    [
      22,
      19,
      22,
    ],
  );

function normalise(
  v: Vec3,
): Vec3 {
  const l =
    Math.hypot(
      v[0],
      v[1],
      v[2],
    ) ||
    1;
  return [
    v[0] /
      l,
    v[1] /
      l,
    v[2] /
      l,
  ];
}

/** CSS-style cubic-bezier easing: x(t) is inverted numerically, then y is read off. */
export function bezierEase([
  x1,
  y1,
  x2,
  y2,
]: readonly [
  number,
  number,
  number,
  number,
]) {
  const cx =
    3 *
    x1;
  const bx =
    3 *
      (x2 -
        x1) -
    cx;
  const ax =
    1 -
    cx -
    bx;
  const cy =
    3 *
    y1;
  const by =
    3 *
      (y2 -
        y1) -
    cy;
  const ay =
    1 -
    cy -
    by;
  const sx =
    (
      t: number,
    ) =>
      ((ax *
        t +
        bx) *
        t +
        cx) *
      t;
  const sy =
    (
      t: number,
    ) =>
      ((ay *
        t +
        by) *
        t +
        cy) *
      t;
  return (
    x: number,
  ): number => {
    if (
      !(
        x >
        0
      )
    )
      return 0;
    if (
      !(
        x <
        1
      )
    )
      return 1;
    let lo = 0;
    let hi = 1;
    let t =
      x;
    for (
      let i = 0;
      i <
      40;
      i++
    ) {
      const v =
        sx(
          t,
        );
      if (
        Math.abs(
          v -
            x,
        ) <
        1e-7
      )
        break;
      if (
        v <
        x
      )
        lo =
          t;
      else
        hi =
          t;
      t =
        (lo +
          hi) /
        2;
    }
    return sy(
      t,
    );
  };
}

export const easeProgress =
  bezierEase(
    EASE.smooth as unknown as readonly [
      number,
      number,
      number,
      number,
    ],
  );

/** Move `progress` toward the requested view at a constant rate. Bad dt values change nothing. */
export function stepViewProgress(
  progress: number,
  target: ViewKind,
  dtMs: number,
): number {
  const goal =
    target ===
    'third'
      ? 1
      : 0;
  if (
    !Number.isFinite(
      dtMs,
    ) ||
    dtMs <=
      0
  )
    return Math.min(
      1,
      Math.max(
        0,
        progress,
      ),
    );
  const step =
    dtMs /
    VIEW_BLEND_MS;
  const next =
    goal >
    progress
      ? Math.min(
          goal,
          progress +
            step,
        )
      : Math.max(
          goal,
          progress -
            step,
        );
  return Math.min(
    1,
    Math.max(
      0,
      next,
    ),
  );
}

export function isoPose(
  center: {
    x: number;
    z: number;
  },
  distance: number,
): CameraPose {
  const t: Vec3 =
    [
      center.x,
      0,
      center.z,
    ];
  return {
    position:
      [
        t[0] +
          ISO_DIR[0] *
            distance,
        t[1] +
          ISO_DIR[1] *
            distance,
        t[2] +
          ISO_DIR[2] *
            distance,
      ],
    target:
      t,
    fov: ISO_FOV,
  };
}

/** Behind and above the avatar, looking at its shoulders. `yaw` is the direction it faces (0 = +z). */
/** `y` is the height of the ground under the avatar (the camera rides above the terrain, never inside it). */
export function thirdPose(avatar: {
  x: number;
  z: number;
  yaw: number;
  y?: number;
}): CameraPose {
  // Scaled to a person ~0.4 tiles tall: just behind and above the shoulders.
  const back = 1.7;
  const up = 0.95;
  const ground =
    avatar.y ??
    0;
  const fx =
    Math.sin(
      avatar.yaw,
    );
  const fz =
    Math.cos(
      avatar.yaw,
    );
  return {
    position:
      [
        avatar.x -
          fx *
            back,
        ground +
          up,
        avatar.z -
          fz *
            back,
      ],
    target:
      [
        avatar.x +
          fx *
            0.55,
        ground +
          0.38,
        avatar.z +
          fz *
            0.55,
      ],
    fov: THIRD_FOV,
  };
}

/**
 * A pose between `a` and `b` at `t` ∈ [0,1]. The target slides linearly; the camera's distance from
 * it and the field of view change geometrically (so apparent size changes at an even pace — the dolly
 * zoom), and the direction turns by blending the two unit vectors, which swings the camera down off
 * the isometric diagonal and in behind the avatar in one arc.
 */
export function blendPose(
  a: CameraPose,
  b: CameraPose,
  t: number,
): CameraPose {
  const u =
    Math.min(
      1,
      Math.max(
        0,
        Number.isFinite(
          t,
        )
          ? t
          : 0,
      ),
    );
  const offA: Vec3 =
    [
      a
        .position[0] -
        a
          .target[0],
      a
        .position[1] -
        a
          .target[1],
      a
        .position[2] -
        a
          .target[2],
    ];
  const offB: Vec3 =
    [
      b
        .position[0] -
        b
          .target[0],
      b
        .position[1] -
        b
          .target[1],
      b
        .position[2] -
        b
          .target[2],
    ];
  const lenA =
    Math.hypot(
      ...offA,
    ) ||
    1e-6;
  const lenB =
    Math.hypot(
      ...offB,
    ) ||
    1e-6;
  const dirA =
    normalise(
      offA,
    );
  const dirB =
    normalise(
      offB,
    );
  const dir =
    normalise(
      [
        lerp(
          dirA[0],
          dirB[0],
          u,
        ),
        lerp(
          dirA[1],
          dirB[1],
          u,
        ),
        lerp(
          dirA[2],
          dirB[2],
          u,
        ),
      ],
    );
  const len =
    Math.exp(
      lerp(
        Math.log(
          lenA,
        ),
        Math.log(
          lenB,
        ),
        u,
      ),
    );
  const target: Vec3 =
    [
      lerp(
        a
          .target[0],
        b
          .target[0],
        u,
      ),
      lerp(
        a
          .target[1],
        b
          .target[1],
        u,
      ),
      lerp(
        a
          .target[2],
        b
          .target[2],
        u,
      ),
    ];
  return {
    position:
      [
        target[0] +
          dir[0] *
            len,
        target[1] +
          dir[1] *
            len,
        target[2] +
          dir[2] *
            len,
      ],
    target,
    fov: Math.exp(
      lerp(
        Math.log(
          a.fov,
        ),
        Math.log(
          b.fov,
        ),
        u,
      ),
    ),
  };
}
