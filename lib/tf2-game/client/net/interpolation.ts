/**
 * Entity interpolation (the SDK's C_BaseEntity::Interpolate / CInterpolatedVar
 * with cl_interp_ratio 2): other entities are drawn where they were `interp`
 * seconds ago — two snapshot intervals at our 33 Hz updates — so there are
 * always two snapshots around the render time to blend between.
 *
 *   - `RenderClock` maps local time to server time from snapshot arrivals
 *     (the least-delayed arrival in a sliding window, slewed gently so render
 *     time never jumps) and gives the render time = server time − interp.
 *   - `InterpolationBuffer` keeps each entity's recent samples and blends them
 *     per field kind: coords and floats linearly, angles along the shorter arc,
 *     everything else stepped. Past the newest sample it extrapolates from the
 *     velocity (`vx/vy/vz` when the schema has them, else the last two samples)
 *     for at most 0.25 s, then holds. A jump larger than any legal move, a new
 *     serial, or `teleported(key)` (the server's teleport event) snaps instead
 *     of sliding through walls.
 *
 * Environment-agnostic.
 */

import { TICK_INTERVAL } from '../../core/constants';
import type { NetFieldKind, NetRecord, NetSchema, NetValue } from '../../sim/net-schema';
import type { EntityState } from '../../net/snapshot';

/** Snapshot spacing at 33 Hz. */
export const SNAPSHOT_INTERVAL = 2 * TICK_INTERVAL;
/** cl_interp_ratio 2 × the update interval. */
export const DEFAULT_INTERP = 2 * SNAPSHOT_INTERVAL;
/** cl_extrapolate_amount (0.25 s). */
export const MAX_EXTRAPOLATION = 0.25;
/** A move faster than this between samples is a teleport (units per second; nothing legal goes 4000 u/s). */
export const TELEPORT_SPEED = 4000;
/** …but never below this distance (respawn-scale jumps). */
export const TELEPORT_MIN_DISTANCE = 192;
/** Samples kept per entity. */
const MAX_SAMPLES = 16;

// ─── Clock ──────────────────────────────────────────────────────────────────

export class RenderClock {
  /** serverTime − localTime (seconds), as applied. */
  private offset = 0;
  private synced = false;
  private readonly window: Array<{ at: number; offset: number }> = [];
  private lastLocal = 0;
  /** Local time (s, on the clock's timeline) it was held at for an offline pause, and the server time it shows. */
  private heldAt: number | null = null;
  private heldTime = 0;

  /**
   * @param interp seconds behind the server to render other entities
   * @param windowSeconds how far back arrivals count toward the estimate
   * @param slew max fraction of elapsed time the clock may be sped up/slowed down
   */
  constructor(
    public interp = DEFAULT_INTERP,
    private readonly tickInterval = TICK_INTERVAL,
    private readonly windowSeconds = 1,
    private readonly slew = 0.05,
  ) {}

  /** host_timescale: server time runs `rate` × local time (1 normally). */
  private rate = 1;
  private scaled = 0;
  private lastRaw: number | null = null;

  /**
   * Server time advances `rate` times as fast as the local clock (host_timescale on a listen server):
   * local time is read through a scaled timeline, continuous across a change, so the estimate does not jump.
   */
  setRate(rate: number): void {
    this.rate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  }

  /** Local ms → seconds on the (scaled) timeline. */
  private toLocal(localMs: number): number {
    if (this.rate === 1 && this.scaled === 0) return localMs / 1000;
    if (this.lastRaw === null) {
      this.lastRaw = localMs;
      this.scaled = localMs / 1000;
      return this.scaled;
    }
    const d = (localMs - this.lastRaw) / 1000;
    if (d < 0) return this.scaled + d * this.rate;
    this.scaled += d * this.rate;
    this.lastRaw = localMs;
    return this.scaled;
  }

  /** A snapshot for `tick` arrived at local time `localMs`. */
  onSnapshot(tick: number, localMs: number): void {
    const now = this.toLocal(localMs);
    // A snapshot still in flight when the clock was held counts as arriving at the hold.
    const local = this.heldAt ?? now;
    const sample = tick * this.tickInterval - local;
    this.window.push({ at: local, offset: sample });
    while (this.window.length > 0 && this.window[0].at < local - this.windowSeconds)
      this.window.shift();
    if (!this.synced) {
      this.offset = sample;
      this.synced = true;
      this.lastLocal = local;
    }
  }

  get isSynced(): boolean {
    return this.synced;
  }

  /** Forget the estimate (the listen server resumed from a pause): the next snapshot sets it afresh. */
  resync(): void {
    this.synced = false;
    this.window.length = 0;
    this.heldAt = null;
  }

  /**
   * Stop the clock (the listen server holds its match: an offline pause). The server time stands still
   * until `release`, which rebases the estimate by the time spent held — the server's clock restarts from
   * the tick it stopped on (MatchRunner.setPaused), so prediction and interpolation carry on from where
   * they were instead of starting over, and nothing is corrected on resume.
   */
  hold(localMs: number): void {
    if (this.heldAt !== null || !this.synced) return;
    this.heldTime = this.serverTime(localMs);
    this.heldAt = this.lastLocal;
  }

  release(localMs: number): void {
    if (this.heldAt === null) return;
    const local = this.toLocal(localMs);
    const held = Math.max(0, local - this.heldAt);
    this.heldAt = null;
    this.offset -= held;
    for (const s of this.window) {
      s.offset -= held;
      s.at += held;
    }
    this.lastLocal = local;
  }

  get isHeld(): boolean {
    return this.heldAt !== null;
  }

  /** The estimated current server time (seconds). Call once per frame, with a monotonic clock. */
  serverTime(localMs: number): number {
    const local = this.toLocal(localMs);
    if (!this.synced) return 0;
    if (this.heldAt !== null) return this.heldTime;
    let target = -Infinity;
    for (const s of this.window) if (s.offset > target) target = s.offset;
    const dt = Math.max(0, local - this.lastLocal);
    this.lastLocal = local;
    if (Number.isFinite(target)) {
      const err = target - this.offset;
      if (Math.abs(err) > 0.25) this.offset = target;
      else {
        const step = this.slew * dt;
        this.offset += err > step ? step : err < -step ? -step : err;
      }
    }
    return local + this.offset;
  }

  /** The time other entities are drawn at. */
  renderTime(localMs: number): number {
    return this.serverTime(localMs) - this.interp;
  }
}

// ─── Buffer ─────────────────────────────────────────────────────────────────

interface Sample {
  t: number;
  serial: number;
  values: readonly NetValue[];
  /** A teleport happened between the previous sample and this one. */
  teleport: boolean;
}

interface Track {
  schema: NetSchema;
  samples: Sample[];
  /** Field indices by role. */
  lerp: number[];
  angle: number[];
  step: number[];
  pos: [number, number, number] | null;
  vel: [number, number, number] | null;
  forceTeleport: boolean;
}

export type SampleResult = 'interpolated' | 'extrapolated' | 'held' | 'none';

const LERP_KINDS: ReadonlySet<NetFieldKind> = new Set<NetFieldKind>(['coord', 'f32']);
const ANGLE_KINDS: ReadonlySet<NetFieldKind> = new Set<NetFieldKind>(['angle8', 'angle16']);

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return a + d * t;
}

export class InterpolationBuffer {
  private readonly tracks = new Map<number, Track>();

  /** Records an entity's state at server time `t` (seconds). Call for every entity in each snapshot. */
  push(t: number, state: EntityState): void {
    let tr = this.tracks.get(state.key);
    if (!tr || tr.schema !== state.schema) {
      tr = makeTrack(state.schema);
      this.tracks.set(state.key, tr);
    }
    const last = tr.samples[tr.samples.length - 1];
    if (last && t <= last.t) return;
    let teleport = tr.forceTeleport || !last || last.serial !== state.serial;
    tr.forceTeleport = false;
    if (!teleport && last && tr.pos) {
      const [ix, iy, iz] = tr.pos;
      const dx = num(state.values[ix]) - num(last.values[ix]);
      const dy = num(state.values[iy]) - num(last.values[iy]);
      const dz = num(state.values[iz]) - num(last.values[iz]);
      const limit = Math.max(TELEPORT_MIN_DISTANCE, TELEPORT_SPEED * (t - last.t));
      if (dx * dx + dy * dy + dz * dz > limit * limit) teleport = true;
    }
    if (last && last.serial !== state.serial) tr.samples.length = 0;
    tr.samples.push({ t, serial: state.serial, values: state.values, teleport });
    if (tr.samples.length > MAX_SAMPLES) tr.samples.shift();
  }

  /** The entity left the snapshot. */
  remove(key: number): void {
    this.tracks.delete(key);
  }

  /** The server moved it (teleport event): do not slide into the next sample. */
  teleported(key: number): void {
    const tr = this.tracks.get(key);
    if (tr) tr.forceTeleport = true;
  }

  has(key: number): boolean {
    return this.tracks.has(key);
  }

  /** Drops samples older than `t` minus a margin (call once per frame with the render time). */
  prune(renderTime: number): void {
    for (const tr of this.tracks.values()) {
      while (tr.samples.length > 2 && tr.samples[1].t < renderTime - 0.5) tr.samples.shift();
    }
  }

  /**
   * Writes the entity's fields at `renderTime` into `out`. Returns how: blended
   * between two samples, extrapolated, held at an end, or 'none' (unknown key).
   */
  sample(key: number, renderTime: number, out: NetRecord): SampleResult {
    const tr = this.tracks.get(key);
    if (!tr || tr.samples.length === 0) return 'none';
    const s = tr.samples;
    const fields = tr.schema.fields;
    const newest = s[s.length - 1];
    if (renderTime >= newest.t) {
      writeAll(fields, newest.values, out);
      const dt = Math.min(renderTime - newest.t, MAX_EXTRAPOLATION);
      if (dt <= 0 || !tr.pos) return 'held';
      let vx = 0;
      let vy = 0;
      let vz = 0;
      if (tr.vel) {
        vx = num(newest.values[tr.vel[0]]);
        vy = num(newest.values[tr.vel[1]]);
        vz = num(newest.values[tr.vel[2]]);
      }
      if (vx === 0 && vy === 0 && vz === 0 && s.length >= 2 && !newest.teleport) {
        const prev = s[s.length - 2];
        const span = newest.t - prev.t;
        if (span > 0) {
          vx = (num(newest.values[tr.pos[0]]) - num(prev.values[tr.pos[0]])) / span;
          vy = (num(newest.values[tr.pos[1]]) - num(prev.values[tr.pos[1]])) / span;
          vz = (num(newest.values[tr.pos[2]]) - num(prev.values[tr.pos[2]])) / span;
        }
      }
      if (vx === 0 && vy === 0 && vz === 0) return 'held';
      out[fields[tr.pos[0]].name] = num(newest.values[tr.pos[0]]) + vx * dt;
      out[fields[tr.pos[1]].name] = num(newest.values[tr.pos[1]]) + vy * dt;
      out[fields[tr.pos[2]].name] = num(newest.values[tr.pos[2]]) + vz * dt;
      return 'extrapolated';
    }
    if (renderTime <= s[0].t) {
      writeAll(fields, s[0].values, out);
      return 'held';
    }
    let i = s.length - 1;
    while (i > 0 && s[i - 1].t > renderTime) i--;
    const a = s[i - 1];
    const b = s[i];
    if (b.teleport) {
      writeAll(fields, a.values, out);
      return 'interpolated';
    }
    const f = (renderTime - a.t) / (b.t - a.t);
    for (const k of tr.step) out[fields[k].name] = a.values[k];
    for (const k of tr.lerp) {
      const va = num(a.values[k]);
      out[fields[k].name] = va + (num(b.values[k]) - va) * f;
    }
    for (const k of tr.angle)
      out[fields[k].name] = lerpAngle(num(a.values[k]), num(b.values[k]), f);
    return 'interpolated';
  }
}

function num(v: NetValue | undefined): number {
  return typeof v === 'number' ? v : v ? 1 : 0;
}

function writeAll(fields: NetSchema['fields'], values: readonly NetValue[], out: NetRecord): void {
  for (let i = 0; i < fields.length; i++) out[fields[i].name] = values[i];
}

function makeTrack(schema: NetSchema): Track {
  const lerp: number[] = [];
  const angle: number[] = [];
  const step: number[] = [];
  const idx = (n: string) => schema.fields.findIndex((f) => f.name === n);
  for (let i = 0; i < schema.fields.length; i++) {
    const f = schema.fields[i];
    if (f.private) step.push(i);
    else if (LERP_KINDS.has(f.kind)) lerp.push(i);
    else if (ANGLE_KINDS.has(f.kind)) angle.push(i);
    else step.push(i);
  }
  const ox = idx('ox');
  const oy = idx('oy');
  const oz = idx('oz');
  const vx = idx('vx');
  const vy = idx('vy');
  const vz = idx('vz');
  return {
    schema,
    samples: [],
    lerp,
    angle,
    step,
    pos: ox >= 0 && oy >= 0 && oz >= 0 ? [ox, oy, oz] : null,
    vel: vx >= 0 && vy >= 0 && vz >= 0 ? [vx, vy, vz] : null,
    forceTeleport: false,
  };
}
