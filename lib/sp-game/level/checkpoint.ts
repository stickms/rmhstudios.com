/**
 * Checkpoints (logic_autosave, and the map start): a snapshot of the whole
 * world the player returns to on death — the SDK's save/restore reduced to an
 * in-memory copy.
 *
 * Every live entity's own fields are copied: numbers, strings and booleans
 * as they are, plain objects and arrays (vectors, anim state, lists) deeply
 * (frozen ones — shared constants — by reference),
 * Maps and Sets shallowly, references to entities and other class instances
 * as references, and each output's connection list (spent `timesToFire`
 * connections come back). Entities created after the save are removed on
 * restore; those removed since are put back in their slots. Physics bodies
 * get their pose, velocities, motion and sleep state back (an entity whose
 * body was destroyed re-creates it through `restorePhysics`). The event
 * queue, trigger touch links, env_global states, portals, the active view
 * control and the soundscape are restored too.
 */

import type { Entity } from '../../tf2-game/sim/entity';
import type { OutputAction, QueuedEvent } from '../../tf2-game/sim/io';
import { vec3, type Vec3 } from '../../tf2-game/core/vec';
import type { SpWorld, TouchVolume } from '../world/sp-world';
import type { PhysBody } from '../physics/physics-world';
import type { Quat } from '../math';

interface EntityRecord {
  entity: Entity;
  id: number;
  fields: Map<string, unknown>;
  outputs: Map<string, OutputAction[]>;
  /** SpEntity context think times, restored in place. */
  contextAts: number[] | null;
}

interface BodyRecord {
  entity: number;
  body: PhysBody;
  origin: Vec3;
  quat: Quat;
  velocity: Vec3;
  angular: Vec3;
  motion: boolean;
  sleeping: boolean;
}

export interface Checkpoint {
  tickCount: number;
  curtime: number;
  entities: EntityRecord[];
  bodies: BodyRecord[];
  queue: QueuedEvent[];
  touch: Array<[TouchVolume, Entity[]]>;
  globals: Array<[string, number]>;
  viewControl: Entity | null;
  soundscape: string;
  portals: unknown;
}

/** Fields never copied: identity, the world link, and caches rebuilt elsewhere. */
const SKIP = new Set(['world', 'id', 'kv', 'outputs', 'classname', 'contexts']);

function isPlain(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function deepCopy(v: unknown, depth = 0): unknown {
  if (v === null || typeof v !== 'object') return v;
  // Frozen (shared, immutable): by reference.
  if (Object.isFrozen(v)) return v;
  if (depth > 6) return v;
  if (Array.isArray(v)) return v.map((x) => deepCopy(x, depth + 1));
  if (ArrayBuffer.isView(v)) return (v as unknown as { slice: () => unknown }).slice();
  if (v instanceof Map) return new Map(v);
  if (v instanceof Set) return new Set(v);
  if (!isPlain(v)) return v; // entities, bodies, class instances: by reference
  const o: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) o[k] = typeof x === 'function' ? x : deepCopy(x, depth + 1);
  return o;
}

function captureEntity(e: Entity): EntityRecord {
  const fields = new Map<string, unknown>();
  for (const key of Object.keys(e)) {
    if (SKIP.has(key)) continue;
    const v = (e as unknown as Record<string, unknown>)[key];
    fields.set(key, deepCopy(v));
  }
  const outputs = new Map<string, OutputAction[]>();
  for (const [k, o] of e.outputs) outputs.set(k, o.actions.map((a) => ({ ...a })));
  const ctx = (e as unknown as { contexts?: Array<{ at: number }> | null }).contexts;
  return { entity: e, id: e.id, fields, outputs, contextAts: ctx ? ctx.map((c) => c.at) : null };
}

function restoreEntity(r: EntityRecord): void {
  const e = r.entity as unknown as Record<string, unknown>;
  for (const [k, v] of r.fields) {
    const cur = e[k];
    const val = deepCopy(v);
    // A frozen object (shared constants: movement parameters) is kept by reference: put the saved one back.
    if (
      (val && typeof val === 'object' && Object.isFrozen(val)) ||
      (cur && typeof cur === 'object' && Object.isFrozen(cur))
    ) {
      try {
        e[k] = val;
      } catch {
        // getter-only field
      }
      continue;
    }
    // Readonly vectors are mutated in place (other code holds them).
    if (cur && typeof cur === 'object' && val && typeof val === 'object' && isPlain(cur) && isPlain(val) && !Array.isArray(cur)) {
      for (const kk of Object.keys(cur)) if (!(kk in (val as object))) delete (cur as Record<string, unknown>)[kk];
      Object.assign(cur, val);
    } else if (Array.isArray(cur) && Array.isArray(val) && Object.isFrozen(cur) === false && k !== 'touching') {
      cur.length = 0;
      cur.push(...val);
    } else if (Array.isArray(cur) && Array.isArray(val)) {
      cur.length = 0;
      cur.push(...val);
    } else {
      try {
        e[k] = val;
      } catch {
        // getter-only field
      }
    }
  }
  const ent = r.entity;
  const ctx = (ent as unknown as { contexts?: Array<{ at: number }> | null }).contexts;
  if (ctx && r.contextAts) for (let i = 0; i < ctx.length && i < r.contextAts.length; i++) ctx[i].at = r.contextAts[i];
  for (const [k, actions] of r.outputs) {
    const o = ent.output(k);
    o.actions.length = 0;
    for (const a of actions) o.actions.push({ ...a });
  }
}

export function captureCheckpoint(w: SpWorld): Checkpoint {
  const entities: EntityRecord[] = [];
  w.forEachEntity((e) => {
    if (e === w.worldEntity) return;
    entities.push(captureEntity(e));
  });
  const bodies: BodyRecord[] = [];
  for (const [id, b] of w.bodiesByEntity) {
    if (b.removed) continue;
    bodies.push({
      entity: id,
      body: b,
      origin: b.getOrigin(vec3()),
      quat: b.getQuat({ x: 0, y: 0, z: 0, w: 1 }),
      velocity: b.getVelocity(vec3()),
      angular: b.getAngularVelocity(vec3()),
      motion: b.kind !== 'dynamic' || b.isMotionEnabled(),
      sleeping: b.isSleeping(),
    });
  }
  return {
    tickCount: w.tickCount,
    curtime: w.curtime,
    entities,
    bodies,
    queue: w.io.pending.map((q) => ({ ...q })),
    touch: [...w.touchState].map(([t, l]) => [t, l.slice()] as [TouchVolume, Entity[]]),
    globals: [...w.globals],
    viewControl: w.viewControl,
    soundscape: w.soundscape,
    portals: w.portals.capture(),
  };
}

export function restoreCheckpoint(w: SpWorld, c: Checkpoint): void {
  if (w.player.held) w.player.drop(false);
  const keep = new Set(c.entities.map((r) => r.entity));
  // Remove what was created since.
  w.forEachEntity((e) => {
    if (e === w.worldEntity || keep.has(e)) return;
    const b = e as Entity & { onCheckpointDiscard?: () => void };
    b.onCheckpointDiscard?.();
    w.remove(e);
  });
  // Revive what was removed since, in its slot.
  for (const r of c.entities) {
    const e = r.entity;
    if (e.removed) {
      e.removed = false;
      w.entities[r.id] = e;
      const t = e as Entity & { isTrigger?: () => boolean; registerAgain?: () => void };
      if (e.isTrigger()) w.registerTrigger(e as unknown as TouchVolume);
      t.registerAgain?.();
    } else if (w.entities[r.id] !== e) {
      w.entities[r.id] = e;
    }
  }
  for (const r of c.entities) restoreEntity(r);
  for (const r of c.entities) {
    const e = r.entity as Entity & { restorePhysics?: () => void; afterRestore?: () => void };
    if (e.bspModel > 0) w.syncBrushModel(e);
    e.restorePhysics?.();
  }
  for (const br of c.bodies) {
    const b = w.bodiesByEntity.get(br.entity);
    if (!b || b.removed) continue;
    if (b.kind === 'dynamic') b.setMotionEnabled(br.motion);
    b.setPose(br.origin, null, br.quat);
    b.setVelocity(br.velocity, false);
    b.setAngularVelocity(br.angular, false);
    if (br.sleeping) b.rb.sleep();
    else b.wake();
  }
  for (const r of c.entities) (r.entity as Entity & { afterRestore?: () => void }).afterRestore?.();
  // Event queue (private in IoSystem: restored as a copy).
  (w.io as unknown as { queue: QueuedEvent[] }).queue = c.queue.map((q) => ({ ...q }));
  const links = w.touchState;
  links.clear();
  for (const [t, l] of c.touch) links.set(t, l.slice());
  w.globals.clear();
  for (const [k, v] of c.globals) w.globals.set(k, v);
  w.viewControl = c.viewControl as typeof w.viewControl;
  w.soundscape = c.soundscape;
  w.portals.restore(c.portals);
  w.player.placeAt(w.player.move.origin, w.player.eyeAngles, w.player.move.velocity);
}
