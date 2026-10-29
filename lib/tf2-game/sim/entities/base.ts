/**
 * Shared plumbing for the map-entity module: an entity base with the SDK's
 * context thinks (SetContextThink — several independent think functions on
 * one entity, as timers, capture areas and movers need), value formatting
 * that matches variant_t::ToString, and small key helpers.
 *
 * Everything here is deterministic and allocation-free per tick.
 */

import { Entity } from '../entity';
import type { Player } from '../player';
import type { GameWorld } from '../world';
import { TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';

/** A named think (SetContextThink): `at` is the curtime it is due, −1 when idle. */
export class ThinkContext {
  at = -1;
  readonly fn: () => void;
  constructor(fn: () => void) {
    this.fn = fn;
  }
}

/** Time comparisons tolerate float noise from accumulating TICK_INTERVAL. */
const TIME_EPS = 1e-6;

/**
 * SetContextThink bookkeeping for one entity: several independent thinks
 * sharing the world's single `nextThink`. Used by MapEntity and by the
 * trigger subclasses (which extend the core BaseTrigger, not MapEntity).
 */
export class ContextThinks {
  private readonly owner: Entity;
  private readonly list: ThinkContext[] = [];
  /** The main think (SetThink) due time, −1 when none. */
  mainAt = -1;

  constructor(owner: Entity) {
    this.owner = owner;
  }

  add(fn: () => void): ThinkContext {
    const c = new ThinkContext(fn);
    this.list.push(c);
    return c;
  }

  set(c: ThinkContext, at: number): void {
    c.at = at;
    this.rearm();
  }

  /** Runs everything due; returns false when the owner was removed. */
  run(): boolean {
    const owner = this.owner;
    const now = owner.world.curtime + TIME_EPS;
    if (this.mainAt >= 0 && this.mainAt <= now) {
      this.mainAt = -1;
      const fn = owner.thinkFn;
      if (fn) fn.call(owner);
      if (owner.removed) return false;
    }
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.at >= 0 && c.at <= now) {
        c.at = -1;
        c.fn();
        if (owner.removed) return false;
      }
    }
    this.rearm();
    return true;
  }

  rearm(): void {
    let m = this.mainAt;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const at = list[i].at;
      if (at >= 0 && (m < 0 || at < m)) m = at;
    }
    this.owner.nextThink = m;
  }
}

/**
 * CBaseEntity with SetContextThink. `setThink` (the main think) and any
 * number of contexts share the world's single `nextThink`, recomputed after
 * every run.
 */
export class MapEntity extends Entity {
  protected readonly thinks = new ContextThinks(this);

  /** Creates a context (call in the constructor or spawn; never per tick). */
  protected context(fn: () => void): ThinkContext {
    return this.thinks.add(fn);
  }

  /** SDK: SetContextThink(fn, at). `at` < 0 cancels. */
  setContextThink(c: ThinkContext, at: number): void {
    this.thinks.set(c, at);
  }

  override setThink(fn: (() => void) | null, at: number): void {
    this.thinkFn = fn;
    this.thinks.mainAt = fn ? at : -1;
    this.thinks.rearm();
  }

  override think(): void {
    this.thinks.run();
  }
}

/** variant_t::ToString for FIELD_FLOAT ("%g"): six significant digits, no trailing zeros. */
export function formatFloat(v: number): string {
  if (!Number.isFinite(v)) return '0';
  if (v === 0) return '0';
  // C's %g: P = 6 significant digits; exponent X of the rounded value picks
  // scientific (X < -4 or X >= P) or fixed, then trailing zeros go.
  const e = v.toExponential(5); // d.ddddde±X, already rounded to 6 digits
  const at = e.indexOf('e');
  const x = Number(e.slice(at + 1));
  if (x < -4 || x >= 6) {
    const mantissa = trimZeros(e.slice(0, at));
    const ax = Math.abs(x);
    return `${mantissa}e${x < 0 ? '-' : '+'}${ax < 10 ? '0' : ''}${ax}`;
  }
  return trimZeros(v.toFixed(5 - x));
}

function trimZeros(s: string): string {
  if (s.indexOf('.') < 0) return s;
  let end = s.length;
  while (s.charCodeAt(end - 1) === 48) end--;
  if (s.charCodeAt(end - 1) === 46) end--;
  const out = s.slice(0, end);
  return out === '-0' ? '0' : out;
}

/** atoi: leading integer, 0 when none. */
export function atoi(v: string | undefined): number {
  if (v === undefined) return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

/** atof. */
export function atof(v: string | undefined): number {
  if (v === undefined) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** The variant's bool conversion: "0"/"false" are false, any other non-empty number/text true. */
export function inputBool(v: string): boolean {
  const s = v.trim().toLowerCase();
  if (s === '' || s === 'false') return false;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n !== 0 : true;
}

/** Remap a team number (2/3) to the SDK's "team - FIRST_GAME_TEAM + 1" output index (1/2), 0 otherwise. */
export function teamOutputIndex(team: number): 0 | 1 | 2 {
  if (team === TF_TEAM_RED) return 1;
  if (team === TF_TEAM_BLUE) return 2;
  return 0;
}

/** The first live player on a team, for debugging helpers and tests. */
export function playersOnTeam(world: GameWorld, team: number, out: Player[]): Player[] {
  out.length = 0;
  world.forEachPlayer((p) => {
    if (p.team === team) out.push(p);
  });
  return out;
}

/** Pushes a sound stop event (EmitSound has no stop form). */
export function stopSound(world: GameWorld, entity: number, name: string, channel = 0): void {
  if (!world.isServer) return;
  world.events.push({ type: 'sound', name, entity, channel, stop: true });
}
