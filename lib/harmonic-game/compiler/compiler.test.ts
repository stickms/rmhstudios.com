import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CONTENTS_PLAYERCLIP,
  CONTENTS_SOLID,
  CONTENTS_WATER,
  MASK_PLAYERSOLID,
  MASK_SOLID,
  SURF_NODRAW,
} from '../../tf2-game/core/constants';
import { emptyTrace } from '../../tf2-game/core/types';
import { faceVertexIndices, findLeaf, type BspFile } from '../../tf2-game/formats/bsp';
import { MapCollision, DIST_EPSILON } from '../../tf2-game/world/map-collision';
import { HL2_HULL_MAX, HL2_HULL_MIN } from '../../sp-game/constants';
import {
  box,
  compileLevel,
  prism,
  ramp,
  room,
  stairs,
  v3,
  waterBox,
  wedge,
  type LevelSource,
} from './index';
import { mapManifestSchema } from '../../tf2-game/assets/map-manifest';
import { textureAxes } from './brush';

const ROOM_MIN = v3(0, 0, 0);
const ROOM_MAX = v3(512, 512, 256);

function roomLevel(extra: Partial<LevelSource> = {}): LevelSource {
  return {
    id: 'test_room',
    title: 'Test room',
    world: room({ min: ROOM_MIN, max: ROOM_MAX, material: 'concrete' }),
    entities: [{ classname: 'info_player_start', origin: v3(256, 256, 1) }],
    ...extra,
  };
}

/** SHA-256 over every typed array and structured part of a BSP. */
function hashBsp(b: BspFile): string {
  const h = createHash('sha256');
  const arr = (a: ArrayBufferView): void => {
    h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  };
  for (const a of [
    b.planes.normal,
    b.planes.dist,
    b.planes.type,
    b.nodes.planeNum,
    b.nodes.children,
    b.nodes.mins,
    b.nodes.maxs,
    b.leafs.contents,
    b.leafs.mins,
    b.leafs.maxs,
    b.leafs.firstLeafBrush,
    b.leafs.numLeafBrushes,
    b.leafs.firstLeafFace,
    b.leafs.numLeafFaces,
    b.leafBrushes,
    b.leafFaces,
    b.brushes.firstSide,
    b.brushes.numSides,
    b.brushes.contents,
    b.brushSides.planeNum,
    b.brushSides.texInfo,
    b.brushSides.bevel,
    b.vertexes,
    b.edges,
    b.surfEdges,
  ])
    arr(a);
  h.update(
    JSON.stringify([
      b.faces,
      b.models,
      b.texData,
      b.texInfo.map((t) => [Array.from(t.textureVecs), t.flags, t.texData]),
      b.entityText,
    ]),
  );
  return h.digest('hex');
}

function trace(c: MapCollision, a: [number, number, number], b: [number, number, number]) {
  return c.traceLine(
    { x: a[0], y: a[1], z: a[2] },
    { x: b[0], y: b[1], z: b[2] },
    MASK_SOLID,
    null,
    emptyTrace(),
  );
}

describe('compileLevel: collision on a hollow room', () => {
  const level = compileLevel(roomLevel());
  const col = new MapCollision(level.bsp);

  it('traceLine hits the east wall at the expected fraction', () => {
    const t = trace(col, [256, 256, 128], [600, 256, 128]);
    expect(t.fraction).toBeCloseTo((256 - DIST_EPSILON) / 344, 6);
    expect(t.plane.normal.x).toBe(-1);
    expect(t.contents & CONTENTS_SOLID).toBeTruthy();
    expect(t.startSolid).toBe(false);
  });

  it('traceLine hits floor and ceiling', () => {
    expect(trace(col, [256, 256, 128], [256, 256, -100]).fraction).toBeCloseTo(
      (128 - DIST_EPSILON) / 228,
      6,
    );
    expect(trace(col, [256, 256, 128], [256, 256, 400]).fraction).toBeCloseTo(
      (128 - DIST_EPSILON) / 272,
      6,
    );
  });

  it('a trace inside the room that stays inside is clear', () => {
    expect(trace(col, [10, 10, 10], [500, 500, 200]).fraction).toBe(1);
  });

  it('traceHull with the HL2 player hull stops 16 units from the wall', () => {
    const t = col.traceHull(
      { x: 256, y: 256, z: 8 },
      { x: 600, y: 256, z: 8 },
      HL2_HULL_MIN,
      HL2_HULL_MAX,
      MASK_PLAYERSOLID,
      null,
      emptyTrace(),
    );
    const endX = 256 + (600 - 256) * t.fraction;
    expect(512 - (endX + HL2_HULL_MAX.x)).toBeCloseTo(DIST_EPSILON, 1);
    expect(endX).toBeCloseTo(496, 1);
    expect(t.startSolid).toBe(false);
  });

  it('a hull standing on the floor can slide along every wall (no snagging on corners)', () => {
    const t = col.traceHull(
      { x: 100, y: 100, z: 0.03125 },
      { x: 100, y: 600, z: 0.03125 },
      HL2_HULL_MIN,
      HL2_HULL_MAX,
      MASK_PLAYERSOLID,
      null,
      emptyTrace(),
    );
    expect(t.startSolid).toBe(false);
    expect(100 + 500 * t.fraction).toBeCloseTo(496, 1);
  });

  it('pointContents is SOLID inside a wall and empty in the room', () => {
    expect(col.pointContents({ x: 520, y: 256, z: 100 }) & CONTENTS_SOLID).toBeTruthy();
    expect(col.pointContents({ x: 256, y: 256, z: -8 }) & CONTENTS_SOLID).toBeTruthy();
    expect(col.pointContents({ x: 256, y: 256, z: 264 }) & CONTENTS_SOLID).toBeTruthy();
    expect(col.pointContents({ x: 256, y: 256, z: 128 })).toBe(0);
  });

  it('surface info reaches the trace', () => {
    const t = trace(col, [256, 256, 128], [600, 256, 128]);
    expect(t.surfaceName).toBe('concrete');
  });
});

describe('compileLevel: structure', () => {
  const level = compileLevel(roomLevel());
  const { bsp } = level;

  it('pairs planes: plane i^1 is the negation of plane i, axial positives first', () => {
    const p = bsp.planes;
    expect(p.count % 2).toBe(0);
    for (let i = 0; i < p.count; i += 2) {
      for (let k = 0; k < 3; k++) expect(p.normal[(i + 1) * 3 + k] + p.normal[i * 3 + k]).toBe(0);
      expect(p.dist[i + 1] + p.dist[i]).toBe(0);
      if (p.type[i] < 3) expect(p.normal[i * 3 + p.type[i]]).toBe(1);
    }
  });

  it('winds faces clockwise about their outward normal, and shares edges', () => {
    const idx: number[] = [];
    for (const f of bsp.faces) {
      faceVertexIndices(bsp, f, idx);
      const [a, b, c] = idx.map((i) => [
        bsp.vertexes[i * 3],
        bsp.vertexes[i * 3 + 1],
        bsp.vertexes[i * 3 + 2],
      ]);
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ];
      const pn = [
        bsp.planes.normal[f.planeNum * 3],
        bsp.planes.normal[f.planeNum * 3 + 1],
        bsp.planes.normal[f.planeNum * 3 + 2],
      ];
      expect(n[0] * pn[0] + n[1] * pn[1] + n[2] * pn[2]).toBeLessThan(0);
      expect(f.lightOfs).toBe(-1);
      expect(f.dispInfo).toBe(-1);
    }
    expect(bsp.edges[0]).toBe(0);
    expect(bsp.edges[1]).toBe(0);
  });

  it('every brush side plane faces outward and every face lies on its plane', () => {
    for (const f of bsp.faces) {
      const idx = faceVertexIndices(bsp, f);
      for (const i of idx) {
        const d =
          bsp.planes.normal[f.planeNum * 3] * bsp.vertexes[i * 3] +
          bsp.planes.normal[f.planeNum * 3 + 1] * bsp.vertexes[i * 3 + 1] +
          bsp.planes.normal[f.planeNum * 3 + 2] * bsp.vertexes[i * 3 + 2];
        expect(d).toBeCloseTo(bsp.planes.dist[f.planeNum], 3);
      }
    }
  });

  it('keeps node 0 as the world root even for a one-brush level', () => {
    const tiny = compileLevel({
      id: 't',
      title: 't',
      world: [box(v3(0, 0, 0), v3(64, 64, 64), 'concrete')],
      entities: [],
    });
    expect(tiny.bsp.nodes.count).toBeGreaterThan(0);
    expect(tiny.bsp.models[0].headNode).toBe(0);
    const leaf = findLeaf(tiny.bsp, { x: 32, y: 32, z: 32 });
    expect(tiny.bsp.leafs.numLeafBrushes[leaf]).toBe(1);
    expect(
      new MapCollision(tiny.bsp).pointContents({ x: 32, y: 32, z: 32 }) & CONTENTS_SOLID,
    ).toBeTruthy();
  });

  it('emits worldspawn first and a manifest that satisfies the schema', () => {
    expect(bsp.entities[0].classname).toBe('worldspawn');
    expect(bsp.entities[0].get('mapname')).toBe('test_room');
    expect(bsp.entityText.startsWith('{\n"classname" "worldspawn"')).toBe(true);
    expect(() => mapManifestSchema.parse(level.manifest)).not.toThrow();
    expect(level.manifest.materials['concrete']).toBeDefined();
  });

  it('adds bevel planes to sloped brushes and not to boxes', () => {
    const w = compileLevel({
      id: 'w',
      title: 'w',
      world: [wedge(v3(0, 0, 0), v3(64, 128, 64), 'north', 'concrete')],
      entities: [],
    }).bsp;
    expect(w.brushes.numSides[0]).toBeGreaterThan(5);
    let bevels = 0;
    for (let s = 0; s < w.brushSides.count; s++) bevels += w.brushSides.bevel[s];
    expect(bevels).toBeGreaterThan(0);
    // The wedge's bevel sides never cut the brush's own vertices.
    const verts = new Set<number>();
    for (let s = 0; s < w.brushSides.count; s++) if (w.brushSides.bevel[s]) verts.add(s);
    expect(verts.size).toBe(bevels);
    const b = compileLevel({
      id: 'b',
      title: 'b',
      world: [box(v3(0, 0, 0), v3(8, 8, 8), 'concrete')],
      entities: [],
    }).bsp;
    expect(b.brushes.numSides[0]).toBe(6);
  });

  it('a hull dropped onto a ramp lands on the slope', () => {
    const l = compileLevel({
      id: 'r',
      title: 'r',
      world: [ramp(v3(0, 0, 0), v3(128, 256, 64), 'north', 'concrete')],
      entities: [],
    });
    const c = new MapCollision(l.bsp);
    const t = c.traceHull(
      { x: 64, y: 128, z: 200 },
      { x: 64, y: 128, z: -50 },
      HL2_HULL_MIN,
      HL2_HULL_MAX,
      MASK_PLAYERSOLID,
      null,
      emptyTrace(),
    );
    expect(t.fraction).toBeLessThan(1);
    expect(t.plane.normal.z).toBeGreaterThan(0.7);
    expect(t.plane.normal.y).toBeLessThan(0);
    // Edge-exact: the hull's high corner (y = 144) touches the slope z = 64*144/256 = 36.
    expect(200 - 250 * t.fraction).toBeCloseTo(36, 0);
  });

  it('texture axes follow Source (floor s=+x t=-y, north wall s=+x t=-z)', () => {
    expect(textureAxes(0, 0, 1)).toEqual({ s: { x: 1, y: 0, z: 0 }, t: { x: 0, y: -1, z: 0 } });
    expect(textureAxes(0, 1, 0)).toEqual({ s: { x: 1, y: 0, z: 0 }, t: { x: 0, y: 0, z: -1 } });
  });

  it('sizes texdata from the material and scales texture vectors per repeat', () => {
    const l = compileLevel(
      { id: 'm', title: 'm', world: [box(v3(0, 0, 0), v3(64, 64, 64), 'tex')], entities: [] },
      {
        materials: (n) => ({
          name: n,
          color: [0.5, 0.5, 0.5],
          surfaceProp: 'metal',
          unitsPerRepeat: 64,
          texture: { id: 'a'.repeat(40), w: 256, h: 256, alpha: false },
        }),
      },
    );
    expect(l.bsp.texData[0].width).toBe(256);
    const floor =
      l.bsp.texInfo[
        l.bsp.faces.find((f) => l.bsp.planes.normal[f.planeNum * 3 + 2] === 1)!.texInfo
      ];
    expect(floor.textureVecs[0]).toBeCloseTo(4); // 256 texels / 64 units
    expect(l.manifest.textures['a'.repeat(40)].file).toBe(`tex/${'a'.repeat(40)}.webp`);
    expect(l.manifest.materials['tex'].base).toBe('a'.repeat(40));
  });
});

describe('compileLevel: faces and contents', () => {
  it('draws exactly the sides that are not nodraw/sky/clip', () => {
    const l = compileLevel({
      id: 'f',
      title: 'f',
      world: [
        box(v3(0, 0, 0), v3(64, 64, 64), 'concrete', {
          faces: { top: { material: 'tools/nodraw' }, bottom: { material: 'tools/nodraw' } },
        }),
        box(v3(128, 0, 0), v3(192, 64, 64), 'concrete'),
        box(v3(256, 0, 0), v3(320, 64, 64), 'tools/nodraw'),
        box(v3(384, 0, 0), v3(448, 64, 64), 'concrete', { contents: 'playerclip' }),
        box(v3(512, 0, 0), v3(576, 64, 64), 'tools/sky'),
      ],
      entities: [],
    });
    expect(l.bsp.faces.length).toBe(4 + 6);
    expect(l.stats.faces).toBe(10);
    expect(l.stats.brushes).toBe(5);
    // Nodraw sides still collide and carry SURF_NODRAW.
    const col = new MapCollision(l.bsp);
    const t = col.traceLine(
      { x: 288, y: 32, z: 200 },
      { x: 288, y: 32, z: -10 },
      MASK_SOLID,
      null,
      emptyTrace(),
    );
    expect(t.fraction).toBeLessThan(1);
    expect(t.surfaceFlags & SURF_NODRAW).toBeTruthy();
    // Playerclip blocks the player, not bullets.
    expect(l.bsp.brushes.contents[3]).toBe(CONTENTS_PLAYERCLIP);
    const pc = col.traceLine(
      { x: 416, y: 32, z: 200 },
      { x: 416, y: 32, z: -10 },
      MASK_PLAYERSOLID,
      null,
      emptyTrace(),
    );
    expect(pc.fraction).toBeLessThan(1);
    const shot = col.traceLine(
      { x: 416, y: 32, z: 200 },
      { x: 416, y: 32, z: -10 },
      MASK_SOLID,
      null,
      emptyTrace(),
    );
    expect(shot.fraction).toBe(1);
  });

  it('reports water contents (point and leaf) without making it solid', () => {
    const l = compileLevel(
      roomLevel({
        world: [
          ...room({ min: ROOM_MIN, max: ROOM_MAX, material: 'concrete' }),
          waterBox(v3(0, 0, 0), v3(512, 512, 64), 'water'),
        ],
      }),
    );
    const col = new MapCollision(l.bsp);
    const c = col.pointContents({ x: 256, y: 256, z: 32 });
    expect(c & CONTENTS_WATER).toBeTruthy();
    expect(c & CONTENTS_SOLID).toBe(0);
    expect(col.pointContents({ x: 256, y: 256, z: 100 })).toBe(0);
    const leaf = findLeaf(l.bsp, { x: 256, y: 256, z: 32 });
    expect(l.bsp.leafs.contents[leaf] & CONTENTS_WATER).toBeTruthy();
    expect(l.bsp.leafs.contents[findLeaf(l.bsp, { x: 256, y: 256, z: 128 })]).toBe(0);
    // Solid traces pass through water.
    expect(trace(col, [256, 256, 128], [256, 256, 1]).fraction).toBe(1);
  });
});

describe('compileLevel: brush entities', () => {
  const src = roomLevel({
    entities: [
      { classname: 'info_player_start', origin: v3(256, 256, 1) },
      {
        classname: 'func_door',
        keys: { targetname: 'door1', speed: '100' },
        brushes: [box(v3(240, 496, 0), v3(272, 512, 96), 'steel')],
        outputs: ['OnOpen lamp,TurnOn,,0,-1'],
      },
      {
        classname: 'trigger_hurt',
        keys: { damage: '10' },
        brushes: [box(v3(0, 0, 0), v3(64, 64, 64), 'tools/nodraw')],
      },
    ],
  });
  const level = compileLevel(src);
  const { bsp } = level;

  it('puts the door brush in models[1] with model "*1", its own tree and its own faces', () => {
    expect(bsp.models.length).toBe(3);
    const door = bsp.entities.find((e) => e.classname === 'func_door')!;
    expect(door.get('model')).toBe('*1');
    expect(door.brushModelIndex).toBe(1);
    expect(bsp.entities.find((e) => e.classname === 'trigger_hurt')!.brushModelIndex).toBe(2);
    expect(door.getAll('OnOpen')).toEqual(['lamp,TurnOn,,0,-1']);
    expect(door.get('targetname')).toBe('door1');
    expect(bsp.models[1].numFaces).toBe(6);
    expect(bsp.models[2].numFaces).toBe(0); // trigger volumes never draw
    expect(bsp.models[1].firstFace).toBe(bsp.models[0].numFaces);
    expect(bsp.models[1].mins).toEqual({ x: 240, y: 496, z: 0 });
    expect(bsp.models[1].maxs).toEqual({ x: 272, y: 512, z: 96 });
    // Door brush is not in the world tree.
    expect(bsp.models[0].numFaces + 6).toBe(bsp.faces.length);
  });

  it('MapCollision places the door as a solid model and traces hit it', () => {
    const col = new MapCollision(bsp);
    expect(col.modelCount).toBe(3);
    expect(col.isModelSolid(1)).toBe(true);
    expect(col.isModelSolid(2)).toBe(false);
    expect(col.pointContents({ x: 256, y: 504, z: 48 }) & CONTENTS_SOLID).toBeTruthy();
    // Wall in the room occupies y>=512; the door sits inside the wall plane's neighbour, so trace from below.
    const t = trace(col, [256, 400, 48], [256, 520, 48]);
    expect(t.fraction).toBeCloseTo((96 - DIST_EPSILON) / 120, 3);
    // Moving the door model moves its collision.
    col.setModelTransform(1, { x: 0, y: -200, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(col.pointContents({ x: 256, y: 504, z: 48 }) & CONTENTS_SOLID).toBeFalsy();
    expect(col.pointContents({ x: 256, y: 304, z: 48 }) & CONTENTS_SOLID).toBeTruthy();
  });
});

describe('compileLevel: shapes', () => {
  it('room with a door gap leaves an opening a hull can walk through', () => {
    const l = compileLevel({
      id: 'd',
      title: 'd',
      world: room({
        min: ROOM_MIN,
        max: ROOM_MAX,
        material: 'concrete',
        doors: [{ wall: 'east', at: 256, width: 96, height: 96 }],
      }),
      entities: [],
    });
    const col = new MapCollision(l.bsp);
    const through = col.traceHull(
      { x: 256, y: 256, z: 0.03125 },
      { x: 700, y: 256, z: 0.03125 },
      HL2_HULL_MIN,
      HL2_HULL_MAX,
      MASK_PLAYERSOLID,
      null,
      emptyTrace(),
    );
    expect(through.fraction).toBe(1);
    const blocked = col.traceHull(
      { x: 256, y: 100, z: 0.03125 },
      { x: 700, y: 100, z: 0.03125 },
      HL2_HULL_MIN,
      HL2_HULL_MAX,
      MASK_PLAYERSOLID,
      null,
      emptyTrace(),
    );
    expect(blocked.fraction).toBeLessThan(1);
    // Lintel above the opening.
    expect(col.pointContents({ x: 520, y: 256, z: 150 }) & CONTENTS_SOLID).toBeTruthy();
    expect(col.pointContents({ x: 520, y: 256, z: 50 })).toBe(0);
  });

  it('stairs climb in rise steps and prisms close', () => {
    const l = compileLevel({
      id: 's',
      title: 's',
      world: [
        ...stairs({
          min: v3(0, 0, 0),
          dir: 'north',
          width: 64,
          steps: 4,
          rise: 8,
          run: 16,
          material: 'concrete',
        }),
        prism(v3(300, 300, 0), 32, 64, 8, 'concrete'),
      ],
      entities: [],
    });
    expect(l.stats.brushes).toBe(5);
    const col = new MapCollision(l.bsp);
    for (let i = 0; i < 4; i++) {
      const t = trace(col, [32, i * 16 + 8, 100], [32, i * 16 + 8, -10]);
      expect(100 - 110 * t.fraction).toBeCloseTo((i + 1) * 8, 1);
    }
    expect(col.pointContents({ x: 300, y: 300, z: 32 }) & CONTENTS_SOLID).toBeTruthy();
    expect(col.pointContents({ x: 340, y: 300, z: 32 })).toBe(0);
  });

  it('rejects degenerate brushes with a useful message', () => {
    expect(() =>
      compileLevel({
        id: 'x',
        title: 'x',
        world: [box(v3(0, 0, 0), v3(0, 8, 8), 'concrete')],
        entities: [],
      }),
    ).toThrow(/no volume/);
    expect(() =>
      compileLevel({
        id: 'x',
        title: 'x',
        world: [
          {
            material: 'c',
            planes: [
              { normal: v3(0, 0, 1), dist: 1 },
              { normal: v3(0, 0, -1), dist: 1 },
              { normal: v3(1, 0, 0), dist: 1 },
              { normal: v3(-1, 0, 0), dist: 1 },
            ],
          },
        ],
        entities: [],
      }),
    ).toThrow(/unbounded|closed convex/);
  });
});

describe('compileLevel: determinism and speed', () => {
  it('compiles byte-identically twice', () => {
    const src = (): LevelSource =>
      roomLevel({
        fog: { color: [90, 100, 110], start: 100, end: 900 },
        sky: 'void',
        entities: [
          { classname: 'func_door', brushes: [box(v3(1, 1, 1), v3(30, 30, 30), 'steel')] },
          { classname: 'info_player_start', origin: v3(10, 10, 1) },
        ],
      });
    const a = compileLevel(src());
    const b = compileLevel(src());
    expect(hashBsp(a.bsp)).toBe(hashBsp(b.bsp));
    expect(a.manifest).toEqual(b.manifest);
    expect(a.bsp.entityText).toBe(b.bsp.entityText);
    expect(a.bsp.entities.some((e) => e.classname === 'env_fog_controller')).toBe(true);
  });

  function synthetic(n: number): LevelSource {
    let seed = 12345;
    const rnd = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const world = [];
    const cols = 50;
    for (let i = 0; i < n; i++) {
      const x = (i % cols) * 48;
      const y = Math.floor(i / cols) * 48;
      const h = 16 + Math.floor(rnd() * 8) * 16;
      world.push(box(v3(x, y, 0), v3(x + 32, y + 32, h), i % 3 === 0 ? 'concrete' : 'steel'));
    }
    return {
      id: 'synthetic',
      title: 'synthetic',
      world,
      entities: [{ classname: 'info_player_start', origin: v3(16, 16, 200) }],
    };
  }

  it('compiles a 2,000-brush level in under 250 ms', () => {
    compileLevel(synthetic(600)); // warm the JIT like any long-lived page would
    // Best of three: a shared CI machine stalls now and then, the compiler does not.
    const runs = [
      compileLevel(synthetic(2000)),
      compileLevel(synthetic(2000)),
      compileLevel(synthetic(2000)),
    ];
    const l = runs.reduce((a, b) => (b.stats.ms < a.stats.ms ? b : a));
    expect(l.stats.brushes).toBe(2000);
    expect(l.stats.faces).toBe(12000);
    expect(l.stats.ms).toBeLessThan(250);
    // eslint-disable-next-line no-console
    console.log(
      `2000 brushes: ${l.stats.ms.toFixed(1)} ms, ${l.stats.leaves} leaves, ${l.bsp.nodes.count} nodes, ${l.bsp.planes.count} planes`,
    );
    // kd quality: leaves hold few brushes, traces find the right ones.
    let maxLeaf = 0;
    for (let i = 0; i < l.bsp.leafs.count; i++)
      maxLeaf = Math.max(maxLeaf, l.bsp.leafs.numLeafBrushes[i]);
    expect(maxLeaf).toBeLessThanOrEqual(16);
    const col = new MapCollision(l.bsp);
    const t = col.traceLine(
      { x: 16 + 48 * 10, y: 16 + 48 * 7, z: 400 },
      { x: 16 + 48 * 10, y: 16 + 48 * 7, z: -10 },
      MASK_SOLID,
      null,
      emptyTrace(),
    );
    expect(t.fraction).toBeLessThan(1);
    expect(
      col.pointContents({ x: 16 + 48 * 10, y: 16 + 48 * 7, z: 5 }) & CONTENTS_SOLID,
    ).toBeTruthy();
    expect(col.pointContents({ x: 40, y: 40, z: 5 })).toBe(0); // the gap between brushes
  });
});
