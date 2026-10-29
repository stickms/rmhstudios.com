/**
 * World geometry for the renderer, as plain typed arrays (no three.js): faces and
 * displacements triangulated, texture and lightmap coordinates computed, and grouped
 * into chunks per (brush model, 3D-skybox area, material) split spatially, each chunk
 * carrying the PVS clusters it touches. world-renderer.ts turns chunks into meshes.
 *
 * Positions and normals are in three.js space (metres, Y up — coords.ts); texture
 * coordinates keep Source's orientation (v down, so textures load with flipY = false).
 */
import type { BspFace, BspFile, BspTexData, BspTexInfo } from '../formats/bsp';
import { faceVertexIndices } from '../formats/bsp';
import type { DisplacementSurface } from '../formats/displacement';
import { SOURCE_UNIT } from './coords';
import type { LightmapAtlas } from './lightmap';

// --- materials ---------------------------------------------------------------------

/**
 * A texdata material name as a manifest key: lowercased, forward slashes, without a
 * leading `materials/` or a `.vmt` extension.
 */
export function normalizeMaterialName(name: string): string {
  let n = name.toLowerCase().replace(/\\/g, '/');
  if (n.startsWith('materials/')) n = n.slice(10);
  if (n.endsWith('.vmt')) n = n.slice(0, -4);
  return n;
}

/**
 * vbsp's cubemap patching renames a material to `maps/<map>/<orig>_<x>_<y>_<z>` (with
 * the patched VMT in the pakfile, which packages strip). Returns the original name, or
 * null when the name is not a patched one.
 */
export function unpatchMaterialName(name: string): string | null {
  const m = /^maps\/[^/]+\/(.+?)(?:_-?\d+_-?\d+_-?\d+)+$/.exec(name);
  if (m) return m[1];
  const w = /^maps\/[^/]+\/(.+?)_wvt_patch$/.exec(name);
  return w ? w[1] : null;
}

// --- face math ---------------------------------------------------------------------

/**
 * Fan triangulation of an n-gon for a counter-clockwise renderer. Source faces wind
 * clockwise seen from the front (D3D), so each fan triangle (0, i, i+1) is emitted as
 * (0, i+1, i). Indices are relative to the polygon's first vertex.
 */
export function fanIndices(n: number, base = 0, out: number[] = []): number[] {
  for (let i = 1; i < n - 1; i++) out.push(base, base + i + 1, base + i);
  return out;
}

/** Texture coordinate of a Source point on a face (normalised by the texdata size). */
export function faceTexCoord(
  ti: BspTexInfo,
  td: BspTexData | undefined,
  x: number,
  y: number,
  z: number,
  out: [number, number],
): [number, number] {
  const v = ti.textureVecs;
  const w = td && td.width > 0 ? td.width : 1;
  const h = td && td.height > 0 ? td.height : 1;
  out[0] = (v[0] * x + v[1] * y + v[2] * z + v[3]) / w;
  out[1] = (v[4] * x + v[5] * y + v[6] * z + v[7]) / h;
  return out;
}

/**
 * Luxel coordinate of a Source point on a face, including the half-texel offset to
 * the luxel centre (SDK engine: BuildMSurfaceVertexArrays — lightmapVecs · p + ofs −
 * mins + 0.5).
 */
export function faceLuxelCoord(
  ti: BspTexInfo,
  face: BspFace,
  x: number,
  y: number,
  z: number,
  out: [number, number],
): [number, number] {
  const v = ti.lightmapVecs;
  out[0] = v[0] * x + v[1] * y + v[2] * z + v[3] - face.lightmapTextureMinsInLuxels[0] + 0.5;
  out[1] = v[4] * x + v[5] * y + v[6] * z + v[7] - face.lightmapTextureMinsInLuxels[1] + 0.5;
  return out;
}

/**
 * Luxel coordinate of displacement vertex (row i, column j) of a `size`-wide grid on a
 * face whose lightmap is (U+1)×(V+1) luxels (U, V = lightmapTextureSizeInLuxels).
 * SDK: CCoreDispSurface::CalcLuxelCoords puts corner 0 (the start corner) at (0.5, 0.5),
 * corner 1 at (0.5, V+0.5), 2 at (U+0.5, V+0.5), 3 at (U+0.5, 0.5);
 * CCoreDispInfo::CalcDispSurfCoords interpolates rows along 0→1 and columns toward 3→2.
 */
export function dispLuxelCoord(
  i: number,
  j: number,
  size: number,
  U: number,
  V: number,
  out: [number, number],
): [number, number] {
  const t = 1 / (size - 1);
  out[0] = 0.5 + U * j * t;
  out[1] = 0.5 + V * i * t;
  return out;
}

/** Luxel coordinate → normalised atlas UV for a face's block at (x0, y0). */
export function atlasUv(
  atlas: Pick<LightmapAtlas, 'width' | 'height'>,
  x0: number,
  y0: number,
  lu: number,
  lv: number,
  out: [number, number],
): [number, number] {
  out[0] = (x0 + lu) / atlas.width;
  out[1] = (y0 + lv) / atlas.height;
  return out;
}

// --- leaves, clusters, areas -------------------------------------------------------

/** Every leaf whose bounds touch the box (walks the tree from headNode). */
export function leavesInBox(
  bsp: BspFile,
  mins: ArrayLike<number>,
  maxs: ArrayLike<number>,
  out: number[] = [],
  headNode = 0,
): number[] {
  const { nodes, planes } = bsp;
  const stack = [headNode];
  while (stack.length) {
    const n = stack.pop()!;
    if (n < 0) {
      out.push(-1 - n);
      continue;
    }
    const p = nodes.planeNum[n];
    const nx = planes.normal[p * 3];
    const ny = planes.normal[p * 3 + 1];
    const nz = planes.normal[p * 3 + 2];
    const d = planes.dist[p];
    // Box extremes along the normal.
    const hi =
      (nx > 0 ? maxs[0] : mins[0]) * nx + (ny > 0 ? maxs[1] : mins[1]) * ny + (nz > 0 ? maxs[2] : mins[2]) * nz;
    const lo =
      (nx > 0 ? mins[0] : maxs[0]) * nx + (ny > 0 ? mins[1] : maxs[1]) * ny + (nz > 0 ? mins[2] : maxs[2]) * nz;
    if (hi >= d) stack.push(nodes.children[n * 2]);
    if (lo < d) stack.push(nodes.children[n * 2 + 1]);
  }
  return out;
}

/** CSR lists of the leaves referencing each face (via LUMP_LEAFFACES). */
export interface FaceLeaves {
  start: Int32Array;
  leaves: Int32Array;
}

export function faceLeafLists(bsp: BspFile): FaceLeaves {
  const nFaces = bsp.faces.length;
  const count = new Int32Array(nFaces + 1);
  const L = bsp.leafs;
  for (let l = 0; l < L.count; l++) {
    const f0 = L.firstLeafFace[l];
    for (let k = 0; k < L.numLeafFaces[l]; k++) {
      const f = bsp.leafFaces[f0 + k];
      if (f < nFaces) count[f + 1]++;
    }
  }
  for (let i = 0; i < nFaces; i++) count[i + 1] += count[i];
  const start = count.slice();
  const fill = count.slice(0, nFaces);
  const leaves = new Int32Array(start[nFaces]);
  for (let l = 0; l < L.count; l++) {
    const f0 = L.firstLeafFace[l];
    for (let k = 0; k < L.numLeafFaces[l]; k++) {
      const f = bsp.leafFaces[f0 + k];
      if (f < nFaces) leaves[fill[f]++] = l;
    }
  }
  return { start, leaves };
}

/** Sorted unique clusters (≥ 0) of a leaf list. */
export function leafClusters(bsp: BspFile, leaves: ArrayLike<number>): number[] {
  const set = new Set<number>();
  for (let i = 0; i < leaves.length; i++) {
    const c = bsp.leafs.cluster[leaves[i]];
    if (c >= 0) set.add(c);
  }
  return [...set].sort((a, b) => a - b);
}

/** Whether any of a chunk's clusters is set in a decompressed PVS row (empty list: always). */
export function clustersVisible(row: Uint8Array, clusters: ArrayLike<number>): boolean {
  if (clusters.length === 0) return true;
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    if (row[c >> 3] & (1 << (c & 7))) return true;
  }
  return false;
}

// --- chunk building ----------------------------------------------------------------

/** SURF_* flags that are never drawn as world geometry. */
export const SURF_SKIP_MASK = 0x2 | 0x4 | 0x40 | 0x80 | 0x100 | 0x200; // SKY2D, SKY, TRIGGER, NODRAW, HINT, SKIP

export interface ChunkData {
  /** Normalised material name (manifest key). */
  material: string;
  /** Brush model index (0 = world). */
  model: number;
  /** Lies in the 3D skybox's area (drawn by the sky pass, scaled). */
  sky3d: boolean;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  uv2s: Float32Array;
  /** RGBA8; alpha = displacement blend (255 elsewhere). */
  colors: Uint8Array;
  indices: Uint32Array;
  /** PVS clusters touched (sorted); empty = no cluster info (always potentially visible). */
  clusters: Int32Array;
  /** Bounding sphere (three space). */
  center: [number, number, number];
  radius: number;
  /** Displacement chunk (for stats / WorldVertexTransition detection). */
  displacement: boolean;
}

export interface WorldGeometryOptions {
  atlas: LightmapAtlas;
  /** Faces as read for lighting (bsp.facesHdr when using HDR lighting), parallel to bsp.faces. */
  lightFaces?: BspFace[];
  displacements: Array<DisplacementSurface | null>;
  /** Whether a material (normalised name) is drawn at all. */
  drawMaterial: (material: string) => boolean;
  /** Leaf area of the 3D skybox (sky_camera's leaf), or -1. */
  skyArea?: number;
  /** Split a chunk while it has more triangles than this (default 4096). */
  maxChunkTris?: number;
}

interface Surface {
  disp: DisplacementSurface | null;
  face: number;
  key: string;
  nv: number;
  nt: number;
  cx: number;
  cy: number;
  cz: number;
  clusters: number[];
}

const scratchIdx: number[] = [];

/** Builds every chunk of the world and brush models. */
export function buildWorldChunks(bsp: BspFile, opts: WorldGeometryOptions): ChunkData[] {
  const lightFaces = opts.lightFaces ?? bsp.faces;
  const maxTris = opts.maxChunkTris ?? 4096;
  const skyArea = opts.skyArea ?? -1;
  const faceLeaves = faceLeafLists(bsp);
  const groups = new Map<string, { material: string; model: number; sky3d: boolean; surfs: Surface[] }>();
  const faceModel = new Int32Array(bsp.faces.length).fill(-1);
  for (let m = 0; m < bsp.models.length; m++) {
    const md = bsp.models[m];
    for (let f = md.firstFace; f < md.firstFace + md.numFaces && f < bsp.faces.length; f++) {
      if (faceModel[f] < 0) faceModel[f] = m;
    }
  }
  const dispByFace = new Map<number, DisplacementSurface>();
  for (const d of opts.displacements) if (d) dispByFace.set(d.faceIndex, d);
  const leafScratch: number[] = [];
  const box = [0, 0, 0];
  const box2 = [0, 0, 0];

  for (let fi = 0; fi < bsp.faces.length; fi++) {
    const model = faceModel[fi];
    if (model < 0) continue;
    const face = bsp.faces[fi];
    const ti = bsp.texInfo[face.texInfo];
    if (!ti || ti.flags & SURF_SKIP_MASK) continue;
    const td = bsp.texData[ti.texData];
    const material = normalizeMaterialName(td ? td.name : '');
    if (!opts.drawMaterial(material)) continue;
    let disp: DisplacementSurface | null = null;
    let nv: number;
    let nt: number;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let leaves: ArrayLike<number>;
    if (face.dispInfo >= 0) {
      disp = dispByFace.get(fi) ?? null;
      if (!disp) continue;
      nv = disp.size * disp.size;
      nt = disp.indices.length / 3;
      for (let k = 0; k < 3; k++) {
        box[k] = disp.mins[k] - 1;
        box2[k] = disp.maxs[k] + 1;
      }
      cx = (disp.mins[0] + disp.maxs[0]) / 2;
      cy = (disp.mins[1] + disp.maxs[1]) / 2;
      cz = (disp.mins[2] + disp.maxs[2]) / 2;
      leafScratch.length = 0;
      leaves = model === 0 ? leavesInBox(bsp, box, box2, leafScratch) : [];
    } else {
      if (face.numEdges < 3) continue;
      nv = face.numEdges;
      nt = nv - 2;
      faceVertexIndices(bsp, face, scratchIdx);
      for (const v of scratchIdx) {
        cx += bsp.vertexes[v * 3];
        cy += bsp.vertexes[v * 3 + 1];
        cz += bsp.vertexes[v * 3 + 2];
      }
      cx /= nv;
      cy /= nv;
      cz /= nv;
      leaves =
        model === 0 ? faceLeaves.leaves.subarray(faceLeaves.start[fi], faceLeaves.start[fi + 1]) : [];
    }
    let sky3d = false;
    if (skyArea >= 0 && model === 0) {
      for (let k = 0; k < leaves.length; k++) {
        if (bsp.leafs.area[leaves[k]] === skyArea && bsp.leafs.cluster[leaves[k]] >= 0) {
          sky3d = true;
          break;
        }
      }
    }
    const clusters = model === 0 ? leafClusters(bsp, leaves) : [];
    const key = `${model}|${sky3d ? 1 : 0}|${material}`;
    let g = groups.get(key);
    if (!g) {
      g = { material, model, sky3d, surfs: [] };
      groups.set(key, g);
    }
    g.surfs.push({ disp, face: fi, key, nv, nt, cx, cy, cz, clusters });
  }

  const chunks: ChunkData[] = [];
  for (const g of groups.values()) {
    // Displacements and brush faces of one material share a chunk; split spatially.
    // Brush models are never split: they move as one object.
    const parts = g.model === 0 ? splitSurfaces(g.surfs, maxTris) : [g.surfs];
    for (const part of parts) {
      chunks.push(emitChunk(bsp, lightFaces, opts.atlas, g.material, g.model, g.sky3d, part));
    }
  }
  return chunks;
}

/** Recursive median split along the longest centroid extent until each part fits maxTris. */
export function splitSurfaces<T extends { nt: number; cx: number; cy: number; cz: number }>(
  surfs: T[],
  maxTris: number,
): T[][] {
  let tris = 0;
  for (const s of surfs) tris += s.nt;
  if (tris <= maxTris || surfs.length < 2) return [surfs];
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const s of surfs) {
    if (s.cx < minX) minX = s.cx;
    if (s.cy < minY) minY = s.cy;
    if (s.cz < minZ) minZ = s.cz;
    if (s.cx > maxX) maxX = s.cx;
    if (s.cy > maxY) maxY = s.cy;
    if (s.cz > maxZ) maxZ = s.cz;
  }
  const ex = maxX - minX;
  const ey = maxY - minY;
  const ez = maxZ - minZ;
  const axis = ex >= ey && ex >= ez ? 'cx' : ey >= ez ? 'cy' : 'cz';
  const sorted = surfs.slice().sort((a, b) => a[axis] - b[axis]);
  // Split at the triangle median so both halves carry similar work.
  let acc = 0;
  let cut = 1;
  for (let i = 0; i < sorted.length; i++) {
    acc += sorted[i].nt;
    if (acc >= tris / 2) {
      cut = Math.min(Math.max(i + 1, 1), sorted.length - 1);
      break;
    }
  }
  return [
    ...splitSurfaces(sorted.slice(0, cut), maxTris),
    ...splitSurfaces(sorted.slice(cut), maxTris),
  ];
}

function emitChunk(
  bsp: BspFile,
  lightFaces: BspFace[],
  atlas: LightmapAtlas,
  material: string,
  model: number,
  sky3d: boolean,
  surfs: Surface[],
): ChunkData {
  let nv = 0;
  let nt = 0;
  let anyDisp = false;
  for (const s of surfs) {
    nv += s.nv;
    nt += s.nt;
    if (s.disp) anyDisp = true;
  }
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const uvs = new Float32Array(nv * 2);
  const uv2s = new Float32Array(nv * 2);
  const colors = new Uint8Array(nv * 4).fill(255);
  const indices = new Uint32Array(nt * 3);
  const clusterSet = new Set<number>();
  let noClusters = false;
  const tc: [number, number] = [0, 0];
  const lc: [number, number] = [0, 0];
  let v = 0;
  let t = 0;
  const S = SOURCE_UNIT;
  const whiteU = atlas.white[0] / atlas.width;
  const whiteV = atlas.white[1] / atlas.height;
  for (const s of surfs) {
    if (s.clusters.length === 0) noClusters = true;
    for (const c of s.clusters) clusterSet.add(c);
    const face = bsp.faces[s.face];
    const lface = lightFaces[s.face] ?? face;
    const ti = bsp.texInfo[face.texInfo];
    const td = bsp.texData[ti.texData];
    const ax = atlas.faceXY[s.face * 2];
    const ay = atlas.faceXY[s.face * 2 + 1];
    const base = v;
    if (s.disp) {
      const d = s.disp;
      const w = td && td.width > 0 ? td.width : 1;
      const h = td && td.height > 0 ? td.height : 1;
      const U = lface.lightmapTextureSizeInLuxels[0];
      const V = lface.lightmapTextureSizeInLuxels[1];
      for (let i = 0; i < d.size; i++) {
        for (let j = 0; j < d.size; j++) {
          const k = i * d.size + j;
          const x = d.positions[k * 3];
          const y = d.positions[k * 3 + 1];
          const z = d.positions[k * 3 + 2];
          positions[v * 3] = y * S;
          positions[v * 3 + 1] = z * S;
          positions[v * 3 + 2] = x * S;
          normals[v * 3] = d.normals[k * 3 + 1];
          normals[v * 3 + 1] = d.normals[k * 3 + 2];
          normals[v * 3 + 2] = d.normals[k * 3];
          uvs[v * 2] = d.texCoords[k * 2] / w;
          uvs[v * 2 + 1] = d.texCoords[k * 2 + 1] / h;
          if (ax >= 0) {
            dispLuxelCoord(i, j, d.size, U, V, lc);
            uv2s[v * 2] = (ax + lc[0]) / atlas.width;
            uv2s[v * 2 + 1] = (ay + lc[1]) / atlas.height;
          } else {
            uv2s[v * 2] = whiteU;
            uv2s[v * 2 + 1] = whiteV;
          }
          colors[v * 4 + 3] = Math.max(0, Math.min(255, Math.round(d.alphas[k])));
          v++;
        }
      }
      // CCoreDispInfo winds clockwise (D3D); swap two indices for three.js.
      for (let k = 0; k < d.indices.length; k += 3) {
        indices[t++] = base + d.indices[k];
        indices[t++] = base + d.indices[k + 2];
        indices[t++] = base + d.indices[k + 1];
      }
    } else {
      faceVertexIndices(bsp, face, scratchIdx);
      const pl = face.planeNum;
      const nx = bsp.planes.normal[pl * 3];
      const ny = bsp.planes.normal[pl * 3 + 1];
      const nz = bsp.planes.normal[pl * 3 + 2];
      for (const vi of scratchIdx) {
        const x = bsp.vertexes[vi * 3];
        const y = bsp.vertexes[vi * 3 + 1];
        const z = bsp.vertexes[vi * 3 + 2];
        positions[v * 3] = y * S;
        positions[v * 3 + 1] = z * S;
        positions[v * 3 + 2] = x * S;
        normals[v * 3] = ny;
        normals[v * 3 + 1] = nz;
        normals[v * 3 + 2] = nx;
        faceTexCoord(ti, td, x, y, z, tc);
        uvs[v * 2] = tc[0];
        uvs[v * 2 + 1] = tc[1];
        if (ax >= 0) {
          faceLuxelCoord(ti, lface, x, y, z, lc);
          uv2s[v * 2] = (ax + lc[0]) / atlas.width;
          uv2s[v * 2 + 1] = (ay + lc[1]) / atlas.height;
        } else {
          uv2s[v * 2] = whiteU;
          uv2s[v * 2 + 1] = whiteV;
        }
        colors[v * 4 + 3] = 0; // WorldVertexTransition on a brush face shows $basetexture
        v++;
      }
      for (let i = 1; i < scratchIdx.length - 1; i++) {
        indices[t++] = base;
        indices[t++] = base + i + 1;
        indices[t++] = base + i;
      }
    }
  }
  const { center, radius } = boundingSphere(positions);
  return {
    material,
    model,
    sky3d,
    positions,
    normals,
    uvs,
    uv2s,
    colors,
    indices,
    clusters: noClusters ? new Int32Array(0) : Int32Array.from([...clusterSet].sort((a, b) => a - b)),
    center,
    radius,
    displacement: anyDisp,
  };
}

// --- overlays (info_overlay) -------------------------------------------------------

/** 2D convex polygon clip (Sutherland–Hodgman) of `poly` by the convex polygon `clip`. */
export function clipPolygon2D(poly: number[][], clip: number[][]): number[][] {
  // Orientation of the clip polygon (inside = left of each edge when counter-clockwise).
  let area = 0;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const sign = area >= 0 ? 1 : -1;
  let out = poly;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const side = (p: number[]) => sign * (ex * (p[1] - a[1]) - ey * (p[0] - a[0]));
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const p = input[k];
      const q = input[(k + 1) % input.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return out;
}

/**
 * Texture coordinate inside an overlay quad: corners c0..c3 (2D) carry
 * (u0,v0) (u0,v1) (u1,v1) (u1,v0) (SDK engine overlay.cpp); solved as the
 * parallelogram spanned at c0 by c3 − c0 (u) and c1 − c0 (v).
 */
export function overlayTexCoord(
  corners: number[][],
  u: [number, number],
  v: [number, number],
  x: number,
  y: number,
  out: [number, number],
): [number, number] {
  const ax = corners[3][0] - corners[0][0];
  const ay = corners[3][1] - corners[0][1];
  const bx = corners[1][0] - corners[0][0];
  const by = corners[1][1] - corners[0][1];
  const det = ax * by - ay * bx;
  const px = x - corners[0][0];
  const py = y - corners[0][1];
  const s = det !== 0 ? (px * by - py * bx) / det : 0;
  const t = det !== 0 ? (ax * py - ay * px) / det : 0;
  out[0] = u[0] + (u[1] - u[0]) * s;
  out[1] = v[0] + (v[1] - v[0]) * t;
  return out;
}

/**
 * info_overlay decals (LUMP_OVERLAYS): each overlay quad, in its basis (U packed in the
 * UV points' z, V = ±normal × U — SDK vbsp overlay.cpp), clipped to every face it lists
 * and projected onto that face's plane; lit by that face's lightmap. One chunk per
 * material.
 */
export function buildOverlayChunks(
  bsp: BspFile,
  opts: Pick<WorldGeometryOptions, 'atlas' | 'lightFaces' | 'drawMaterial'>,
): ChunkData[] {
  const atlas = opts.atlas;
  const lightFaces = opts.lightFaces ?? bsp.faces;
  const faceLeaves = faceLeafLists(bsp);
  interface Poly {
    pos: number[]; // source xyz triples
    uv: number[];
    lm: number[];
    clusters: number[];
  }
  const byMat = new Map<string, Poly[]>();
  const idx: number[] = [];
  const tc: [number, number] = [0, 0];
  const lc: [number, number] = [0, 0];
  for (const ov of bsp.overlays) {
    const ti = bsp.texInfo[ov.texInfo];
    if (!ti) continue;
    const td = bsp.texData[ti.texData];
    const material = normalizeMaterialName(td ? td.name : '');
    if (!opts.drawMaterial(material)) continue;
    const N = [ov.basisNormal.x, ov.basisNormal.y, ov.basisNormal.z];
    const U = [ov.uvPoints[0].z, ov.uvPoints[1].z, ov.uvPoints[2].z];
    let V = [N[1] * U[2] - N[2] * U[1], N[2] * U[0] - N[0] * U[2], N[0] * U[1] - N[1] * U[0]];
    const vl = Math.hypot(V[0], V[1], V[2]);
    if (vl < 1e-6 || Math.hypot(U[0], U[1], U[2]) < 1e-6) continue;
    // vbsp sets uvPoints[3].z = 1 when Hammer's BasisV is −(normal × BasisU) (overlay.cpp).
    const flip = ov.uvPoints[3].z === 1 ? -1 : 1;
    V = [(V[0] / vl) * flip, (V[1] / vl) * flip, (V[2] / vl) * flip];
    const O = [ov.origin.x, ov.origin.y, ov.origin.z];
    const corners = ov.uvPoints.map((p) => [p.x, p.y]);
    for (const fi of ov.faces) {
      const face = bsp.faces[fi];
      if (!face || face.dispInfo >= 0) continue;
      const fti = bsp.texInfo[face.texInfo];
      if (!fti) continue;
      faceVertexIndices(bsp, face, idx);
      const pl = face.planeNum;
      const fn = [bsp.planes.normal[pl * 3], bsp.planes.normal[pl * 3 + 1], bsp.planes.normal[pl * 3 + 2]];
      const fd = bsp.planes.dist[pl];
      const denom = fn[0] * N[0] + fn[1] * N[1] + fn[2] * N[2];
      if (Math.abs(denom) < 0.1) continue;
      const face2d = idx.map((vi) => {
        const dx = bsp.vertexes[vi * 3] - O[0];
        const dy = bsp.vertexes[vi * 3 + 1] - O[1];
        const dz = bsp.vertexes[vi * 3 + 2] - O[2];
        return [dx * U[0] + dy * U[1] + dz * U[2], dx * V[0] + dy * V[1] + dz * V[2]];
      });
      const clipped = clipPolygon2D(corners, face2d);
      if (clipped.length < 3) continue;
      const lface = lightFaces[fi] ?? face;
      const ax = atlas.faceXY[fi * 2];
      const ay = atlas.faceXY[fi * 2 + 1];
      const poly: Poly = {
        pos: [],
        uv: [],
        lm: [],
        clusters: leafClusters(bsp, faceLeaves.leaves.subarray(faceLeaves.start[fi], faceLeaves.start[fi + 1])),
      };
      for (const [x, y] of clipped) {
        const q = [O[0] + U[0] * x + V[0] * y, O[1] + U[1] * x + V[1] * y, O[2] + U[2] * x + V[2] * y];
        const t = (fd - (fn[0] * q[0] + fn[1] * q[1] + fn[2] * q[2])) / denom;
        // On the face plane, nudged off it along the face normal (depth offset does the rest).
        const p = [q[0] + N[0] * t + fn[0] * 0.1, q[1] + N[1] * t + fn[1] * 0.1, q[2] + N[2] * t + fn[2] * 0.1];
        poly.pos.push(p[0], p[1], p[2]);
        overlayTexCoord(corners, ov.u, ov.v, x, y, tc);
        poly.uv.push(tc[0], tc[1]);
        if (ax >= 0) {
          faceLuxelCoord(fti, lface, p[0], p[1], p[2], lc);
          poly.lm.push((ax + lc[0]) / atlas.width, (ay + lc[1]) / atlas.height);
        } else {
          poly.lm.push(atlas.white[0] / atlas.width, atlas.white[1] / atlas.height);
        }
      }
      // Wind counter-clockwise about the face normal (front faces for three.js).
      const n = poly.pos.length / 3;
      const e1 = [poly.pos[3] - poly.pos[0], poly.pos[4] - poly.pos[1], poly.pos[5] - poly.pos[2]];
      const e2 = [poly.pos[6] - poly.pos[0], poly.pos[7] - poly.pos[1], poly.pos[8] - poly.pos[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (cr[0] * fn[0] + cr[1] * fn[1] + cr[2] * fn[2] < 0) {
        const rev = (arr: number[], k: number) => {
          const out: number[] = [];
          for (let i = n - 1; i >= 0; i--) for (let j = 0; j < k; j++) out.push(arr[i * k + j]);
          return out;
        };
        poly.pos = rev(poly.pos, 3);
        poly.uv = rev(poly.uv, 2);
        poly.lm = rev(poly.lm, 2);
      }
      let list = byMat.get(material);
      if (!list) byMat.set(material, (list = []));
      list.push(poly);
    }
  }
  const chunks: ChunkData[] = [];
  const S = SOURCE_UNIT;
  for (const [material, polys] of byMat) {
    let nv = 0;
    let nt = 0;
    for (const p of polys) {
      nv += p.pos.length / 3;
      nt += p.pos.length / 3 - 2;
    }
    const positions = new Float32Array(nv * 3);
    const normals = new Float32Array(nv * 3);
    const uvs = new Float32Array(nv * 2);
    const uv2s = new Float32Array(nv * 2);
    const colors = new Uint8Array(nv * 4).fill(255);
    const indices = new Uint32Array(nt * 3);
    const clusters = new Set<number>();
    let always = false;
    let v = 0;
    let t = 0;
    for (const p of polys) {
      if (!p.clusters.length) always = true;
      for (const c of p.clusters) clusters.add(c);
      const n = p.pos.length / 3;
      for (let i = 1; i < n - 1; i++) {
        indices[t++] = v;
        indices[t++] = v + i;
        indices[t++] = v + i + 1;
      }
      for (let i = 0; i < n; i++) {
        positions[v * 3] = p.pos[i * 3 + 1] * S;
        positions[v * 3 + 1] = p.pos[i * 3 + 2] * S;
        positions[v * 3 + 2] = p.pos[i * 3] * S;
        uvs[v * 2] = p.uv[i * 2];
        uvs[v * 2 + 1] = p.uv[i * 2 + 1];
        uv2s[v * 2] = p.lm[i * 2];
        uv2s[v * 2 + 1] = p.lm[i * 2 + 1];
        v++;
      }
    }
    const sphere = boundingSphere(positions);
    chunks.push({
      material,
      model: 0,
      sky3d: false,
      positions,
      normals,
      uvs,
      uv2s,
      colors,
      indices,
      clusters: always ? new Int32Array(0) : Int32Array.from([...clusters].sort((a, b) => a - b)),
      center: sphere.center,
      radius: sphere.radius,
      displacement: false,
    });
  }
  return chunks;
}

function boundingSphere(positions: Float32Array): { center: [number, number, number]; radius: number } {
  const n = positions.length / 3;
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const x = positions[i * 3 + k];
      if (x < mn[k]) mn[k] = x;
      if (x > mx[k]) mx[k] = x;
    }
  }
  const center: [number, number, number] = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  let r2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = positions[i * 3] - center[0];
    const dy = positions[i * 3 + 1] - center[1];
    const dz = positions[i * 3 + 2] - center[2];
    r2 = Math.max(r2, dx * dx + dy * dy + dz * dz);
  }
  return { center, radius: Math.sqrt(r2) };
}
