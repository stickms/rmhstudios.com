/**
 * The nav generator's per-game hull (NavGenOptions.hull) without game files: an analytic box room
 * stands in for the map's collision, so the hull alone decides what is walkable.
 *
 * A 400 × 400 room with a 70-unit ceiling: TF2's crouched hull (62) cannot even be dropped onto the
 * floor from its spawn (the generator lowers it from 12 units up), CS:GO's (54) can and walks the room
 * crouched only (its standing hull is 72). With an 80-unit ceiling CS:GO stands.
 */
import { describe, expect, it } from 'vitest';
import { TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';
import { emptyTrace, type TraceResult } from '../../core/types';
import type { Vec3 } from '../../core/vec';
import type { BspFile } from '../../formats/bsp';
import { parseEntityLump } from '../../formats/keyvalues';
import type { MapCollision } from '../../world/map-collision';
import { NAV_HULL_CS, NAV_HULL_TF, NavGenerator } from './generate';
import { NAV_CROUCH, POI_SPAWN } from './nav-mesh';

const HALF = 200;

/** Sweeps a box through the inside of [-HALF, HALF]² × [0, ceiling] (everything outside is solid). */
function roomCollision(ceiling: number): MapCollision {
  const trace = (a: Vec3, b: Vec3, mins: Vec3, maxs: Vec3, out: TraceResult): TraceResult => {
    const lo = [-HALF - mins.x, -HALF - mins.y, 0 - mins.z];
    const hi = [HALF - maxs.x, HALF - maxs.y, ceiling - maxs.z];
    const p0 = [a.x, a.y, a.z];
    const d = [b.x - a.x, b.y - a.y, b.z - a.z];
    Object.assign(out, emptyTrace());
    if (p0.some((v, i) => v < lo[i] - 1e-6 || v > hi[i] + 1e-6)) {
      out.startSolid = out.allSolid = true;
      out.fraction = 0;
      out.endPos = { ...a };
      return out;
    }
    let f = 1;
    let axis = -1;
    let sign = 0;
    for (let i = 0; i < 3; i++) {
      if (d[i] > 0 && p0[i] + d[i] > hi[i]) {
        const t = (hi[i] - p0[i]) / d[i];
        if (t < f) [f, axis, sign] = [t, i, -1];
      } else if (d[i] < 0 && p0[i] + d[i] < lo[i]) {
        const t = (lo[i] - p0[i]) / d[i];
        if (t < f) [f, axis, sign] = [t, i, 1];
      }
    }
    out.fraction = Math.max(0, f);
    out.endPos = { x: a.x + d[0] * f, y: a.y + d[1] * f, z: a.z + d[2] * f };
    if (axis >= 0) {
      const n = [0, 0, 0];
      n[axis] = sign;
      out.plane = { normal: { x: n[0], y: n[1], z: n[2] }, dist: 0 };
    }
    return out;
  };
  const point = { x: 0, y: 0, z: 0 };
  return {
    traceHull: (
      a: Vec3,
      b: Vec3,
      mins: Vec3,
      maxs: Vec3,
      _m: number,
      _f: unknown,
      out: TraceResult,
    ) => trace(a, b, mins, maxs, out),
    traceLine: (a: Vec3, b: Vec3, _m: number, _f: unknown, out: TraceResult) =>
      trace(a, b, point, point, out),
    pointContents: () => 0,
    isModelSolid: () => true,
    setModelSolid: () => {},
    pointInModel: () => false,
  } as unknown as MapCollision;
}

const ENTITIES = `{
"classname" "worldspawn"
}
{
"classname" "info_player_terrorist"
"origin" "-100 -100 0"
}
{
"classname" "info_player_counterterrorist"
"origin" "100 100 0"
}
{
"classname" "info_deathmatch_spawn"
"origin" "0 0 0"
}
`;

/** Just enough BSP for the generator: entities, no brush models, one leaf in cluster 0, no PVS. */
function roomBsp(): BspFile {
  return {
    version: 21,
    entities: parseEntityLump(ENTITIES),
    models: [],
    planes: {
      count: 1,
      normal: Float32Array.from([0, 0, 1]),
      dist: Float32Array.from([0]),
      type: Int32Array.from([2]),
    },
    nodes: { count: 1, planeNum: Int32Array.from([0]), children: Int32Array.from([-1, -1]) },
    leafs: { count: 1, cluster: Int16Array.from([0]) },
    visibility: null,
  } as unknown as BspFile;
}

const generate = (ceiling: number, hull = NAV_HULL_TF) =>
  new NavGenerator(roomBsp(), roomCollision(ceiling), { hull }).run();

describe('nav generation per game hull', () => {
  it('keeps TF2 as the default hull', () => {
    expect(NAV_HULL_TF).toMatchObject({
      halfWidth: 24,
      standHeight: 82,
      crouchHeight: 62,
      step: 18,
    });
    expect(NAV_HULL_CS).toMatchObject({
      halfWidth: 16,
      standHeight: 72,
      crouchHeight: 54,
      step: 18,
    });
    expect(generate(70).areaCount).toBe(0);
  });

  it("walks CS:GO's crouched hull under a 70-unit ceiling, crouched", () => {
    const mesh = generate(70, NAV_HULL_CS);
    expect(mesh.areaCount).toBeGreaterThan(0);
    for (let a = 0; a < mesh.areaCount; a++) expect(mesh.attrs[a] & NAV_CROUCH).toBe(NAV_CROUCH);
  });

  it('stands under an 80-unit ceiling, and reads the CS:GO spawns as team POIs', () => {
    const mesh = generate(80, NAV_HULL_CS);
    expect(mesh.areaCount).toBeGreaterThan(0);
    for (let a = 0; a < mesh.areaCount; a++) expect(mesh.attrs[a] & NAV_CROUCH).toBe(0);
    const spawns = mesh.pois.filter((p) => p.kind === POI_SPAWN);
    expect(spawns.map((p) => p.team).sort()).toEqual([0, TF_TEAM_RED, TF_TEAM_BLUE].sort());
    expect(spawns.every((p) => p.area >= 0)).toBe(true);
  });
});
