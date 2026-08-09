/**
 * Every `Prop` kind in `types.ts` (§6.2).
 *
 * Props are the level format's whole vocabulary, so the rule here is that a
 * prop is *data plus one update function* — never a new physics concept. A
 * `swing` is a body on a pivot constraint; a `conveyor` is a surface that
 * writes tangential velocity; a `popCannon` is an impulse applied to whatever
 * is standing in a rectangle. Anything that needed a new solver would also need
 * a new authoring rule, and eight level agents cannot author against a moving
 * target.
 *
 * Bodies that carry things (`platformMoving`, `skiLift`) are static bodies moved
 * through `moveCarrying` rather than dynamic bodies with velocity.
 * That keeps them immovable by players — a four-player chain hauling on a
 * moving platform must not be able to stop it — while still handing matter the
 * surface velocity its friction solver needs to carry riders.
 */

import Matter from 'matter-js';
import { MATERIALS } from '../constants';
import type { GameEvent, MaterialId, Prop, PropKind, SeatIndex, Vec2 } from '../types';
import type { Character } from './character';
import { startStretchInk } from './character';
import type { Rng } from './rng';
import type { SignalBus } from './signals';
import { ENGINE, GRAVITY_SCALE, P } from './tuning';
import { defaultMeta, FILTERS, moveCarrying, shapeContains, type PhysWorld } from './world';

const { Bodies, Body, Constraint } = Matter;

export interface PropRuntime {
  prop: Prop;
  kind: PropKind;
  body: Matter.Body | null;
  /** Rope/skiLift build several bodies; the first is `body`. */
  extra: Matter.Body[];
  constraints: Matter.Constraint[];
  active: boolean;
  progress: number;
  carriedBy: SeatIndex | -1;
  carryLink: Matter.Constraint | null;
  consumed: boolean;
  charges: number;
  cooldownUntil: number;
  /** Path position for kinematic props, 0..path segments. */
  t: number;
  dir: 1 | -1;
  holdMs: number;
  latched: boolean;
  /** `plate` accumulator (§6.6 W2). */
  filled: string[];
  home: Vec2;
}

export interface PropContext {
  world: PhysWorld;
  characters: (Character | null)[];
  signals: SignalBus;
  nowMs: number;
  rng: Rng;
  emit(event: GameEvent): void;
}

const CARRYABLE: ReadonlySet<PropKind> = new Set<PropKind>([
  'relic',
  'key',
  'parcel',
  'camera',
  'thruster',
  'paperweight',
  'stretchInk',
]);

const forceScratch: Vec2 = { x: 0, y: 0 };
const posScratch: Vec2 = { x: 0, y: 0 };
const velScratch: Vec2 = { x: 0, y: 0 };

function blank(prop: Prop): PropRuntime {
  return {
    prop,
    kind: prop.kind,
    body: null,
    extra: [],
    constraints: [],
    active: false,
    progress: 0,
    carriedBy: -1,
    carryLink: null,
    consumed: false,
    charges: 0,
    cooldownUntil: 0,
    t: 0,
    dir: 1,
    holdMs: 0,
    latched: false,
    filled: [],
    home: { x: prop.at.x, y: prop.at.y },
  };
}

export function createProps(world: PhysWorld, props: Prop[], signals: SignalBus): PropRuntime[] {
  const out: PropRuntime[] = [];
  for (const prop of props) out.push(createProp(world, prop, signals));
  return out;
}

function addPropBody(
  world: PhysWorld,
  rt: PropRuntime,
  body: Matter.Body,
  grabbable: boolean,
  material: MaterialId = 'paper',
): Matter.Body {
  world.add(
    body,
    defaultMeta({
      role: 'prop',
      grabbable: grabbable && MATERIALS[material].grip > 0,
      material,
      refId: rt.prop.id,
    }),
  );
  return body;
}

function createProp(world: PhysWorld, prop: Prop, signals: SignalBus): PropRuntime {
  const rt = blank(prop);
  const at = prop.at;

  switch (prop.kind) {
    case 'crate': {
      const body = Bodies.rectangle(at.x, at.y, prop.size.x, prop.size.y, {
        collisionFilter: FILTERS.prop,
        angle: prop.angle ?? 0,
        friction: MATERIALS[prop.material ?? 'paper'].friction,
        label: `crate-${prop.id}`,
      });
      if (prop.mass) Body.setMass(body, prop.mass);
      rt.body = addPropBody(world, rt, body, true, prop.material ?? 'paper');
      break;
    }
    case 'swing': {
      const bar = Bodies.rectangle(at.x, at.y + prop.length / 2, 12, prop.length, {
        collisionFilter: FILTERS.prop,
        frictionAir: prop.damping ?? 0.01,
        label: `swing-${prop.id}`,
      });
      rt.body = addPropBody(world, rt, bar, true);
      const pivot = Constraint.create({
        pointA: { x: at.x, y: at.y },
        bodyB: bar,
        pointB: { x: 0, y: -prop.length / 2 },
        length: 0,
        stiffness: 1,
        label: 'pivot',
      });
      rt.constraints.push(pivot);
      world.addConstraint(pivot);
      break;
    }
    case 'rope': {
      let prev: Matter.Body | null = null;
      for (let i = 0; i < prop.segments; i++) {
        const seg = Bodies.circle(at.x, at.y + ENGINE.ROPE_SEG_LENGTH * (i + 0.5), 6, {
          collisionFilter: FILTERS.prop,
          frictionAir: 0.02,
          label: `rope-${prop.id}-${i}`,
        });
        Body.setMass(seg, 0.08);
        addPropBody(world, rt, seg, true);
        if (i === 0) rt.body = seg;
        else rt.extra.push(seg);
        const link = Constraint.create(
          prev
            ? {
                bodyA: prev,
                bodyB: seg,
                length: ENGINE.ROPE_SEG_LENGTH,
                stiffness: prop.stiffness ?? 0.9,
                damping: 0.05,
              }
            : {
                pointA: { x: at.x, y: at.y },
                bodyB: seg,
                length: ENGINE.ROPE_SEG_LENGTH / 2,
                stiffness: 1,
              },
        );
        rt.constraints.push(link);
        world.addConstraint(link);
        prev = seg;
      }
      break;
    }
    case 'platformMoving': {
      const body = Bodies.rectangle(at.x, at.y, prop.size.x, prop.size.y, {
        isStatic: true,
        collisionFilter: FILTERS.prop,
        friction: MATERIALS[prop.material ?? 'paper'].friction,
        label: `platform-${prop.id}`,
      });
      rt.body = addPropBody(world, rt, body, true, prop.material ?? 'paper');
      break;
    }
    case 'platformFalling': {
      const body = Bodies.rectangle(at.x, at.y, prop.size.x, prop.size.y, {
        isStatic: true,
        collisionFilter: FILTERS.prop,
        friction: MATERIALS[prop.material ?? 'paper'].friction,
        label: `falling-${prop.id}`,
      });
      rt.body = addPropBody(world, rt, body, true, prop.material ?? 'paper');
      break;
    }
    case 'lever': {
      const bar = Bodies.rectangle(at.x, at.y - prop.length / 2, 10, prop.length, {
        collisionFilter: FILTERS.prop,
        frictionAir: 0.05,
        label: `lever-${prop.id}`,
      });
      rt.body = addPropBody(world, rt, bar, true);
      const pivot = Constraint.create({
        pointA: { x: at.x, y: at.y },
        bodyB: bar,
        pointB: { x: 0, y: prop.length / 2 },
        length: 0,
        stiffness: 1,
        label: 'pivot',
      });
      rt.constraints.push(pivot);
      world.addConstraint(pivot);
      signals.setSource(prop.signal, false);
      break;
    }
    case 'button': {
      const body = Bodies.rectangle(at.x, at.y, prop.size.x, prop.size.y, {
        isStatic: true,
        isSensor: true,
        collisionFilter: FILTERS.prop,
        label: `button-${prop.id}`,
      });
      rt.body = addPropBody(world, rt, body, false);
      signals.setSource(prop.signal, false);
      break;
    }
    case 'door': {
      const body = Bodies.rectangle(at.x, at.y, prop.size.x, prop.size.y, {
        isStatic: true,
        collisionFilter: FILTERS.prop,
        label: `door-${prop.id}`,
      });
      rt.body = addPropBody(world, rt, body, true);
      break;
    }
    case 'conveyor': {
      const body = Bodies.rectangle(at.x, at.y, prop.size.x, prop.size.y, {
        isStatic: true,
        collisionFilter: FILTERS.prop,
        friction: 1,
        label: `conveyor-${prop.id}`,
      });
      rt.body = addPropBody(world, rt, body, true);
      break;
    }
    case 'trampoline': {
      const body = Bodies.rectangle(at.x, at.y, prop.size.x, prop.size.y, {
        isStatic: true,
        collisionFilter: FILTERS.prop,
        restitution: prop.bounce,
        friction: 0.2,
        label: `trampoline-${prop.id}`,
      });
      rt.body = addPropBody(world, rt, body, true, 'rubber');
      break;
    }
    case 'skiLift': {
      for (let i = 0; i < prop.chairs; i++) {
        const chair = Bodies.rectangle(at.x, at.y, 44, 10, {
          isStatic: true,
          collisionFilter: FILTERS.prop,
          friction: 0.8,
          label: `lift-${prop.id}-${i}`,
        });
        addPropBody(world, rt, chair, true);
        if (i === 0) rt.body = chair;
        else rt.extra.push(chair);
      }
      break;
    }
    case 'popCannon': {
      const barrel = Bodies.rectangle(at.x, at.y, 90, 34, {
        isStatic: true,
        collisionFilter: FILTERS.prop,
        angle: prop.angle ?? 0,
        label: `cannon-${prop.id}`,
      });
      rt.body = addPropBody(world, rt, barrel, true, 'rubber');
      break;
    }
    case 'relic':
    case 'key':
    case 'parcel':
    case 'camera':
    case 'thruster':
    case 'paperweight':
    case 'stretchInk': {
      const body = Bodies.circle(at.x, at.y, 16, {
        collisionFilter: FILTERS.prop,
        frictionAir: 0.02,
        label: `${prop.kind}-${prop.id}`,
      });
      Body.setMass(body, 0.35);
      rt.body = addPropBody(world, rt, body, true);
      if (prop.kind === 'thruster') rt.charges = prop.charges;
      break;
    }
    case 'plate': {
      const body = Bodies.rectangle(at.x, at.y, 90, 12, {
        isStatic: true,
        isSensor: true,
        collisionFilter: FILTERS.prop,
        label: `plate-${prop.id}`,
      });
      rt.body = addPropBody(world, rt, body, false);
      break;
    }
    case 'signalRelay':
      signals.addRelay(prop);
      break;
    // Field props (`fan`, `magnet`, `zeroG`) and markers (`poseOutline`,
    // `rescueDrone`) have no collider at all — they are regions the update
    // sweeps, and giving them sensor bodies would only cost broadphase.
    case 'fan':
    case 'magnet':
    case 'zeroG':
    case 'poseOutline':
    case 'rescueDrone':
      break;
  }
  return rt;
}

// ─── Per-step update ────────────────────────────────────────────────────────

export function pathPoint(path: Vec2[], t: number, out: Vec2): void {
  if (path.length === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }
  if (path.length === 1) {
    out.x = path[0].x;
    out.y = path[0].y;
    return;
  }
  const span = path.length - 1;
  const clamped = t < 0 ? 0 : t > span ? span : t;
  const i = Math.min(span - 1, Math.floor(clamped));
  const f = clamped - i;
  out.x = path[i].x + (path[i + 1].x - path[i].x) * f;
  out.y = path[i].y + (path[i + 1].y - path[i].y) * f;
}

export function pathLength(path: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
  return total;
}

export function updateProps(ctx: PropContext, props: PropRuntime[], dtMs: number): void {
  const dt = dtMs / 1000;
  for (const rt of props) {
    switch (rt.kind) {
      case 'platformMoving':
      case 'skiLift': {
        const prop = rt.prop as Extract<Prop, { kind: 'platformMoving' | 'skiLift' }>;
        const path = prop.path;
        if (!rt.body || path.length < 2) break;
        const total = pathLength(path) || 1;
        const spans = path.length - 1;
        rt.t += (prop.speed * dt * spans) / total * rt.dir;
        const loop = rt.kind === 'skiLift' || (rt.prop as { loop?: boolean }).loop === true;
        if (rt.t > spans) {
          if (loop) rt.t -= spans;
          else {
            rt.t = spans;
            rt.dir = -1;
          }
        } else if (rt.t < 0) {
          if (loop) rt.t += spans;
          else {
            rt.t = 0;
            rt.dir = 1;
          }
        }
        pathPoint(path, rt.t, posScratch);
        moveCarrying(rt.body, posScratch.x, posScratch.y);
        for (let i = 0; i < rt.extra.length; i++) {
          const offset = ((i + 1) / (rt.extra.length + 1)) * spans;
          let t = rt.t + offset;
          while (t > spans) t -= spans;
          pathPoint(path, t, posScratch);
          moveCarrying(rt.extra[i], posScratch.x, posScratch.y);
        }
        rt.progress = rt.t / spans;
        break;
      }
      case 'platformFalling': {
        const prop = rt.prop as Extract<Prop, { kind: 'platformFalling' }>;
        if (!rt.body || !rt.active) break;
        rt.holdMs += dtMs;
        rt.progress = Math.min(1, rt.holdMs / prop.delayMs);
        if (rt.holdMs >= prop.delayMs && rt.body.isStatic) Body.setStatic(rt.body, false);
        break;
      }
      case 'lever': {
        const prop = rt.prop as Extract<Prop, { kind: 'lever' }>;
        if (!rt.body) break;
        const past = Math.abs(rt.body.angle) >= prop.threshold;
        const value = prop.latching ? rt.latched || past : past;
        if (past) rt.latched = true;
        rt.active = value;
        rt.progress = Math.min(1, Math.abs(rt.body.angle) / (prop.threshold || 1));
        ctx.signals.setSource(prop.signal, value);
        break;
      }
      case 'button': {
        const prop = rt.prop as Extract<Prop, { kind: 'button' }>;
        if (!rt.body) break;
        let mass = 0;
        const b = rt.body.bounds;
        for (const other of ctx.world.tracked) {
          if (other === rt.body || other.isStatic) continue;
          if (
            other.position.x < b.min.x ||
            other.position.x > b.max.x ||
            other.position.y < b.min.y - 40 ||
            other.position.y > b.max.y
          ) {
            continue;
          }
          mass += other.mass;
        }
        rt.active = mass >= prop.minMass;
        ctx.signals.setSource(prop.signal, rt.active);
        break;
      }
      case 'door': {
        const prop = rt.prop as Extract<Prop, { kind: 'door' }>;
        if (!rt.body) break;
        const open = ctx.signals.get(prop.signal);
        const target = open ? 1 : 0;
        const step = (prop.speed * dt) / (Math.hypot(prop.openOffset.x, prop.openOffset.y) || 1);
        rt.progress += Math.sign(target - rt.progress) * Math.min(step, Math.abs(target - rt.progress));
        rt.active = open;
        moveCarrying(
          rt.body,
          rt.home.x + prop.openOffset.x * rt.progress,
          rt.home.y + prop.openOffset.y * rt.progress,
        );
        break;
      }
      case 'fan': {
        const prop = rt.prop as Extract<Prop, { kind: 'fan' }>;
        const on = !prop.pulseMs || Math.floor(ctx.nowMs / prop.pulseMs) % 2 === 0;
        rt.active = on;
        if (!on) break;
        const half = { x: prop.size.x / 2, y: prop.size.y / 2 };
        for (const body of ctx.world.tracked) {
          if (body.isStatic) continue;
          if (
            Math.abs(body.position.x - rt.home.x) > half.x ||
            Math.abs(body.position.y - rt.home.y) > half.y
          ) {
            continue;
          }
          forceScratch.x = prop.dir.x * prop.force * body.mass;
          forceScratch.y = prop.dir.y * prop.force * body.mass;
          Body.applyForce(body, body.position, forceScratch);
        }
        break;
      }
      case 'magnet': {
        const prop = rt.prop as Extract<Prop, { kind: 'magnet' }>;
        rt.active = true;
        for (const body of ctx.world.tracked) {
          if (body.isStatic) continue;
          // Heads and props only. Magnets pulling hands would make anchoring
          // feel broken rather than weird, which is the opposite of W7's joke.
          const meta = ctx.world.meta.get(body.id);
          if (!meta || (meta.role !== 'head' && meta.role !== 'prop')) continue;
          const dx = rt.home.x - body.position.x;
          const dy = rt.home.y - body.position.y;
          const d = Math.hypot(dx, dy);
          if (d > prop.radius || d < 1) continue;
          const falloff = 1 - d / prop.radius;
          const f = prop.force * prop.polarity * falloff * body.mass;
          forceScratch.x = (dx / d) * f;
          forceScratch.y = (dy / d) * f;
          Body.applyForce(body, body.position, forceScratch);
        }
        break;
      }
      case 'zeroG': {
        const prop = rt.prop as Extract<Prop, { kind: 'zeroG' }>;
        rt.active = true;
        const half = { x: prop.size.x / 2, y: prop.size.y / 2 };
        for (const body of ctx.world.tracked) {
          if (body.isStatic) continue;
          if (
            Math.abs(body.position.x - rt.home.x) > half.x ||
            Math.abs(body.position.y - rt.home.y) > half.y
          ) {
            continue;
          }
          // Cancel the fraction of gravity the volume removes. Applying the
          // counter-force is cheaper and far less surprising than mutating
          // `body.gravityScale`, which matter never reads back.
          forceScratch.x = 0;
          forceScratch.y = -body.mass * P.GRAVITY_Y * GRAVITY_SCALE * (1 - prop.g);
          Body.applyForce(body, body.position, forceScratch);
        }
        break;
      }
      case 'conveyor': {
        const prop = rt.prop as Extract<Prop, { kind: 'conveyor' }>;
        if (!rt.body) break;
        rt.active = true;
        const b = rt.body.bounds;
        for (const body of ctx.world.tracked) {
          if (body.isStatic) continue;
          if (
            body.position.x < b.min.x ||
            body.position.x > b.max.x ||
            body.position.y < b.min.y - 40 ||
            body.position.y > b.min.y + 6
          ) {
            continue;
          }
          velScratch.x = prop.speed * dt;
          velScratch.y = body.velocity.y;
          Body.setVelocity(body, velScratch);
        }
        break;
      }
      case 'plate': {
        const prop = rt.prop as Extract<Prop, { kind: 'plate' }>;
        if (!rt.body) break;
        const b = rt.body.bounds;
        for (const other of ctx.world.tracked) {
          const meta = ctx.world.meta.get(other.id);
          if (!meta || meta.role !== 'prop' || !meta.refId) continue;
          if (
            other.position.x < b.min.x ||
            other.position.x > b.max.x ||
            other.position.y < b.min.y - 60 ||
            other.position.y > b.max.y + 20
          ) {
            continue;
          }
          if (prop.slots.includes(meta.refId) && !rt.filled.includes(meta.refId)) {
            rt.filled.push(meta.refId);
          }
        }
        rt.progress = rt.filled.length / Math.max(1, prop.slots.length);
        rt.active = rt.filled.length >= prop.slots.length;
        break;
      }
      case 'popCannon': {
        if (rt.cooldownUntil > 0 && ctx.nowMs >= rt.cooldownUntil) rt.cooldownUntil = 0;
        rt.active = rt.cooldownUntil === 0;
        break;
      }
      default:
        break;
    }

    if (rt.carriedBy >= 0 && rt.body) {
      const ch = ctx.characters[rt.carriedBy];
      if (!ch || ch.state === 'dead') dropProp(ctx, rt);
    }
  }
}

// ─── Carrying, pickups and `useItem` ────────────────────────────────────────

/** True when this prop is something a player picks up rather than holds onto. */
export function isCarryable(kind: PropKind): boolean {
  return CARRYABLE.has(kind);
}

export function carryProp(ctx: PropContext, rt: PropRuntime, ch: Character, hand: 'l' | 'r'): void {
  if (!rt.body || rt.carriedBy >= 0 || rt.consumed) return;
  const arm = hand === 'l' ? ch.arms[0] : ch.arms[1];

  if (rt.kind === 'parcel') {
    rt.consumed = true;
    ctx.world.remove(rt.body);
    rt.body = null;
    ctx.emit({ kind: 'parcel', parcelId: (rt.prop as Extract<Prop, { kind: 'parcel' }>).parcelId, seat: ch.seat });
    return;
  }

  rt.carriedBy = ch.seat;
  ch.carrying = rt.prop.id;
  // A carried object collides with the world but not with people (§3.1
  // `CARRY`) — a relic that shoves your friends off a ledge is a griefing tool,
  // not a collectible.
  rt.body.collisionFilter = { ...FILTERS.carry };
  const link = Constraint.create({
    bodyA: arm.hand,
    pointA: { x: 0, y: 0 },
    bodyB: rt.body,
    pointB: { x: 0, y: 0 },
    length: 0,
    stiffness: 0.9,
    damping: 0.2,
    label: 'carry',
  });
  rt.carryLink = link;
  ctx.world.addConstraint(link);
  ctx.emit({ kind: 'item', propId: rt.prop.id, seat: ch.seat, kindOf: rt.kind });
}

export function dropProp(ctx: PropContext, rt: PropRuntime): void {
  if (rt.carriedBy < 0) return;
  const ch = ctx.characters[rt.carriedBy];
  if (ch && ch.carrying === rt.prop.id) ch.carrying = null;
  if (rt.carryLink) ctx.world.removeConstraint(rt.carryLink);
  rt.carryLink = null;
  rt.carriedBy = -1;
  if (rt.body) rt.body.collisionFilter = { ...FILTERS.prop };
}

/**
 * `useItem` on whatever this seat is holding. Returns true when something
 * happened, so the caller can decide whether to spend the input.
 */
export function activateProp(ctx: PropContext, props: PropRuntime[], ch: Character): boolean {
  for (const rt of props) {
    if (rt.carriedBy !== ch.seat) continue;
    switch (rt.kind) {
      case 'thruster': {
        const prop = rt.prop as Extract<Prop, { kind: 'thruster' }>;
        if (rt.charges <= 0) return false;
        rt.charges--;
        const arm = ch.arms[ch.activeArm];
        const mag = Math.hypot(arm.aim.x, arm.aim.y) || 1;
        forceScratch.x = (-arm.aim.x / mag) * prop.impulse;
        forceScratch.y = (-arm.aim.y / mag) * prop.impulse;
        Body.applyForce(ch.head, ch.head.position, forceScratch);
        ctx.emit({ kind: 'item', propId: rt.prop.id, seat: ch.seat, kindOf: 'thruster' });
        return true;
      }
      case 'paperweight': {
        const prop = rt.prop as Extract<Prop, { kind: 'paperweight' }>;
        // Freezing yourself into a solid platform is the whole item: the user
        // becomes level geometry their friends can stand on.
        if (ch.state === 'frozen') {
          ch.state = 'alive';
          Body.setStatic(ch.head, false);
          return true;
        }
        ch.state = 'frozen';
        ch.respawnAtMs = ctx.nowMs + (prop.durationMs ?? 6000);
        Body.setStatic(ch.head, true);
        ctx.emit({ kind: 'item', propId: rt.prop.id, seat: ch.seat, kindOf: 'paperweight' });
        return true;
      }
      case 'stretchInk': {
        // Aim at an ally and use: the *ally* gets the reach, which is what
        // makes it a co-op item rather than a personal upgrade.
        const arm = ch.arms[ch.activeArm];
        let best: Character | null = null;
        let bestDot = 0.5;
        for (const other of ctx.characters) {
          if (!other || other === ch || other.state !== 'alive') continue;
          const dx = other.head.position.x - ch.head.position.x;
          const dy = other.head.position.y - ch.head.position.y;
          const d = Math.hypot(dx, dy) || 1;
          const dot = (dx / d) * arm.aim.x + (dy / d) * arm.aim.y;
          if (dot > bestDot) {
            bestDot = dot;
            best = other;
          }
        }
        const target = best ?? ch;
        for (const a of target.arms) startStretchInk(a, ctx.nowMs);
        rt.consumed = true;
        dropProp(ctx, rt);
        if (rt.body) {
          ctx.world.remove(rt.body);
          rt.body = null;
        }
        ctx.emit({ kind: 'item', propId: rt.prop.id, seat: target.seat, kindOf: 'stretchInk' });
        return true;
      }
      case 'camera':
        // The shutter is an objective concern; `objectives.ts` reads the frame.
        return true;
      default:
        return false;
    }
  }
  return false;
}

/**
 * Fire a pop cannon: everything in the barrel leaves along the barrel's angle,
 * jittered inside `arc`. It takes two players by design — one holds the handle,
 * one is the ammunition — and that is World 3's joke and its lesson.
 */
export function firePopCannon(ctx: PropContext, rt: PropRuntime): boolean {
  if (rt.kind !== 'popCannon' || !rt.body || rt.cooldownUntil > 0) return false;
  const prop = rt.prop as Extract<Prop, { kind: 'popCannon' }>;
  const angle = rt.body.angle + (ctx.rng.next() - 0.5) * prop.arc;
  const b = rt.body.bounds;
  let fired = false;
  for (const ch of ctx.characters) {
    if (!ch || ch.state !== 'alive') continue;
    const p = ch.head.position;
    if (p.x < b.min.x || p.x > b.max.x || p.y < b.min.y || p.y > b.max.y) continue;
    velScratch.x = Math.cos(angle) * prop.power;
    velScratch.y = Math.sin(angle) * prop.power;
    Body.setVelocity(ch.head, velScratch);
    fired = true;
  }
  if (fired) rt.cooldownUntil = ctx.nowMs + prop.cooldownMs;
  return fired;
}

/** Pickups engage on overlap, not on a grip — you cannot fumble a parcel. */
export function sweepPickups(ctx: PropContext, props: PropRuntime[]): void {
  for (const rt of props) {
    if (!rt.body || rt.consumed || rt.carriedBy >= 0 || !isCarryable(rt.kind)) continue;
    for (const ch of ctx.characters) {
      if (!ch || ch.state !== 'alive') continue;
      for (let i = 0; i < 2; i++) {
        const hand = ch.arms[i].hand;
        const d = Math.hypot(hand.position.x - rt.body.position.x, hand.position.y - rt.body.position.y);
        if (d <= P.HAND_RADIUS + 18) {
          carryProp(ctx, rt, ch, i === 0 ? 'l' : 'r');
          break;
        }
      }
      if (rt.carriedBy >= 0 || rt.consumed) break;
    }
  }
}

/** `platformFalling` arms itself the moment anything grips or lands on it. */
export function armFallingPlatform(props: PropRuntime[], refId: string): void {
  for (const rt of props) {
    if (rt.kind === 'platformFalling' && rt.prop.id === refId) rt.active = true;
  }
}

export function propAt(props: PropRuntime[], id: string): PropRuntime | null {
  for (const rt of props) if (rt.prop.id === id) return rt;
  return null;
}

/** Region props have no body, so `shapeContains` is how objectives find them. */
export function propContains(rt: PropRuntime, x: number, y: number): boolean {
  const prop = rt.prop;
  if ('size' in prop) {
    return shapeContains(
      { kind: 'rect', x: prop.at.x - prop.size.x / 2, y: prop.at.y - prop.size.y / 2, w: prop.size.x, h: prop.size.y },
      x,
      y,
    );
  }
  return Math.hypot(x - prop.at.x, y - prop.at.y) <= 40;
}
