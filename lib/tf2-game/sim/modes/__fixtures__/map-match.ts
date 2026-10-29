/**
 * TEST SUPPORT ONLY (Node): builds a world on a real map from TF2_ROOT with
 * the map entities and the detected game mode, adds scripted players, and
 * steps it. Used by the entities/modes suites.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MASK_PLAYERSOLID, VEC_HULL_MAX, VEC_HULL_MIN } from '../../../core/constants';
import { emptyTrace } from '../../../core/types';
import { angleVectors, vec3, type Vec3 } from '../../../core/vec';
import { COLLISION_GROUP_PLAYER_MOVEMENT, type Entity } from '../../entity';
import { loadMap, type LoadedMap } from '../../map-loader';
import type { Player } from '../../player';
import type { RulesOptions } from '../../rules';
import { GameWorld } from '../../world';
import { registerMapEntities, type TriggerAreaCapture } from '../../entities';
import { createGameModeForMap } from '..';

export const TF2_ROOT = process.env.TF2_ROOT;

const cache = new Map<string, Uint8Array>();

export function loadTf2Map(name: string): LoadedMap {
  let bytes = cache.get(name);
  if (!bytes) {
    const b = readFileSync(path.join(TF2_ROOT!, 'tf', 'maps', `${name}.bsp`));
    bytes = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    cache.set(name, bytes);
  }
  return loadMap(bytes, { name });
}

export function makeWorld(name: string, rules: Partial<RulesOptions> = {}): GameWorld {
  registerMapEntities();
  const map = loadTf2Map(name);
  const world = new GameWorld({
    map,
    options: { seed: 3, lagCompensation: false, rules: { bonusRoundTime: 3, ...rules } },
  });
  world.setMode(createGameModeForMap(world, name));
  return world;
}

export function addPlayers(world: GameWorld, team: number, classes: readonly number[]): Player[] {
  const out: Player[] = [];
  for (const cls of classes) {
    const p = world.addPlayer(`${team}-${cls}-${out.length}`, { bot: true });
    p.requestTeam(team);
    p.requestClass(cls);
    out.push(p);
  }
  return out;
}

/** Steps `seconds` of game time, calling `each` before every tick. */
export function run(world: GameWorld, seconds: number, each?: () => void): void {
  const ticks = Math.ceil(seconds / world.frametime);
  for (let i = 0; i < ticks; i++) {
    each?.();
    world.step();
  }
}

/** Steps until `pred` holds (true) or `maxSeconds` pass (false). */
export function runUntil(
  world: GameWorld,
  pred: () => boolean,
  maxSeconds: number,
  each?: () => void,
): boolean {
  const ticks = Math.ceil(maxSeconds / world.frametime);
  for (let i = 0; i < ticks; i++) {
    if (pred()) return true;
    each?.();
    world.step();
  }
  return pred();
}

const tr = emptyTrace();
const a = vec3();
const b = vec3();

/** A spot where a standing player fits on the floor at (x, y), searching down from z. */
export function floorAt(
  world: GameWorld,
  x: number,
  y: number,
  zTop: number,
  zBottom: number,
): Vec3 | null {
  a.x = x;
  a.y = y;
  a.z = zTop;
  b.x = x;
  b.y = y;
  b.z = zBottom;
  const filter = world.entityFilter(null, COLLISION_GROUP_PLAYER_MOVEMENT);
  world.traceHull(a, b, VEC_HULL_MIN, VEC_HULL_MAX, MASK_PLAYERSOLID, filter, tr);
  if (tr.startSolid || tr.fraction >= 1) return null;
  return { x: tr.endPos.x, y: tr.endPos.y, z: tr.endPos.z + 1 };
}

/** A standing spot inside a brush trigger (tries a grid over its bounds). */
export function spotInside(
  world: GameWorld,
  e: Entity,
  avoid: Entity | null = null,
  offset = 0,
): Vec3 | null {
  const wb = worldBounds(e);
  const minX = wb.mins.x;
  const maxX = wb.maxs.x;
  const minY = wb.mins.y;
  const maxY = wb.maxs.y;
  const top = wb.maxs.z;
  const bottom = wb.mins.z - 64;
  const box = { mins: vec3(), maxs: vec3() };
  let skipped = 0;
  for (let r = 0; r <= 4; r++) {
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const x = (minX + maxX) / 2 + (i * (maxX - minX)) / 10;
        const y = (minY + maxY) / 2 + (j * (maxY - minY)) / 10;
        const s = floorAt(world, x, y, top - 1, bottom);
        if (!s) continue;
        box.mins.x = s.x + VEC_HULL_MIN.x;
        box.mins.y = s.y + VEC_HULL_MIN.y;
        box.mins.z = s.z + VEC_HULL_MIN.z;
        box.maxs.x = s.x + VEC_HULL_MAX.x;
        box.maxs.y = s.y + VEC_HULL_MAX.y;
        box.maxs.z = s.z + VEC_HULL_MAX.z;
        if (avoid && world.boxTouchesBrushEntity(avoid, box.mins, box.maxs)) continue;
        if (!world.boxTouchesBrushEntity(e, box.mins, box.maxs)) continue;
        if (skipped < offset) {
          skipped++;
          continue;
        }
        return s;
      }
    }
  }
  return null;
}

/** World AABB of an entity's (possibly rotated) bounds. */
export function worldBounds(e: Entity): { mins: Vec3; maxs: Vec3 } {
  const fwd = vec3();
  const right = vec3();
  const up = vec3();
  angleVectors(e.angles, fwd, right, up);
  const mins = vec3(Infinity, Infinity, Infinity);
  const maxs = vec3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? e.maxs.x : e.mins.x;
    const y = i & 2 ? e.maxs.y : e.mins.y;
    const z = i & 4 ? e.maxs.z : e.mins.z;
    // Local (x forward, y left, z up) to world.
    const wx = e.origin.x + fwd.x * x - right.x * y + up.x * z;
    const wy = e.origin.y + fwd.y * x - right.y * y + up.y * z;
    const wz = e.origin.z + fwd.z * x - right.z * y + up.z * z;
    mins.x = Math.min(mins.x, wx);
    mins.y = Math.min(mins.y, wy);
    mins.z = Math.min(mins.z, wz);
    maxs.x = Math.max(maxs.x, wx);
    maxs.y = Math.max(maxs.y, wy);
    maxs.z = Math.max(maxs.z, wz);
  }
  return { mins, maxs };
}

export function teleport(world: GameWorld, p: Player, pos: Vec3): void {
  world.teleportEntity(p, pos, null, vec3());
}

export function areaForPoint(
  world: GameWorld,
  pointName: string,
  areas: readonly TriggerAreaCapture[],
): TriggerAreaCapture | undefined {
  return areas.find(
    (a2) => !a2.removed && a2.capPointName.toLowerCase() === pointName.toLowerCase(),
  );
}
