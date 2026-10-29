/**
 * Builds displacement surfaces from ddispinfo_t + CDispVert + the base face,
 * the way CCoreDispInfo does (SDK: public/builddisp.cpp). Shared by the
 * renderer (positions, normals, alpha, UVs) and collision (positions,
 * triangles, flags).
 *
 * Vertex (row i, column j) is at index i * size + j, size = 2^power + 1. Row 0
 * runs from corner 0 toward corner 3; rows step from the 0→1 edge toward the
 * 3→2 edge (SDK: CCoreDispInfo::GenerateDispSurf).
 *
 * Winding: triangles are emitted exactly as CCoreDispInfo::GenerateCollisionSurface
 * does. Their facing normal is (v2 − v0) × (v1 − v0) (SDK: CDispCollTri::CalcPlane),
 * i.e. they are clockwise when seen from the front (Direct3D convention). A
 * counter-clockwise renderer (three.js) swaps two indices.
 */

import type { BspFile } from './bsp';

export interface DisplacementSurface {
  /** Index into bsp.dispInfos. */
  index: number;
  /** Index of the base face in bsp.faces. */
  faceIndex: number;
  power: number;
  /** Vertices per side: 2^power + 1. */
  size: number;
  /** xyz per vertex, world space. */
  positions: Float32Array;
  /** Smoothed vertex normals (SDK: CCoreDispInfo::GenerateDispSurfNormals). */
  normals: Float32Array;
  /** Per-vertex blend alpha, 0–255 as stored (for $basetexture2 blending, divide by 255). */
  alphas: Float32Array;
  /** Base texture coordinates in texels (divide by the material's width/height), from the flat surface. */
  texCoords: Float32Array;
  /** Triangle vertex indices, 3 per triangle, 2 * (size-1)^2 triangles. */
  indices: Uint16Array;
  /** CDispTri tags per triangle (DISPTRI_TAG_*). */
  triTags: Uint16Array;
  /** The base face's 4 corners (xyz × 4) after rotating to the start position. */
  corners: Float32Array;
  /** Base face plane normal. */
  faceNormal: [number, number, number];
  /** DISP_SURF_* flags (no physics / hull / ray collision). */
  flags: number;
  contents: number;
  texInfo: number;
  mins: [number, number, number];
  maxs: [number, number, number];
}

/** NUM_DISP_POWER_VERTS */
export const dispVertCount = (power: number): number => ((1 << power) + 1) * ((1 << power) + 1);
/** NUM_DISP_POWER_TRIS */
export const dispTriCount = (power: number): number => (1 << power) * (1 << power) * 2;

/** Builds one displacement. Returns null if its base face is not a quad. */
export function buildDisplacement(bsp: BspFile, dispIndex: number): DisplacementSurface | null {
  const di = bsp.dispInfos[dispIndex];
  const faceIndex = di.mapFace;
  const face = bsp.faces[faceIndex];
  if (!face || face.numEdges !== 4) return null;

  // Base face corners from surfedges (SDK: CVRadDispMgr::DispBuilderInit).
  const pts = new Float64Array(12);
  for (let k = 0; k < 4; k++) {
    const se = bsp.surfEdges[face.firstEdge + k];
    const v = se >= 0 ? bsp.edges[se * 2] : bsp.edges[-se * 2 + 1];
    pts[k * 3] = bsp.vertexes[v * 3];
    pts[k * 3 + 1] = bsp.vertexes[v * 3 + 1];
    pts[k * 3 + 2] = bsp.vertexes[v * 3 + 2];
  }

  // SDK: CCoreDispSurface::FindSurfPointStartIndex — the corner nearest startPosition.
  const sp = di.startPosition;
  let start = 0;
  let best = Infinity;
  for (let k = 0; k < 4; k++) {
    const dx = sp.x - pts[k * 3];
    const dy = sp.y - pts[k * 3 + 1];
    const dz = sp.z - pts[k * 3 + 2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) {
      best = d;
      start = k;
    }
  }
  // SDK: CCoreDispSurface::AdjustSurfPointData — rotate so that corner is first.
  const corners = new Float32Array(12);
  for (let k = 0; k < 4; k++) {
    const src = (k + start) % 4;
    corners[k * 3] = pts[src * 3];
    corners[k * 3 + 1] = pts[src * 3 + 1];
    corners[k * 3 + 2] = pts[src * 3 + 2];
  }

  const power = di.power;
  const size = (1 << power) + 1;
  const n = size * size;
  const positions = new Float32Array(n * 3);
  const flat = new Float64Array(n * 3);
  const alphas = new Float32Array(n);
  const dv = bsp.dispVerts;
  const ooInt = 1 / (size - 1);

  // SDK: CCoreDispInfo::GenerateDispSurf
  const e0x = (corners[3] - corners[0]) * ooInt;
  const e0y = (corners[4] - corners[1]) * ooInt;
  const e0z = (corners[5] - corners[2]) * ooInt;
  const e1x = (corners[6] - corners[9]) * ooInt;
  const e1y = (corners[7] - corners[10]) * ooInt;
  const e1z = (corners[8] - corners[11]) * ooInt;
  const mins: [number, number, number] = [Infinity, Infinity, Infinity];
  const maxs: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < size; i++) {
    const ax = corners[0] + e0x * i;
    const ay = corners[1] + e0y * i;
    const az = corners[2] + e0z * i;
    const bx = corners[9] + e1x * i;
    const by = corners[10] + e1y * i;
    const bz = corners[11] + e1z * i;
    const sx = (bx - ax) * ooInt;
    const sy = (by - ay) * ooInt;
    const sz = (bz - az) * ooInt;
    for (let j = 0; j < size; j++) {
      const idx = i * size + j;
      const fx = ax + sx * j;
      const fy = ay + sy * j;
      const fz = az + sz * j;
      flat[idx * 3] = fx;
      flat[idx * 3 + 1] = fy;
      flat[idx * 3 + 2] = fz;
      const vi = di.dispVertStart + idx;
      const dist = dv.dist[vi];
      const px = fx + dv.vector[vi * 3] * dist;
      const py = fy + dv.vector[vi * 3 + 1] * dist;
      const pz = fz + dv.vector[vi * 3 + 2] * dist;
      positions[idx * 3] = px;
      positions[idx * 3 + 1] = py;
      positions[idx * 3 + 2] = pz;
      alphas[idx] = dv.alpha[vi];
      if (px < mins[0]) mins[0] = px;
      if (py < mins[1]) mins[1] = py;
      if (pz < mins[2]) mins[2] = pz;
      if (px > maxs[0]) maxs[0] = px;
      if (py > maxs[1]) maxs[1] = py;
      if (pz > maxs[2]) maxs[2] = pz;
    }
  }

  // SDK: CCoreDispInfo::GenerateCollisionSurface (BuildTriTLtoBR / BuildTriBLtoTR)
  const indices = new Uint16Array((size - 1) * (size - 1) * 6);
  let t = 0;
  for (let iv = 0; iv < size - 1; iv++) {
    for (let iu = 0; iu < size - 1; iu++) {
      const ndx = iv * size + iu;
      if (ndx % 2 === 1) {
        indices[t++] = ndx;
        indices[t++] = ndx + size;
        indices[t++] = ndx + 1;
        indices[t++] = ndx + 1;
        indices[t++] = ndx + size;
        indices[t++] = ndx + size + 1;
      } else {
        indices[t++] = ndx;
        indices[t++] = ndx + size;
        indices[t++] = ndx + size + 1;
        indices[t++] = ndx;
        indices[t++] = ndx + size + 1;
        indices[t++] = ndx + 1;
      }
    }
  }

  const triCount = indices.length / 3;
  const triTags = new Uint16Array(triCount);
  if (di.dispTriStart >= 0 && di.dispTriStart + triCount <= bsp.dispTris.length) {
    triTags.set(bsp.dispTris.subarray(di.dispTriStart, di.dispTriStart + triCount));
  }

  // Texel coordinates from the flat surface (SDK: CCoreDispInfo::CalcDispSurfCoords interpolates
  // the base face's coords, which is the same as projecting the flat position).
  const texCoords = new Float32Array(n * 2);
  const ti = bsp.texInfo[face.texInfo];
  if (ti) {
    const tv = ti.textureVecs;
    for (let k = 0; k < n; k++) {
      const x = flat[k * 3];
      const y = flat[k * 3 + 1];
      const z = flat[k * 3 + 2];
      texCoords[k * 2] = tv[0] * x + tv[1] * y + tv[2] * z + tv[3];
      texCoords[k * 2 + 1] = tv[4] * x + tv[5] * y + tv[6] * z + tv[7];
    }
  }

  // dface_t.planenum is the face's own plane (its winding is clockwise about
  // that normal for either `side`), so it is used as is.
  const pl = face.planeNum;
  const faceNormal: [number, number, number] = [
    bsp.planes.normal[pl * 3],
    bsp.planes.normal[pl * 3 + 1],
    bsp.planes.normal[pl * 3 + 2],
  ];

  const normals = computeDispNormals(positions, size, faceNormal);

  return {
    index: dispIndex,
    faceIndex,
    power,
    size,
    positions,
    normals,
    alphas,
    texCoords,
    indices,
    triTags,
    corners,
    faceNormal,
    flags: di.flags,
    contents: di.contents,
    texInfo: face.texInfo,
    mins,
    maxs,
  };
}

/** SDK: CCoreDispInfo::GenerateDispSurfNormals / CalcNormalFromEdges. */
function computeDispNormals(
  pos: Float32Array,
  size: number,
  fallback: [number, number, number],
): Float32Array {
  const normals = new Float32Array(size * size * 3);
  const acc = [0, 0, 0];
  const tmp = [0, 0, 0];
  // Adds normalize((c - a) × (b - a)) where b is the "row" neighbour and c the "column" neighbour,
  // matching CrossProduct(tmpVect[1], tmpVect[0]) in the SDK.
  const addTri = (a: number, b: number, c: number) => {
    const t0x = pos[b * 3] - pos[a * 3];
    const t0y = pos[b * 3 + 1] - pos[a * 3 + 1];
    const t0z = pos[b * 3 + 2] - pos[a * 3 + 2];
    const t1x = pos[c * 3] - pos[a * 3];
    const t1y = pos[c * 3 + 1] - pos[a * 3 + 1];
    const t1z = pos[c * 3 + 2] - pos[a * 3 + 2];
    tmp[0] = t1y * t0z - t1z * t0y;
    tmp[1] = t1z * t0x - t1x * t0z;
    tmp[2] = t1x * t0y - t1y * t0x;
    const l = Math.hypot(tmp[0], tmp[1], tmp[2]);
    if (l > 0) {
      acc[0] += tmp[0] / l;
      acc[1] += tmp[1] / l;
      acc[2] += tmp[2] / l;
    }
  };
  const V = (row: number, col: number) => col * size + row; // SDK: indexCol * postSpacing + indexRow
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const row = j;
      const col = i;
      const left = row - 1 >= 0;
      const top = col + 1 <= size - 1;
      const right = row + 1 <= size - 1;
      const bottom = col - 1 >= 0;
      acc[0] = acc[1] = acc[2] = 0;
      let count = 0;
      if (top && right) {
        addTri(V(row, col), V(row, col + 1), V(row + 1, col));
        addTri(V(row + 1, col), V(row, col + 1), V(row + 1, col + 1));
        count += 2;
      }
      if (left && top) {
        addTri(V(row - 1, col), V(row - 1, col + 1), V(row, col));
        addTri(V(row, col), V(row - 1, col + 1), V(row, col + 1));
        count += 2;
      }
      if (left && bottom) {
        addTri(V(row - 1, col - 1), V(row - 1, col), V(row, col - 1));
        addTri(V(row, col - 1), V(row - 1, col), V(row, col));
        count += 2;
      }
      if (right && bottom) {
        addTri(V(row, col - 1), V(row, col), V(row + 1, col - 1));
        addTri(V(row + 1, col - 1), V(row, col), V(row + 1, col));
        count += 2;
      }
      // The SDK averages (and leaves unnormalized); normalize for rendering.
      let nx = acc[0] / count;
      let ny = acc[1] / count;
      let nz = acc[2] / count;
      const l = Math.hypot(nx, ny, nz);
      if (l > 1e-6) {
        nx /= l;
        ny /= l;
        nz /= l;
      } else {
        // Collapsed vertices (all neighbours coincide): use the base face normal.
        [nx, ny, nz] = fallback;
      }
      const o = (i * size + j) * 3;
      normals[o] = nx;
      normals[o + 1] = ny;
      normals[o + 2] = nz;
    }
  }
  return normals;
}

/** Builds every displacement in the map (null entries for malformed ones). */
export function buildDisplacements(bsp: BspFile): Array<DisplacementSurface | null> {
  const out: Array<DisplacementSurface | null> = [];
  for (let i = 0; i < bsp.dispInfos.length; i++) out.push(buildDisplacement(bsp, i));
  return out;
}
