/**
 * Pure parts of the renderer: lightmap encoding and atlas packing, HDR calibration,
 * face/displacement coordinate math and winding, FOV conversion, PVS helpers, ambient
 * cubes and the sun, overlays. Rendering itself is checked with the screenshot harness
 * (scripts/tf2-game/render-harness).
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { BspFace, BspFile, BspTexInfo } from '../formats/bsp';
import { scaleFovByWidthRatio, sourceFovToVertical, sourceHorizontalFov } from './camera';
import {
  SOURCE_UNIT,
  sourceAnglesToCameraQuaternion,
  sourceTransformToMatrix,
  sourceTransformToMatrixSrcAxes,
  srcToThree,
} from './coords';
import {
  AMBIENT_CUBE_SCALE,
  evalAmbientCube,
  lightNormalFromProps,
  newAmbientCube,
  parseLightString,
  sampleAmbientCube,
} from './lighting';
import {
  buildLightmapAtlas,
  decodeRgbe,
  faceStyle0Offset,
  lightmapTexelToLinear,
  linearToLightmap,
  measureHdrScale,
  packRects,
} from './lightmap';
import { SKY_FACE_AXES } from './sky';
import {
  atlasUv,
  clipPolygon2D,
  clustersVisible,
  dispLuxelCoord,
  faceLeafLists,
  faceLuxelCoord,
  faceTexCoord,
  fanIndices,
  leafClusters,
  leavesInBox,
  normalizeMaterialName,
  overlayTexCoord,
  splitSurfaces,
  unpatchMaterialName,
} from './world-geometry';

// --- fixtures ----------------------------------------------------------------------

function face(over: Partial<BspFace> = {}): BspFace {
  return {
    planeNum: 0,
    side: 0,
    onNode: 0,
    firstEdge: 0,
    numEdges: 4,
    texInfo: 0,
    dispInfo: -1,
    surfaceFogVolumeId: -1,
    styles: [0, 255, 255, 255],
    lightOfs: 0,
    area: 0,
    lightmapTextureMinsInLuxels: [0, 0],
    lightmapTextureSizeInLuxels: [1, 1],
    origFace: 0,
    numPrims: 0,
    firstPrimId: 0,
    smoothingGroups: 0,
    dynamicShadowsEnabled: true,
    ...over,
  };
}

function texInfo(flags = 0): BspTexInfo {
  return {
    // s = x / 2 + 1, t = y / 4 (texels); luxels: x / 16, y / 16
    textureVecs: Float32Array.from([0.5, 0, 0, 1, 0, 0.25, 0, 0]),
    lightmapVecs: Float32Array.from([1 / 16, 0, 0, 0, 0, 1 / 16, 0, 0]),
    flags,
    texData: 0,
  };
}

/** RGBE bytes for a linear value v (mantissa 128..255). */
function rgbe(v: number): number[] {
  if (v <= 0) return [0, 0, 0, 0];
  let e = Math.ceil(Math.log2((v * 255) / 255));
  let m = Math.round((v * 255) / Math.pow(2, e));
  while (m > 255) {
    e++;
    m = Math.round((v * 255) / Math.pow(2, e));
  }
  return [m, m, m, e & 0xff];
}

function fakeBsp(over: Partial<BspFile>): BspFile {
  return {
    faces: [],
    facesHdr: [],
    texInfo: [texInfo()],
    texData: [
      { reflectivity: { x: 0.5, y: 0.5, z: 0.5 }, nameStringTableId: 0, name: 'X', width: 64, height: 64, viewWidth: 64, viewHeight: 64 },
    ],
    lighting: new Uint8Array(0),
    lightingHdr: new Uint8Array(0),
    ...over,
  } as unknown as BspFile;
}

// --- lightmap encoding -------------------------------------------------------------

describe('lightmap encoding', () => {
  it('matches SDK lineartolightmap (gamma 2.2, overbright 2)', () => {
    expect(linearToLightmap(0)).toBe(0);
    expect(linearToLightmap(1)).toBe(128); // 255 · 1 / 2 rounded
    expect(linearToLightmap(4)).toBe(Math.round(Math.pow(4095 / 1024, 1 / 2.2) * 127.5));
    expect(linearToLightmap(100)).toBe(linearToLightmap(4)); // clamped at 4
    expect(linearToLightmap(-1)).toBe(0);
    expect(linearToLightmap(Number.NaN)).toBe(0);
  });

  it('round-trips through the shader decode within quantisation', () => {
    for (const L of [0.05, 0.2, 0.5, 1, 1.5, 2.5, 3.9]) {
      const back = lightmapTexelToLinear(linearToLightmap(L));
      expect(Math.abs(back - L) / L).toBeLessThan(0.03);
    }
  });

  it('decodes ColorRGBExp32 (signed exponent)', () => {
    const out = [0, 0, 0];
    decodeRgbe(Uint8Array.from([255, 128, 0, 0]), 0, out);
    expect(out[0]).toBeCloseTo(1);
    expect(out[1]).toBeCloseTo(128 / 255);
    expect(out[2]).toBe(0);
    decodeRgbe(Uint8Array.from([255, 255, 255, 0xff]), 0, out); // exponent −1
    expect(out[0]).toBeCloseTo(0.5);
    decodeRgbe(Uint8Array.from([255, 255, 255, 2]), 0, out);
    expect(out[0]).toBeCloseTo(4);
  });

  it('measures the LDR/HDR calibration as the median luxel ratio', () => {
    const f = face({ lightmapTextureSizeInLuxels: [3, 3] }); // 16 luxels
    const ldr: number[] = [];
    const hdr: number[] = [];
    for (let i = 0; i < 16; i++) {
      ldr.push(...rgbe(0.4));
      hdr.push(...rgbe(0.2));
    }
    const bsp = fakeBsp({
      faces: [f],
      facesHdr: [f],
      lighting: Uint8Array.from(ldr),
      lightingHdr: Uint8Array.from(hdr),
    });
    // Too few samples for one small face with stride 1: duplicate faces.
    bsp.faces = Array.from({ length: 4 }, () => f);
    bsp.facesHdr = bsp.faces;
    expect(measureHdrScale(bsp, 1)).toBeCloseTo(2, 1);
    expect(measureHdrScale(fakeBsp({ faces: [f] }))).toBeNull();
  });
});

// --- packing and the atlas ---------------------------------------------------------

describe('lightmap atlas', () => {
  it('packs rectangles without overlap, padded, inside the atlas', () => {
    const sizes: number[] = [];
    for (let i = 0; i < 200; i++) sizes.push(1 + ((i * 7) % 17), 1 + ((i * 13) % 11));
    sizes.push(0, 0);
    const p = packRects(sizes, 1024, 1)!;
    expect(p).not.toBeNull();
    const n = sizes.length / 2;
    expect(p.xy[(n - 1) * 2]).toBe(-1); // empty rect
    const rects: number[][] = [];
    for (let i = 0; i < n - 1; i++) {
      const x = p.xy[i * 2];
      const y = p.xy[i * 2 + 1];
      const w = sizes[i * 2];
      const h = sizes[i * 2 + 1];
      expect(x).toBeGreaterThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(1);
      expect(x + w + 1).toBeLessThanOrEqual(p.width);
      expect(y + h + 1).toBeLessThanOrEqual(p.height);
      rects.push([x - 1, y - 1, x + w + 1, y + h + 1]);
    }
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        const [ax0, ay0, ax1, ay1] = rects[a];
        const [bx0, by0, bx1, by1] = rects[b];
        expect(ax0 < bx1 && bx0 < ax1 && ay0 < by1 && by0 < ay1).toBe(false);
      }
    }
    expect(Math.log2(p.width) % 1).toBe(0);
    expect(Math.log2(p.height) % 1).toBe(0);
  });

  it('returns null when nothing fits', () => {
    expect(packRects([5000, 10], 4096)).toBeNull();
  });

  it('builds style-0 blocks, the flat lightmap of bumped faces, borders and the white block', () => {
    // Face 0: 2×2 luxels, two styles (style 0 second). Face 1: bumped 2×2 (flat block first).
    const f0 = face({ styles: [5, 0, 255, 255], lightOfs: 0 });
    const f1 = face({ texInfo: 1, lightOfs: 32 });
    const bytes: number[] = [];
    for (let i = 0; i < 4; i++) bytes.push(...rgbe(0.1)); // f0 style 5
    for (let i = 0; i < 4; i++) bytes.push(...rgbe(1)); // f0 style 0
    for (let i = 0; i < 4; i++) bytes.push(...rgbe(2)); // f1 flat
    for (let i = 0; i < 12; i++) bytes.push(...rgbe(0.01)); // f1 bump vectors
    const bsp = fakeBsp({
      faces: [f0, f1, face({ lightOfs: -1 })],
      texInfo: [texInfo(), texInfo(0x800)],
      lighting: Uint8Array.from(bytes),
    });
    expect(faceStyle0Offset(f0, false)).toBe(16);
    expect(faceStyle0Offset(f1, true)).toBe(32);
    const atlas = buildLightmapAtlas(bsp, { hdr: false });
    expect(atlas.luxels).toBe(8);
    expect(atlas.faceXY[4]).toBe(-1); // no lightmap
    const px = (x: number, y: number) => atlas.data[(y * atlas.width + x) * 4];
    const [x0, y0] = [atlas.faceXY[0], atlas.faceXY[1]];
    const [x1, y1] = [atlas.faceXY[2], atlas.faceXY[3]];
    expect(px(x0, y0)).toBe(linearToLightmap(1));
    expect(px(x0 - 1, y0 - 1)).toBe(linearToLightmap(1)); // padded corner
    expect(px(x0 + 2, y0 + 1)).toBe(linearToLightmap(1)); // padded edge
    expect(px(x1 + 1, y1 + 1)).toBe(linearToLightmap(2));
    expect(px(atlas.white[0], atlas.white[1])).toBe(linearToLightmap(1));
    // HDR scale multiplies luxels.
    const scaled = buildLightmapAtlas(fakeBsp({ ...bsp, lightingHdr: bsp.lighting, facesHdr: bsp.faces }), {
      hdr: true,
      scale: 2,
    });
    expect(scaled.data[(scaled.faceXY[1] * scaled.width + scaled.faceXY[0]) * 4]).toBe(linearToLightmap(2));
  });
});

// --- face math ---------------------------------------------------------------------

describe('face geometry', () => {
  it('fans polygons with the winding reversed (Source CW → three CCW)', () => {
    expect(fanIndices(3)).toEqual([0, 2, 1]);
    expect(fanIndices(4, 10)).toEqual([10, 12, 11, 10, 13, 12]);
    // A Source face whose front is +Z winds clockwise seen from above.
    const src = [
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ];
    const v = src.map(([x, y, z]) => srcToThree(x, y, z, new Vector3()));
    const tri = fanIndices(4).slice(0, 3).map((i) => v[i]);
    const n = new Vector3().subVectors(tri[1], tri[0]).cross(new Vector3().subVectors(tri[2], tri[0]));
    const up = srcToThree(0, 0, 1, new Vector3());
    expect(n.dot(up)).toBeGreaterThan(0); // counter-clockwise about the face normal
  });

  it('computes texture and luxel coordinates', () => {
    const ti = texInfo();
    const td = { width: 64, height: 32 } as BspFile['texData'][number];
    expect(faceTexCoord(ti, td, 10, 8, 0, [0, 0])).toEqual([(5 + 1) / 64, 2 / 32]);
    const f = face({ lightmapTextureMinsInLuxels: [2, -1] });
    expect(faceLuxelCoord(ti, f, 64, 32, 0, [0, 0])).toEqual([4 - 2 + 0.5, 2 + 1 + 0.5]);
    expect(atlasUv({ width: 256, height: 128 }, 10, 20, 2.5, 3.5, [0, 0])).toEqual([12.5 / 256, 23.5 / 128]);
  });

  it('maps displacement corners to the SDK luxel corners', () => {
    const size = 5;
    const U = 7;
    const V = 3;
    expect(dispLuxelCoord(0, 0, size, U, V, [0, 0])).toEqual([0.5, 0.5]); // corner 0
    expect(dispLuxelCoord(size - 1, 0, size, U, V, [0, 0])).toEqual([0.5, V + 0.5]); // corner 1
    expect(dispLuxelCoord(size - 1, size - 1, size, U, V, [0, 0])).toEqual([U + 0.5, V + 0.5]); // corner 2
    expect(dispLuxelCoord(0, size - 1, size, U, V, [0, 0])).toEqual([U + 0.5, 0.5]); // corner 3
    expect(dispLuxelCoord(2, 2, size, U, V, [0, 0])).toEqual([0.5 + U / 2, 0.5 + V / 2]);
  });

  it('splits surfaces by triangle median along the longest axis', () => {
    const surfs = Array.from({ length: 10 }, (_, i) => ({ nt: 10, cx: i * 100, cy: 0, cz: 0 }));
    const parts = splitSurfaces(surfs, 30);
    expect(parts.reduce((a, p) => a + p.length, 0)).toBe(10);
    for (const p of parts) expect(p.reduce((a, s) => a + s.nt, 0)).toBeLessThanOrEqual(30);
    // Spatially coherent: each part is a contiguous run of x.
    for (const p of parts) {
      const xs = p.map((s) => s.cx).sort((a, b) => a - b);
      expect(xs[xs.length - 1] - xs[0]).toBe((xs.length - 1) * 100);
    }
    expect(splitSurfaces(surfs, 1000)).toHaveLength(1);
  });

  it('normalises and un-patches material names', () => {
    expect(normalizeMaterialName('Materials\\Concrete\\Wall.vmt')).toBe('concrete/wall');
    expect(unpatchMaterialName('maps/ctf_2fort/concrete/wall_c_-123_456_78')).toBe('concrete/wall_c');
    expect(unpatchMaterialName('maps/ctf_2fort/nature/blend_wvt_patch')).toBe('nature/blend');
    expect(unpatchMaterialName('concrete/wall')).toBeNull();
  });
});

// --- PVS ---------------------------------------------------------------------------

describe('leaves and PVS', () => {
  // One node splitting on x = 0: front (x ≥ 0) leaf 0, back leaf 1.
  const bsp = {
    nodes: { planeNum: Int32Array.from([0]), children: Int32Array.from([-1, -2]) },
    planes: { normal: Float32Array.from([1, 0, 0]), dist: Float32Array.from([0]) },
    leafs: {
      count: 2,
      cluster: Int16Array.from([3, 9]),
      area: Int16Array.from([1, 1]),
      firstLeafFace: Uint16Array.from([0, 1]),
      numLeafFaces: Uint16Array.from([1, 2]),
    },
    leafFaces: Uint16Array.from([0, 0, 1]),
    faces: [face(), face()],
  } as unknown as BspFile;

  it('finds the leaves a box touches', () => {
    expect(leavesInBox(bsp, [1, 0, 0], [2, 1, 1]).sort()).toEqual([0]);
    expect(leavesInBox(bsp, [-2, 0, 0], [-1, 1, 1]).sort()).toEqual([1]);
    expect(leavesInBox(bsp, [-1, 0, 0], [1, 1, 1]).sort()).toEqual([0, 1]);
  });

  it('inverts leaf face lists and collects clusters', () => {
    const fl = faceLeafLists(bsp);
    expect(Array.from(fl.leaves.subarray(fl.start[0], fl.start[1])).sort()).toEqual([0, 1]);
    expect(Array.from(fl.leaves.subarray(fl.start[1], fl.start[2]))).toEqual([1]);
    expect(leafClusters(bsp, [1, 0, 1])).toEqual([3, 9]);
  });

  it('tests chunk clusters against a PVS row', () => {
    const row = new Uint8Array(2);
    row[1] = 1 << 1; // cluster 9
    expect(clustersVisible(row, [3, 9])).toBe(true);
    expect(clustersVisible(row, [3])).toBe(false);
    expect(clustersVisible(row, [])).toBe(true);
  });
});

// --- camera and transforms ---------------------------------------------------------

describe('camera', () => {
  it('converts Source FOV like ScaleFOVByWidthRatio', () => {
    expect(scaleFovByWidthRatio(90, 1)).toBeCloseTo(90);
    expect(sourceHorizontalFov(90, 4 / 3)).toBeCloseTo(90);
    expect(sourceHorizontalFov(90, 16 / 9)).toBeCloseTo(106.26, 1);
    expect(sourceHorizontalFov(90, 16 / 10)).toBeCloseTo(100.39, 1);
    expect(sourceFovToVertical(90)).toBeCloseTo(73.74, 1);
    // The vertical angle is the same for any aspect.
    const v = sourceFovToVertical(75);
    const h = sourceHorizontalFov(75, 21 / 9);
    const vFromH = (2 * Math.atan(Math.tan((h * Math.PI) / 360) / (21 / 9)) * 180) / Math.PI;
    expect(vFromH).toBeCloseTo(v, 6);
  });

  it('points the three camera along Source angles', () => {
    const q = new Quaternion();
    const look = (p: number, y: number) =>
      new Vector3(0, 0, -1).applyQuaternion(sourceAnglesToCameraQuaternion(p, y, 0, q));
    const f = look(0, 0); // Source +X → three +Z
    expect(f.z).toBeCloseTo(1);
    const l = look(0, 90); // Source +Y → three +X
    expect(l.x).toBeCloseTo(1);
    const d = look(90, 0); // pitch down → three −Y
    expect(d.y).toBeCloseTo(-1);
    const upv = new Vector3(0, 1, 0).applyQuaternion(sourceAnglesToCameraQuaternion(0, 37, 0, q));
    expect(upv.y).toBeCloseTo(1);
  });

  it('places converted and Source-axis geometry the same way', () => {
    const origin = { x: 100, y: -50, z: 20 };
    const angles = { x: 10, y: 70, z: -5 };
    const a = sourceTransformToMatrix(origin, angles, 1.5, new Matrix4());
    const b = sourceTransformToMatrixSrcAxes(origin, angles, 1.5, new Matrix4());
    const p = { x: 3, y: -7, z: 11 }; // model space, Source axes, metres
    const viaThree = srcToThree(p.x, p.y, p.z, new Vector3()).divideScalar(SOURCE_UNIT).applyMatrix4(a);
    const viaSrc = new Vector3(p.x, p.y, p.z).applyMatrix4(b);
    expect(viaThree.distanceTo(viaSrc)).toBeLessThan(1e-9);
    // Yaw 90: model forward (+X) points along world +Y (three +X).
    const m = sourceTransformToMatrixSrcAxes({ x: 0, y: 0, z: 0 }, { x: 0, y: 90, z: 0 }, 1, new Matrix4());
    const fw = new Vector3(1, 0, 0).applyMatrix4(m);
    expect(fw.x).toBeCloseTo(1);
  });

  it('sky faces are oriented consistently seen from inside', () => {
    for (const [c, u, v] of Object.values(SKY_FACE_AXES)) {
      // right × up = −forward (a right-handed view basis looking at c).
      const r = new Vector3(...(u as [number, number, number]));
      const up = new Vector3(...(v as [number, number, number]));
      const fwd = new Vector3(...(c as [number, number, number]));
      expect(r.clone().cross(up).dot(fwd)).toBeCloseTo(-1);
    }
  });
});

// --- lighting ----------------------------------------------------------------------

describe('ambient cubes and the sun', () => {
  function ambientBsp(): BspFile {
    const cube = (v: number) => Array.from({ length: 6 }, () => rgbe(v)).flat();
    const cubes = Uint8Array.from([...cube(0.001), ...cube(0.003)]);
    return {
      nodes: { planeNum: Int32Array.from([0]), children: Int32Array.from([-1, -2]) },
      planes: { normal: Float32Array.from([1, 0, 0]), dist: Float32Array.from([0]) },
      leafs: {
        count: 2,
        mins: Int16Array.from([0, 0, 0, -100, 0, 0]),
        maxs: Int16Array.from([255, 255, 255, 0, 100, 100]),
        ambientLighting: null,
      },
      // leaf 0: two samples; leaf 1 (no samples) borrows leaf 0's.
      leafAmbientLdr: {
        index: Uint16Array.from([2, 0, 0, 0]),
        cubes,
        positions: Uint8Array.from([0, 0, 0, 255, 0, 0]),
        sampleCount: 2,
      },
      leafAmbientHdr: null,
    } as unknown as BspFile;
  }

  it('weights samples by 1 / (d² + 1) and scales to lightmap units', () => {
    const bsp = ambientBsp();
    const out = newAmbientCube();
    expect(sampleAmbientCube(bsp, { x: 1, y: 0, z: 0 }, out, { leaf: 0 })).toBe(true);
    // The stored values after RGBE quantisation.
    const q = [0, 0, 0];
    decodeRgbe(Uint8Array.from(rgbe(0.001)), 0, q);
    const near = q[0] * AMBIENT_CUBE_SCALE;
    decodeRgbe(Uint8Array.from(rgbe(0.003)), 0, q);
    const far = q[0] * AMBIENT_CUBE_SCALE;
    const w0 = 1 / (1 + 1);
    const w1 = 1 / (254 * 254 + 1);
    const expected = (near * w0 + far * w1) / (w0 + w1);
    expect(out[0]).toBeCloseTo(expected, 5);
    // Midway, both samples count equally.
    sampleAmbientCube(bsp, { x: 127.5, y: 0, z: 0 }, out, { leaf: 0 });
    expect(out[4]).toBeCloseTo((near + far) / 2, 5);
  });

  it('evaluates the cube like the SDK AmbientLight', () => {
    const cube = Float32Array.from([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]);
    expect(evalAmbientCube(cube, 1, 0, 0, [0, 0, 0])[0]).toBe(1);
    expect(evalAmbientCube(cube, 0, -1, 0, [0, 0, 0])[0]).toBe(4);
    const s = Math.SQRT1_2;
    expect(evalAmbientCube(cube, 0, s, -s, [0, 0, 0])[0]).toBeCloseTo(0.5 * 3 + 0.5 * 6);
  });

  it('parses light_environment like vrad', () => {
    const c = parseLightString('255 255 255 200')!;
    expect(c[0]).toBeCloseTo(200 / 255);
    const g = parseLightString('128 64 0')!;
    expect(g[0]).toBeCloseTo(Math.pow(128 / 255, 2.2));
    expect(g[2]).toBe(0);
    expect(parseLightString('')).toBeNull();
    // pitch −90: light travels straight down.
    const down = lightNormalFromProps([0, 0, 0], 0, -90);
    expect(down[2]).toBeCloseTo(-1);
    const n = lightNormalFromProps([-45, 90, 0], 0, 0);
    expect(n[1]).toBeCloseTo(Math.SQRT1_2);
    expect(n[2]).toBeCloseTo(-Math.SQRT1_2);
  });
});

// --- overlays ----------------------------------------------------------------------

describe('overlays', () => {
  it('clips the overlay quad to a face polygon (either winding)', () => {
    const quad = [
      [-2, -2],
      [-2, 2],
      [2, 2],
      [2, -2],
    ];
    const faceCw = [
      [0, 0],
      [0, 4],
      [4, 4],
      [4, 0],
    ];
    const area = (p: number[][]) =>
      Math.abs(p.reduce((a, q, i) => a + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0)) / 2;
    expect(area(clipPolygon2D(quad, faceCw))).toBeCloseTo(4);
    expect(area(clipPolygon2D(quad, [...faceCw].reverse()))).toBeCloseTo(4);
    expect(clipPolygon2D(quad, faceCw.map(([x, y]) => [x + 10, y]))).toHaveLength(0);
  });

  it('interpolates overlay texture coordinates over the quad', () => {
    const corners = [
      [-2, -1],
      [-2, 1],
      [2, 1],
      [2, -1],
    ];
    const uv: [number, number] = [0, 0];
    expect(overlayTexCoord(corners, [0, 1], [0, 1], -2, -1, uv)).toEqual([0, 0]);
    expect(overlayTexCoord(corners, [0, 1], [0, 1], 2, 1, uv)).toEqual([1, 1]);
    expect(overlayTexCoord(corners, [0, 1], [0, 1], 0, 0, uv)).toEqual([0.5, 0.5]);
  });
});
