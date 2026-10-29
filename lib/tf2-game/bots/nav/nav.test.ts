/**
 * The nav mesh without game files: a hand-built three-room mesh — lookup,
 * the binary round trip, A* (shortest route, enemy spawn rooms forbidden,
 * a closed door blocking, the closest area when the goal is unreachable)
 * and the move intent → user command conversion.
 */
import { describe, expect, it } from 'vitest';
import { IN_DUCK, IN_JUMP, TF_TEAM_BLUE, TF_TEAM_RED } from '../../core/constants';
import { emptyUserCmd } from '../../core/types';
import {
  CONN_JUMP,
  CONN_WALK,
  NAV_BLUE_SPAWN,
  NAV_HEALTH,
  NavMesh,
  POI_SPAWN,
  type NavMeshData,
} from './nav-mesh';
import { decodeNavMesh, encodeNavMesh } from './serialize';
import { applyMoveIntent, NavPath, NavPathfinder, newMoveIntent } from '../path';

/**
 * Areas (cells of 25 units):
 *   0: x 0…9,   y 0…9   (z 0)
 *   1: x 10…19, y 0…9   (z 0)       BLU spawn
 *   2: x 0…9,   y 10…19 (z 0)
 *   3: x 10…19, y 10…19 (z 48, a ledge reached by a jump from 2, dropped from to 1)
 */
function meshData(): NavMeshData {
  const conns: Array<[number, number, number, number, number, number, number, number]> = [
    // from, to, type, ax, ay, bx, by, z
    [0, 1, CONN_WALK, 250, 0, 250, 237, 0],
    [1, 0, CONN_WALK, 250, 0, 250, 237, 0],
    [0, 2, CONN_WALK, 0, 250, 237, 250, 0],
    [2, 0, CONN_WALK, 0, 250, 237, 250, 0],
    [2, 3, CONN_JUMP, 250, 250, 250, 487, 48],
    [3, 1, CONN_WALK, 250, 250, 487, 250, 0],
  ];
  conns.sort((a, b) => a[0] - b[0]); // CSR: grouped by source area
  const n = 4;
  const connStart = new Uint32Array(n + 1);
  for (const c of conns) connStart[c[0] + 1]++;
  for (let i = 0; i < n; i++) connStart[i + 1] += connStart[i];
  const m = conns.length;
  const connTo = new Uint32Array(m);
  const connType = new Uint8Array(m);
  const portal = new Float32Array(m * 5);
  conns.forEach((c, i) => {
    connTo[i] = c[1];
    connType[i] = c[2];
    portal.set([c[3], c[4], c[5], c[6], c[7]], i * 5);
  });
  return {
    cellSize: 25,
    areaCount: n,
    gx0: Int16Array.from([0, 10, 0, 10]),
    gy0: Int16Array.from([0, 0, 10, 10]),
    gx1: Int16Array.from([9, 19, 9, 19]),
    gy1: Int16Array.from([9, 9, 19, 19]),
    cz: Float32Array.from([0, 0, 0, 48]),
    dzdx: new Float32Array(n),
    dzdy: new Float32Array(n),
    attrs: Uint32Array.from([0, NAV_BLUE_SPAWN, NAV_HEALTH, 0]),
    blocker: Int16Array.from([-1, -1, -1, -1]),
    sector: Uint16Array.from([0, 0, 1, 1]),
    connStart,
    connTo,
    connType,
    portal,
    sectorCount: 2,
    vis: Uint8Array.from([0b11, 0b11]),
    pois: [
      {
        kind: POI_SPAWN,
        team: TF_TEAM_BLUE,
        name: 'spawn',
        index: -1,
        pos: { x: 360, y: 100, z: 0 },
        area: 1,
      },
    ],
    blockers: [],
  };
}

const opts = (team: number) => ({ team, dangerWeight: 0, avoidArea: -1, maxExpansions: 1000 });

describe('nav mesh', () => {
  it('finds the area under a point, preferring the highest floor below the feet', () => {
    const mesh = new NavMesh(meshData());
    expect(mesh.areaAt(100, 100, 0)).toBe(0);
    expect(mesh.areaAt(400, 400, 50)).toBe(3);
    expect(mesh.areaAt(400, 400, 0)).toBe(-1); // under the ledge, not standing on it
    expect(mesh.nearestArea(-30, 100, 0)).toBe(0);
    expect(mesh.areaAt(5000, 5000, 0)).toBe(-1);
    expect(mesh.isPotentiallyVisible(0, 3)).toBe(true);
  });

  it('round-trips through nav.bin byte for byte', () => {
    const mesh = new NavMesh(meshData());
    const bin = encodeNavMesh(mesh);
    const back = decodeNavMesh(bin);
    expect(back.areaCount).toBe(4);
    expect(Array.from(back.connTo)).toEqual(Array.from(mesh.connTo));
    expect(Array.from(back.attrs)).toEqual(Array.from(mesh.attrs));
    expect(back.pois).toEqual(mesh.pois);
    expect(encodeNavMesh(back)).toEqual(bin);
    expect(() => decodeNavMesh(bin.subarray(0, 40))).toThrow(/truncated/);
    const bad = bin.slice();
    bad[0] ^= 0xff;
    expect(() => decodeNavMesh(bad)).toThrow(/magic/);
  });

  it('paths around the enemy spawn room and over the jump', () => {
    const mesh = new NavMesh(meshData());
    const pf = new NavPathfinder(mesh);
    const path = new NavPath();
    // BLU may cut through its own spawn (0 → 1).
    expect(pf.find(0, 1, 360, 100, 0, opts(TF_TEAM_BLUE), path)).toBe(true);
    expect(Array.from(path.areas.subarray(0, path.length))).toEqual([0, 1]);
    // RED may not enter BLU's spawn at all: the goal is unreachable, the path ends closest to it.
    expect(pf.find(0, 1, 360, 100, 0, opts(TF_TEAM_RED), path)).toBe(false);
    expect(path.areas[path.length - 1]).not.toBe(1);
    // To the ledge: 0 → 2 → 3, the last step a jump.
    expect(pf.find(0, 3, 400, 400, 48, opts(TF_TEAM_RED), path)).toBe(true);
    expect(Array.from(path.areas.subarray(0, path.length))).toEqual([0, 2, 3]);
    expect(mesh.connType[path.conns[2]]).toBe(CONN_JUMP);
  });

  it('turns a world-space move intent into forward/side inputs for the view', () => {
    const it = newMoveIntent();
    it.dirX = 0;
    it.dirY = 1;
    it.speed = 1;
    it.jump = true;
    const cmd = emptyUserCmd();
    // Facing +x, moving +y is a strafe left (negative side move).
    applyMoveIntent(it, 0, cmd, IN_JUMP, IN_DUCK);
    expect(cmd.forwardMove).toBeCloseTo(0, 5);
    expect(cmd.sideMove).toBeCloseTo(-450, 5);
    expect(cmd.buttons & IN_JUMP).toBeTruthy();
    // Facing +y it is straight ahead.
    applyMoveIntent(it, 90, cmd, IN_JUMP, IN_DUCK);
    expect(cmd.forwardMove).toBeCloseTo(450, 5);
    expect(cmd.sideMove).toBeCloseTo(0, 5);
  });
});
