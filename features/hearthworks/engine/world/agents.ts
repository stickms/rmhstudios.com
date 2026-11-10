/**
 * What customers and farmhands share: the way they get from tile to tile. An agent is a nav `Mover` plus a little
 * courtesy. Each tick it takes the next step of its route unless another agent is standing on (or stepping onto)
 * the tile it wants, in which case it waits a moment and then looks for a way around. Everything here is a function
 * of integer tick counters, the world's own rng and the world's arrays in their stored order, so every replica
 * of the lockstep simulation agrees.
 */

import {
  findPath,
  stepMover,
  walkable,
  type Blocker,
  type Mover,
  type MoverStatus,
  type PathOptions,
  type PathResult,
} from '../nav';
import type { Npc, World, Worker } from './types';

export type Agent = Npc | Worker;

/** Route searches the whole world may start in one tick. Spreads load: anyone left over simply asks again next tick. */
export const SEARCHES_PER_TICK = 6;
/** Ticks to wait for someone to move before trying a way around them. */
export const YIELD_TICKS = 30;
/** Ticks of being stuck behind someone before giving up on the errand. */
export const STUCK_GIVE_UP_TICKS = 300;

export interface Budget {
  searches: number;
}
export const newBudget = (): Budget => ({ searches: SEARCHES_PER_TICK });

export const allAgents = (w: World): Agent[] => [...w.npcs, ...w.workers];

const round = Math.round;

/** The tiles an agent is on right now: where it stands and, mid-step, the tile it is stepping onto. */
export function occupies(a: Mover, x: number, z: number): boolean {
  if (a.fromX === x && a.fromZ === z) return true;
  const next = a.path[0];
  return a.leg > 0 && next !== undefined && next.x === x && next.z === z;
}

export function agentOnTile(w: World, x: number, z: number): boolean {
  return allAgents(w).some((a) => occupies(a, x, z) || (round(a.x) === x && round(a.z) === z));
}

function occupiedByOther(w: World, self: Mover, x: number, z: number): boolean {
  for (const a of allAgents(w)) if (a !== self && occupies(a, x, z)) return true;
  return false;
}

/**
 * Tiles to plan around: where everyone else is standing still, and where everyone else is headed. People mid-stride
 * are not obstacles (they will have moved on), so a crowd never makes a route impossible on its own.
 */
export function staticBlockers(w: World, self: Mover | null, alsoOccupied = false): Blocker {
  const n = w.size;
  const set = new Set<number>();
  for (const a of allAgents(w)) {
    if (a === self) continue;
    const end = a.path[a.path.length - 1];
    if (end) set.add(end.z * n + end.x);
    else set.add(a.fromZ * n + a.fromX);
    if (alsoOccupied) {
      set.add(a.fromZ * n + a.fromX);
      const next = a.path[0];
      if (a.leg > 0 && next) set.add(next.z * n + next.x);
    }
  }
  return (x, z) => set.has(z * n + x);
}

/** Point an agent at a freshly found route. */
export function assignRoute(
  m: Mover,
  from: { x: number; z: number },
  r: PathResult,
  to: { x: number; z: number },
  within: number,
): void {
  m.path = r.steps;
  m.leg = 0;
  m.fromX = from.x;
  m.fromZ = from.z;
  m.goalX = round(to.x);
  m.goalZ = round(to.z);
  m.stopWithin = within;
  // An agent that has not set off yet must stand exactly on its tile.
  if (m.path.length === 0) {
    m.goalX = null;
    m.goalZ = null;
  }
}

/** Search for a route from where the agent stands and, if there is one, set off along it. Costs one search. */
export function routeTo(
  w: World,
  a: Mover,
  to: { x: number; z: number },
  opts: PathOptions,
  budget: Budget,
): boolean {
  budget.searches -= 1;
  const here = { x: round(a.x), z: round(a.z) };
  const r = findPath(w, here, to, opts);
  if (!r) return false;
  assignRoute(a, here, r, to, opts.stopWithin ?? 0);
  return true;
}

export function faceToward(m: Mover, x: number, z: number): void {
  if (x === m.x && z === m.z) return;
  m.yaw = Math.atan2(x - m.x, z - m.z);
}

export type WalkStatus = MoverStatus | 'yield';

/** Take one tick's worth of the agent's route. */
export function walk(w: World, a: Agent, budget: Budget): WalkStatus {
  if (a.path.length === 0) return 'idle';
  if (a.leg === 0) {
    const next = a.path[0];
    if (occupiedByOther(w, a, next.x, next.z)) {
      a.stuck += 1;
      if (
        a.stuck % YIELD_TICKS === 0 &&
        a.goalX !== null &&
        a.goalZ !== null &&
        budget.searches > 0
      ) {
        // Still in the way: look for a route that goes around everyone.
        routeTo(
          w,
          a,
          { x: a.goalX, z: a.goalZ },
          { stopWithin: a.stopWithin, blocked: staticBlockers(w, a, true) },
          budget,
        );
      }
      return 'yield';
    }
  }
  a.stuck = 0;
  return stepMover(w, a);
}

const DOOR_ORDER: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/** An open tile beside a building (its "door"), preferring the south side, or null if it is walled in. */
export function doorTile(
  w: World,
  x: number,
  z: number,
  blocked?: Blocker,
): { x: number; z: number } | null {
  for (const [dx, dz] of DOOR_ORDER) {
    if (walkable(w, x + dx, z + dz, blocked)) return { x: x + dx, z: z + dz };
  }
  return null;
}
