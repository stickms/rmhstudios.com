/**
 * Assembles a `BspFile` from compiled brushes: plane table (paired, as vbsp writes it), brushes and
 * sides, render faces, edges, texinfo/texdata, a kd-tree per model, leaf lists and the entity lump.
 * The result is exactly the shape `parseBsp` produces, so `MapCollision`, `WorldRenderer` and
 * `SpWorld` run on it unchanged.
 */
import type {
  BspFile,
  BspFace,
  BspModel,
  BspTexData,
  BspTexInfo,
} from '../../tf2-game/formats/bsp';
import { parseEntityLump } from '../../tf2-game/formats/keyvalues';
import {
  buildBrush,
  polygonArea,
  textureAxes,
  brushContainsPoint,
  type CompiledBrush,
} from './brush';
import { buildKd, type KdBounds, type KdNode } from './kd';
import type { MaterialInfo, MaterialLookup } from './materials';
import { normalizeHarmonicMaterial } from './materials';
import type { EntitySource, Face, LevelSource, Vec3 } from './types';

// SURF_* (lib/tf2-game/core/constants.ts).
const SURF_TRANS = 0x10;
const SURF_SKY = 0x4;
const SURF_TRIGGER = 0x40;
const SURF_NODRAW = 0x80;
const SURF_NOLIGHT = 0x400;
const CONTENTS_FLUID = 0x20 | 0x10; // water, slime: the renderer reads the camera leaf's contents for fog
const CONTENTS_PLAYERCLIP = 0x10000;
const CONTENTS_LADDER = 0x20000000;

/** Shared by every face (the engine only reads them). */
const FACE_STYLES: [number, number, number, number] = [255, 255, 255, 255];
const NO_LUXELS: [number, number] = [0, 0];
const ROOT_PAD = 16;
const DEFAULT_UNITS_PER_REPEAT = 128;
const DEFAULT_TEX_SIZE = 64;

export interface BuiltBsp {
  bsp: BspFile;
  materials: Map<string, MaterialInfo>;
  stats: { brushes: number; faces: number; leaves: number };
}

function u16(v: number, what: string): number {
  if (v > 0xffff) throw new Error(`level too large: ${what} exceeds 65535 (${v})`);
  return v;
}
const clamp16 = (v: number): number => Math.max(-32768, Math.min(32767, v));

// --- planes -----------------------------------------------------------------------------

class PlaneTable {
  readonly nx: number[] = [];
  readonly ny: number[] = [];
  readonly nz: number[] = [];
  readonly d: number[] = [];
  readonly type: number[] = [];
  private readonly index = new Map<string, number>();

  private static key(nx: number, ny: number, nz: number, d: number): string {
    return `${Math.round(nx * 1e5)}|${Math.round(ny * 1e5)}|${Math.round(nz * 1e5)}|${Math.round(d * 100)}`;
  }

  /** Axial planes: normal code (axis*2 + negative) -> dist*100 -> index. */
  private readonly axial: Array<Map<number, number>> = [
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    new Map(),
  ];

  /** Index of the plane `n·p = d`; creates the pair (n, -n) when new. */
  get(nx: number, ny: number, nz: number, d: number): number {
    const code =
      nx === 1
        ? 0
        : nx === -1
          ? 1
          : ny === 1
            ? 2
            : ny === -1
              ? 3
              : nz === 1
                ? 4
                : nz === -1
                  ? 5
                  : -1;
    const dk = Math.round(d * 100);
    if (code >= 0) {
      const hit = this.axial[code].get(dk);
      if (hit !== undefined) return hit;
    }
    const idx = this.getSlow(nx, ny, nz, d);
    if (code >= 0) this.axial[code].set(dk, idx);
    return idx;
  }

  private getSlow(nx: number, ny: number, nz: number, d: number): number {
    const k = PlaneTable.key(nx, ny, nz, d);
    const hit = this.index.get(k);
    if (hit !== undefined) return hit;
    // Snap axial normals so the engine's axial fast path applies.
    const eps = 1e-6;
    let axis = -1;
    if (Math.abs(Math.abs(nx) - 1) < eps) axis = 0;
    else if (Math.abs(Math.abs(ny) - 1) < eps) axis = 1;
    else if (Math.abs(Math.abs(nz) - 1) < eps) axis = 2;
    let type: number;
    if (axis >= 0) {
      nx = axis === 0 ? Math.sign(nx) : 0;
      ny = axis === 1 ? Math.sign(ny) : 0;
      nz = axis === 2 ? Math.sign(nz) : 0;
      type = axis;
    } else {
      const ax = Math.abs(nx);
      const ay = Math.abs(ny);
      const az = Math.abs(nz);
      type = 3 + (ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2);
    }
    // Axial planes list the positive orientation first; others as first requested.
    const flip = axis >= 0 && nx + ny + nz < 0;
    const a = flip ? [-nx, -ny, -nz, -d] : [nx, ny, nz, d];
    const base = this.nx.length;
    this.push(a[0], a[1], a[2], a[3], type);
    this.push(-a[0], -a[1], -a[2], -a[3], type);
    this.index.set(PlaneTable.key(a[0], a[1], a[2], a[3]), base);
    this.index.set(PlaneTable.key(-a[0], -a[1], -a[2], -a[3]), base + 1);
    return this.index.get(k) ?? (flip ? base + 1 : base);
  }

  private push(nx: number, ny: number, nz: number, d: number, type: number): void {
    // -0 would make byte-level comparisons noisy.
    this.nx.push(nx + 0);
    this.ny.push(ny + 0);
    this.nz.push(nz + 0);
    this.d.push(d + 0);
    this.type.push(type);
  }
}

// --- materials / texinfo ----------------------------------------------------------------

class MaterialTable {
  readonly byRaw = new Map<string, MaterialInfo>();
  readonly byName = new Map<string, MaterialInfo>();
  readonly texData: BspTexData[] = [];
  readonly texDataStrings: string[] = [];
  private readonly texDataIndex = new Map<string, number>();
  readonly texInfo: BspTexInfo[] = [];
  private readonly texInfoIndex = new Map<string, number>();

  constructor(private readonly lookup: MaterialLookup) {}

  info(raw: string): MaterialInfo {
    let m = this.byRaw.get(raw);
    if (!m) {
      m = this.lookup(raw);
      if (!m.name) m = { ...m, name: normalizeHarmonicMaterial(raw) };
      this.byRaw.set(raw, m);
      if (!this.byName.has(m.name)) this.byName.set(m.name, m);
    }
    return m;
  }

  private texDataFor(m: MaterialInfo): number {
    const hit = this.texDataIndex.get(m.name);
    if (hit !== undefined) return hit;
    const w = m.texture?.w ?? DEFAULT_TEX_SIZE;
    const h = m.texture?.h ?? DEFAULT_TEX_SIZE;
    const lin = (c: number): number => Math.pow(c, 2.2);
    const id = this.texData.length;
    this.texDataStrings.push(m.name);
    this.texData.push({
      reflectivity: { x: lin(m.color[0]), y: lin(m.color[1]), z: lin(m.color[2]) },
      nameStringTableId: id,
      name: m.name,
      width: w,
      height: h,
      viewWidth: w,
      viewHeight: h,
    });
    this.texDataIndex.set(m.name, id);
    return id;
  }

  /** texinfo for a face of this material on a plane with this normal. */
  texInfoFor(face: Face, nx: number, ny: number, nz: number, extraFlags: number): number {
    // Axial normals (every box side) are keyed without any trigonometry.
    const axial = nx * nx === 1 || ny * ny === 1 || nz * nz === 1;
    let fast = '';
    if (axial) {
      fast = `${face.material}|${extraFlags}|${nx}${ny}${nz}|${face.uScale ?? 1}|${face.vScale ?? 1}|${face.uShift ?? 0}|${face.vShift ?? 0}|${face.rotation ?? 0}`;
      const hit = this.fastIndex.get(fast);
      if (hit !== undefined) return hit;
    }
    const idx = this.texInfoSlow(face, nx, ny, nz, extraFlags);
    if (axial) this.fastIndex.set(fast, idx);
    return idx;
  }

  private readonly fastIndex = new Map<string, number>();

  private texInfoSlow(face: Face, nx: number, ny: number, nz: number, extraFlags: number): number {
    const m = this.info(face.material);
    let flags = extraFlags;
    if (m.nodraw) flags |= SURF_NODRAW;
    if (m.sky) flags |= SURF_SKY | SURF_NOLIGHT;
    if (m.unlit) flags |= SURF_NOLIGHT;
    if (m.translucent) flags |= SURF_TRANS;
    const td = this.texDataFor(m);
    const data = this.texData[td];

    const { s, t } = textureAxes(nx, ny, nz);
    const r = ((face.rotation ?? 0) * Math.PI) / 180;
    const cs = Math.cos(r);
    const sn = Math.sin(r);
    const sx = s.x * cs + t.x * sn;
    const sy = s.y * cs + t.y * sn;
    const sz = s.z * cs + t.z * sn;
    const tx = -s.x * sn + t.x * cs;
    const ty = -s.y * sn + t.y * cs;
    const tz = -s.z * sn + t.z * cs;
    const U = m.unitsPerRepeat ?? DEFAULT_UNITS_PER_REPEAT;
    const ku = data.width / (U * (face.uScale ?? 1));
    const kv = data.height / (U * (face.vScale ?? 1));
    const vecs = [
      sx * ku,
      sy * ku,
      sz * ku,
      face.uShift ?? 0,
      tx * kv,
      ty * kv,
      tz * kv,
      face.vShift ?? 0,
    ].map((x) => Math.round(x * 1e6) / 1e6 + 0);

    const key = `${m.name}|${flags}|${vecs.join(',')}`;
    const hit = this.texInfoIndex.get(key);
    if (hit !== undefined) return hit;
    const textureVecs = Float32Array.from(vecs);
    const lightmapVecs = new Float32Array([
      sx / 16,
      sy / 16,
      sz / 16,
      0,
      tx / 16,
      ty / 16,
      tz / 16,
      0,
    ]);
    this.texInfo.push({ textureVecs, lightmapVecs, flags, texData: td });
    this.texInfoIndex.set(key, this.texInfo.length - 1);
    return this.texInfo.length - 1;
  }
}

// --- entity lump ------------------------------------------------------------------------

const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 1e4) / 1e4);
const vec = (v: Vec3): string => `${fmt(v.x)} ${fmt(v.y)} ${fmt(v.z)}`;

function checkValue(s: string, what: string): string {
  if (s.includes('"')) throw new Error(`entity ${what}: values cannot contain a double quote`);
  return s;
}

function entityBlock(props: Array<[string, string]>): string {
  return `{\n${props.map(([k, v]) => `"${checkValue(k, k)}" "${checkValue(v, k)}"`).join('\n')}\n}`;
}

// --- main -------------------------------------------------------------------------------

interface ModelWork {
  brushes: CompiledBrush[];
  /** Global brush index of brushes[0]. */
  brushBase: number;
  /** Trigger volumes never draw. */
  hidden: boolean;
}

export function buildBsp(src: LevelSource, lookup: MaterialLookup): BuiltBsp {
  // 1. Compile brushes.
  const world: CompiledBrush[] = src.world.map((b, i) =>
    buildBrush(b, `${src.id}: world brush ${i}`),
  );
  const models: ModelWork[] = [{ brushes: world, brushBase: 0, hidden: false }];
  const entityModel = new Map<number, number>(); // entity index -> model index
  let brushCount = world.length;
  src.entities.forEach((e, ei) => {
    if (!e.brushes || e.brushes.length === 0) return;
    if (e.classname === 'worldspawn')
      throw new Error(`${src.id}: worldspawn is implicit; remove it from entities`);
    const brushes = e.brushes.map((b, i) =>
      buildBrush(b, `${src.id}: ${e.classname}#${ei} brush ${i}`),
    );
    entityModel.set(ei, models.length);
    models.push({
      brushes,
      brushBase: brushCount,
      hidden: e.classname.toLowerCase().startsWith('trigger_'),
    });
    brushCount += brushes.length;
  });

  const planes = new PlaneTable();
  const mats = new MaterialTable(lookup);

  // 2. Brushes and sides.
  const bFirstSide: number[] = [];
  const bNumSides: number[] = [];
  const bContents: number[] = [];
  const sPlane: number[] = [];
  const sTex: number[] = [];
  const sBevel: number[] = [];
  /** Per global brush, per non-bevel side: texinfo (reused for faces). */
  const sideTexInfo: number[][] = [];
  /** Plane index of each non-bevel side, parallel to sideTexInfo. */
  const sidePlaneIdx: number[][] = [];
  for (const m of models) {
    for (const b of m.brushes) {
      bFirstSide.push(sPlane.length);
      bNumSides.push(b.sides.length);
      bContents.push(b.contents);
      const hideFlags = m.hidden ? SURF_TRIGGER | SURF_NODRAW : 0;
      const tis: number[] = [];
      const pis: number[] = [];
      let firstTi = -1;
      for (const s of b.sides) {
        const p = s.plane;
        const ti = mats.texInfoFor(s.face, p.nx, p.ny, p.nz, hideFlags);
        if (firstTi < 0) firstTi = ti;
        const useTi = s.bevel ? firstTi : ti;
        const pi = u16(planes.get(p.nx, p.ny, p.nz, p.d), 'planes');
        sPlane.push(pi);
        sTex.push(useTi);
        sBevel.push(s.bevel ? 1 : 0);
        if (!s.bevel) {
          tis.push(ti);
          pis.push(pi);
        }
      }
      sideTexInfo.push(tis);
      sidePlaneIdx.push(pis);
    }
  }

  // 3. Faces, vertexes, edges.
  const vertBuckets = new Map<number, number[]>();
  const verts: number[] = [];
  const edgeIndex = new Map<number, number>();
  const edges: number[] = [0, 0]; // edge 0 is a dummy: surfedge 0 cannot carry a sign
  const surfEdges: number[] = [];
  const faces: BspFace[] = [];
  const faceMins: number[] = [];
  const faceMaxs: number[] = [];
  /** Faces of each global brush. */
  const brushFaces: number[][] = [];
  const modelFirstFace: number[] = [];
  const modelNumFaces: number[] = [];

  // Vertices are shared when equal within 1/1000 unit; the hash only picks a bucket.
  const vertex = (p: Vec3): number => {
    const h =
      Math.imul(Math.round(p.x * 64), 73856093) ^
      Math.imul(Math.round(p.y * 64), 19349663) ^
      Math.imul(Math.round(p.z * 64), 83492791);
    let bucket = vertBuckets.get(h);
    if (bucket) {
      for (const i of bucket) {
        if (
          Math.abs(verts[i * 3] - p.x) < 1e-3 &&
          Math.abs(verts[i * 3 + 1] - p.y) < 1e-3 &&
          Math.abs(verts[i * 3 + 2] - p.z) < 1e-3
        )
          return i;
      }
    } else {
      bucket = [];
      vertBuckets.set(h, bucket);
    }
    const i = verts.length / 3;
    u16(i + 1, 'vertexes');
    verts.push(p.x + 0, p.y + 0, p.z + 0);
    bucket.push(i);
    return i;
  };

  for (const m of models) {
    modelFirstFace.push(faces.length);
    m.brushes.forEach((b, bi) => {
      const list: number[] = [];
      brushFaces.push(list);
      if (m.hidden || b.contents & (CONTENTS_PLAYERCLIP | CONTENTS_LADDER)) return;
      const tis = sideTexInfo[m.brushBase + bi];
      const pis = sidePlaneIdx[m.brushBase + bi];
      let side = 0;
      for (const s of b.sides) {
        if (s.bevel) break;
        const ti = tis[side];
        const pn = pis[side++];
        const info = mats.texInfo[ti];
        if (info.flags & (SURF_NODRAW | SURF_SKY)) continue;
        const poly = s.poly!;
        const first = surfEdges.length;
        let mnx = Infinity;
        let mny = Infinity;
        let mnz = Infinity;
        let mxx = -Infinity;
        let mxy = -Infinity;
        let mxz = -Infinity;
        const vi = poly.map(vertex);
        for (const p of poly) {
          mnx = Math.min(mnx, p.x);
          mny = Math.min(mny, p.y);
          mnz = Math.min(mnz, p.z);
          mxx = Math.max(mxx, p.x);
          mxy = Math.max(mxy, p.y);
          mxz = Math.max(mxz, p.z);
        }
        for (let i = 0; i < vi.length; i++) {
          const a = vi[i];
          const c = vi[(i + 1) % vi.length];
          const rev = edgeIndex.get(c * 65536 + a);
          if (rev !== undefined) {
            surfEdges.push(-rev);
          } else {
            const idx = edges.length / 2;
            edges.push(a, c);
            edgeIndex.set(a * 65536 + c, idx);
            surfEdges.push(idx);
          }
        }
        const fi = faces.length;
        faces.push({
          planeNum: pn,
          side: 0,
          onNode: 0,
          firstEdge: first,
          numEdges: vi.length,
          texInfo: ti,
          dispInfo: -1,
          surfaceFogVolumeId: 0,
          styles: FACE_STYLES,
          lightOfs: -1,
          area: polygonArea(poly),
          lightmapTextureMinsInLuxels: NO_LUXELS,
          lightmapTextureSizeInLuxels: NO_LUXELS,
          origFace: fi,
          numPrims: 0,
          firstPrimId: 0,
          smoothingGroups: 0,
          dynamicShadowsEnabled: true,
        });
        faceMins.push(mnx, mny, mnz);
        faceMaxs.push(mxx, mxy, mxz);
        list.push(fi);
      }
    });
    modelNumFaces.push(faces.length - modelFirstFace[modelFirstFace.length - 1]);
  }
  u16(faces.length, 'faces');

  // 4. kd-trees.
  const nPlane: number[] = [];
  const nChildren: number[] = [];
  const nMins: number[] = [];
  const nMaxs: number[] = [];
  const lContents: number[] = [];
  const lMins: number[] = [];
  const lMaxs: number[] = [];
  const lFirstFace: number[] = [];
  const lNumFaces: number[] = [];
  const lFirstBrush: number[] = [];
  const lNumBrushes: number[] = [];
  const leafBrushes: number[] = [];
  const leafFaces: number[] = [];
  const modelHead: number[] = [];
  const modelMins: Vec3[] = [];
  const modelMaxs: Vec3[] = [];

  const clampMin = (v: number): number => clamp16(Math.floor(v));
  const clampMax = (v: number): number => clamp16(Math.ceil(v));

  for (let mi = 0; mi < models.length; mi++) {
    const m = models[mi];
    const n = m.brushes.length;
    const bmin = new Float64Array(n * 3);
    const bmax = new Float64Array(n * 3);
    const lo: [number, number, number] = [Infinity, Infinity, Infinity];
    const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    m.brushes.forEach((b, i) => {
      const a = [b.mins.x, b.mins.y, b.mins.z];
      const c = [b.maxs.x, b.maxs.y, b.maxs.z];
      for (let k = 0; k < 3; k++) {
        bmin[i * 3 + k] = a[k];
        bmax[i * 3 + k] = c[k];
        lo[k] = Math.min(lo[k], a[k]);
        hi[k] = Math.max(hi[k], c[k]);
      }
    });
    if (n === 0) {
      lo.fill(0);
      hi.fill(0);
    }
    modelMins.push({ x: lo[0], y: lo[1], z: lo[2] });
    modelMaxs.push({ x: hi[0], y: hi[1], z: hi[2] });
    const cell: KdBounds = {
      mins: [lo[0] - ROOT_PAD, lo[1] - ROOT_PAD, lo[2] - ROOT_PAD],
      maxs: [hi[0] + ROOT_PAD, hi[1] + ROOT_PAD, hi[2] + ROOT_PAD],
    };
    const ids = Array.from({ length: n }, (_, i) => i);
    const force = new Uint8Array(n);
    m.brushes.forEach((b, i) => {
      if (b.contents & CONTENTS_FLUID) force[i] = 1;
    });
    let tree = buildKd(bmin, bmax, ids, cell, undefined, force);

    if (mi === 0 && tree.leaf) {
      // Keep a real node 0 for the world so `findLeaf(bsp, p)` (headNode 0) works on tiny levels.
      const d = cell.maxs[0];
      const emptyFront: KdNode = {
        leaf: true,
        items: [],
        mins: [d, cell.mins[1], cell.mins[2]],
        maxs: [d + ROOT_PAD, cell.maxs[1], cell.maxs[2]],
      };
      tree = {
        leaf: false,
        axis: 0,
        dist: d,
        mins: cell.mins,
        maxs: cell.maxs,
        front: emptyFront,
        back: tree,
      };
    }

    const emit = (node: KdNode): number => {
      if (node.leaf) {
        const leaf = lContents.length;
        let contents = 0;
        for (const id of node.items) {
          const b = m.brushes[id];
          if (contents & b.contents) continue;
          let inside = true;
          for (let c = 0; c < 8 && inside; c++) {
            inside = brushContainsPoint(
              b,
              c & 1 ? node.maxs[0] : node.mins[0],
              c & 2 ? node.maxs[1] : node.mins[1],
              c & 4 ? node.maxs[2] : node.mins[2],
            );
          }
          if (inside) contents |= b.contents;
        }
        lContents.push(contents);
        lMins.push(clampMin(node.mins[0]), clampMin(node.mins[1]), clampMin(node.mins[2]));
        lMaxs.push(clampMax(node.maxs[0]), clampMax(node.maxs[1]), clampMax(node.maxs[2]));
        lFirstBrush.push(u16(leafBrushes.length, 'leaf brush list'));
        for (const id of node.items) leafBrushes.push(u16(m.brushBase + id, 'brush index'));
        lNumBrushes.push(node.items.length);
        lFirstFace.push(u16(leafFaces.length, 'leaf face list'));
        let nf = 0;
        if (mi === 0) {
          for (const id of node.items) {
            for (const f of brushFaces[m.brushBase + id]) {
              const eps = 1e-3;
              if (
                faceMaxs[f * 3] >= node.mins[0] - eps &&
                faceMins[f * 3] <= node.maxs[0] + eps &&
                faceMaxs[f * 3 + 1] >= node.mins[1] - eps &&
                faceMins[f * 3 + 1] <= node.maxs[1] + eps &&
                faceMaxs[f * 3 + 2] >= node.mins[2] - eps &&
                faceMins[f * 3 + 2] <= node.maxs[2] + eps
              ) {
                leafFaces.push(f);
                nf++;
              }
            }
          }
        }
        lNumFaces.push(nf);
        return -(leaf + 1);
      }
      const idx = nPlane.length;
      const nx = node.axis === 0 ? 1 : 0;
      const ny = node.axis === 1 ? 1 : 0;
      const nz = node.axis === 2 ? 1 : 0;
      nPlane.push(planes.get(nx, ny, nz, node.dist));
      nChildren.push(0, 0);
      nMins.push(clampMin(node.mins[0]), clampMin(node.mins[1]), clampMin(node.mins[2]));
      nMaxs.push(clampMax(node.maxs[0]), clampMax(node.maxs[1]), clampMax(node.maxs[2]));
      nChildren[idx * 2] = emit(node.front);
      nChildren[idx * 2 + 1] = emit(node.back);
      return idx;
    };
    modelHead.push(emit(tree));
  }
  u16(leafBrushes.length, 'leaf brush list');
  u16(leafFaces.length, 'leaf face list');
  u16(planes.nx.length, 'planes');

  // 5. Entities.
  const blocks: string[] = [];
  const world0: Array<[string, string]> = [
    ['classname', 'worldspawn'],
    ['mapname', src.id],
    ['message', src.title],
  ];
  if (src.sky) world0.push(['skyname', src.sky]);
  blocks.push(entityBlock(world0));
  if (src.fog) {
    blocks.push(
      entityBlock([
        ['classname', 'env_fog_controller'],
        ['targetname', 'harmonic_fog'],
        ['fogenable', '1'],
        ['fogcolor', `${fmt(src.fog.color[0])} ${fmt(src.fog.color[1])} ${fmt(src.fog.color[2])}`],
        ['fogstart', fmt(src.fog.start)],
        ['fogend', fmt(src.fog.end)],
        ['fogmaxdensity', fmt(src.fog.maxDensity ?? 1)],
      ]),
    );
  }
  src.entities.forEach((e: EntitySource, ei) => {
    const props: Array<[string, string]> = [['classname', e.classname]];
    if (e.origin) props.push(['origin', vec(e.origin)]);
    if (e.angles) props.push(['angles', vec(e.angles)]);
    for (const [k, v] of Object.entries(e.keys ?? {})) props.push([k, v]);
    const mi = entityModel.get(ei);
    if (mi !== undefined) props.push(['model', `*${mi}`]);
    for (const o of e.outputs ?? []) {
      const sp = o.indexOf(' ');
      if (sp <= 0)
        throw new Error(
          `${src.id}: output "${o}" must be "OutputName target,Input,param,delay,times"`,
        );
      props.push([o.slice(0, sp), o.slice(sp + 1)]);
    }
    blocks.push(entityBlock(props));
  });
  const entityText = blocks.join('\n') + '\n';

  // 6. Assemble.
  const planeCount = planes.nx.length;
  const normal = new Float32Array(planeCount * 3);
  for (let i = 0; i < planeCount; i++) {
    normal[i * 3] = planes.nx[i];
    normal[i * 3 + 1] = planes.ny[i];
    normal[i * 3 + 2] = planes.nz[i];
  }
  const nodeCount = nPlane.length;
  const leafCount = lContents.length;
  const bspModels: BspModel[] = models.map((_, i) => ({
    mins: modelMins[i],
    maxs: modelMaxs[i],
    origin: { x: 0, y: 0, z: 0 },
    headNode: modelHead[i],
    firstFace: modelFirstFace[i],
    numFaces: modelNumFaces[i],
  }));

  const bsp: BspFile = {
    version: 20,
    mapRevision: 1,
    lumps: Array.from({ length: 64 }, () => ({
      offset: 0,
      length: 0,
      version: 0,
      uncompressedSize: 0,
    })),
    entities: parseEntityLump(entityText),
    entityText,
    planes: {
      count: planeCount,
      normal,
      dist: Float32Array.from(planes.d),
      type: Int32Array.from(planes.type),
    },
    texData: mats.texData,
    texDataStrings: mats.texDataStrings,
    vertexes: Float32Array.from(verts),
    visibility: null,
    nodes: {
      count: nodeCount,
      planeNum: Int32Array.from(nPlane),
      children: Int32Array.from(nChildren),
      mins: Int16Array.from(nMins),
      maxs: Int16Array.from(nMaxs),
      firstFace: new Uint16Array(nodeCount),
      numFaces: new Uint16Array(nodeCount),
      area: new Int16Array(nodeCount),
    },
    texInfo: mats.texInfo,
    faces,
    facesHdr: [],
    originalFaces: [],
    lighting: new Uint8Array(0),
    lightingHdr: new Uint8Array(0),
    leafs: {
      count: leafCount,
      version: 1,
      contents: Int32Array.from(lContents),
      cluster: new Int16Array(leafCount),
      area: new Int16Array(leafCount),
      flags: new Uint8Array(leafCount),
      mins: Int16Array.from(lMins),
      maxs: Int16Array.from(lMaxs),
      firstLeafFace: Uint16Array.from(lFirstFace),
      numLeafFaces: Uint16Array.from(lNumFaces),
      firstLeafBrush: Uint16Array.from(lFirstBrush),
      numLeafBrushes: Uint16Array.from(lNumBrushes),
      leafWaterDataId: new Int16Array(leafCount).fill(-1),
      ambientLighting: null,
    },
    edges: Uint16Array.from(edges),
    surfEdges: Int32Array.from(surfEdges),
    models: bspModels,
    worldLights: [],
    worldLightsHdr: [],
    leafFaces: Uint16Array.from(leafFaces),
    leafBrushes: Uint16Array.from(leafBrushes),
    brushes: {
      count: bContents.length,
      firstSide: Int32Array.from(bFirstSide),
      numSides: Int32Array.from(bNumSides),
      contents: Int32Array.from(bContents),
    },
    brushSides: {
      count: sPlane.length,
      planeNum: Uint16Array.from(sPlane),
      texInfo: Int16Array.from(sTex),
      dispInfo: new Int16Array(sPlane.length),
      bevel: Int16Array.from(sBevel),
    },
    dispInfos: [],
    dispVerts: {
      count: 0,
      vector: new Float32Array(0),
      dist: new Float32Array(0),
      alpha: new Float32Array(0),
    },
    dispTris: new Uint16Array(0),
    leafAmbientLdr: null,
    leafAmbientHdr: null,
    gameLumps: [],
    staticProps: null,
    pakfile: new Uint8Array(0),
    cubemaps: [],
    overlays: [],
    faceMacroTextureInfo: new Uint16Array(0),
    mapFlags: 0,
  };
  return {
    bsp,
    materials: mats.byName,
    stats: { brushes: bContents.length, faces: faces.length, leaves: leafCount },
  };
}
