/**
 * Moving along a planned path, one tick at a time. A mover walks a tile in `TICKS_PER_TILE` ticks; a jump or a
 * fall takes its own time. Each step is checked against the world as it begins, so if something has been built in
 * the way the mover re-plans instead of walking through it. Positions are exact functions of integer tick counts,
 * so every replica agrees to the bit.
 */

import { ROAD_STEP_TIME } from '../content/city';
import { LEVEL_HEIGHT, WATER_LEVEL, roadLink, tileTop, type World } from '../world';
import { findPath, type PathOptions, type PathStep } from './astar';
import { moveBetween, type Blocker, type MoveKind } from './passable';

export const TICKS_PER_TILE = 20;
const JUMP_TICKS = 14;
const FALL_TICKS = 12;

export interface Mover {
  x: number;
  z: number;
  /** The tile the current step began on. */
  fromX: number;
  fromZ: number;
  /** Steps still to take; `path[0]` is the one in progress. */
  path: PathStep[];
  /** Ticks into the current step. */
  leg: number;
  /** Where the whole journey is headed (for re-planning), or null when standing. */
  goalX: number | null;
  goalZ: number | null;
  stopWithin: number;
  /** Direction faced: 0 = +z, increasing toward +x. */
  yaw: number;
}

export function newMover(x: number, z: number): Mover {
  return { x, z, fromX: Math.round(x), fromZ: Math.round(z), path: [], leg: 0, goalX: null, goalZ: null, stopWithin: 0, yaw: 0 };
}

export type MoverStatus = 'idle' | 'moving' | 'arrived' | 'blocked';

/** How many ticks a step takes. Diagonals are longer; a jump is a quick hop, a fall quicker still. */
export function stepTicks(kind: MoveKind, dx: number, dz: number, onRoad = false): number {
  const dist = Math.hypot(dx, dz);
  if (onRoad && kind === 'walk') return Math.max(1, Math.round(TICKS_PER_TILE * dist * ROAD_STEP_TIME));
  if (kind === 'jump') return Math.round(JUMP_TICKS * Math.max(1, dist * 0.8));
  if (kind === 'fall') return Math.round(FALL_TICKS + dist * 6);
  return Math.round(TICKS_PER_TILE * dist);
}

/** Plan a journey. Returns false (and stands still) when there is no way to get there. */
export function startPath(
  world: World,
  m: Mover,
  to: { x: number; z: number },
  opts: PathOptions = {},
): boolean {
  const here = { x: Math.round(m.x), z: Math.round(m.z) };
  const r = findPath(world, here, to, opts);
  if (!r) return false;
  m.path = r.steps;
  m.leg = 0;
  m.fromX = here.x;
  m.fromZ = here.z;
  m.goalX = Math.round(to.x);
  m.goalZ = Math.round(to.z);
  m.stopWithin = opts.stopWithin ?? 0;
  return true;
}

export function stopMover(m: Mover): void {
  m.path = [];
  m.leg = 0;
  m.goalX = null;
  m.goalZ = null;
}

/** Advance one tick. */
export function stepMover(world: World, m: Mover, blocked?: Blocker): MoverStatus {
  if (m.path.length === 0) return 'idle';
  const next = m.path[0];
  if (m.leg === 0) {
    // About to set off: is the step still allowed? If not, re-plan from where we stand.
    const move = moveBetween(world, m.fromX, m.fromZ, next.x, next.z, blocked);
    if (!move || move.kind !== next.kind) {
      if (m.goalX === null || m.goalZ === null || !startPath(world, m, { x: m.goalX, z: m.goalZ }, { stopWithin: m.stopWithin, blocked })) {
        stopMover(m);
        return 'blocked';
      }
      if (m.path.length === 0) return 'arrived';
      return stepMover(world, m, blocked);
    }
    m.yaw = Math.atan2(next.x - m.fromX, next.z - m.fromZ);
  }
  const dur = stepTicks(next.kind, next.x - m.fromX, next.z - m.fromZ, roadLink(world, m.fromX, m.fromZ, next.x, next.z));
  m.leg += 1;
  const f = Math.min(1, m.leg / dur);
  m.x = m.fromX + (next.x - m.fromX) * f;
  m.z = m.fromZ + (next.z - m.fromZ) * f;
  if (m.leg >= dur) {
    m.x = next.x;
    m.z = next.z;
    m.fromX = next.x;
    m.fromZ = next.z;
    m.path.shift();
    m.leg = 0;
    if (m.path.length === 0) {
      m.goalX = null;
      m.goalZ = null;
      return 'arrived';
    }
  }
  return 'moving';
}

/** The standing height for a mover mid-step: a hop arcs up and over, a fall drops away, a walk follows the ground. */
export function moverY(world: World, m: Mover): number {
  const fromTop = tileTop(world, m.fromX, m.fromZ);
  const step = m.path[0];
  if (!step) return tileTop(world, m.x, m.z);
  const toTop = tileTop(world, step.x, step.z);
  const dur = stepTicks(step.kind, step.x - m.fromX, step.z - m.fromZ, roadLink(world, m.fromX, m.fromZ, step.x, step.z));
  const f = Math.min(1, Math.max(0, m.leg / dur));
  const smooth = f * f * (3 - 2 * f);
  if (step.kind === 'jump') return fromTop + (toTop - fromTop) * smooth + Math.sin(Math.PI * f) * (LEVEL_HEIGHT * 0.9);
  if (step.kind === 'fall') {
    // Walk off the edge first, then drop with gravity.
    const drop = f < 0.35 ? 0 : ((f - 0.35) / 0.65) ** 2;
    return fromTop + (toTop - fromTop) * drop;
  }
  return fromTop + (toTop - fromTop) * smooth;
}

export { WATER_LEVEL };
