/**
 * The matter.js world: collision layers, level geometry, and the side table
 * that tells the rest of the engine what a given body *is*.
 *
 * Two decisions here are load-bearing.
 *
 * **Metadata lives beside the bodies, not on them.** `BodyMeta` is a `Map`
 * keyed by `body.id` rather than a field bolted onto matter's `Body`, because
 * the moment engine state is readable through a matter type it starts leaking
 * into the renderer and the net layer, and `Simulation` (types.ts) exists
 * precisely so neither of them ever sees a body.
 *
 * **The masks are stated, not derived.** `MASK.ARM` excludes `HEAD` and `ARM`;
 * four players tangling in one gap is the point of the game and arm-vs-arm
 * collision turns that into a jittering knot that ejects everyone. If you find
 * yourself "fixing" arms passing through each other, you have found the
 * feature.
 */

import Matter from 'matter-js';
import { LAYER, MASK, MATERIALS } from '../constants';
import type { Level, MaterialId, SeatIndex, Shape, Vec2 } from '../types';
import { ENGINE, P } from './tuning';

const { Bodies, Body, Bounds, Composite, Engine, Vertices } = Matter;

export type BodyRole =
  | 'geometry'
  | 'prop'
  | 'hazard'
  | 'beam'
  | 'head'
  | 'arm'
  | 'hand'
  | 'carry'
  | 'drone';

export interface BodyMeta {
  role: BodyRole;
  grabbable: boolean;
  material: MaterialId;
  /** Actor parts carry their seat; everything else is -1. */
  seat: SeatIndex | -1;
  /** Authored prop/hazard id, or '' for level geometry. */
  refId: string;
  /** Hazards only: kills on contact, after `graceMs` of continuous overlap. */
  lethal: boolean;
  graceMs: number;
  /** Index into the lag-comp history buffer; -1 for bodies that never move. */
  histIndex: number;
}

export interface PhysWorld {
  engine: Matter.Engine;
  root: Matter.Composite;
  meta: Map<number, BodyMeta>;
  /** Everything a hand may latch onto, maintained incrementally. */
  grabbables: Matter.Body[];
  /** Bodies whose transform is recorded for lag compensation (§9.5). */
  tracked: Matter.Body[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  bodyCount: number;
  add(body: Matter.Body, meta: BodyMeta): Matter.Body;
  remove(body: Matter.Body): void;
  addConstraint(c: Matter.Constraint): void;
  removeConstraint(c: Matter.Constraint): void;
}

export function defaultMeta(partial: Partial<BodyMeta> = {}): BodyMeta {
  return {
    role: 'geometry',
    grabbable: false,
    material: 'paper',
    seat: -1,
    refId: '',
    lethal: false,
    graceMs: 0,
    histIndex: -1,
    ...partial,
  };
}

/** matter collides A with B only when each side's mask admits the other. */
export function filterFor(category: number, mask: number): Matter.ICollisionFilter {
  return { category, mask, group: 0 };
}

export const FILTERS = {
  world: filterFor(LAYER.WORLD, MASK.WORLD),
  head: filterFor(LAYER.HEAD, MASK.HEAD),
  arm: filterFor(LAYER.ARM, MASK.ARM),
  hand: filterFor(LAYER.HAND, MASK.HAND),
  prop: filterFor(LAYER.PROP, MASK.PROP),
  hazard: filterFor(LAYER.HAZARD, MASK.HAZARD),
  carry: filterFor(LAYER.CARRY, MASK.CARRY),
} as const;

export function shapeCentre(shape: Shape, out: Vec2): Vec2 {
  switch (shape.kind) {
    case 'rect':
      out.x = shape.x + shape.w / 2;
      out.y = shape.y + shape.h / 2;
      return out;
    case 'circle':
      out.x = shape.x;
      out.y = shape.y;
      return out;
    case 'poly': {
      let sx = 0;
      let sy = 0;
      for (const p of shape.points) {
        sx += p.x;
        sy += p.y;
      }
      const n = Math.max(1, shape.points.length);
      out.x = shape.x + sx / n;
      out.y = shape.y + sy / n;
      return out;
    }
    case 'chain': {
      let sx = 0;
      let sy = 0;
      for (const p of shape.points) {
        sx += p.x;
        sy += p.y;
      }
      const n = Math.max(1, shape.points.length);
      out.x = sx / n;
      out.y = sy / n;
      return out;
    }
  }
}

/** True when `point` is inside `shape` — used for volumes (zeroG, heat, void). */
export function shapeContains(shape: Shape, x: number, y: number): boolean {
  switch (shape.kind) {
    case 'rect': {
      if (!shape.angle) return x >= shape.x && x <= shape.x + shape.w && y >= shape.y && y <= shape.y + shape.h;
      const cx = shape.x + shape.w / 2;
      const cy = shape.y + shape.h / 2;
      const c = Math.cos(-shape.angle);
      const s = Math.sin(-shape.angle);
      const dx = x - cx;
      const dy = y - cy;
      const rx = dx * c - dy * s;
      const ry = dx * s + dy * c;
      return Math.abs(rx) <= shape.w / 2 && Math.abs(ry) <= shape.h / 2;
    }
    case 'circle': {
      const dx = x - shape.x;
      const dy = y - shape.y;
      return dx * dx + dy * dy <= shape.r * shape.r;
    }
    case 'poly': {
      let inside = false;
      const pts = shape.points;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = shape.x + pts[i].x;
        const yi = shape.y + pts[i].y;
        const xj = shape.x + pts[j].x;
        const yj = shape.y + pts[j].y;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    case 'chain': {
      const half = shape.thickness / 2;
      for (let i = 0; i < shape.points.length - 1; i++) {
        const a = shape.points[i];
        const b = shape.points[i + 1];
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const len2 = vx * vx + vy * vy || 1;
        let t = ((x - a.x) * vx + (y - a.y) * vy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const dx = x - (a.x + vx * t);
        const dy = y - (a.y + vy * t);
        if (dx * dx + dy * dy <= half * half) return true;
      }
      return false;
    }
  }
}

export interface ShapeBodyOptions {
  isStatic?: boolean;
  isSensor?: boolean;
  material?: MaterialId;
  restitution?: number;
  density?: number;
  filter?: Matter.ICollisionFilter;
  angle?: number;
  label?: string;
}

/**
 * `Shape` → one matter body. A `chain` becomes a single compound body rather
 * than one body per span: the budget in §17 counts what the broadphase has to
 * consider, and a 12-point chain would otherwise eat a tenth of the level.
 */
export function shapeToBody(shape: Shape, opts: ShapeBodyOptions = {}): Matter.Body {
  const material = MATERIALS[opts.material ?? 'paper'];
  const common: Matter.IChamferableBodyDefinition = {
    isStatic: opts.isStatic ?? true,
    isSensor: opts.isSensor ?? false,
    friction: material.friction,
    frictionStatic: material.friction,
    restitution: opts.restitution ?? 0,
    collisionFilter: opts.filter ?? FILTERS.world,
    label: opts.label ?? 'shape',
  };
  if (opts.density !== undefined) common.density = opts.density;

  switch (shape.kind) {
    case 'rect':
      return Bodies.rectangle(shape.x + shape.w / 2, shape.y + shape.h / 2, shape.w, shape.h, {
        ...common,
        angle: shape.angle ?? opts.angle ?? 0,
      });
    case 'circle':
      return Bodies.circle(shape.x, shape.y, shape.r, common);
    case 'poly': {
      const verts = shape.points.map((p) => ({ x: shape.x + p.x, y: shape.y + p.y }));
      const centre = Vertices.centre(verts);
      const body = Bodies.fromVertices(centre.x, centre.y, [verts], common);
      // fromVertices silently returns a degenerate body for self-intersecting
      // input (poly-decomp is not installed and we do not want it); the AABB
      // fallback keeps a bad level playable instead of invisible.
      if (body && body.vertices.length >= 3) {
        if (shape.angle) Body.setAngle(body, shape.angle);
        return body;
      }
      const bounds = Bounds.create(verts);
      return Bodies.rectangle(
        (bounds.min.x + bounds.max.x) / 2,
        (bounds.min.y + bounds.max.y) / 2,
        Math.max(1, bounds.max.x - bounds.min.x),
        Math.max(1, bounds.max.y - bounds.min.y),
        common,
      );
    }
    case 'chain': {
      const parts: Matter.Body[] = [];
      for (let i = 0; i < shape.points.length - 1; i++) {
        const a = shape.points[i];
        const b = shape.points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.5) continue;
        parts.push(
          Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len, shape.thickness, {
            ...common,
            angle: Math.atan2(dy, dx),
          }),
        );
      }
      if (parts.length === 0) return Bodies.circle(shape.points[0]?.x ?? 0, shape.points[0]?.y ?? 0, 1, common);
      if (parts.length === 1) return parts[0];
      return Body.create({ ...common, parts });
    }
  }
}

export function createPhysWorld(level: Level): PhysWorld {
  const engine = Engine.create({
    // Sleeping is on so a level's static furniture leaves the solver alone;
    // actors opt out individually (`sleepThreshold = Infinity`) because a
    // sleeping head does not receive the arm forces that would wake it.
    enableSleeping: true,
    constraintIterations: ENGINE.CONSTRAINT_ITERATIONS,
  });
  engine.gravity.x = 0;
  engine.gravity.y = P.GRAVITY_Y;

  const world: PhysWorld = {
    engine,
    root: engine.world,
    meta: new Map(),
    grabbables: [],
    tracked: [],
    bounds: {
      minX: level.bounds.x,
      minY: level.bounds.y,
      maxX: level.bounds.x + level.bounds.w,
      maxY: level.bounds.y + level.bounds.h,
    },
    bodyCount: 0,
    add(body, meta) {
      world.meta.set(body.id, meta);
      Composite.add(engine.world, body);
      world.bodyCount++;
      if (meta.grabbable) world.grabbables.push(body);
      if (!body.isStatic || meta.role === 'prop') {
        meta.histIndex = world.tracked.length;
        world.tracked.push(body);
      }
      return body;
    },
    remove(body) {
      const meta = world.meta.get(body.id);
      if (meta?.grabbable) {
        const i = world.grabbables.indexOf(body);
        if (i >= 0) world.grabbables.splice(i, 1);
      }
      world.meta.delete(body.id);
      Composite.remove(engine.world, body, true);
      world.bodyCount--;
    },
    addConstraint(c) {
      Composite.add(engine.world, c);
    },
    removeConstraint(c) {
      Composite.remove(engine.world, c, true);
    },
  };

  for (const piece of level.geometry) {
    const body = shapeToBody(piece.shape, { isStatic: true, material: piece.material });
    body.sleepThreshold = Infinity;
    world.add(
      body,
      defaultMeta({
        role: 'geometry',
        // `nogrip` is the material that means "you cannot hold this"; honouring
        // it here rather than in the grab query keeps one rule in one place.
        grabbable: (piece.grabbable ?? true) && MATERIALS[piece.material].grip > 0,
        material: piece.material,
      }),
    );
  }

  return world;
}

/**
 * §17's hard cap. A level that trips this does not degrade gracefully — it
 * drops frames on the phone the whole budget is written for — so it fails loudly
 * at construction rather than quietly at 45fps in someone's hand.
 */
export function assertBodyBudget(world: PhysWorld, seats: number): void {
  // Each seat adds 1 head + ARM_SEGMENTS×2 + 2 hands.
  const actorBodies = seats * (1 + P.ARM_SEGMENTS * 2 + 2);
  const total = world.bodyCount + actorBodies;
  if (total > ENGINE.BODY_BUDGET) {
    throw new Error(
      `bums-rush: level uses ${world.bodyCount} bodies + ${actorBodies} for ${seats} seats = ${total}, over the ${ENGINE.BODY_BUDGET} budget (§17)`,
    );
  }
}

const setPosScratch: Vec2 = { x: 0, y: 0 };

/**
 * matter integrates with Verlet, so `positionPrev` is where a body's velocity
 * actually lives — but `@types/matter-js@0.20` does not declare it. This is a
 * typings gap, not a runtime one; every matter build since 0.10 has the field.
 */
interface VerletBody extends Matter.Body {
  positionPrev: Matter.Vector;
}

/**
 * Move a body and let Verlet read the move as a velocity change — which is what
 * a taut rope does, and what the two-argument `Body.setPosition` deliberately
 * does not do (it drags `positionPrev` along so the body keeps sailing). Used
 * by the joint limiter and by grip re-projection.
 */
export function correctPosition(body: Matter.Body, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  setPosScratch.x = body.position.x + dx;
  setPosScratch.y = body.position.y + dy;
  Body.setPosition(body, setPosScratch);
  const prev = (body as VerletBody).positionPrev;
  prev.x -= dx;
  prev.y -= dy;
}

/**
 * Give a static body the surface velocity matter's friction solver needs to
 * carry riders. `Body.setPosition` alone moves `positionPrev` with the body, so
 * a moving platform would slide out from under everyone standing on it.
 */
export function moveCarrying(body: Matter.Body, x: number, y: number): void {
  const dx = x - body.position.x;
  const dy = y - body.position.y;
  setPosScratch.x = x;
  setPosScratch.y = y;
  Body.setPosition(body, setPosScratch);
  setPosScratch.x = dx;
  setPosScratch.y = dy;
  Body.setVelocity(body, setPosScratch);
}

/** Move a body without changing its velocity (teleports: respawn, drone lifts). */
export function teleport(body: Matter.Body, x: number, y: number): void {
  setPosScratch.x = x;
  setPosScratch.y = y;
  Body.setPosition(body, setPosScratch);
  Body.setVelocity(body, ZERO);
  Body.setAngularVelocity(body, 0);
}

export const ZERO: Vec2 = { x: 0, y: 0 };
