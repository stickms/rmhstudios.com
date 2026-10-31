/**
 * Passage through portals for the player, in a synthetic room traced like BSP brushes: the
 * shared CGameMovement port moves the player with portal carving on (as SpPlayer does), the
 * portal service teleports it when its centre crosses an open portal. Floor and ceiling portals
 * turn with the shot, so they are checked at many yaws, entered falling, standing and walking;
 * the exit must never leave the player inside the world. No game files.
 */
import { describe, expect, it } from 'vitest';
import { FL_ONGROUND, MASK_PLAYERSOLID } from '../../tf2-game/core/constants';
import { emptyTrace, emptyUserCmd, NO_ENTITY, type TraceFilter } from '../../tf2-game/core/types';
import { copy, vec3, type Vec3 } from '../../tf2-game/core/vec';
import { playerMove } from '../../tf2-game/sim/movement';
import { createMoveState, type MoveContext, type MoveState } from '../../tf2-game/sim/movement-types';
import { boxBrush, BoxWorld, roomBrushes, type Brush } from '../../tf2-game/sim/__fixtures__/box-world';
import type { MapCollision } from '../../tf2-game/world/map-collision';
import { PORTAL_MOVE_PARAMS } from '../constants';
import { SpCollision } from '../world/collision';
import { findFreeSpace } from '../world/free-space';
import type { SpWorld } from '../world/sp-world';
import { frameForward, frameFromNormalUp, planeDistance, PORTAL_HALF_HEIGHT, PORTAL_HALF_WIDTH, type PortalFrame } from './portal-math';
import { frameBoxes, MIN_FLOOR_EXIT_SPEED_PLAYER, PortalService, type PortalEntity } from './portals';

const DT = 1 / 66;
const HALF = 512;
const HEIGHT = 256;
const THICK = 192;

interface FakePlayer {
  id: number;
  origin: Vec3;
  mins: Vec3;
  maxs: Vec3;
  move: MoveState;
  eyeAngles: Vec3;
  held: null;
  dead: boolean;
  traceFilter: TraceFilter;
  placeAt(origin: Vec3, angles: Vec3 | null, velocity: Vec3 | null): void;
}

/** The part of SpWorld the portal service uses, over a BoxWorld map. */
function setup(extra: Brush[] = []) {
  const map = new BoxWorld([...roomBrushes(HALF, HEIGHT, THICK), ...extra]);
  const collision = new SpCollision(map as unknown as MapCollision);
  const st = createMoveState(0, 0);
  st.viewOffsetZ = PORTAL_MOVE_PARAMS.viewZ ?? 64;
  st.maxSpeed = 175;
  const tr = emptyTrace();
  const player: FakePlayer = {
    id: 1,
    origin: st.origin,
    mins: { ...PORTAL_MOVE_PARAMS.hullMin },
    maxs: { ...PORTAL_MOVE_PARAMS.hullMax },
    move: st,
    eyeAngles: vec3(),
    held: null,
    dead: false,
    traceFilter: () => true,
    placeAt(origin, angles, velocity) {
      copy(st.origin, origin);
      if (angles) copy(this.eyeAngles, angles);
      if (velocity) copy(st.velocity, velocity);
      else st.velocity.x = st.velocity.y = st.velocity.z = 0;
      st.groundEntity = NO_ENTITY;
      st.flags &= ~FL_ONGROUND;
    },
  };
  const fits = (o: Vec3): boolean => {
    collision.carving = true;
    collision.traceHull(o, o, player.mins, player.maxs, MASK_PLAYERSOLID, null, tr);
    collision.carving = false;
    return !tr.startSolid;
  };
  /** Fits with no portal carving at all: plainly outside every solid. */
  const fitsUncarved = (o: Vec3): boolean => {
    collision.traceHull(o, o, player.mins, player.maxs, MASK_PLAYERSOLID, null, tr);
    return !tr.startSolid;
  };
  const orientedBoxes: Array<{ rotation: unknown }> = [];
  const world = {
    curtime: 0,
    tickCount: 0,
    player,
    collision,
    physics: {
      regroupStatic: () => [],
      restoreStatic: () => {},
      addStaticOrientedBox: (_c: Vec3, _h: Vec3, rotation: unknown) => {
        orientedBoxes.push({ rotation });
        return () => {};
      },
    },
    emit: () => {},
    emitSound: () => {},
    playerFits: fits,
    unstickPlayer(prefer: Vec3 | null = null, maxDist = 64): boolean {
      const at = findFreeSpace(player.origin, fits, { prefer, maxDist });
      if (at) copy(st.origin, at);
      return !!at;
    },
  };
  const portals = new PortalService(world as unknown as SpWorld);
  collision.portals = portals;
  let nextId = 100;
  const makePortal = (which: 0 | 1, frame: PortalFrame): PortalEntity => {
    const p = {
      id: nextId++,
      which,
      linkage: 0,
      activated: false,
      frame,
      fromGun: true,
      openedAt: 0,
      removed: false,
      origin: { ...frame.origin },
      angles: vec3(),
      fireOutput: () => {},
    } as unknown as PortalEntity;
    portals.register(p);
    return p;
  };
  const ctx: MoveContext = { params: PORTAL_MOVE_PARAMS, world: collision, curtime: 0, filter: null };
  const cmd = emptyUserCmd();
  /** One tick: the move with carving on (SpPlayer.runCommand), then the portal pass (SpWorld.step). */
  const tick = (): void => {
    cmd.commandNumber++;
    world.tickCount++;
    world.curtime += DT;
    ctx.curtime = world.curtime;
    copy(cmd.viewAngles, player.eyeAngles);
    collision.carving = true;
    playerMove(st, cmd, ctx);
    collision.carving = false;
    portals.updatePlayer();
  };
  /** Runs until `until` (or `seconds` pass); counts ticks the player ended inside a solid. */
  const run = (seconds: number, until?: () => boolean): { done: boolean; stuckTicks: number } => {
    let stuckTicks = 0;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      tick();
      if (!fits(st.origin)) stuckTicks++;
      if (until?.()) return { done: true, stuckTicks };
    }
    return { done: !!until?.(), stuckTicks };
  };
  const place = (o: Vec3, v: Vec3 = vec3()): void => {
    player.placeAt(o, null, v);
    portals.resetPlayerTracking();
  };
  return { map, collision, st, player, portals, makePortal, run, tick, cmd, place, fits, fitsUncarved, orientedBoxes };
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
/** A floor portal at (x, y) whose top faces the yaw it was shot at. */
const floorPortal = (x: number, y: number, yaw: number): PortalFrame =>
  frameFromNormalUp(vec3(x, y, 0), vec3(0, 0, 1), vec3(Math.cos(rad(yaw)), Math.sin(rad(yaw)), 0));
const ceilingPortal = (x: number, y: number, yaw: number): PortalFrame =>
  frameFromNormalUp(vec3(x, y, HEIGHT), vec3(0, 0, -1), vec3(-Math.cos(rad(yaw)), -Math.sin(rad(yaw)), 0));
/** On the −x wall, facing +x into the room, its bottom 8 units over the floor. */
const wallPortal = (y = 0): PortalFrame => frameFromNormalUp(vec3(-HALF, y, PORTAL_HALF_HEIGHT + 8), vec3(1, 0, 0), vec3(0, 0, 1));

const YAWS = [0, 23, 37, 61, 90, 145, 222, 300];
const speed = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);

describe('portal passage: floor portals at any yaw', () => {
  for (const yaw of YAWS) {
    it(`falling into a floor portal shot at yaw ${yaw}° comes out of the wall portal at the same speed`, () => {
      const t = setup();
      const a = t.makePortal(0, floorPortal(0, 0, yaw));
      const b = t.makePortal(1, wallPortal());
      t.portals.open(a);
      t.portals.open(b);
      t.place(vec3(0, 0, 40), vec3(0, 0, -300));
      const r = t.run(1, () => t.portals.lastTeleport !== null);
      expect(r.done).toBe(true);
      const tp = t.portals.lastTeleport!;
      expect(tp.from).toBe(a.id);
      expect(tp.to).toBe(b.id);
      expect(Math.abs(tp.speedOut - tp.speedIn)).toBeLessThan(1e-9 * tp.speedIn);
      // Out of the wall portal along its normal (+x), in front of it, and never inside the wall.
      expect(t.st.velocity.x).toBeGreaterThan(0.95 * tp.speedIn);
      expect(t.fits(t.st.origin)).toBe(true);
      expect(r.stuckTicks).toBe(0);
      expect(t.run(1).stuckTicks).toBe(0);
    });

    it(`standing still on a floor portal shot at yaw ${yaw}° drops the player through it`, () => {
      const t = setup();
      const a = t.makePortal(0, floorPortal(0, 0, yaw));
      t.portals.open(a);
      t.portals.open(t.makePortal(1, wallPortal()));
      t.place(vec3(0, 0, 0.03125));
      // Not standing on the floor that the hole cut away.
      const r = t.run(2, () => t.portals.lastTeleport !== null);
      expect(r.done).toBe(true);
      expect(t.portals.lastTeleport!.from).toBe(a.id);
      expect(r.stuckTicks).toBe(0);
    });
  }

  it('walking onto a turned floor portal drops the player in', () => {
    const t = setup();
    const a = t.makePortal(0, floorPortal(0, 0, 37));
    t.portals.open(a);
    t.portals.open(t.makePortal(1, wallPortal()));
    t.place(vec3(-90, 0, 0.03125));
    t.run(0.2);
    t.cmd.forwardMove = 175; // eyes along +x: across the turned hole
    const r = t.run(3, () => t.portals.lastTeleport !== null);
    t.cmd.forwardMove = 0;
    expect(r.done).toBe(true);
    expect(t.portals.lastTeleport!.from).toBe(a.id);
    expect(r.stuckTicks).toBe(0);
  });

  it('a hull overlapping the rim stays on the floor around the hole', () => {
    const t = setup();
    t.portals.open(t.makePortal(0, floorPortal(0, 0, 37)));
    t.portals.open(t.makePortal(1, wallPortal()));
    // Centred 30 units off the portal across its width: the hull sticks out past the 32-unit half width.
    const across = vec3(-Math.sin(rad(37)) * 30, Math.cos(rad(37)) * 30, 0.03125);
    t.place(across);
    const r = t.run(1);
    expect(t.portals.lastTeleport).toBeNull();
    expect(t.st.origin.z).toBeGreaterThan(-0.1);
    expect(r.stuckTicks).toBe(0);
  });

  it('builds a turned frame for a turned portal (oriented colliders, plane sets that leave the hole open)', () => {
    const fr = floorPortal(0, 0, 37);
    const boxes = frameBoxes(fr);
    expect(boxes).toHaveLength(4);
    // Turned: six faces plus six axial bevels.
    for (const b of boxes) expect(b.count).toBe(12);
    const inside = (p: Vec3): boolean =>
      boxes.some((b) => {
        for (let i = 0; i < b.count; i++) {
          const d = b.planes[i * 4] * p.x + b.planes[i * 4 + 1] * p.y + b.planes[i * 4 + 2] * p.z - b.planes[i * 4 + 3];
          if (d > 0) return false;
        }
        return true;
      });
    const local = (f: number, l: number, u: number): Vec3 => ({
      x: fr.origin.x + fr.m[0] * f + fr.m[1] * l + fr.m[2] * u,
      y: fr.origin.y + fr.m[3] * f + fr.m[4] * l + fr.m[5] * u,
      z: fr.origin.z + fr.m[6] * f + fr.m[7] * l + fr.m[8] * u,
    });
    // The hole is open to its corners; the frame is solid just past every side.
    expect(inside(local(-20, 0, 0))).toBe(false);
    expect(inside(local(-20, PORTAL_HALF_WIDTH - 1, PORTAL_HALF_HEIGHT - 1))).toBe(false);
    expect(inside(local(-20, PORTAL_HALF_WIDTH + 4, 0))).toBe(true);
    expect(inside(local(-20, -PORTAL_HALF_WIDTH - 4, 0))).toBe(true);
    expect(inside(local(-20, 0, PORTAL_HALF_HEIGHT + 4))).toBe(true);
    expect(inside(local(-20, 0, -PORTAL_HALF_HEIGHT - 4))).toBe(true);
    // An axis-aligned wall portal keeps plain boxes.
    for (const b of frameBoxes(wallPortal())) expect(b.count).toBe(6);
    // The physics frame of a passage is turned with the portal.
    const t = setup();
    t.portals.open(t.makePortal(0, fr));
    t.portals.open(t.makePortal(1, wallPortal()));
    expect(t.orientedBoxes.length).toBeGreaterThanOrEqual(8);
    expect(t.orientedBoxes.every((o) => o.rotation)).toBe(true);
  });
});

describe('portal passage: walls, ceilings and the exit', () => {
  it('walking into a wall portal whose partner is on the floor throws the player up and clear of the floor', () => {
    const t = setup();
    const a = t.makePortal(0, wallPortal());
    const b = t.makePortal(1, floorPortal(200, 0, 61));
    t.portals.open(a);
    t.portals.open(b);
    t.place(vec3(-HALF + 80, 0, 0.03125));
    t.player.eyeAngles.y = 180;
    t.run(0.1);
    t.cmd.forwardMove = 120; // slower than the floor exit's minimum
    const r = t.run(3, () => t.portals.lastTeleport !== null);
    t.cmd.forwardMove = 0;
    expect(r.done).toBe(true);
    expect(t.portals.lastTeleport!.to).toBe(b.id);
    expect(t.portals.lastTeleport!.speedIn).toBeLessThan(MIN_FLOOR_EXIT_SPEED_PLAYER);
    expect(t.st.velocity.z).toBeGreaterThanOrEqual(MIN_FLOOR_EXIT_SPEED_PLAYER);
    expect(t.fits(t.st.origin)).toBe(true);
    // It rises out of the hole: its feet clear the floor before it falls back.
    let cleared = false;
    const after = t.run(1.5, () => {
      if (t.st.origin.z > 1) cleared = true;
      return false;
    });
    expect(cleared).toBe(true);
    expect(r.stuckTicks + after.stuckTicks).toBe(0);
  });

  for (const yaw of [0, 37, 145]) {
    it(`jumping into a ceiling portal (yaw ${yaw}°) comes out of a floor portal going up`, () => {
      const t = setup();
      const a = t.makePortal(0, ceilingPortal(0, 0, yaw));
      const b = t.makePortal(1, floorPortal(300, 0, 0));
      t.portals.open(a);
      t.portals.open(b);
      t.place(vec3(0, 0, HEIGHT - 72 - 30), vec3(0, 0, 400));
      const r = t.run(1, () => t.portals.lastTeleport !== null);
      expect(r.done).toBe(true);
      expect(t.portals.lastTeleport!.from).toBe(a.id);
      expect(t.st.velocity.z).toBeGreaterThanOrEqual(MIN_FLOOR_EXIT_SPEED_PLAYER);
      expect(r.stuckTicks).toBe(0);
      expect(t.run(1).stuckTicks).toBe(0);
    });
  }

  it('falling floor to floor keeps the speed (above the floor exit minimum) and turns it upward', () => {
    const t = setup();
    const a = t.makePortal(0, floorPortal(0, 0, 37));
    const b = t.makePortal(1, floorPortal(300, 100, 145));
    t.portals.open(a);
    t.portals.open(b);
    t.place(vec3(0, 0, 60), vec3(0, 0, -600));
    const r = t.run(1, () => t.portals.lastTeleport !== null);
    expect(r.done).toBe(true);
    const tp = t.portals.lastTeleport!;
    expect(Math.abs(tp.speedOut - tp.speedIn)).toBeLessThan(1e-9 * tp.speedIn);
    expect(t.st.velocity.z).toBeGreaterThan(0.99 * tp.speedIn);
    expect(speed(t.st.velocity)).toBeCloseTo(tp.speedIn, 6);
    expect(r.stuckTicks).toBe(0);
  });

  it('an exit blocked in front still places the player where its hull fits', () => {
    // A crate right in front of the exit wall portal, overlapping where the player is mapped to.
    const crate = boxBrush(vec3(-HALF + 10, -60, 0), vec3(-HALF + 40, 60, 40));
    const t = setup([crate]);
    const a = t.makePortal(0, floorPortal(0, 0, 0));
    const b = t.makePortal(1, wallPortal());
    t.portals.open(a);
    t.portals.open(b);
    t.place(vec3(0, 0, 40), vec3(0, 0, -400));
    const r = t.run(1, () => t.portals.lastTeleport !== null);
    expect(r.done).toBe(true);
    expect(t.portals.lastTeleport!.to).toBe(b.id);
    expect(t.fits(t.st.origin)).toBe(true);
    expect(r.stuckTicks).toBe(0);
    expect(t.run(1).stuckTicks).toBe(0);
  });

  it('closing the passage while the player is down in a floor hole puts it back on the floor, not inside it', () => {
    const t = setup();
    const a = t.makePortal(0, floorPortal(0, 0, 37));
    const b = t.makePortal(1, wallPortal());
    t.portals.open(a);
    t.portals.open(b);
    t.place(vec3(0, 0, 0.03125));
    // Sink until the feet are 20 units under the floor (the centre has not crossed yet).
    expect(t.run(2, () => t.st.origin.z < -20).done).toBe(true);
    expect(t.portals.lastTeleport).toBeNull();
    expect(t.fitsUncarved(t.st.origin)).toBe(false);
    t.portals.close(b);
    expect(t.fitsUncarved(t.st.origin)).toBe(true);
    expect(t.st.origin.z).toBeGreaterThanOrEqual(0);
    expect(planeDistance(a.frame, t.st.origin)).toBeGreaterThanOrEqual(0);
    expect(t.run(0.5).stuckTicks).toBe(0);
  });

  it('carves a sloped portal so that no corner of the shortened box reaches behind it', () => {
    const t = setup();
    const n = vec3(Math.SQRT1_2, 0, Math.SQRT1_2);
    const fr = frameFromNormalUp(vec3(0, 0, 0), n, vec3(0, 0, 1));
    t.portals.open(t.makePortal(0, fr));
    t.portals.open(t.makePortal(1, wallPortal()));
    const hm = vec3();
    const hM = vec3();
    const mins = vec3(-16, -16, 0);
    const maxs = vec3(16, 16, 36);
    // A ducked hull resting against the slope over the portal's centre.
    const o = vec3(-12, 0, -18);
    expect(frameForward(fr).z).toBeCloseTo(Math.SQRT1_2, 9);
    const i = t.portals.carveHull(o, o, mins, maxs, hm, hM);
    expect(i).toBeGreaterThanOrEqual(0);
    for (const x of [hm.x, hM.x])
      for (const y of [hm.y, hM.y])
        for (const z of [hm.z, hM.z]) expect(planeDistance(fr, vec3(o.x + x, o.y + y, o.z + z))).toBeGreaterThan(0);
  });
});
