import { describe, expect, it } from 'vitest';
import {
  CONTENTS_BLUETEAM,
  CONTENTS_GRATE,
  CONTENTS_PLAYERCLIP,
  CONTENTS_REDTEAM,
  CONTENTS_SOLID,
  CONTENTS_WATER,
  CONTENTS_WINDOW,
  MASK_PLAYERSOLID,
  MASK_SHOT,
  MASK_SOLID,
  MASK_WATER,
  SURF_NODRAW,
  VEC_HULL_MAX,
  VEC_HULL_MIN,
} from '../core/constants';
import { emptyTrace, NO_ENTITY, WORLD_ENTITY } from '../core/types';
import type { Vec3 } from '../core/vec';
import { BspEntity } from '../formats/keyvalues';
import type { BspFile } from '../formats/bsp';
import { boxPoints } from './convex';
import { DIST_EPSILON, MapCollision, SOLID_BBOX, SOLID_VPHYSICS } from './map-collision';

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

interface BoxBrush {
  mins: Vec3;
  maxs: Vec3;
  contents: number;
  texInfo: number;
}

/**
 * A hand-built BSP: world = one node splitting at x = 0 with every world brush
 * in both leaves (exercises the split and the per-trace brush dedupe);
 * model 1 = one leaf with the door brush; model 2 = one leaf with a trigger;
 * plus a 45° ramp brush (non-axial plane with its bevels).
 */
function syntheticBsp(world: BoxBrush[], door: BoxBrush, trigger: BoxBrush): BspFile {
  const planes: number[] = []; // nx ny nz d type
  const addPlane = (nx: number, ny: number, nz: number, d: number) => {
    const type =
      nx === 1 || nx === -1 ? 0 : ny === 1 || ny === -1 ? 1 : nz === 1 || nz === -1 ? 2 : 3;
    planes.push(
      nx,
      ny,
      nz,
      d,
      Math.abs(nx) === 1 || Math.abs(ny) === 1 || Math.abs(nz) === 1 ? type : 3,
    );
    return planes.length / 5 - 1;
  };
  const sides: Array<[number, number, number]> = []; // plane, texinfo, bevel
  const brushes: Array<[number, number, number]> = []; // firstSide, numSides, contents
  const addBox = (b: BoxBrush) => {
    const first = sides.length;
    sides.push([addPlane(1, 0, 0, b.maxs.x), b.texInfo, 0]);
    sides.push([addPlane(-1, 0, 0, -b.mins.x), b.texInfo, 0]);
    sides.push([addPlane(0, 1, 0, b.maxs.y), b.texInfo, 0]);
    sides.push([addPlane(0, -1, 0, -b.mins.y), b.texInfo, 0]);
    sides.push([addPlane(0, 0, 1, b.maxs.z), b.texInfo, 0]);
    sides.push([addPlane(0, 0, -1, -b.mins.z), b.texInfo, 0]);
    brushes.push([first, 6, b.contents]);
    return brushes.length - 1;
  };
  // Ramp: x in [600, 800], y in [-100, 100], z from 0 up the slope z = x − 600, under the plane.
  const addRamp = () => {
    const first = sides.length;
    const s = Math.SQRT1_2;
    sides.push([addPlane(-s, 0, s, (-600 * s) as number), 0, 0]); // slope: z − x ≤ −600
    sides.push([addPlane(0, 0, -1, 0), 0, 0]); // z ≥ 0
    sides.push([addPlane(1, 0, 0, 800), 0, 0]); // x ≤ 800
    sides.push([addPlane(0, 1, 0, 100), 0, 0]);
    sides.push([addPlane(0, -1, 0, 100), 0, 0]);
    // Bevels: axial planes not already present (x ≥ 600, z ≤ 200).
    sides.push([addPlane(-1, 0, 0, -600), 0, 1]);
    sides.push([addPlane(0, 0, 1, 200), 0, 1]);
    brushes.push([first, 7, CONTENTS_SOLID]);
    return brushes.length - 1;
  };
  const worldBrushes = world.map(addBox);
  worldBrushes.push(addRamp());
  const doorBrush = addBox(door);
  const triggerBrush = addBox(trigger);
  const nodePlane = addPlane(1, 0, 0, 0);

  const leafBrushes = [...worldBrushes, ...worldBrushes, doorBrush, triggerBrush];
  const nLeafs = 4;
  const leafFirst = [0, worldBrushes.length, worldBrushes.length * 2, worldBrushes.length * 2 + 1];
  const leafNum = [worldBrushes.length, worldBrushes.length, 1, 1];
  const np = planes.length / 5;
  const bsp = {
    planes: {
      count: np,
      normal: Float32Array.from(
        { length: np * 3 },
        (_, i) => planes[Math.floor(i / 3) * 5 + (i % 3)],
      ),
      dist: Float32Array.from({ length: np }, (_, i) => planes[i * 5 + 3]),
      type: Int32Array.from({ length: np }, (_, i) => planes[i * 5 + 4]),
    },
    nodes: { count: 1, planeNum: Int32Array.of(nodePlane), children: Int32Array.of(-1, -2) },
    leafs: {
      count: nLeafs,
      firstLeafBrush: Uint16Array.from(leafFirst),
      numLeafBrushes: Uint16Array.from(leafNum),
    },
    leafBrushes: Uint16Array.from(leafBrushes),
    brushes: {
      count: brushes.length,
      firstSide: Int32Array.from(brushes.map((b) => b[0])),
      numSides: Int32Array.from(brushes.map((b) => b[1])),
      contents: Int32Array.from(brushes.map((b) => b[2])),
    },
    brushSides: {
      count: sides.length,
      planeNum: Uint16Array.from(sides.map((s) => s[0])),
      texInfo: Int16Array.from(sides.map((s) => s[1])),
      dispInfo: new Int16Array(sides.length).fill(-1),
      bevel: Int16Array.from(sides.map((s) => s[2])),
    },
    texInfo: [
      { flags: 0, texData: 0 },
      { flags: SURF_NODRAW, texData: 1 },
    ],
    texData: [{ name: 'DEV/DEV_MEASUREGENERIC01' }, { name: 'TOOLS/TOOLSPLAYERCLIP' }],
    models: [
      { mins: v(-2048, -2048, -2048), maxs: v(2048, 2048, 2048), origin: v(0, 0, 0), headNode: 0 },
      { mins: door.mins, maxs: door.maxs, origin: v(0, 0, 0), headNode: -3 },
      { mins: trigger.mins, maxs: trigger.maxs, origin: v(0, 0, 0), headNode: -4 },
    ],
    entities: [
      new BspEntity([['classname', 'worldspawn']]),
      new BspEntity([
        ['classname', 'func_door'],
        ['model', '*1'],
      ]),
      new BspEntity([
        ['classname', 'trigger_multiple'],
        ['model', '*2'],
      ]),
    ],
  };
  return bsp as unknown as BspFile;
}

function makeWorld() {
  const world: BoxBrush[] = [
    // Floor: z −16…0.
    { mins: v(-1024, -1024, -16), maxs: v(1024, 1024, 0), contents: CONTENTS_SOLID, texInfo: 0 },
    // Wall at x 100…116 (only for y < 0).
    { mins: v(100, -512, 0), maxs: v(116, 0, 256), contents: CONTENTS_SOLID, texInfo: 0 },
    // Player clip at x −216…−200.
    { mins: v(-216, -512, 0), maxs: v(-200, 512, 256), contents: CONTENTS_PLAYERCLIP, texInfo: 1 },
    // Grate and window (y 200…216 at x 300…400, and x 400…500).
    { mins: v(300, 200, 0), maxs: v(400, 216, 128), contents: CONTENTS_GRATE, texInfo: 0 },
    { mins: v(400, 200, 0), maxs: v(500, 216, 128), contents: CONTENTS_WINDOW, texInfo: 0 },
    // Water pool block (non-solid).
    { mins: v(-600, -600, 0), maxs: v(-400, -400, 64), contents: CONTENTS_WATER, texInfo: 0 },
  ];
  // Door: a slab in model space around the origin (x −4…4, y −32…32, z 0…96), placed at (0, 300, 0).
  const door = { mins: v(-4, -32, 0), maxs: v(4, 32, 96), contents: CONTENTS_SOLID, texInfo: 0 };
  const trigger = {
    mins: v(-64, -64, 0),
    maxs: v(64, 64, 64),
    contents: CONTENTS_SOLID,
    texInfo: 0,
  };
  const bsp = syntheticBsp(world, door, trigger);
  const col = new MapCollision(bsp, { displacements: [] });
  col.setModelTransform(1, v(0, 300, 0), v(0, 0, 0));
  col.setModelTransform(2, v(-300, 300, 0), v(0, 0, 0));
  return col;
}

describe('MapCollision (synthetic BSP)', () => {
  const tr = emptyTrace();

  it('stops a line DIST_EPSILON above the floor with the floor plane and surface', () => {
    const col = makeWorld();
    col.traceLine(v(0, 0, 100), v(0, 0, -100), MASK_SOLID, null, tr);
    expect(tr.fraction).toBeCloseTo((100 - DIST_EPSILON) / 200, 6);
    expect(tr.endPos.z).toBeCloseTo(DIST_EPSILON, 4);
    expect(tr.plane.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(tr.plane.dist).toBe(0);
    expect(tr.contents).toBe(CONTENTS_SOLID);
    expect(tr.surfaceName).toBe('DEV/DEV_MEASUREGENERIC01');
    expect(tr.entity).toBe(WORLD_ENTITY);
    expect(tr.startSolid).toBe(false);
  });

  it('sweeps the player hull into the floor and a wall', () => {
    const col = makeWorld();
    col.traceHull(
      v(50, -100, 100),
      v(50, -100, -100),
      VEC_HULL_MIN,
      VEC_HULL_MAX,
      MASK_PLAYERSOLID,
      null,
      tr,
    );
    expect(tr.endPos.z).toBeCloseTo(DIST_EPSILON, 4);
    // Into the wall at x = 100: the box's +x face (24) stops 1/32 short.
    col.traceHull(
      v(0, -100, 10),
      v(300, -100, 10),
      VEC_HULL_MIN,
      VEC_HULL_MAX,
      MASK_PLAYERSOLID,
      null,
      tr,
    );
    expect(tr.endPos.x).toBeCloseTo(100 - 24 - DIST_EPSILON, 4);
    expect(tr.plane.normal).toEqual({ x: -1, y: 0, z: 0 });
    // The wall stops at y = 0, so a hull fully past it (y − 24 > 0) is clear.
    col.traceHull(
      v(0, 30, 10),
      v(300, 30, 10),
      VEC_HULL_MIN,
      VEC_HULL_MAX,
      MASK_PLAYERSOLID,
      null,
      tr,
    );
    expect(tr.fraction).toBe(1);
    expect(tr.entity).toBe(NO_ENTITY);
    // …but one overlapping it by a unit is not.
    col.traceHull(
      v(0, 23, 10),
      v(300, 23, 10),
      VEC_HULL_MIN,
      VEC_HULL_MAX,
      MASK_PLAYERSOLID,
      null,
      tr,
    );
    expect(tr.fraction).toBeLessThan(1);
  });

  it('reports startsolid / allsolid', () => {
    const col = makeWorld();
    col.traceLine(v(0, 0, -8), v(0, 0, -8), MASK_SOLID, null, tr);
    expect(tr.startSolid && tr.allSolid).toBe(true);
    expect(tr.fraction).toBe(0);
    col.traceLine(v(0, 0, -8), v(0, 0, 50), MASK_SOLID, null, tr);
    expect(tr.startSolid).toBe(true);
    expect(tr.allSolid).toBe(false);
    col.traceHull(v(0, 0, -1), v(0, 0, -1), VEC_HULL_MIN, VEC_HULL_MAX, MASK_SOLID, null, tr);
    expect(tr.startSolid).toBe(true);
    col.traceHull(v(0, 0, 1), v(0, 0, 1), VEC_HULL_MIN, VEC_HULL_MAX, MASK_SOLID, null, tr);
    expect(tr.startSolid).toBe(false);
  });

  it('honours contents masks (player clip, grate, window)', () => {
    const col = makeWorld();
    col.traceLine(v(0, 100, 50), v(-400, 100, 50), MASK_PLAYERSOLID, null, tr);
    expect(tr.fraction).toBeLessThan(1);
    expect(tr.contents).toBe(CONTENTS_PLAYERCLIP);
    expect(tr.surfaceFlags & SURF_NODRAW).toBeTruthy();
    expect(tr.surfaceName).toBe('TOOLS/TOOLSPLAYERCLIP');
    col.traceLine(v(0, 100, 50), v(-400, 100, 50), MASK_SHOT, null, tr);
    expect(tr.fraction).toBe(1);
    // Grates stop players but not bullets; windows stop both.
    col.traceLine(v(350, 100, 50), v(350, 300, 50), MASK_SHOT, null, tr);
    expect(tr.fraction).toBe(1);
    col.traceLine(v(350, 100, 50), v(350, 300, 50), MASK_PLAYERSOLID, null, tr);
    expect(tr.contents).toBe(CONTENTS_GRATE);
    col.traceLine(v(450, 100, 50), v(450, 300, 50), MASK_SHOT, null, tr);
    expect(tr.contents).toBe(CONTENTS_WINDOW);
  });

  it('walks a hull up a 45° ramp using the slope plane, and rays skip bevels', () => {
    const col = makeWorld();
    col.traceHull(v(700, 0, 300), v(700, 0, 0), VEC_HULL_MIN, VEC_HULL_MAX, MASK_SOLID, null, tr);
    // The slope rises with x, so the box's bottom +x edge touches it: z = (700 + 24) − 600.
    expect(tr.plane.normal.z).toBeCloseTo(Math.SQRT1_2, 5);
    expect(tr.endPos.z).toBeCloseTo(700 + 24 - 600 + DIST_EPSILON * Math.SQRT2, 3);
    // A ray just above the slope near its top passes over the bevel plane z ≤ 200 region correctly.
    col.traceLine(v(650, 0, 300), v(650, 0, 0), MASK_SOLID, null, tr);
    expect(tr.endPos.z).toBeCloseTo(50, 1);
  });

  it('traces brush models at their transform, with solidity, contents and entity filters', () => {
    const col = makeWorld();
    // Door at (0, 300): a ray along y hits its −y face at y = 300 − 32.
    col.traceLine(v(0, 0, 50), v(0, 600, 50), MASK_SOLID, null, tr);
    expect(tr.endPos.y).toBeCloseTo(268 - DIST_EPSILON, 4);
    expect(tr.plane.normal.y).toBe(-1);
    expect(tr.plane.dist).toBeCloseTo(-268, 4);
    // Move it.
    col.setModelTransform(1, v(0, 400, 0), v(0, 0, 0));
    col.traceLine(v(0, 0, 50), v(0, 600, 50), MASK_SOLID, null, tr);
    expect(tr.endPos.y).toBeCloseTo(368 - DIST_EPSILON, 4);
    // Rotate it 90° (yaw): now it spans x −32…32 and y 396…404.
    col.setModelTransform(1, v(0, 400, 0), v(0, 90, 0));
    col.traceLine(v(0, 0, 50), v(0, 600, 50), MASK_SOLID, null, tr);
    expect(tr.endPos.y).toBeCloseTo(396 - DIST_EPSILON, 3);
    expect(tr.plane.normal.y).toBeCloseTo(-1, 6);
    expect(tr.plane.dist).toBeCloseTo(-396, 3);
    col.traceLine(v(30, 0, 50), v(30, 600, 50), MASK_SOLID, null, tr);
    expect(tr.fraction).toBeLessThan(1);
    // Entity id and filter.
    col.setModelEntity(1, 42);
    col.traceLine(v(0, 0, 50), v(0, 600, 50), MASK_SOLID, null, tr);
    expect(tr.entity).toBe(42);
    col.traceLine(v(0, 0, 50), v(0, 600, 50), MASK_SOLID, (id) => id !== 42, tr);
    expect(tr.fraction).toBe(1);
    // Not solid.
    col.setModelSolid(1, false);
    col.traceLine(v(0, 0, 50), v(0, 600, 50), MASK_SOLID, null, tr);
    expect(tr.fraction).toBe(1);
    // Respawn-room style: solid only to masks that carry the team bit.
    col.setModelSolid(1, true);
    col.setModelContents(1, CONTENTS_BLUETEAM);
    col.traceLine(v(0, 0, 50), v(0, 600, 50), MASK_PLAYERSOLID, null, tr);
    expect(tr.fraction).toBe(1);
    col.traceLine(v(0, 0, 50), v(0, 600, 50), MASK_PLAYERSOLID | CONTENTS_BLUETEAM, null, tr);
    expect(tr.fraction).toBeLessThan(1);
    expect(tr.contents).toBe(CONTENTS_BLUETEAM);
    col.traceLine(v(0, 0, 50), v(0, 600, 50), MASK_PLAYERSOLID | CONTENTS_REDTEAM, null, tr);
    expect(tr.fraction).toBe(1);
    col.setModelContents(1, null);
    col.traceLine(v(0, 0, 50), v(0, 600, 50), MASK_PLAYERSOLID, null, tr);
    expect(tr.contents).toBe(CONTENTS_SOLID);
  });

  it('places brush entities from the entity lump: triggers are not solid', () => {
    const col = makeWorld();
    expect(col.isModelSolid(1)).toBe(true);
    expect(col.isModelSolid(2)).toBe(false);
    col.traceLine(v(-300, 200, 30), v(-300, 400, 30), MASK_SOLID, null, tr);
    expect(tr.fraction).toBe(1);
  });

  it('answers trigger touch and point queries at the model transform', () => {
    const col = makeWorld();
    // Trigger box: (−300, 300) ± 64, z 0…64.
    expect(col.pointInModel(2, v(-300, 300, 32))).toBe(true);
    expect(col.pointInModel(2, v(-300, 300, 80))).toBe(false);
    expect(col.boxTouchesModel(2, v(-400, 300, 0), v(-360, 340, 82))).toBe(true); // overlaps x −364
    expect(col.boxTouchesModel(2, v(-420, 300, 0), v(-370, 340, 82))).toBe(false);
    col.setModelTransform(2, v(-300, 300, 0), v(0, 45, 0));
    // Rotated 45°: the corner now reaches −300 − 64·√2 ≈ −390.5 along x.
    expect(col.pointInModel(2, v(-385, 300, 32))).toBe(true);
    expect(col.pointInModel(2, v(-300 - 60, 300 - 60, 32))).toBe(false);
  });

  it('reports point contents of world and models', () => {
    const col = makeWorld();
    expect(col.pointContents(v(-500, -500, 32))).toBe(CONTENTS_WATER);
    expect(col.pointContents(v(0, 0, -8))).toBe(CONTENTS_SOLID);
    expect(col.pointContents(v(0, 0, 8))).toBe(0);
    expect(col.pointContents(v(0, 300, 50))).toBe(CONTENTS_SOLID); // the door
    col.setModelContents(1, CONTENTS_REDTEAM);
    expect(col.pointContents(v(0, 300, 50))).toBe(CONTENTS_REDTEAM);
    // Water does not block solid traces but does block water masks.
    col.traceLine(v(-500, -500, 100), v(-500, -500, 10), MASK_SOLID, null, tr);
    expect(tr.fraction).toBe(1);
    col.traceLine(v(-500, -500, 100), v(-500, -500, 10), MASK_WATER, null, tr);
    expect(tr.endPos.z).toBeCloseTo(64 + DIST_EPSILON, 4);
  });

  it('collides with static props: rotated hulls, bbox props, broad phase', () => {
    const col = makeWorld();
    const cube = Float32Array.from(boxPoints(v(-16, -16, 0), v(16, 16, 32)));
    // A 45° cube at (0, −600): its corner points along +x at 16√2.
    col.addStaticProp([cube], v(0, -600, 0), v(0, 45, 0), SOLID_VPHYSICS, { surfaceName: 'wood' });
    col.traceLine(v(100, -600, 16), v(0, -600, 16), MASK_SOLID, null, tr);
    // A ray meets the vertical edge between two diagonal faces (bevels are skipped for rays).
    expect(tr.endPos.x).toBeCloseTo(16 * Math.SQRT2 + DIST_EPSILON * Math.SQRT2, 3);
    expect(tr.surfaceName).toBe('wood');
    expect(tr.entity).toBe(WORLD_ENTITY);
    // A hull sliding past: the box bevels keep it off the diagonal faces.
    col.traceHull(
      v(100, -600, 1),
      v(0, -600, 1),
      VEC_HULL_MIN,
      VEC_HULL_MAX,
      MASK_PLAYERSOLID,
      null,
      tr,
    );
    expect(tr.endPos.x).toBeCloseTo(16 * Math.SQRT2 + 24 + DIST_EPSILON, 3);
    // SOLID_BBOX uses mins/maxs as an oriented box; SOLID_NONE adds nothing.
    expect(
      col.addStaticProp(null, v(0, -800, 0), v(0, 0, 0), SOLID_BBOX, {
        mins: v(-8, -8, 0),
        maxs: v(8, 8, 8),
      }),
    ).toBe(1);
    expect(col.addStaticProp([cube], v(0, -900, 0), v(0, 0, 0), 0)).toBe(-1);
    col.traceLine(v(0, -800, 50), v(0, -800, 0), MASK_SOLID, null, tr);
    expect(tr.endPos.z).toBeCloseTo(8 + DIST_EPSILON, 4);
    col.traceLine(v(0, -900, 50), v(0, -900, 0), MASK_SOLID, null, tr);
    expect(tr.endPos.z).toBeCloseTo(DIST_EPSILON, 4); // the floor
    expect(col.staticPropCount).toBe(2);
    // Inside a prop: startsolid.
    col.traceHull(v(0, -600, 1), v(0, -600, 1), v(-1, -1, 0), v(1, 1, 1), MASK_SOLID, null, tr);
    expect(tr.startSolid).toBe(true);
  });

  it('keeps lines symmetric through brushes', () => {
    const col = makeWorld();
    let s = 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let i = 0; i < 500; i++) {
      const a = v(rnd() * 900, rnd() * 900, 1 + Math.abs(rnd()) * 300);
      const b = v(rnd() * 900, rnd() * 900, 1 + Math.abs(rnd()) * 300);
      col.traceLine(a, b, MASK_PLAYERSOLID, null, tr);
      const ab = tr.fraction < 1 || tr.startSolid;
      col.traceLine(b, a, MASK_PLAYERSOLID, null, tr);
      const ba = tr.fraction < 1 || tr.startSolid;
      expect(ab).toBe(ba);
    }
  });
});
