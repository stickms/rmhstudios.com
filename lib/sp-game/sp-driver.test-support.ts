/**
 * TEST SUPPORT ONLY: loads SP maps from the installs and drives the player
 * like a person at the keyboard (walk to a point, look at something, press
 * +use), collecting the world's events. Never imported by runtime modules.
 */
import { IN_USE, MASK_PLAYERSOLID } from '../tf2-game/core/constants';
import { emptyTrace } from '../tf2-game/core/types';
import { vec3, type Vec3 } from '../tf2-game/core/vec';
import { createFsAssets } from './assets';
import type { SpGame } from './constants';
import type { SpUserCmd } from './player/sp-player';
import { readSpMap, spFileSystem } from './sp-root.test-support';
import type { SpEvent } from './world/events';
import { SpWorld, type LoadType } from './world/sp-world';
import type { TransitionData } from './level/transition';

export async function loadWorld(game: SpGame, map: string, opts: { loadType?: LoadType; transition?: TransitionData | null } = {}): Promise<SpWorld> {
  const gfs = spFileSystem(game);
  if (!gfs) throw new Error(`${game} install not configured`);
  const bsp = readSpMap(game, map);
  return SpWorld.create({ game, mapName: map, bsp, assets: createFsAssets(game, gfs, bsp), loadType: opts.loadType, transition: opts.transition });
}

/** A world plus the events it produced and input helpers. */
export class Driver {
  readonly w: SpWorld;
  readonly events: SpEvent[] = [];
  readonly inputs: string[] = [];
  cmd: SpUserCmd;
  private seq = 0;

  constructor(w: SpWorld) {
    this.w = w;
    this.cmd = {
      commandNumber: 0,
      tickCount: 0,
      viewAngles: { ...w.player.eyeAngles },
      forwardMove: 0,
      sideMove: 0,
      upMove: 0,
      buttons: 0,
      weaponSelect: 0,
      randomSeed: 0,
    };
    // Record every input the I/O system dispatches ("target.Input").
    const io = w.io as unknown as { dispatch: (ev: { target: string; input: string; entity: { targetname: string } | null }) => void };
    const orig = io.dispatch.bind(io);
    io.dispatch = (ev) => {
      this.inputs.push(`${(ev.entity ? ev.entity.targetname : ev.target).toLowerCase()}.${ev.input.toLowerCase()}`);
      orig(ev);
    };
  }

  /** One tick with the current command. */
  tick(): void {
    this.cmd.commandNumber = ++this.seq;
    this.cmd.tickCount = this.w.tickCount;
    this.w.step(this.cmd);
    for (const e of this.w.drainEvents()) this.events.push(e);
    const p = this.w.player.origin;
    if (!Number.isFinite(p.x + p.y + p.z)) throw new Error(`player position NaN at tick ${this.w.tickCount}`);
  }

  run(seconds: number, until?: () => boolean): boolean {
    const n = Math.round(seconds / this.w.tick);
    for (let i = 0; i < n; i++) {
      this.tick();
      if (until && until()) return true;
    }
    return until ? until() : true;
  }

  idle(seconds: number, until?: () => boolean): boolean {
    this.cmd.forwardMove = this.cmd.sideMove = 0;
    this.cmd.buttons = 0;
    return this.run(seconds, until);
  }

  fired(input: string): boolean {
    return this.inputs.includes(input.toLowerCase());
  }

  look(at: Vec3): void {
    const eye = this.w.player.eyePosition(vec3());
    const dx = at.x - eye.x;
    const dy = at.y - eye.y;
    const dz = at.z - eye.z;
    this.cmd.viewAngles.y = (Math.atan2(dy, dx) * 180) / Math.PI;
    this.cmd.viewAngles.x = (-Math.atan2(dz, Math.hypot(dx, dy)) * 180) / Math.PI;
    this.cmd.viewAngles.z = 0;
  }

  /**
   * Walks toward `to` (2-D) until within `radius`; returns how close it got.
   * Reports `stuck` when it made no progress for a second.
   */
  walkTo(to: Vec3, opts: { radius?: number; timeout?: number; keepPitch?: boolean } = {}): { reached: boolean; stuck: boolean; dist: number } {
    const radius = opts.radius ?? 16;
    const n = Math.round((opts.timeout ?? 20) / this.w.tick);
    let best = Infinity;
    let sinceBest = 0;
    for (let i = 0; i < n; i++) {
      const p = this.w.player.origin;
      const d = Math.hypot(to.x - p.x, to.y - p.y);
      if (d <= radius) {
        this.cmd.forwardMove = 0;
        return { reached: true, stuck: false, dist: d };
      }
      if (d < best - 0.5) {
        best = d;
        sinceBest = 0;
      } else if (++sinceBest > 66) {
        this.cmd.forwardMove = 0;
        return { reached: false, stuck: true, dist: d };
      }
      this.cmd.viewAngles.y = (Math.atan2(to.y - p.y, to.x - p.x) * 180) / Math.PI;
      if (!opts.keepPitch) this.cmd.viewAngles.x = 0;
      this.cmd.forwardMove = 450;
      this.cmd.buttons &= ~IN_USE;
      this.tick();
    }
    this.cmd.forwardMove = 0;
    const p = this.w.player.origin;
    return { reached: false, stuck: false, dist: Math.hypot(to.x - p.x, to.y - p.y) };
  }

  /** Presses +use for one tick (then releases for one). */
  use(): void {
    this.cmd.buttons |= IN_USE;
    this.tick();
    this.cmd.buttons &= ~IN_USE;
    this.tick();
  }

  press(buttons: number): void {
    this.cmd.buttons |= buttons;
    this.tick();
    this.cmd.buttons &= ~buttons;
    this.tick();
  }

  /**
   * A path for the player's standing hull from its position to `to`, over a
   * 16-unit grid (breadth-first; each step steps up to 18 units and drops to
   * the floor, like movement). Waypoints derived from the map itself.
   */
  findPath(to: Vec3, opts: { grid?: number; maxNodes?: number } = {}): Vec3[] | null {
    const w = this.w;
    const p = w.player;
    const g = opts.grid ?? 16;
    const maxNodes = opts.maxNodes ?? 60000;
    const mins = p.params.hullMin;
    const maxs = p.params.hullMax;
    const filter = p.traceFilter;
    const tr = emptyTrace();
    const c = w.collision;
    const key = (x: number, y: number, z: number): string => `${Math.round(x / g)},${Math.round(y / g)},${Math.round(z / 8)}`;
    const start = vec3(p.origin.x, p.origin.y, p.origin.z);
    const prev = new Map<string, string | null>();
    const pos = new Map<string, Vec3>();
    const k0 = key(start.x, start.y, start.z);
    prev.set(k0, null);
    pos.set(k0, start);
    const queue = [k0];
    let goal: string | null = null;
    let best = k0;
    let bestD = Infinity;
    for (let qi = 0; qi < queue.length && qi < maxNodes; qi++) {
      const k = queue[qi];
      const a = pos.get(k)!;
      const d = Math.hypot(a.x - to.x, a.y - to.y) + Math.abs(a.z - to.z) * 0.5;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
      if (Math.hypot(a.x - to.x, a.y - to.y) <= g && Math.abs(a.z - to.z) < 40) {
        goal = k;
        break;
      }
      for (const [dx, dy] of [[g, 0], [-g, 0], [0, g], [0, -g]]) {
        const up = vec3(a.x, a.y, a.z + 18);
        c.traceHull(a, up, mins, maxs, MASK_PLAYERSOLID, filter, tr);
        const s0 = vec3(tr.endPos.x, tr.endPos.y, tr.endPos.z);
        const across = vec3(s0.x + dx, s0.y + dy, s0.z);
        c.traceHull(s0, across, mins, maxs, MASK_PLAYERSOLID, filter, tr);
        if (tr.fraction < 1 || tr.startSolid) continue;
        const down = vec3(across.x, across.y, across.z - 18 - 240);
        c.traceHull(across, down, mins, maxs, MASK_PLAYERSOLID, filter, tr);
        if (tr.startSolid || tr.fraction >= 1 || tr.plane.normal.z < 0.7) continue;
        const b = vec3(tr.endPos.x, tr.endPos.y, tr.endPos.z);
        const kb = key(b.x, b.y, b.z);
        if (prev.has(kb)) continue;
        prev.set(kb, k);
        pos.set(kb, b);
        queue.push(kb);
      }
    }
    if (!goal) {
      this.lastPathFailure = { closest: pos.get(best)!, explored: queue.length };
      return null;
    }
    const out: Vec3[] = [];
    for (let k: string | null = goal; k; k = prev.get(k) ?? null) out.push(pos.get(k)!);
    out.reverse();
    // Keep corners only.
    const simplified: Vec3[] = [];
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1];
      const b = out[i];
      const n = out[i + 1];
      if (!n || Math.sign(b.x - a.x) !== Math.sign(n.x - b.x) || Math.sign(b.y - a.y) !== Math.sign(n.y - b.y) || Math.abs(n.z - b.z) > 1) simplified.push(b);
    }
    return simplified;
  }

  /** Walks a path found by findPath; returns false when it got stuck on the way. */
  followPath(path: Vec3[], timeoutEach = 10): { ok: boolean; at: number } {
    for (let i = 0; i < path.length; i++) {
      const r = this.walkTo(path[i], { radius: i === path.length - 1 ? 12 : 10, timeout: timeoutEach });
      if (!r.reached) return { ok: false, at: i };
    }
    return { ok: true, at: path.length };
  }

  /** Finds and walks a path to `to`, re-planning when something moved into the way. */
  goTo(to: Vec3, opts: { attempts?: number; maxNodes?: number; near?: number } = {}): { ok: boolean; reason: string } {
    for (let a = 0; a < (opts.attempts ?? 4); a++) {
      let path = this.findPath(to, { maxNodes: opts.maxNodes ?? 200000 });
      // Characters walking about can close a gap for a moment: settle for the reachable
      // point nearest the goal when the caller allows it.
      const f = this.lastPathFailure;
      if (!path && opts.near && f && Math.hypot(f.closest.x - to.x, f.closest.y - to.y) <= opts.near) {
        path = this.findPath(f.closest, { maxNodes: opts.maxNodes ?? 200000 });
      }
      if (!path) return { ok: false, reason: 'no path' };
      const r = this.followPath(path);
      if (r.ok) return { ok: true, reason: '' };
      // Side-step and try again.
      this.cmd.sideMove = a % 2 ? 450 : -450;
      this.run(0.3);
      this.cmd.sideMove = 0;
    }
    return { ok: false, reason: 'stuck' };
  }

  /** Why the last findPath failed: the closest point it reached. */
  lastPathFailure: { closest: Vec3; explored: number } | null = null;

  entity(name: string) {
    return this.w.findByName(name);
  }
}
