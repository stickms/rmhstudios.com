/**
 * The contracts the TF2 modules meet at: a player's input for one tick
 * (`UserCmd`), a trace through the world (`TraceResult`), and the collision
 * service movement, weapons and bots trace through (`CollisionWorld`).
 * The SDK equivalents are CUserCmd, trace_t / CGameTrace and IEngineTrace.
 */

import type { Vec3, QAngle } from './vec';

/** One tick of player input (usercmd.h). Built client-side, simulated by both. */
export interface UserCmd {
  /** Monotonic per-player command number; prediction acks and spread seeds key off it. */
  commandNumber: number;
  /** Server tick the client believed it was on when it built the command (lag compensation). */
  tickCount: number;
  viewAngles: QAngle;
  /** −450…450 like cl_forwardspeed; movement clamps it to the class speed. */
  forwardMove: number;
  sideMove: number;
  upMove: number;
  /** IN_* bits. */
  buttons: number;
  /** 0 = no change, else the weapon slot (1-based) the player asked for this tick. */
  weaponSelect: number;
  /** Seed for this command's shared random stream (spread, crits). */
  randomSeed: number;
}

export const emptyUserCmd = (): UserCmd => ({
  commandNumber: 0,
  tickCount: 0,
  viewAngles: { x: 0, y: 0, z: 0 },
  forwardMove: 0,
  sideMove: 0,
  upMove: 0,
  buttons: 0,
  weaponSelect: 0,
  randomSeed: 0,
});

/** Entity index meaning "the world" in a trace. */
export const WORLD_ENTITY = 0;
/** Entity index meaning "nothing was hit". */
export const NO_ENTITY = -1;

export interface TracePlane {
  normal: Vec3;
  dist: number;
}

export interface TraceResult {
  /** 0…1 of the way from start to end before hitting something; 1 = clear. */
  fraction: number;
  endPos: Vec3;
  plane: TracePlane;
  /** The start position was inside something solid. */
  startSolid: boolean;
  /** The whole trace was inside something solid. */
  allSolid: boolean;
  /** Contents of what was hit (CONTENTS_*). */
  contents: number;
  /** SURF_* flags of the surface hit (0 for entities). */
  surfaceFlags: number;
  /** Material name of the surface hit, for impact effects ('' when unknown). */
  surfaceName: string;
  /** WORLD_ENTITY, an entity id, or NO_ENTITY when fraction === 1. */
  entity: number;
  /** Hitbox group hit (HITGROUP_*), for traces against player hitboxes. */
  hitGroup: number;
}

export function emptyTrace(): TraceResult {
  return {
    fraction: 1,
    endPos: { x: 0, y: 0, z: 0 },
    plane: { normal: { x: 0, y: 0, z: 0 }, dist: 0 },
    startSolid: false,
    allSolid: false,
    contents: 0,
    surfaceFlags: 0,
    surfaceName: '',
    entity: NO_ENTITY,
    hitGroup: 0,
  };
}

/** Hit groups (shareddefs.h HITGROUP_*). */
export const HITGROUP_GENERIC = 0;
export const HITGROUP_HEAD = 1;
export const HITGROUP_CHEST = 2;
export const HITGROUP_STOMACH = 3;
export const HITGROUP_LEFTARM = 4;
export const HITGROUP_RIGHTARM = 5;
export const HITGROUP_LEFTLEG = 6;
export const HITGROUP_RIGHTLEG = 7;

/**
 * Decides whether a trace may hit an entity. Returning false passes through it
 * (the SDK's ITraceFilter::ShouldHitEntity). The world is always tested.
 */
export type TraceFilter = (entityId: number, contentsMask: number) => boolean;

/**
 * Everything a trace can hit: the map (BSP brushes, displacements, static
 * props, brush entities at their current positions) and the simulation's
 * entities (players, buildings, projectiles). `lib/tf2-game/world/` implements
 * the map half; the game world composes it with entity bounding boxes.
 */
export interface CollisionWorld {
  /** Sweeps an axis-aligned box from start to end (IEngineTrace::TraceRay with a hull). */
  traceHull(
    start: Vec3,
    end: Vec3,
    mins: Vec3,
    maxs: Vec3,
    mask: number,
    filter: TraceFilter | null,
    out: TraceResult,
  ): TraceResult;
  /** A zero-size trace. */
  traceLine(start: Vec3, end: Vec3, mask: number, filter: TraceFilter | null, out: TraceResult): TraceResult;
  /** CONTENTS_* at a point (map only, including brush entities). */
  pointContents(point: Vec3): number;
}
