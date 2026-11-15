/**
 * Line of sight and bullets on the block-stepped map. Everything here is integer tile walking plus IEEE
 * arithmetic (+ − × ÷ √, no trig), so every replica of the lockstep sim resolves a shot identically.
 */

import type { WeaponDef } from '../content';
import { nextRandom } from './rng';
import {
  WATER_LEVEL,
  type World,
} from './types';

/** Eye and chest heights above a tile's top, in block levels (a person is about one block tall). */
export const EYE = 0.9;
export const CHEST = 0.6;
/** How far above a tile's own top a thing on it blocks a line of sight, in block levels. */
const FOREST_HEIGHT = 3;
const BUILDING_HEIGHT: Record<
  string,
  number
> =
  {
    cottage: 2.6,
    kitchen: 2.2,
    harvester: 1.6,
    stall: 1.3,
  };
/** A person is hit if a pellet passes this close to their middle (tiles). */
export const HIT_RADIUS = 0.4;

/** One draw from the world's own generator. */
export function drawRandom(
  w: World,
): number {
  const r =
    nextRandom(
      w.rng,
    );
  w.rng =
    r.state;
  return r.value;
}

function ground(
  w: World,
  x: number,
  z: number,
): number {
  const i =
    z *
      w.size +
    x;
  return w
    .terrain[
    i
  ] ===
    'water'
    ? WATER_LEVEL
    : w
        .height[
        i
      ];
}

/** The level of the top of whatever stands on a tile: terrain, then trees or a building above it. */
function surface(
  w: World,
  x: number,
  z: number,
): number {
  const i =
    z *
      w.size +
    x;
  let top =
    ground(
      w,
      x,
      z,
    );
  if (
    w
      .terrain[
      i
    ] ===
    'forest'
  )
    top +=
      FOREST_HEIGHT;
  for (const b of w.buildings) {
    if (
      b.x ===
        x &&
      b.z ===
        z
    )
      top +=
        BUILDING_HEIGHT[
          b
            .kind
        ] ??
        0;
  }
  return top;
}

export interface Sight {
  clear: boolean;
  /** Where the line stopped: the end tile if clear, else the first tile that blocked it. */
  x: number;
  z: number;
}

/**
 * Can an eye on tile A see a chest on tile B? Walk the grid between them; each tile in between must not rise
 * above the straight line joining eye to chest, so a ledge, a tree line or a wall blocks sight and the same
 * ground one block up does not.
 */
export function sightLine(
  w: World,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): Sight {
  const n =
    w.size;
  const x0 =
    Math.min(
      n -
        1,
      Math.max(
        0,
        Math.round(
          ax,
        ),
      ),
    );
  const z0 =
    Math.min(
      n -
        1,
      Math.max(
        0,
        Math.round(
          az,
        ),
      ),
    );
  const x1 =
    Math.min(
      n -
        1,
      Math.max(
        0,
        Math.round(
          bx,
        ),
      ),
    );
  const z1 =
    Math.min(
      n -
        1,
      Math.max(
        0,
        Math.round(
          bz,
        ),
      ),
    );
  const steps =
    Math.max(
      Math.abs(
        x1 -
          x0,
      ),
      Math.abs(
        z1 -
          z0,
      ),
    );
  const h0 =
    ground(
      w,
      x0,
      z0,
    ) +
    EYE;
  const h1 =
    ground(
      w,
      x1,
      z1,
    ) +
    CHEST;
  let px =
    x0;
  let pz =
    z0;
  for (
    let i = 1;
    i <=
    steps;
    i++
  ) {
    const x =
      x0 +
      Math.round(
        ((x1 -
          x0) *
          i) /
          steps,
      );
    const z =
      z0 +
      Math.round(
        ((z1 -
          z0) *
          i) /
          steps,
      );
    // A diagonal step squeezes between the two tiles it passes beside: if both stand above the line, that is a wall
    // meeting at a corner, and nothing gets through the join.
    if (
      x !==
        px &&
      z !==
        pz
    ) {
      const hMid =
        h0 +
        ((h1 -
          h0) *
          (i -
            0.5)) /
          steps;
      if (
        surface(
          w,
          x,
          pz,
        ) >
          hMid &&
        surface(
          w,
          px,
          z,
        ) >
          hMid
      )
        return {
          clear: false,
          x,
          z: pz,
        };
    }
    px =
      x;
    pz =
      z;
    if (
      i <
        steps &&
      surface(
        w,
        x,
        z,
      ) >
        h0 +
          ((h1 -
            h0) *
            i) /
            steps
    )
      return {
        clear: false,
        x,
        z,
      };
  }
  return {
    clear: true,
    x: x1,
    z: z1,
  };
}

export interface ShotTarget {
  id: string;
  x: number;
  z: number;
}

export interface ShotHit {
  id: string;
  damage: number;
}

export interface ShotResult {
  hits: ShotHit[];
  /** Where the first pellet ended (for the tracer). */
  endX: number;
  endZ: number;
}

/**
 * Fire a weapon from `from` toward the aim point. Each pellet gets its own sideways error from the world's
 * generator (one draw per pellet, always), travels up to the weapon's range, and strikes the nearest target whose
 * middle it passes within HIT_RADIUS of and that is not hidden behind terrain. Damage falls off linearly with the
 * distance travelled.
 */
export function resolveShot(
  w: World,
  from: {
    x: number;
    z: number;
  },
  aim: {
    x: number;
    z: number;
  },
  gun: WeaponDef,
  opts: {
    damageMul: number;
    spreadMul: number;
  },
  targets: readonly ShotTarget[],
): ShotResult {
  const dx =
    aim.x -
    from.x;
  const dz =
    aim.z -
    from.z;
  const len =
    Math.sqrt(
      dx *
        dx +
        dz *
          dz,
    ) ||
    1;
  const ux =
    dx /
    len;
  const uz =
    dz /
    len;
  const hits: ShotHit[] =
    [];
  let endX =
    from.x +
    ux *
      gun.range;
  let endZ =
    from.z +
    uz *
      gun.range;
  for (
    let p = 0;
    p <
    gun.pellets;
    p++
  ) {
    const lat =
      (drawRandom(
        w,
      ) *
        2 -
        1) *
      gun.spread *
      opts.spreadMul;
    const norm =
      Math.sqrt(
        1 +
          lat *
            lat,
      );
    const vx =
      (ux -
        uz *
          lat) /
      norm;
    const vz =
      (uz +
        ux *
          lat) /
      norm;
    let best: {
      t: ShotTarget;
      along: number;
    } | null =
      null;
    for (const t of targets) {
      const rx =
        t.x -
        from.x;
      const rz =
        t.z -
        from.z;
      const along =
        rx *
          vx +
        rz *
          vz;
      if (
        along <=
          0 ||
        along >
          gun.range
      )
        continue;
      const off =
        -rx *
          vz +
        rz *
          vx;
      if (
        off *
          off >
        HIT_RADIUS *
          HIT_RADIUS
      )
        continue;
      if (
        best &&
        along >=
          best.along
      )
        continue;
      if (
        !sightLine(
          w,
          from.x,
          from.z,
          t.x,
          t.z,
        )
          .clear
      )
        continue;
      best =
        {
          t,
          along,
        };
    }
    if (
      best
    ) {
      const raw =
        gun.damage *
        opts.damageMul *
        (1 -
          gun.falloff *
            (best.along /
              gun.range));
      const damage =
        Math.max(
          1,
          Math.round(
            raw,
          ),
        );
      const struck =
        best.t;
      const seen =
        hits.find(
          (
            h,
          ) =>
            h.id ===
            struck.id,
        );
      if (
        seen
      )
        seen.damage +=
          damage;
      else
        hits.push(
          {
            id: struck.id,
            damage,
          },
        );
      if (
        p ===
        0
      ) {
        endX =
          struck.x;
        endZ =
          struck.z;
      }
    } else if (
      p ===
      0
    ) {
      const s =
        sightLine(
          w,
          from.x,
          from.z,
          endX,
          endZ,
        );
      if (
        !s.clear
      ) {
        endX =
          s.x;
        endZ =
          s.z;
      }
    }
  }
  return {
    hits,
    endX,
    endZ,
  };
}
