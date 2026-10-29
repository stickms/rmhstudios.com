/**
 * The single-player entity base and class registry.
 *
 * SP entities extend the TF simulation's `Entity` (lib/tf2-game/sim/entity.ts:
 * keyvalues, outputs, inputs, thinks, parenting) so the engine-generic TF
 * classes — logic_relay, the trigger family, the filters — run unchanged in
 * the SP world. `SpEntity` adds what single player needs: the typed world
 * (`sp`), +use, animation state for models, context thinks, and the renderer
 * state record.
 *
 * The registry is separate from the TF one: SP maps get SP behaviour for
 * shared classnames (func_door, math_counter…), and the TF registry is left
 * alone.
 */

import { Entity, PointEntity } from '../../tf2-game/sim/entity';
import type { Vec3 } from '../../tf2-game/core/vec';
import { vec3 } from '../../tf2-game/core/vec';
import type { SpWorld } from '../world/sp-world';
import type { MdlSequence } from '../formats/mdl-sequences';

export type SpEntityConstructor = new (classname: string) => Entity;

const registry = new Map<string, SpEntityConstructor>();

/** Registers a class for one or more classnames. */
export function registerSp(ctor: SpEntityConstructor | (new () => Entity), ...classnames: string[]): void {
  for (const c of classnames) registry.set(c.toLowerCase(), ctor as SpEntityConstructor);
}

export function isSpClassRegistered(classname: string): boolean {
  return registry.has(classname.toLowerCase());
}

export function spRegisteredClassnames(): string[] {
  return [...registry.keys()].sort();
}

/** Creates an entity by classname; unknown classnames become inert point entities. */
export function createSpEntity(classname: string): Entity {
  const lc = classname.toLowerCase();
  const ctor = registry.get(lc);
  return ctor ? new ctor(lc) : new PointEntity(lc);
}

/** USE_TYPE (SDK: baseentity.h). */
export const USE_OFF = 0;
export const USE_ON = 1;
export const USE_SET = 2;
export const USE_TOGGLE = 3;

/** Model animation state for the renderer (prop_dynamic, actors, doors, the portal gun…). */
export interface AnimState {
  /** Sequence name ('' = the model's first / idle). */
  sequence: string;
  /** curtime the sequence started. */
  startTime: number;
  /** Playback rate (1 = authored fps). */
  rate: number;
  loop: boolean;
  /** Seconds per cycle (from the model, 0 when unknown). */
  duration: number;
}

/** A context think (SetContextThink): independent timers on one entity. */
export interface ThinkContext {
  at: number;
  fn: () => void;
}

const TIME_EPS = 1e-6;

export class SpEntity extends Entity {
  /** The SP world (same object as `world`, typed). */
  get sp(): SpWorld {
    return this.world as unknown as SpWorld;
  }

  /** Current model animation (null = static). */
  anim: AnimState | null = null;
  /** Visibility toggle for renderable point entities (sprites, beams, lights…). */
  visualOn = true;
  /** Extra renderer fields (written into the state record's `extra`). */
  extra: Record<string, unknown> | null = null;
  private contexts: ThinkContext[] | null = null;
  private mainAt = -1;

  /** Replaces (or adds) a keyvalue so later `kvString` reads see it (SetText, SetTargetN…). */
  setKv(key: string, value: string): void {
    if (!this.kv) return;
    const k = key.toLowerCase();
    const i = this.kv.props.findIndex(([pk]) => pk.toLowerCase() === k);
    if (i >= 0) this.kv.props[i] = [this.kv.props[i][0], value];
    else this.kv.props.push([key, value]);
  }

  /** +use from the player. Return true when consumed. */
  use(_activator: Entity, _useType: number): boolean {
    return false;
  }

  /** Whether +use should consider this entity (FCAP_IMPULSE_USE / FCAP_ONOFF_USE…). */
  isUsable(): boolean {
    return false;
  }

  // ─── Context thinks ─────────────────────────────────────────────────────

  protected context(fn: () => void): ThinkContext {
    const c: ThinkContext = { at: -1, fn };
    (this.contexts ??= []).push(c);
    return c;
  }

  setContextThink(c: ThinkContext, at: number): void {
    c.at = at;
    this.rearm();
  }

  override setThink(fn: (() => void) | null, at: number): void {
    this.thinkFn = fn;
    this.mainAt = fn ? at : -1;
    this.rearm();
  }

  override think(): void {
    const now = this.world.curtime + TIME_EPS;
    if (this.mainAt >= 0 && this.mainAt <= now) {
      this.mainAt = -1;
      const fn = this.thinkFn;
      if (fn) fn.call(this);
    }
    if (this.contexts) {
      for (const c of this.contexts) {
        if (c.at >= 0 && c.at <= now) {
          c.at = -1;
          c.fn.call(this);
        }
      }
    }
    this.rearm();
  }

  private rearm(): void {
    let at = this.mainAt;
    if (this.contexts) for (const c of this.contexts) if (c.at >= 0 && (at < 0 || c.at < at)) at = c.at;
    this.nextThink = at;
  }

  // ─── Animation ──────────────────────────────────────────────────────────

  /** The model's sequence by name (case-insensitive), or null. */
  findSequence(name: string): MdlSequence | null {
    if (!this.model) return null;
    const info = this.sp.assets.model(this.model);
    if (!info) return null;
    const lc = name.toLowerCase();
    for (const s of info.sequences) if (s.name.toLowerCase() === lc) return s;
    return null;
  }

  /** A sequence for an activity name (ACT_IDLE…), or null. */
  findActivity(activity: string): MdlSequence | null {
    if (!this.model) return null;
    const info = this.sp.assets.model(this.model);
    if (!info) return null;
    const uc = activity.toUpperCase();
    for (const s of info.sequences) if (s.activity.toUpperCase() === uc) return s;
    return null;
  }

  /** Starts a sequence; returns its duration in seconds (0 when the model lacks it). */
  playSequence(name: string, rate = 1, loop?: boolean): number {
    const seq = this.findSequence(name);
    const duration = seq ? seq.duration : 0;
    this.anim = {
      sequence: seq ? seq.name : name,
      startTime: this.world.curtime,
      rate,
      loop: loop ?? (seq ? seq.looping : false),
      duration,
    };
    return rate > 0 ? duration / rate : duration;
  }

  /** 0…1 of the current sequence. */
  animCycle(): number {
    const a = this.anim;
    if (!a || a.duration <= 0) return 0;
    const t = ((this.world.curtime - a.startTime) * a.rate) / a.duration;
    return a.loop ? t - Math.floor(t) : Math.min(1, Math.max(0, t));
  }

  /** Where the eyes are (actors override). */
  eyePosition(out: Vec3): Vec3 {
    out.x = this.origin.x;
    out.y = this.origin.y;
    out.z = this.origin.z + (this.maxs.z > 0 ? this.maxs.z * 0.9 : 0);
    return out;
  }
}

/** A point entity that only needs to accept a few inputs and expose an on/off state (lights, sprites…). */
export class SpPoint extends SpEntity {}

export const scratchVec = vec3();
