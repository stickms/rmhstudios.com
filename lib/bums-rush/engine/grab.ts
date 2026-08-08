/**
 * The grab (§3.3) — attach, latch, tear.
 *
 * Three things here are deliberate and easy to "fix" into a worse game:
 *
 * 1. **The grip persists while the button is held, even if the target moves
 *    away.** You are holding on, not overlapping. Re-querying every frame would
 *    make a moving platform shed its riders.
 * 2. **Grip strength is finite.** A four-player chain hanging off one hand
 *    *can* tear, and the tear is telegraphed by `tension` crossing
 *    `GRIP_WARN_RATIO`. Removing the break force to stop chains snapping
 *    removes the drama the chains exist for.
 * 3. **Hand beats head.** A deliberate handshake must win over an accidental
 *    headlock, or four players in one gap resolve into a scrum of neck grabs.
 *
 * Tension is reported in matter force units so it can be read as multiples of a
 * character's weight (`1.84 × 1.15 × 0.001 = 0.00212`). It is derived from the
 * grip constraint's residual separation rather than from any number matter
 * exposes, because matter exposes none — see `GRIP_TENSION_GAIN` for the
 * calibration and `__tests__/grab.test.ts` for the assertion that keeps it
 * honest.
 */

import Matter from 'matter-js';
import { MATERIALS, NET } from '../constants';
import type { MaterialId, SeatIndex, Vec2 } from '../types';
import type { Character } from './character';
import { DT2, ENGINE, GRAVITY_STEP, P } from './tuning';
import { correctPosition, type BodyMeta, type PhysWorld } from './world';

const { Body, Constraint } = Matter;

export interface Grip {
  active: boolean;
  seat: SeatIndex;
  hand: 'l' | 'r';
  constraint: Matter.Constraint | null;
  target: Matter.Body | null;
  targetSeat: SeatIndex | -1;
  targetRef: string;
  material: MaterialId;
  /** Break force at a full grip — material and grease applied, trigger not. */
  baseBreak: number;
  /** Effective break force after material, analog pull and grease. */
  breakForce: number;
  /** Smoothed transmitted force, in matter force units. */
  load: number;
  /** 0..1 of `breakForce` — drives the thinning stroke and the rumble ramp. */
  tension: number;
  heldMs: number;
  /** `crumbly` surfaces give way after ENGINE.CRUMBLY_HOLD_MS in one grip. */
  crumbleMs: number;
  /** Attach point in the target's local frame, so re-projection is exact. */
  localX: number;
  localY: number;
}

export interface GrabHit {
  body: Matter.Body | null;
  meta: BodyMeta | null;
  priority: number;
  x: number;
  y: number;
  dist: number;
}

export interface GrabContext {
  world: PhysWorld;
  characters: (Character | null)[];
  nowMs: number;
  pvp: boolean;
  /**
   * Frame to resolve the query against, or -1 for "now". Set by
   * `Simulation.resolveGrabAt` for a guest's rising grip edge (§9.5) and reset
   * immediately after — a field rather than a parameter so the per-step
   * "reaching" sweep costs no argument shuffling.
   */
  rewindFrame: number;
}

export interface GrabState {
  grips: Grip[];
  /** Per (seat, targetSeat) re-grip lockout after a PvP cap expiry (§8.3). */
  pvpCooldown: Float64Array;
  history: History;
  lastHit: GrabHit;
}

const HANDS_PER_SEAT = 2;

export function createGrabState(trackedSlots: number): GrabState {
  const grips: Grip[] = [];
  for (let seat = 0; seat < NET.MAX_SEATS; seat++) {
    for (let h = 0; h < HANDS_PER_SEAT; h++) {
      grips.push({
        active: false,
        seat: seat as SeatIndex,
        hand: h === 0 ? 'l' : 'r',
        constraint: null,
        target: null,
        targetSeat: -1,
        targetRef: '',
        material: 'paper',
        baseBreak: P.GRIP_BREAK_FORCE,
        breakForce: P.GRIP_BREAK_FORCE,
        load: 0,
        tension: 0,
        heldMs: 0,
        crumbleMs: 0,
        localX: 0,
        localY: 0,
      });
    }
  }
  return {
    grips,
    pvpCooldown: new Float64Array(NET.MAX_SEATS * NET.MAX_SEATS),
    history: createHistory(trackedSlots),
    lastHit: { body: null, meta: null, priority: -1, x: 0, y: 0, dist: Infinity },
  };
}

export function gripFor(state: GrabState, seat: SeatIndex, hand: 'l' | 'r'): Grip {
  return state.grips[seat * HANDS_PER_SEAT + (hand === 'l' ? 0 : 1)];
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

const closestScratch: Vec2 = { x: 0, y: 0 };
const rewindScratch: Transform = { x: 0, y: 0, angle: 0 };

/**
 * Squared distance from (x, y) to the nearest point of `body`'s surface, with
 * that point written into `out`. Zero when the point is inside. matter stores
 * circles as many-sided polygons, so one polygon path covers every shape we
 * make.
 */
export function closestPointOnBody(body: Matter.Body, x: number, y: number, out: Vec2): number {
  let best = Infinity;
  for (const part of body.parts) {
    if (body.parts.length > 1 && part === body) continue;
    const verts = part.vertices;
    let inside = true;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const a = verts[j];
      const b = verts[i];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      // matter keeps vertices clockwise in screen space, so an outside point
      // has a positive cross product against at least one edge.
      if ((x - a.x) * ey - (y - a.y) * ex > 0) inside = false;
      const len2 = ex * ex + ey * ey || 1;
      let t = ((x - a.x) * ex + (y - a.y) * ey) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + ex * t;
      const py = a.y + ey * t;
      const d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < best) {
        best = d;
        closestScratch.x = px;
        closestScratch.y = py;
      }
    }
    if (inside) {
      out.x = x;
      out.y = y;
      return 0;
    }
  }
  out.x = closestScratch.x;
  out.y = closestScratch.y;
  return best;
}

function priorityOf(meta: BodyMeta, seat: SeatIndex): number {
  if (meta.seat === seat) return -1;
  switch (meta.role) {
    case 'hand':
      return 3;
    case 'head':
      return 2;
    case 'prop':
    case 'carry':
      return 1;
    default:
      return 0;
  }
}

/**
 * §3.3 step 1–2. Highest priority wins outright; ties go to the nearest, so a
 * player reaching into a cluster of hands gets the one they are actually
 * closest to rather than the one that happens to be first in the array.
 */
export function queryGrab(
  ctx: GrabContext,
  state: GrabState,
  seat: SeatIndex,
  hx: number,
  hy: number,
  radius: number,
  out: GrabHit,
): boolean {
  out.body = null;
  out.meta = null;
  out.priority = -1;
  out.dist = Infinity;
  const r2 = radius * radius;
  const bodies = ctx.world.grabbables;
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const meta = ctx.world.meta.get(body.id);
    if (!meta || !meta.grabbable) continue;
    const prio = priorityOf(meta, seat);
    if (prio < 0) continue;
    if (prio < out.priority) continue;

    // Lag compensation, the half that matters: the query point is carried into
    // the target's *present* frame through the target's transform at `frame`,
    // so a grab issued against a moving platform lands where the player saw it
    // and then rides the platform's current position. You grab what you saw.
    let px = hx;
    let py = hy;
    if (ctx.rewindFrame >= 0 && meta.histIndex >= 0) {
      if (sampleHistory(state.history, ctx.rewindFrame, meta.histIndex, rewindScratch)) {
        const dx = hx - rewindScratch.x;
        const dy = hy - rewindScratch.y;
        const c = Math.cos(-rewindScratch.angle);
        const s = Math.sin(-rewindScratch.angle);
        const lx = dx * c - dy * s;
        const ly = dx * s + dy * c;
        const cc = Math.cos(body.angle);
        const ss = Math.sin(body.angle);
        px = body.position.x + lx * cc - ly * ss;
        py = body.position.y + lx * ss + ly * cc;
      }
    }

    // Cheap AABB reject before the per-edge walk.
    if (
      px < body.bounds.min.x - radius ||
      px > body.bounds.max.x + radius ||
      py < body.bounds.min.y - radius ||
      py > body.bounds.max.y + radius
    ) {
      continue;
    }
    if (meta.seat >= 0) {
      const other = ctx.characters[meta.seat];
      if (!other || other.state === 'dead' || other.state === 'respawning') continue;
      if (ctx.pvp && ctx.nowMs < other.invulnUntilMs) continue;
      if (ctx.pvp && ctx.nowMs < state.pvpCooldown[seat * NET.MAX_SEATS + meta.seat]) continue;
    }
    const d2 = closestPointOnBody(body, px, py, closestScratch);
    if (d2 > r2) continue;
    if (prio > out.priority || d2 < out.dist) {
      out.body = body;
      out.meta = meta;
      out.priority = prio;
      out.dist = d2;
      out.x = closestScratch.x;
      out.y = closestScratch.y;
    }
  }
  return out.body !== null;
}

// ─── Attach / detach ────────────────────────────────────────────────────────

export function attachGrip(
  ctx: GrabContext,
  state: GrabState,
  ch: Character,
  hand: 'l' | 'r',
  hit: GrabHit,
  gripScale: number,
): void {
  const grip = gripFor(state, ch.seat, hand);
  if (grip.active) detachGrip(ctx, state, grip, false);
  const arm = hand === 'l' ? ch.arms[0] : ch.arms[1];
  const target = hit.body;
  const meta = hit.meta;
  if (!target || !meta) return;

  const c = Math.cos(target.angle);
  const s = Math.sin(target.angle);
  const dx = hit.x - target.position.x;
  const dy = hit.y - target.position.y;
  grip.localX = dx * c + dy * s;
  grip.localY = -dx * s + dy * c;

  // A static target is anchored by world point rather than by body: matter
  // would otherwise keep rotating `pointB` against a body that never moves, and
  // a world-point constraint is the one case where the solver has a genuinely
  // infinite mass on the far side, which is what a ledge is.
  const options: Matter.IConstraintDefinition = target.isStatic
    ? { bodyA: arm.hand, pointA: { x: 0, y: 0 }, pointB: { x: hit.x, y: hit.y } }
    : {
        bodyA: arm.hand,
        pointA: { x: 0, y: 0 },
        bodyB: target,
        pointB: { x: grip.localX, y: grip.localY },
      };
  options.length = 0;
  options.stiffness = P.GRIP_STIFFNESS;
  options.damping = P.GRIP_DAMPING;
  options.label = 'grip';
  const constraint = Constraint.create(options);
  ctx.world.addConstraint(constraint);

  grip.active = true;
  grip.constraint = constraint;
  grip.target = target;
  grip.targetSeat = meta.seat;
  grip.targetRef = meta.refId;
  grip.material = meta.material;
  grip.baseBreak = breakForceFor(ch, arm.greaseUntilMs > ctx.nowMs, meta.material, 1);
  grip.breakForce = grip.baseBreak * gripScale;
  grip.load = 0;
  grip.tension = 0;
  grip.heldMs = 0;
  grip.crumbleMs = 0;
}

export function breakForceFor(
  ch: Character,
  greased: boolean,
  material: MaterialId,
  gripScale: number,
): number {
  if (ch.assists.stickyGrip) return Infinity;
  const mat = MATERIALS[material].grip;
  const coat = greased ? MATERIALS.grease.grip : 1;
  return P.GRIP_BREAK_FORCE * mat * coat * gripScale;
}

/**
 * Release assist (§3.4): letting go within `RELEASE_ASSIST_WINDOW_MS` of the
 * peak of the swing scales the outgoing impulse by 1.08. It is invisible, and
 * it is what makes "let go at the top of the arc" reward timing rather than
 * luck. It fires on a voluntary release only — a torn grip is a punishment and
 * must not also be a boost.
 */
export function detachGrip(ctx: GrabContext, state: GrabState, grip: Grip, voluntary: boolean): void {
  if (!grip.active) return;
  if (grip.constraint) ctx.world.removeConstraint(grip.constraint);
  const ch = ctx.characters[grip.seat];
  if (voluntary && ch) {
    const arm = grip.hand === 'l' ? ch.arms[0] : ch.arms[1];
    if (ctx.nowMs - arm.peakAtMs <= P.RELEASE_ASSIST_WINDOW_MS) {
      scaleVelocity(ch.head, P.RELEASE_ASSIST_SCALE);
      scaleVelocity(arm.hand, P.RELEASE_ASSIST_SCALE);
    }
  }
  if (ctx.pvp && grip.targetSeat >= 0) {
    state.pvpCooldown[grip.seat * NET.MAX_SEATS + grip.targetSeat] =
      ctx.nowMs + P.PVP_GRIP_COOLDOWN_MS;
  }
  grip.active = false;
  grip.constraint = null;
  grip.target = null;
  grip.targetSeat = -1;
  grip.targetRef = '';
  grip.tension = 0;
  grip.heldMs = 0;
  grip.crumbleMs = 0;
}

const velScratch: Vec2 = { x: 0, y: 0 };

function scaleVelocity(body: Matter.Body, k: number): void {
  velScratch.x = body.velocity.x * k;
  velScratch.y = body.velocity.y * k;
  Body.setVelocity(body, velScratch);
}

// ─── Tension ────────────────────────────────────────────────────────────────

/** Every part of one character, in matter mass units. */
const CHARACTER_MASS = P.HEAD_MASS + P.ARM_SEGMENTS * 2 * P.ARM_SEG_MASS + 2 * P.HAND_MASS;

/**
 * The load in a grip, in matter force units, by Newton rather than by
 * inference.
 *
 * The obvious measure — read the constraint's residual separation and multiply
 * by its stiffness — is what this used to do, and it is quietly wrong in the
 * one situation the game is about. A player hauling on a handhold pushes their
 * hand *into* the anchor, which shrinks the separation while the weight below
 * is unchanged; measured, a four-player chain whose members were pulling
 * themselves up reported one percent of the load it was actually carrying, and
 * a chain that cannot report its load cannot tear.
 *
 * So instead: find everything hanging from this grip, and sum `m × (a − g)`.
 * That is the force the grip must be supplying, exactly, whatever the solver
 * and the arm controller are doing between them. A body at rest returns its own
 * weight; a body being accelerated returns the extra. Tensions are therefore
 * readable as multiples of `CHARACTER_MASS × GRAVITY_Y × 0.001` — one player.
 */
export function gripLoad(ctx: GrabContext, state: GrabState, grip: Grip): number {
  const carried = hangingSeats(state, grip);
  let fx = 0;
  let fy = 0;
  for (let seat = 0; seat < NET.MAX_SEATS; seat++) {
    if ((carried & (1 << seat)) === 0) continue;
    const ch = ctx.characters[seat];
    if (!ch) continue;
    fx += CHARACTER_MASS * ch.accX;
    fy += CHARACTER_MASS * (ch.accY - GRAVITY_STEP);
  }
  return Math.hypot(fx, fy) / DT2;
}

/**
 * Bitmask of the seats on the hanging side of `grip` — the component holding
 * `grip.seat` once this grip's own link is cut. Four seats, so a bitmask BFS is
 * both the shortest and the fastest way to write it.
 */
function hangingSeats(state: GrabState, grip: Grip): number {
  let frontier = 1 << grip.seat;
  let seen = frontier;
  while (frontier !== 0) {
    let next = 0;
    for (const other of state.grips) {
      if (!other.active || other.targetSeat < 0) continue;
      if (other === grip) continue;
      const a = 1 << other.seat;
      const b = 1 << other.targetSeat;
      if ((frontier & a) !== 0 && (seen & b) === 0) next |= b;
      if ((frontier & b) !== 0 && (seen & a) === 0) next |= a;
    }
    seen |= next;
    frontier = next;
  }
  return seen;
}

/**
 * Pull an over-stretched grip back to its slack.
 *
 * matter holds a zero-length constraint by separating: with a 0.12 kg hand the
 * separation needed to carry even one other player is tens of pixels, and a
 * four-player chain measured 130 px of daylight between a hand and the hand it
 * was holding. That is not a grip, it is a rubber band, and it is why the lower
 * half of a chain kept accelerating downward while every grip still read as
 * held. The same position-based limiter the arms use fixes it: inside the slack
 * it does nothing, past the slack the grip is a rope.
 */
export function limitGrip(grip: Grip): void {
  const c = grip.constraint;
  if (!c || !c.bodyA) return;
  const ax = c.bodyA.position.x + (c.pointA ? c.pointA.x : 0);
  const ay = c.bodyA.position.y + (c.pointA ? c.pointA.y : 0);
  const bx = (c.bodyB ? c.bodyB.position.x : 0) + (c.pointB ? c.pointB.x : 0);
  const by = (c.bodyB ? c.bodyB.position.y : 0) + (c.pointB ? c.pointB.y : 0);
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.hypot(dx, dy);
  if (d <= ENGINE.GRIP_SLACK_PX || d < 1e-6) return;
  const wa = c.bodyA.isStatic ? 0 : c.bodyA.inverseMass;
  const wb = c.bodyB && !c.bodyB.isStatic ? c.bodyB.inverseMass : 0;
  const wsum = wa + wb;
  if (wsum <= 0) return;
  const excess = d - ENGINE.GRIP_SLACK_PX;
  const nx = (dx / d) * excess;
  const ny = (dy / d) * excess;
  correctPosition(c.bodyA, (nx * wa) / wsum, (ny * wa) / wsum);
  if (c.bodyB && !c.bodyB.isStatic) correctPosition(c.bodyB, (-nx * wb) / wsum, (-ny * wb) / wsum);
}

/** Ran every step after `Engine.update`. Returns the grips that tore. */
export function updateGrips(
  ctx: GrabContext,
  state: GrabState,
  dtMs: number,
  onBreak: (grip: Grip) => void,
  onCrumble: (grip: Grip) => void,
): void {
  for (const grip of state.grips) {
    if (!grip.active) continue;
    grip.heldMs += dtMs;
    // A position-based constraint reports its load as a residual separation
    // that alternates between correcting and re-separating, so the raw figure
    // swings by a factor of three between consecutive steps. Smoothing it is
    // not cosmetic: a grip that tears on a single-frame numerical spike tears
    // for no reason a player can see, and catching a fall spikes hardest of
    // all. Four steps of memory is short enough that a real overload still
    // tears inside 70 ms.
    const force = gripLoad(ctx, state, grip);
    grip.load = grip.heldMs <= dtMs ? force : grip.load * 0.75 + force * 0.25;
    grip.tension = grip.breakForce === Infinity ? 0 : Math.min(1, grip.load / grip.breakForce);
    if (grip.material === 'crumbly') {
      grip.crumbleMs += dtMs;
      if (grip.crumbleMs >= ENGINE.CRUMBLY_HOLD_MS) {
        onCrumble(grip);
        continue;
      }
    }

    // §8.3 — no infinite hold on another player, or one strong player pins
    // another for a whole Showdown round.
    if (ctx.pvp && grip.targetSeat >= 0 && grip.heldMs >= P.PVP_GRIP_MAX_MS) {
      detachGrip(ctx, state, grip, false);
      continue;
    }

    if (grip.load > grip.breakForce) {
      onBreak(grip);
      detachGrip(ctx, state, grip, false);
    }
  }
}

/** Rolling peak of the swing, so `detachGrip` can tell a timed release. */
export function trackSwingPeak(ch: Character, nowMs: number): void {
  const speed = Math.hypot(ch.head.velocity.x, ch.head.velocity.y);
  for (const arm of ch.arms) {
    // A peak older than a quarter second is not the swing the player is in.
    if (nowMs - arm.peakAtMs > 250) {
      arm.peakSpeed = speed;
      arm.peakAtMs = nowMs;
    } else if (speed >= arm.peakSpeed) {
      arm.peakSpeed = speed;
      arm.peakAtMs = nowMs;
    }
  }
}

// ─── Lag compensation (§9.5) ────────────────────────────────────────────────

export interface History {
  capacity: number;
  slots: number;
  frames: Int32Array;
  data: Float32Array;
  head: number;
  count: number;
}

/** NET.LAGCOMP_MAX_MS of rewind, plus two frames of slack for a late packet. */
export const LAGCOMP_FRAMES = Math.ceil(NET.LAGCOMP_MAX_MS / P.FIXED_DT_MS) + 2;

export function createHistory(slots: number): History {
  const capacity = LAGCOMP_FRAMES;
  return {
    capacity,
    slots,
    frames: new Int32Array(capacity).fill(-1),
    data: new Float32Array(capacity * slots * 3),
    head: 0,
    count: 0,
  };
}

/** Reallocates. Only ever called from `addSeat`, never from the step path. */
export function growHistory(h: History, slots: number): History {
  if (slots <= h.slots) return h;
  const next = createHistory(slots);
  return next;
}

export function recordHistory(h: History, frame: number, tracked: Matter.Body[]): void {
  h.head = (h.head + 1) % h.capacity;
  h.frames[h.head] = frame;
  const base = h.head * h.slots * 3;
  const n = Math.min(tracked.length, h.slots);
  for (let i = 0; i < n; i++) {
    const b = tracked[i];
    const o = base + i * 3;
    h.data[o] = b.position.x;
    h.data[o + 1] = b.position.y;
    h.data[o + 2] = b.angle;
  }
  if (h.count < h.capacity) h.count++;
}

export interface Transform {
  x: number;
  y: number;
  angle: number;
}

/**
 * The world as it was at `frame`, clamped to the buffer. Beyond the clamp the
 * caller gets the newest state it has — a laggy player may not grab something
 * that no longer exists, which is the point of bounding the rewind (§9.5).
 */
export function sampleHistory(h: History, frame: number, slot: number, out: Transform): boolean {
  if (slot < 0 || slot >= h.slots || h.count === 0) return false;
  let best = -1;
  let bestDelta = Infinity;
  for (let i = 0; i < h.capacity; i++) {
    const f = h.frames[i];
    if (f < 0) continue;
    const d = Math.abs(f - frame);
    if (d < bestDelta) {
      bestDelta = d;
      best = i;
    }
  }
  if (best < 0) return false;
  const o = (best * h.slots + slot) * 3;
  out.x = h.data[o];
  out.y = h.data[o + 1];
  out.angle = h.data[o + 2];
  return true;
}
