/**
 * Remote players' motion, Source-style: the world only knows where a player stood at each 50 ms tick (a `move`
 * command teleports it, ~10 Hz while walking), so drawing `player.x/z` straight from the world steps the avatar.
 * Instead every remote player has a short buffer of (tick, x, z) samples and is drawn `INTERP_DELAY_MS` in the
 * past, interpolated between the two samples around that moment. If the newest sample is older than the render
 * time (ticks arrived late) the avatar is extrapolated along its recent velocity for at most
 * `EXTRAPOLATE_MAX_MS`, then holds. The buffer costs nothing on the wire: it is fed from the replica the session
 * already keeps.
 *
 * Time here is SIM time (tick × TICK_MS), so a late or reordered packet does not move anyone backwards, and a
 * duplicate tick is the same sample. Discontinuities are not interpolated across:
 *   - a teleport (respawn, arrest: a jump beyond `SNAP_DISTANCE`) snaps;
 *   - a host migration rewinds the tick counter (the new host's checkpoint can be a tick or two behind what we
 *     had applied): samples at or after the rewound tick are discarded, and a big rewind forgets the track.
 *
 * The same sampler hands the animation layer what it needs to blend locomotion without differencing positions
 * itself: `speed` (tiles/s over the last ~120 ms) and `yaw` (radians, `atan2(vx, vz)`, held while standing).
 *
 * Pure: no DOM, no clock of its own (the caller passes wall time), so it is unit-tested on fake time.
 */

import {
  TICK_MS,
  type World,
} from '../world';

/** Draw this far in the past (Source's cl_interp ≈ 2 × the update interval at 20 Hz). */
export const INTERP_DELAY_MS = 100;
/** Past the newest sample, keep moving along the last velocity for at most this long, then hold. */
export const EXTRAPOLATE_MAX_MS = 250;
/** A jump between consecutive samples larger than this many tiles is a teleport: do not slide across it. */
export const SNAP_DISTANCE = 6;
/** A rewind of the tick counter larger than this many ticks forgets the track (a new host's world). */
export const REWIND_RESET_TICKS = 40;
/** Samples kept per player (3.2 s). */
export const MAX_SAMPLES = 64;
/** The window over which velocity (and so speed and yaw) is measured. */
export const VELOCITY_WINDOW_MS = 120;
/** A sim-clock estimate further than this from a new observation is a hitch (hidden tab): re-anchor. */
const CLOCK_SNAP_MS = 500;
const CLOCK_SMOOTH = 0.1;

export interface Pose {
  x: number;
  z: number;
  /** Tiles per second. */
  speed: number;
  /** Radians, `atan2(vx, vz)`: 0 faces +z. Held at the last moving heading while standing. */
  yaw: number;
  /** True while the sample is past the newest data (extrapolating or holding). */
  extrapolated: boolean;
}

interface Sample {
  /** Sim time, ms. */
  t: number;
  x: number;
  z: number;
  /** Do not interpolate from the previous sample to this one (a teleport). */
  snap: boolean;
}

export class PoseBuffer {
  private samples: Sample[] =
    [];
  private lastYaw = 0;

  get size(): number {
    return this
      .samples
      .length;
  }

  get newestTick(): number {
    const s =
      this
        .samples[
        this
          .samples
          .length -
          1
      ];
    return s
      ? s.t /
          TICK_MS
      : -1;
  }

  /**
   * Record where the player stood at `tick`. Tolerates what a network does: a tick that arrives after a newer one
   * is inserted in order, a repeated tick replaces its sample, a gap is simply a longer segment to interpolate.
   */
  push(
    tick: number,
    x: number,
    z: number,
  ): void {
    if (
      !Number.isFinite(
        tick,
      ) ||
      !Number.isFinite(
        x,
      ) ||
      !Number.isFinite(
        z,
      )
    )
      return;
    const t =
      tick *
      TICK_MS;
    const s =
      this
        .samples;
    let at =
      s.length;
    while (
      at >
        0 &&
      s[
        at -
          1
      ]
        .t >
        t
    )
      at--;
    if (
      at >
        0 &&
      s[
        at -
          1
      ]
        .t ===
        t
    ) {
      s[
        at -
          1
      ].x =
        x;
      s[
        at -
          1
      ].z =
        z;
      return;
    }
    if (
      at ===
        0 &&
      s.length >=
        MAX_SAMPLES
    )
      return; // older than everything we keep
    const prev =
      at >
      0
        ? s[
            at -
              1
          ]
        : null;
    const snap =
      !!prev &&
      Math.hypot(
        x -
          prev.x,
        z -
          prev.z,
      ) >
        SNAP_DISTANCE;
    s.splice(
      at,
      0,
      {
        t,
        x,
        z,
        snap,
      },
    );
    // The sample after an inserted one may now follow a different position: re-judge its jump.
    const next =
      s[
        at +
          1
      ];
    if (
      next
    )
      next.snap =
        Math.hypot(
          next.x -
            x,
          next.z -
            z,
        ) >
        SNAP_DISTANCE;
    if (
      s.length >
      MAX_SAMPLES
    )
      s.splice(
        0,
        s.length -
          MAX_SAMPLES,
      );
  }

  /**
   * The timeline went backwards (a new host's checkpoint is behind what we had applied): everything at or after
   * `tick` belongs to a world that no longer exists. A rewind of more than `REWIND_RESET_TICKS` forgets the track.
   */
  rewindTo(
    tick: number,
  ): void {
    const t =
      tick *
      TICK_MS;
    const s =
      this
        .samples;
    const newest =
      s[
        s.length -
          1
      ];
    if (
      !newest
    )
      return;
    if (
      newest.t -
        t >
      REWIND_RESET_TICKS *
        TICK_MS
    ) {
      s.length = 0;
      return;
    }
    while (
      s.length >
        0 &&
      s[
        s.length -
          1
      ]
        .t >=
        t
    )
      s.pop();
  }

  reset(): void {
    this.samples.length = 0;
  }

  /** Position at sim time `t` (ms): interpolated inside the data, extrapolated (capped) past it. */
  private at(
    t: number,
  ): {
    x: number;
    z: number;
    extrapolated: boolean;
  } | null {
    const s =
      this
        .samples;
    if (
      s.length ===
      0
    )
      return null;
    const first =
      s[0];
    const newest =
      s[
        s.length -
          1
      ];
    if (
      t <=
      first.t
    )
      return {
        x: first.x,
        z: first.z,
        extrapolated: false,
      };
    if (
      t >=
      newest.t
    ) {
      const past =
        Math.min(
          t -
            newest.t,
          EXTRAPOLATE_MAX_MS,
        );
      if (
        past <=
        0
      )
        return {
          x: newest.x,
          z: newest.z,
          extrapolated: false,
        };
      const v =
        this.velocityAtNewest();
      return {
        x:
          newest.x +
          v.x *
            past,
        z:
          newest.z +
          v.z *
            past,
        extrapolated: true,
      };
    }
    // The pair around t: s[i-1].t <= t < s[i].t.
    let i =
      s.length -
      1;
    while (
      i >
        0 &&
      s[
        i -
          1
      ]
        .t >
        t
    )
      i--;
    const a =
      s[
        i -
          1
      ];
    const b =
      s[
        i
      ];
    if (
      b.snap
    )
      return {
        x:
          t -
            a.t <
          b.t -
            t
            ? a.x
            : b.x,
        z:
          t -
            a.t <
          b.t -
            t
            ? a.z
            : b.z,
        extrapolated: false,
      };
    const k =
      (t -
        a.t) /
      (b.t -
        a.t);
    return {
      x:
        a.x +
        (b.x -
          a.x) *
          k,
      z:
        a.z +
        (b.z -
          a.z) *
          k,
      extrapolated: false,
    };
  }

  /** Velocity (tiles per ms) over the window ending at the newest sample, 0 across a teleport. */
  private velocityAtNewest(): {
    x: number;
    z: number;
  } {
    const s =
      this
        .samples;
    const newest =
      s[
        s.length -
          1
      ];
    let i =
      s.length -
      1;
    while (
      i >
        0 &&
      newest.t -
        s[
          i -
            1
        ]
          .t <=
        VELOCITY_WINDOW_MS &&
      !s[
        i
      ]
        .snap
    )
      i--;
    if (
      i ===
        s.length -
          1 &&
      s.length >
        1 &&
      !newest.snap
    )
      i =
        s.length -
        2;
    const old =
      s[
        i
      ];
    const dt =
      newest.t -
      old.t;
    if (
      dt <=
        0 ||
      newest.snap
    )
      return {
        x: 0,
        z: 0,
      };
    return {
      x:
        (newest.x -
          old.x) /
        dt,
      z:
        (newest.z -
          old.z) /
        dt,
    };
  }

  /** The pose to draw when the render clock reads `simRenderMs`. Null until there is a sample. */
  sample(
    simRenderMs: number,
  ): Pose | null {
    const p =
      this.at(
        simRenderMs,
      );
    if (
      !p
    )
      return null;
    const back =
      this.at(
        simRenderMs -
          VELOCITY_WINDOW_MS,
      ) ??
      p;
    const dx =
      p.x -
      back.x;
    const dz =
      p.z -
      back.z;
    const dist =
      Math.hypot(
        dx,
        dz,
      );
    // A teleport inside the window is not a sprint.
    const speed =
      dist >
      SNAP_DISTANCE
        ? 0
        : dist /
          (VELOCITY_WINDOW_MS /
            1000);
    if (
      speed >
      0.05
    )
      this.lastYaw =
        Math.atan2(
          dx,
          dz,
        );
    return {
      x: p.x,
      z: p.z,
      speed:
        speed >
        0.05
          ? speed
          : 0,
      yaw: this
        .lastYaw,
      extrapolated:
        p.extrapolated,
    };
  }
}

/**
 * One buffer per remote player, and the render clock. Feed it each frame with the world the session shows
 * (`observe`), read it each frame for each avatar (`sample`).
 */
export class RemotePoses {
  private readonly tracks =
    new Map<
      string,
      PoseBuffer
    >();
  private lastTick =
    -1;
  /** wall − sim, smoothed: maps the frame clock onto the host's tick clock without following packet jitter. */
  private offset:
    | number
    | null =
    null;

  constructor(
    private readonly selfId: () => string,
  ) {}

  /** Call every frame with the shown world and the frame clock (ms). Cheap when the tick has not changed. */
  observe(
    world: World,
    wallMs: number,
  ): void {
    if (
      world.tick ===
      this
        .lastTick
    )
      return;
    const rewound =
      world.tick <
      this
        .lastTick;
    this.lastTick =
      world.tick;
    if (
      rewound
    )
      for (const track of this.tracks.values())
        track.rewindTo(
          world.tick,
        );
    const me =
      this.selfId();
    const seen =
      new Set<string>();
    for (const p of Object.values(
      world.players,
    )) {
      if (
        p.id ===
        me
      )
        continue;
      seen.add(
        p.id,
      );
      let track =
        this.tracks.get(
          p.id,
        );
      if (
        !track
      )
        this.tracks.set(
          p.id,
          (track =
            new PoseBuffer()),
        );
      track.push(
        world.tick,
        p.x,
        p.z,
      );
    }
    for (const id of [
      ...this.tracks.keys(),
    ])
      if (
        !seen.has(
          id,
        )
      )
        this.tracks.delete(
          id,
        );
    const observed =
      wallMs -
      world.tick *
        TICK_MS;
    if (
      this
        .offset ===
        null ||
      rewound ||
      Math.abs(
        observed -
          this
            .offset,
      ) >
        CLOCK_SNAP_MS
    )
      this.offset =
        observed;
    else
      this.offset +=
        (observed -
          this
            .offset) *
        CLOCK_SMOOTH;
  }

  /** Where to draw `id` at wall time `wallMs`; null if unknown. */
  sample(
    id: string,
    wallMs: number,
  ): Pose | null {
    const track =
      this.tracks.get(
        id,
      );
    if (
      !track ||
      this
        .offset ===
        null
    )
      return null;
    return track.sample(
      wallMs -
        this
          .offset -
        INTERP_DELAY_MS,
    );
  }

  reset(): void {
    this.tracks.clear();
    this.lastTick =
      -1;
    this.offset =
      null;
  }
}
