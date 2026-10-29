/**
 * The portal service, clean-room from Portal's public behaviour and the Valve
 * Developer Community's entity documentation (no Portal game code is used):
 *
 * - Portals are `prop_portal` entities (map-placed or created by the gun), one
 *   blue (PortalTwo 0) and one orange (PortalTwo 1) per linkage group. Opening
 *   a portal closes any other open portal of its colour and group; a pair of
 *   open portals of one group forms a passage.
 * - Placement (`firePortal`): a shot from the eye travels through existing
 *   passages; it needs a world surface whose material is portalable
 *   (`%noportal` absent), outside every func_noportal_volume. The 64 × 112
 *   rectangle is then fitted: samples round its edge must lie on the same
 *   flat surface, clear in front, outside func_portal_bumper volumes and off
 *   the other portal — failing samples slide the rectangle away from their
 *   side, a few units per pass, up to 64 units in all.
 * - Passage: the player and physics objects whose centre crosses a portal's
 *   plane (front to back) inside its rectangle come out of the partner with
 *   position, orientation and velocity mapped through the pair's transform
 *   (portal-math.ts) — speed is conserved.
 * - Walls behind open portals: for box traces made with carving on (player
 *   movement), a box inside a portal's mouth is traced against the map with
 *   its hull cut at the portal plane, plus the hole's frame; for rigid bodies,
 *   the static colliders behind an open portal move to a "wall" collision
 *   group that a body travelling through that portal ignores, and frame boxes
 *   only travellers collide with line the hole.
 * - `traceThroughPortals`: line traces (the gun, energy balls, the renderer's
 *   picking) continue out of the partner portal.
 * - Fizzlers call `fizzleGunPortals`; func_portal_detector queries
 *   `portalsInVolume`.
 */

import { emptyTrace, WORLD_ENTITY, type TraceFilter, type TraceResult } from '../../tf2-game/core/types';
import { CONTENTS_SOLID, IN_ATTACK, IN_ATTACK2, MASK_PLAYERSOLID, MASK_SOLID_BRUSHONLY } from '../../tf2-game/core/constants';
import { angleVectors, copy, normalize, vec3, vectorAngles, type Vec3 } from '../../tf2-game/core/vec';
import type { Entity } from '../../tf2-game/sim/entity';
import { PHYS_GROUP, PROP_FILTER, type PhysBody } from '../physics/physics-world';
import type { PortalCarve } from '../world/collision';
import { clipBoxToAabb } from '../world/convex-trace';
import type { SpWorld } from '../world/sp-world';
import type { SpPlayer } from '../player/sp-player';
import {
  frameAngles,
  frameForward,
  frameFromAngles,
  frameFromNormalUp,
  frameLeft,
  frameUp,
  planeCoords,
  planeDistance,
  portalTransform,
  rectsOverlap,
  segmentEntersPortal,
  transformPoint,
  transformQuat,
  transformVector,
  withinRect,
  PORTAL_HALF_HEIGHT,
  PORTAL_HALF_WIDTH,
  type PortalFrame,
  type PortalTransform,
} from './portal-math';

/** What the service needs from a prop_portal entity. */
export interface PortalEntity extends Entity {
  /** 0 blue (primary), 1 orange (PortalTwo). */
  which: 0 | 1;
  linkage: number;
  activated: boolean;
  frame: PortalFrame;
  fromGun: boolean;
  /** curtime it last opened (the newest wins when several of a colour are open). */
  openedAt: number;
}

/** Volumes that refuse or bump portals (func_noportal_volume, func_portal_bumper). */
export interface PortalVolume extends Entity {
  activeVolume(): boolean;
  pointIsWithin(p: Vec3): boolean;
}

export interface PortalState {
  id: number;
  which: 0 | 1;
  linkage: number;
  open: boolean;
  /** The partner when the passage is open (−1 otherwise). */
  linked: number;
  origin: Vec3;
  angles: Vec3;
  forward: Vec3;
  up: Vec3;
  fromGun: boolean;
}

interface Passage {
  portal: PortalEntity;
  partner: PortalEntity;
  transform: PortalTransform;
  /** Normal / left / up world axes when axis-aligned (−1 otherwise). */
  axisN: number;
  signN: number;
  axisL: number;
  axisU: number;
  /** Frame boxes (world AABBs) behind the hole. */
  frames: Array<{ mins: Vec3; maxs: Vec3 }>;
  /** Physics slot (0/1) for linkage 0, −1 otherwise. */
  slot: number;
}

/** Portal shots refire (the gun's cycle). */
export const PORTALGUN_REFIRE = 0.5;
/** How far the gun's shot reaches. */
export const PORTAL_SHOT_RANGE = 8192;
/** Depth of the hole's frame behind the wall. */
const FRAME_DEPTH = 128;
const FRAME_THICKNESS = 64;
const MAX_FIT_SLIDE = 64;

const AXES: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];

function axisOf(v: Vec3): { axis: number; sign: number } {
  for (let i = 0; i < 3; i++) {
    const c = v[AXES[i]];
    if (Math.abs(c) > 0.999) return { axis: i, sign: c > 0 ? 1 : -1 };
  }
  return { axis: -1, sign: 0 };
}

export class PortalService implements PortalCarve {
  private readonly world: SpWorld;
  readonly portals: PortalEntity[] = [];
  readonly volumes: PortalVolume[] = [];
  readonly bumpers: PortalVolume[] = [];
  private passages: Passage[] = [];
  private readonly prevCenter = vec3(NaN, NaN, NaN);
  private readonly bodyPrev = new Map<number, Vec3>();
  private readonly bodyTraveler = new Map<number, number>();
  private regrouped: Array<{ pieces: ReturnType<SpWorld['physics']['regroupStatic']>; removers: Array<() => void> }> = [];
  /** The latest teleport (tests and the renderer's camera smoothing). */
  lastTeleport: { entity: number; from: number; to: number; speedIn: number; speedOut: number; tick: number } | null = null;

  constructor(world: SpWorld) {
    this.world = world;
  }

  // ─── Registry ────────────────────────────────────────────────────────────

  register(p: PortalEntity): void {
    if (!this.portals.includes(p)) this.portals.push(p);
  }

  unregister(p: PortalEntity): void {
    const i = this.portals.indexOf(p);
    if (i >= 0) this.portals.splice(i, 1);
    this.refresh();
  }

  registerVolume(v: PortalVolume, bumper: boolean): void {
    const list = bumper ? this.bumpers : this.volumes;
    if (!list.includes(v)) list.push(v);
  }

  /** The open partner of a portal (the other colour of its group, newest open), or null. */
  partnerOf(p: PortalEntity): PortalEntity | null {
    let best: PortalEntity | null = null;
    for (const q of this.portals) {
      if (q === p || q.removed || !q.activated || q.linkage !== p.linkage || q.which === p.which) continue;
      if (!best || q.openedAt > best.openedAt) best = q;
    }
    return best;
  }

  /** Opens a portal (closing others of its colour and group). */
  open(p: PortalEntity): void {
    for (const q of this.portals) {
      if (q !== p && q.activated && q.linkage === p.linkage && q.which === p.which) this.close(q, false);
    }
    p.activated = true;
    p.openedAt = this.world.curtime;
    this.world.emit({ type: 'effect', kind: 'portal_open', pos: { ...p.frame.origin }, normal: frameForward(p.frame), entity: p.id });
    this.refresh();
  }

  /** Closes a portal (Fizzle). */
  close(p: PortalEntity, fizzle = true): void {
    if (!p.activated) return;
    p.activated = false;
    if (fizzle) {
      this.world.emit({ type: 'effect', kind: 'portal_fizzle', pos: { ...p.frame.origin }, normal: frameForward(p.frame), entity: p.id });
      this.world.emitSound(p.which === 0 ? 'Portal.fizzle_moved' : 'Portal.fizzle_moved', { pos: p.frame.origin });
    }
    this.refresh();
  }

  /** Fizzlers: closes every portal the gun placed. */
  fizzleGunPortals(): number {
    let n = 0;
    for (const p of this.portals) {
      if (p.fromGun && p.activated) {
        this.close(p, true);
        n++;
      }
    }
    return n;
  }

  /** Rebuilds the open passages and the physics walls behind them. */
  refresh(): void {
    const phys = this.world.physics;
    for (const r of this.regrouped) {
      phys.restoreStatic(r.pieces);
      for (const rm of r.removers) rm();
    }
    this.regrouped = [];
    const out: Passage[] = [];
    for (const p of this.portals) {
      if (p.removed || !p.activated) continue;
      const partner = this.partnerOf(p);
      if (!partner) continue;
      // Only the newest open portal of a colour forms the passage.
      const newest = this.portals.filter((q) => q.activated && q.linkage === p.linkage && q.which === p.which && !q.removed).sort((a, b) => b.openedAt - a.openedAt)[0];
      if (newest !== p) continue;
      const fwd = frameForward(p.frame);
      const n = axisOf(fwd);
      const l = axisOf(frameLeft(p.frame));
      const u = axisOf(frameUp(p.frame));
      const passage: Passage = {
        portal: p,
        partner,
        transform: portalTransform(p.frame, partner.frame),
        axisN: n.axis,
        signN: n.sign,
        axisL: l.axis,
        axisU: u.axis,
        frames: [],
        slot: p.linkage === 0 ? p.which : -1,
      };
      if (n.axis >= 0 && l.axis >= 0 && u.axis >= 0) passage.frames = this.frameBoxes(p.frame);
      out.push(passage);
      // Physics: walls behind, frames for travellers.
      if (passage.slot >= 0 && passage.frames.length > 0) {
        const tunnel = this.tunnelBox(p.frame);
        const wallGroup = passage.slot === 0 ? PHYS_GROUP.PORTAL_WALL_0 : PHYS_GROUP.PORTAL_WALL_1;
        const frameGroup = passage.slot === 0 ? PHYS_GROUP.PORTAL_FRAME_0 : PHYS_GROUP.PORTAL_FRAME_1;
        const pieces = phys.regroupStatic(
          (mins, maxs) =>
            mins.x < tunnel.maxs.x && maxs.x > tunnel.mins.x && mins.y < tunnel.maxs.y && maxs.y > tunnel.mins.y && mins.z < tunnel.maxs.z && maxs.z > tunnel.mins.z,
          wallGroup,
        );
        const removers = passage.frames.map((f) => phys.addStaticBox(f.mins, f.maxs, frameGroup, PHYS_GROUP.PROP));
        this.regrouped.push({ pieces, removers });
      }
    }
    this.passages = out;
  }

  /** The region just behind an open portal (shrunk inside the rectangle). */
  private tunnelBox(fr: PortalFrame): { mins: Vec3; maxs: Vec3 } {
    return this.localBox(fr, -64, -0.5, -PORTAL_HALF_WIDTH + 2, PORTAL_HALF_WIDTH - 2, -PORTAL_HALF_HEIGHT + 2, PORTAL_HALF_HEIGHT - 2);
  }

  /** The hole's four sides behind the wall, as world AABBs (axis-aligned portals). */
  private frameBoxes(fr: PortalFrame): Array<{ mins: Vec3; maxs: Vec3 }> {
    const W = PORTAL_HALF_WIDTH;
    const H = PORTAL_HALF_HEIGHT;
    const T = FRAME_THICKNESS;
    const D = -FRAME_DEPTH;
    return [
      this.localBox(fr, D, 0, W, W + T, -H - T, H + T),
      this.localBox(fr, D, 0, -W - T, -W, -H - T, H + T),
      this.localBox(fr, D, 0, -W, W, H, H + T),
      this.localBox(fr, D, 0, -W, W, -H - T, -H),
    ];
  }

  /** World AABB of a box in the portal's frame: forward [f0,f1], left [l0,l1], up [u0,u1]. */
  private localBox(fr: PortalFrame, f0: number, f1: number, l0: number, l1: number, u0: number, u1: number): { mins: Vec3; maxs: Vec3 } {
    const mins = vec3(Infinity, Infinity, Infinity);
    const maxs = vec3(-Infinity, -Infinity, -Infinity);
    const m = fr.m;
    for (const f of [f0, f1])
      for (const l of [l0, l1])
        for (const u of [u0, u1]) {
          const x = fr.origin.x + m[0] * f + m[1] * l + m[2] * u;
          const y = fr.origin.y + m[3] * f + m[4] * l + m[5] * u;
          const z = fr.origin.z + m[6] * f + m[7] * l + m[8] * u;
          mins.x = Math.min(mins.x, x);
          mins.y = Math.min(mins.y, y);
          mins.z = Math.min(mins.z, z);
          maxs.x = Math.max(maxs.x, x);
          maxs.y = Math.max(maxs.y, y);
          maxs.z = Math.max(maxs.z, z);
        }
    return { mins, maxs };
  }

  /** Open passages (for tests / the renderer). */
  get openPassages(): ReadonlyArray<{ portal: PortalEntity; partner: PortalEntity; transform: PortalTransform }> {
    return this.passages;
  }

  // ─── PortalCarve ─────────────────────────────────────────────────────────

  carveHull(start: Vec3, end: Vec3, mins: Vec3, maxs: Vec3, hullMins: Vec3, hullMaxs: Vec3): number {
    for (let i = 0; i < this.passages.length; i++) {
      const ps = this.passages[i];
      if (ps.frames.length === 0) continue;
      const fr = ps.portal.frame;
      const k = AXES[ps.axisN];
      const kl = AXES[ps.axisL];
      const ku = AXES[ps.axisU];
      const extL = (maxs[kl] - mins[kl]) / 2;
      const extU = (maxs[ku] - mins[ku]) / 2;
      // The start must be in the mouth (the frame boxes keep the rest of the move inside it).
      cc.x = start.x + (mins.x + maxs.x) / 2;
      cc.y = start.y + (mins.y + maxs.y) / 2;
      cc.z = start.z + (mins.z + maxs.z) / 2;
      const c = planeCoords(fr, cc);
      if (Math.abs(c.left) + extL > PORTAL_HALF_WIDTH + 0.5 || Math.abs(c.up) + extU > PORTAL_HALF_HEIGHT + 0.5) continue;
      const dS = planeDistance(fr, start);
      const dE = planeDistance(fr, end);
      const s = ps.signN;
      const front = s > 0 ? maxs[k] : -mins[k];
      const back = s > 0 ? mins[k] : -maxs[k];
      const near = Math.min(dS, dE);
      if (near + back > 1) continue; // not reaching the wall
      if (Math.max(dS, dE) + front < 0) continue;
      const nb = Math.min(Math.max(back, 0.05 - near), front - 0.5);
      copy(hullMins, mins);
      copy(hullMaxs, maxs);
      if (s > 0) hullMins[k] = nb;
      else hullMaxs[k] = -nb;
      return i;
    }
    return -1;
  }

  clipFrame(portal: number, start: Vec3, end: Vec3, mins: Vec3, maxs: Vec3, out: TraceResult): void {
    const ps = this.passages[portal];
    if (!ps) return;
    for (const f of ps.frames) {
      clipBoxToAabb(f.mins, f.maxs, start, end, mins, maxs, WORLD_ENTITY, CONTENTS_SOLID, out);
      if (out.allSolid) return;
    }
  }

  // ─── Passage for the player and bodies ──────────────────────────────────────

  /** Teleports the player when its centre crossed an open portal this tick. */
  updatePlayer(): void {
    const p = this.world.player;
    centerOf(p, cc);
    if (Number.isNaN(this.prevCenter.x)) {
      copy(this.prevCenter, cc);
      return;
    }
    for (const ps of this.passages) {
      const fr = ps.portal.frame;
      const d0 = planeDistance(fr, this.prevCenter);
      const d1 = planeDistance(fr, cc);
      if (!(d0 >= 0 && d1 < 0)) continue;
      if (!withinRect(fr, cc) && !withinRect(fr, this.prevCenter)) continue;
      this.teleportPlayer(p, ps);
      centerOf(p, cc);
      break;
    }
    copy(this.prevCenter, cc);
  }

  /** Forgets the player's last position (after a teleport by the map or a checkpoint). */
  resetPlayerTracking(): void {
    this.prevCenter.x = NaN;
  }

  private teleportPlayer(p: SpPlayer, ps: Passage): void {
    const tr = ps.transform;
    const speedIn = Math.hypot(p.move.velocity.x, p.move.velocity.y, p.move.velocity.z);
    centerOf(p, cc);
    const off = { x: cc.x - p.origin.x, y: cc.y - p.origin.y, z: cc.z - p.origin.z };
    const nc = transformPoint(tr, cc, vec3());
    const nv = transformVector(tr, p.move.velocity, vec3());
    // View: forward and up through the passage, roll levelled out.
    angleVectors(p.eyeAngles, tF, tR, tU);
    transformVector(tr, tF, tF);
    const ang = vectorAngles(tF, vec3());
    if (ang.x > 180) ang.x -= 360;
    ang.x = Math.max(-89, Math.min(89, ang.x));
    ang.z = 0;
    // Keep the hull's cross-section inside the exit's rectangle (the hole the player comes out of).
    const pf = ps.partner.frame;
    const hx = (p.maxs.x - p.mins.x) / 2;
    const hy = (p.maxs.y - p.mins.y) / 2;
    const hz = (p.maxs.z - p.mins.z) / 2;
    const L = frameLeft(pf);
    const U = frameUp(pf);
    const extL = Math.abs(L.x) * hx + Math.abs(L.y) * hy + Math.abs(L.z) * hz;
    const extU = Math.abs(U.x) * hx + Math.abs(U.y) * hy + Math.abs(U.z) * hz;
    const pc = planeCoords(pf, nc);
    const maxL = Math.max(0, PORTAL_HALF_WIDTH - extL - 1);
    const maxU = Math.max(0, PORTAL_HALF_HEIGHT - extU - 1);
    const dl = Math.max(-maxL, Math.min(maxL, pc.left)) - pc.left;
    const du = Math.max(-maxU, Math.min(maxU, pc.up)) - pc.up;
    nc.x += L.x * dl + U.x * du;
    nc.y += L.y * dl + U.y * du;
    nc.z += L.z * dl + U.z * du;
    const no = { x: nc.x - off.x, y: nc.y - off.y, z: nc.z - off.z };
    // Make sure it fits; push out along the exit's normal when it doesn't.
    const out = frameForward(ps.partner.frame);
    const trace = emptyTrace();
    const c = this.world.collision;
    c.carving = true;
    for (let i = 0; i < 24; i++) {
      c.traceHull(no, no, p.mins, p.maxs, MASK_PLAYERSOLID, p.traceFilter, trace);
      if (!trace.startSolid) break;
      no.x += out.x * 2;
      no.y += out.y * 2;
      no.z += out.z * 2;
    }
    c.carving = false;
    p.placeAt(no, ang, nv);
    if (p.held && p.held.phys) {
      // The held object comes along at the same offset from the eyes.
      p.held.phys.setPose({ x: no.x + out.x * 24, y: no.y + out.y * 24, z: no.z + p.move.viewOffsetZ }, null);
    }
    ps.portal.fireOutput('OnPlayerTeleportFromMe', p);
    ps.partner.fireOutput('OnPlayerTeleportToMe', p);
    this.world.emitSound('PortalPlayer.EnterPortal', { entity: p.id });
    this.world.emit({ type: 'teleport', entity: p.id });
    this.lastTeleport = {
      entity: p.id,
      from: ps.portal.id,
      to: ps.partner.id,
      speedIn,
      speedOut: Math.hypot(nv.x, nv.y, nv.z),
      tick: this.world.tickCount,
    };
  }

  /** Rigid bodies: passage groups and teleports. */
  updateBodies(): void {
    const w = this.world;
    for (const [id, b] of w.bodiesByEntity) {
      if (b.removed || b.kind !== 'dynamic') continue;
      const e = w.entity(id);
      if (!e) continue;
      b.getCenter(cc);
      let prev = this.bodyPrev.get(b.handle);
      if (!prev) {
        prev = { ...cc };
        this.bodyPrev.set(b.handle, prev);
      }
      // Travelling through a portal: ignore that portal's wall, collide with its frame.
      let traveller = -1;
      for (const ps of this.passages) {
        if (ps.slot < 0 || ps.frames.length === 0) continue;
        const d = planeDistance(ps.portal.frame, cc);
        if (d > b.radius + 8 || d < -b.radius - 8) continue;
        if (!withinRect(ps.portal.frame, cc, Math.min(b.radius * 0.5, 20))) continue;
        traveller = ps.slot;
        break;
      }
      const was = this.bodyTraveler.get(b.handle) ?? -1;
      if (traveller !== was && !b.held) {
        if (traveller < 0) b.setGroups(b.membership, PROP_FILTER);
        else {
          const wall = traveller === 0 ? PHYS_GROUP.PORTAL_WALL_0 : PHYS_GROUP.PORTAL_WALL_1;
          const frame = traveller === 0 ? PHYS_GROUP.PORTAL_FRAME_0 : PHYS_GROUP.PORTAL_FRAME_1;
          b.setGroups(b.membership, (PROP_FILTER & ~wall) | frame);
        }
        this.bodyTraveler.set(b.handle, traveller);
      }
      for (const ps of this.passages) {
        const fr = ps.portal.frame;
        const d0 = planeDistance(fr, prev);
        const d1 = planeDistance(fr, cc);
        if (!(d0 >= 0 && d1 < 0) || !withinRect(fr, cc)) continue;
        this.teleportBody(e, b, ps);
        b.getCenter(cc);
        break;
      }
      copy(prev, cc);
    }
  }

  private teleportBody(e: Entity, b: PhysBody, ps: Passage): void {
    const tr = ps.transform;
    if (this.world.player.held && this.world.player.held.id === e.id) this.world.player.drop(false);
    const o = b.getOrigin(vec3());
    const q = b.getQuat({ x: 0, y: 0, z: 0, w: 1 });
    const v = b.getVelocity(vec3());
    const av = b.getAngularVelocity(vec3());
    const speedIn = Math.hypot(v.x, v.y, v.z);
    const no = transformPoint(tr, o, vec3());
    const nq = transformQuat(tr, q, { x: 0, y: 0, z: 0, w: 1 });
    const nv = transformVector(tr, v, vec3());
    const nav = transformVector(tr, av, vec3());
    b.setPose(no, null, nq);
    b.setVelocity(nv);
    b.setAngularVelocity(nav);
    const sync = e as Entity & { syncFromBody?: () => void };
    sync.syncFromBody?.();
    ps.portal.fireOutput('OnEntityTeleportFromMe', e);
    ps.partner.fireOutput('OnEntityTeleportToMe', e);
    this.lastTeleport = { entity: e.id, from: ps.portal.id, to: ps.partner.id, speedIn, speedOut: Math.hypot(nv.x, nv.y, nv.z), tick: this.world.tickCount };
  }

  /**
   * A point (energy ball, projectile) moving from `start` to `end`: when the
   * segment enters an open portal, returns the mapped position, velocity
   * transform and the portals; else null.
   */
  crossing(start: Vec3, end: Vec3): { passage: Passage; t: number } | null {
    let best: { passage: Passage; t: number } | null = null;
    for (const ps of this.passages) {
      const t = segmentEntersPortal(ps.portal.frame, start, end);
      if (t >= 0 && (!best || t < best.t)) best = { passage: ps, t };
    }
    return best;
  }

  // ─── Traces through portals ────────────────────────────────────────────────

  /**
   * A line trace that continues out of open portals (up to `maxPortals`).
   * Returns the final segment's trace plus every portal passed.
   */
  traceThroughPortals(
    start: Vec3,
    end: Vec3,
    mask: number,
    filter: TraceFilter | null,
    maxPortals = 4,
  ): { trace: TraceResult; start: Vec3; end: Vec3; dir: Vec3; portals: PortalEntity[] } {
    const s = { ...start };
    const e = { ...end };
    const crossed: PortalEntity[] = [];
    const trace = emptyTrace();
    const dir = vec3(e.x - s.x, e.y - s.y, e.z - s.z);
    let remaining = normalize(dir);
    for (let hop = 0; ; hop++) {
      this.world.collision.traceLine(s, e, mask, filter, trace);
      if (hop >= maxPortals) break;
      const len = Math.hypot(e.x - s.x, e.y - s.y, e.z - s.z) || 1;
      const hit = this.crossing(s, e);
      if (!hit || hit.t > trace.fraction + 1 / len) break;
      const ps = hit.passage;
      const p = { x: s.x + (e.x - s.x) * hit.t, y: s.y + (e.y - s.y) * hit.t, z: s.z + (e.z - s.z) * hit.t };
      remaining -= len * hit.t;
      crossed.push(ps.portal);
      transformPoint(ps.transform, p, s);
      transformVector(ps.transform, dir, dir);
      s.x += dir.x * 0.5;
      s.y += dir.y * 0.5;
      s.z += dir.z * 0.5;
      e.x = s.x + dir.x * remaining;
      e.y = s.y + dir.y * remaining;
      e.z = s.z + dir.z * remaining;
    }
    return { trace, start: s, end: e, dir, portals: crossed };
  }

  // ─── The gun ───────────────────────────────────────────────────────────────

  /** weapon_portalgun input handling: +attack blue, +attack2 orange. */
  gunInput(player: SpPlayer, buttons: number, pressed: number): void {
    const gun = player.portalgun;
    if (!gun) return;
    if (this.world.curtime < gun.nextFire) return;
    let which: 0 | 1 | -1 = -1;
    if (buttons & IN_ATTACK && gun.canFire1) which = 0;
    else if (buttons & IN_ATTACK2 && gun.canFire2) which = 1;
    else if (pressed & (IN_ATTACK | IN_ATTACK2)) {
      this.world.emitSound('Weapon_Portalgun.powerup', { entity: player.id });
      gun.nextFire = this.world.curtime + PORTALGUN_REFIRE;
      return;
    }
    if (which < 0) return;
    gun.nextFire = this.world.curtime + PORTALGUN_REFIRE;
    this.firePortal(player, which as 0 | 1);
  }

  /** Fires a portal shot from the player's eyes; returns the placed portal or null. */
  firePortal(player: SpPlayer, which: 0 | 1, linkage = 0): PortalEntity | null {
    const eye = player.eyePosition(vec3());
    const fwd = vec3();
    angleVectors(player.eyeAngles, fwd);
    const end = { x: eye.x + fwd.x * PORTAL_SHOT_RANGE, y: eye.y + fwd.y * PORTAL_SHOT_RANGE, z: eye.z + fwd.z * PORTAL_SHOT_RANGE };
    this.world.emitSound(which === 0 ? 'Weapon_Portalgun.fire_blue' : 'Weapon_Portalgun.fire_red', { entity: player.id });
    const filter: TraceFilter = (id) => {
      if (id === player.id) return false;
      const e = this.world.entity(id);
      return !e || e.bspModel > 0;
    };
    const res = this.traceThroughPortals(eye, end, MASK_SOLID_BRUSHONLY, filter);
    return this.placeFromTrace(which, linkage, res.trace, res.dir);
  }

  /** Places a portal where a shot hit (shared by the gun and weapon_portalgun's FirePortal inputs). */
  placeFromTrace(which: 0 | 1, linkage: number, tr: TraceResult, dir: Vec3): PortalEntity | null {
    const w = this.world;
    if (tr.fraction >= 1 || tr.startSolid) return this.fail(tr.endPos, null);
    const n = tr.plane.normal;
    if (tr.entity !== WORLD_ENTITY) return this.fail(tr.endPos, n);
    if (!this.surfacePortalable(tr.surfaceName, tr.surfaceFlags)) return this.fail(tr.endPos, n);
    if (this.inNoPortalVolume(tr.endPos)) return this.fail(tr.endPos, n);
    const fr = this.fitPortal(which, linkage, tr.endPos, n, dir);
    if (!fr) return this.fail(tr.endPos, n);
    const p = this.gunPortal(which, linkage);
    p.frame = fr;
    copy(p.origin, fr.origin);
    frameAngles(fr, p.angles);
    p.fromGun = true;
    this.open(p);
    w.emitSound(which === 0 ? 'Portal.open_blue' : 'Portal.open_red', { pos: fr.origin });
    p.fireOutput('OnPlacedSuccessfully', w.player);
    return p;
  }

  private fail(pos: Vec3, normal: Vec3 | null): null {
    this.world.emit({ type: 'effect', kind: 'portal_fail', pos: { ...pos }, normal: normal ? { ...normal } : undefined });
    this.world.emitSound('Portal.fizzle_invalid_surface', { pos });
    return null;
  }

  /** The gun's portal entity of a colour (created on first use). */
  private gunPortal(which: 0 | 1, linkage: number): PortalEntity {
    for (const p of this.portals) if (p.fromGun && p.which === which && p.linkage === linkage && !p.removed) return p;
    const e = this.world.spawnEntity('prop_portal', (ent) => {
      const pe = ent as PortalEntity;
      pe.which = which;
      pe.linkage = linkage;
      pe.fromGun = true;
    }) as PortalEntity;
    return e;
  }

  /** Whether a material takes portals (and isn't sky / nodraw). */
  surfacePortalable(material: string, surfaceFlags: number): boolean {
    // SURF_SKY | SURF_SKY2D | SURF_NODRAW
    if (surfaceFlags & (0x4 | 0x2 | 0x80)) return false;
    if (!material) return false;
    return !this.world.assets.material(material).noportal;
  }

  inNoPortalVolume(p: Vec3): boolean {
    for (const v of this.volumes) if (!v.removed && v.activeVolume() && v.pointIsWithin(p)) return true;
    return false;
  }

  private inBumper(p: Vec3): boolean {
    for (const v of this.bumpers) if (!v.removed && v.activeVolume() && v.pointIsWithin(p)) return true;
    return false;
  }

  /**
   * Fits the rectangle on the surface at `hit` (see the module comment).
   * Walls take world up as the portal's up; floors and ceilings face the
   * portal's top along the shot.
   */
  fitPortal(which: 0 | 1, linkage: number, hit: Vec3, normal: Vec3, dir: Vec3): PortalFrame | null {
    const n = { ...normal };
    normalize(n);
    let upHint: Vec3;
    if (Math.abs(n.z) < 0.7) upHint = { x: 0, y: 0, z: 1 };
    else {
      upHint = { x: dir.x, y: dir.y, z: 0 };
      if (normalize(upHint) === 0) upHint = { x: 1, y: 0, z: 0 };
      if (n.z < 0) upHint = { x: -upHint.x, y: -upHint.y, z: 0 };
    }
    const origin = { ...hit };
    const other = this.openOther(which, linkage);
    const tr = emptyTrace();
    let slid = 0;
    const samples: Array<[number, number]> = [];
    for (const l of [-1, -0.5, 0, 0.5, 1]) for (const u of [-1, -0.5, 0, 0.5, 1]) if (Math.abs(l) === 1 || Math.abs(u) === 1) samples.push([l, u]);
    for (let iter = 0; iter < 24; iter++) {
      const fr = frameFromNormalUp(origin, n, upHint);
      const left = frameLeft(fr);
      const up = frameUp(fr);
      let pushL = 0;
      let pushU = 0;
      let bad = 0;
      for (const [sl, su] of samples) {
        const lo = sl * (PORTAL_HALF_WIDTH - 1);
        const uo = su * (PORTAL_HALF_HEIGHT - 1);
        const q = { x: origin.x + left.x * lo + up.x * uo, y: origin.y + left.y * lo + up.y * uo, z: origin.z + left.z * lo + up.z * uo };
        if (!this.sampleOk(fr, q, n, tr, other)) {
          bad++;
          pushL -= sl;
          pushU -= su;
        }
      }
      if (bad === 0) {
        if (other && rectsOverlap(fr, other.frame)) return null;
        if (this.inNoPortalVolume(origin)) return null;
        return fr;
      }
      if (pushL === 0 && pushU === 0) return null;
      const len = Math.hypot(pushL, pushU);
      const step = iter < 12 ? 4 : 2;
      origin.x += (left.x * pushL + up.x * pushU) * (step / len);
      origin.y += (left.y * pushL + up.y * pushU) * (step / len);
      origin.z += (left.z * pushL + up.z * pushU) * (step / len);
      slid += step;
      if (slid > MAX_FIT_SLIDE) return null;
    }
    return null;
  }

  private openOther(which: 0 | 1, linkage: number): PortalEntity | null {
    let best: PortalEntity | null = null;
    for (const p of this.portals) {
      if (p.removed || !p.activated || p.linkage !== linkage || p.which === which) continue;
      if (!best || p.openedAt > best.openedAt) best = p;
    }
    return best;
  }

  /** One fit sample: on the same flat portalable surface, clear in front, not bumped, off the other portal. */
  private sampleOk(fr: PortalFrame, q: Vec3, n: Vec3, tr: TraceResult, other: PortalEntity | null): boolean {
    const c = this.world.collision;
    const worldOnly: TraceFilter = (id) => {
      const e = this.world.entity(id);
      return !!e && e.bspModel > 0 && e.isSolid();
    };
    // Clear from the centre to the sample, just in front of the surface (no corner, no obstruction).
    a.x = fr.origin.x + n.x * 2;
    a.y = fr.origin.y + n.y * 2;
    a.z = fr.origin.z + n.z * 2;
    b.x = q.x + n.x * 2;
    b.y = q.y + n.y * 2;
    b.z = q.z + n.z * 2;
    c.traceMap(a, b, zero, zero, MASK_SOLID_BRUSHONLY, worldOnly, tr);
    if (tr.fraction < 1 || tr.startSolid) return false;
    // The surface is there and flat.
    a.x = q.x - n.x * 4;
    a.y = q.y - n.y * 4;
    a.z = q.z - n.z * 4;
    c.traceMap(b, a, zero, zero, MASK_SOLID_BRUSHONLY, worldOnly, tr);
    if (tr.fraction >= 1 || tr.startSolid || tr.entity !== WORLD_ENTITY) return false;
    const nn = tr.plane.normal;
    if (nn.x * n.x + nn.y * n.y + nn.z * n.z < 0.99) return false;
    if (Math.abs(planeDistance(fr, tr.endPos)) > 1) return false;
    if (!this.surfacePortalable(tr.surfaceName, tr.surfaceFlags)) return false;
    if (this.inBumper(q) || this.inNoPortalVolume(q)) return false;
    if (other && Math.abs(planeDistance(other.frame, q)) < 2 && withinRect(other.frame, q, -1)) return false;
    return true;
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  /** Open portals whose centre lies inside a volume (func_portal_detector). */
  portalsInVolume(contains: (p: Vec3) => boolean, linkage: number): PortalEntity[] {
    return this.portals.filter((p) => !p.removed && p.activated && p.linkage === linkage && contains(p.frame.origin));
  }

  isLinked(p: PortalEntity): boolean {
    return this.passages.some((ps) => ps.portal === p || ps.partner === p);
  }

  state(): PortalState[] {
    return this.portals
      .filter((p) => !p.removed)
      .map((p) => {
        const linked = p.activated ? this.partnerOf(p) : null;
        return {
          id: p.id,
          which: p.which,
          linkage: p.linkage,
          open: p.activated,
          linked: linked ? linked.id : -1,
          origin: { ...p.frame.origin },
          angles: frameAngles(p.frame),
          forward: frameForward(p.frame),
          up: frameUp(p.frame),
          fromGun: p.fromGun,
        };
      });
  }

  capture(): null {
    return null;
  }

  restore(_state: unknown): void {
    this.prevCenter.x = NaN;
    this.bodyPrev.clear();
    this.bodyTraveler.clear();
    for (const p of this.portals) p.frame = frameFromAngles(p.origin, p.angles);
    this.refresh();
  }
}

function centerOf(e: Entity, out: Vec3): Vec3 {
  out.x = e.origin.x + (e.mins.x + e.maxs.x) / 2;
  out.y = e.origin.y + (e.mins.y + e.maxs.y) / 2;
  out.z = e.origin.z + (e.mins.z + e.maxs.z) / 2;
  return out;
}

const cc = vec3();
const tF = vec3();
const tR = vec3();
const tU = vec3();
const a = vec3();
const b = vec3();
const zero = Object.freeze(vec3());
