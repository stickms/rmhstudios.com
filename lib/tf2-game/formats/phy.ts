/**
 * .phy collision models: phyheader_t (public/phyfile.h), then per solid an
 * `int size` and a VPHY compact-surface blob, then a KeyValues-style text
 * section ("solid { … }", "editparams { … }"). The blob is vphysics'
 * compactsurfaceheader_t (VPHY id, version, model type, surface size, drag
 * areas, axis map size — 28 bytes) followed by an IVP compact surface: a
 * ledge tree whose leaves are convex "ledges" (triangle lists over a shared
 * point array).
 *
 * IVP stores metres with Y down and Z/Y swapped relative to Source; the
 * conversion is the engine's ConvertPositionToHL: hl = (x, z, -y) / 0.0254.
 */

import { viewOf } from './binary';
import { parseKeyValues, type KvNode } from './keyvalues';

export const PHY_VPHY_ID = 0x59485056; // 'VPHY'
const IVP_SURFACE_HEADER = 48; // sizeof(IVP_Compact_Surface)
const IVP_LEDGE_HEADER = 16; // sizeof(IVP_Compact_Ledge)
const IVP_TRIANGLE_SIZE = 16; // sizeof(IVP_Compact_Triangle)
const IVP_POINT_SIZE = 16; // sizeof(IVP_Compact_Poly_Point)
const IVP_NODE_SIZE = 28; // sizeof(IVP_Compact_Ledgetree_Node)
/** 1 / METERS_PER_INCH */
const METERS_TO_INCHES = 1 / 0.0254;

export interface PhyConvex {
  /** xyz in model space, Source units/axes; the convex piece's distinct points. */
  vertices: Float32Array;
  /** Triangles over `vertices` (3 indices each), as stored (IVP winding). */
  triangles: Uint16Array;
}

export interface PhySolid {
  /** Convex pieces of this solid (a ledge each). */
  convexes: PhyConvex[];
  /** compactsurfaceheader_t.modelType (0 = IVP compact surface). */
  modelType: number;
  /** IVP mass centre, Source units. */
  massCenter: [number, number, number];
}

export interface PhyFile {
  checksum: number;
  solids: PhySolid[];
  /** The text section after the solids. */
  text: string;
  /** Parsed text section (top-level "solid", "editparams", "ragdollconstraint", "collisionrules"…). */
  keyValues: KvNode;
}

function ivpToSource(x: number, y: number, z: number, out: Float32Array, o: number): void {
  out[o] = x * METERS_TO_INCHES;
  out[o + 1] = z * METERS_TO_INCHES;
  out[o + 2] = -y * METERS_TO_INCHES;
}

/** Reads one IVP compact ledge into a convex piece. */
function readLedge(bytes: Uint8Array, view: DataView, ledge: number): PhyConvex | null {
  const pointOffset = view.getInt32(ledge, true);
  const nTriangles = view.getInt16(ledge + 12, true);
  if (nTriangles <= 0) return null;
  const pointBase = ledge + pointOffset;
  const remap = new Map<number, number>();
  const tris = new Uint16Array(nTriangles * 3);
  const pts: number[] = [];
  for (let t = 0; t < nTriangles; t++) {
    const tri = ledge + IVP_LEDGE_HEADER + t * IVP_TRIANGLE_SIZE;
    for (let e = 0; e < 3; e++) {
      const edge = view.getUint32(tri + 4 + e * 4, true);
      const pi = edge & 0xffff; // start_point_index:16
      let idx = remap.get(pi);
      if (idx === undefined) {
        idx = remap.size;
        remap.set(pi, idx);
        pts.push(pi);
      }
      tris[t * 3 + e] = idx;
    }
  }
  const vertices = new Float32Array(pts.length * 3);
  for (let i = 0; i < pts.length; i++) {
    const p = pointBase + pts[i] * IVP_POINT_SIZE;
    if (p + 12 > bytes.length) return null;
    ivpToSource(
      view.getFloat32(p, true),
      view.getFloat32(p + 4, true),
      view.getFloat32(p + 8, true),
      vertices,
      i * 3,
    );
  }
  return { vertices, triangles: tris };
}

/** Walks the ledge tree (IVP_Compact_Ledgetree_Node) and collects leaf ledges. */
function readCompactSurface(
  bytes: Uint8Array,
  view: DataView,
  surface: number,
  end: number,
): PhySolid['convexes'] {
  const out: PhyConvex[] = [];
  const rootOffset = view.getInt32(surface + 32, true);
  if (rootOffset <= 0 || surface + rootOffset >= end) return out;
  const stack = [surface + rootOffset];
  let guard = 0;
  while (stack.length && guard++ < 100000) {
    const node = stack.pop()!;
    if (node < surface || node + IVP_NODE_SIZE > end) continue;
    const right = view.getInt32(node, true);
    if (right === 0) {
      const ledgeOffset = view.getInt32(node + 4, true);
      const ledge = readLedge(bytes, view, node + ledgeOffset);
      if (ledge) out.push(ledge);
    } else {
      stack.push(node + right);
      stack.push(node + IVP_NODE_SIZE);
    }
  }
  return out;
}

/** SDK: phyheader_t + vphysics' compact surface layout. */
export function parsePhy(bytes: Uint8Array): PhyFile {
  const view = viewOf(bytes);
  if (bytes.length < 16) throw new Error('phy: too short');
  const headerSize = view.getInt32(0, true);
  const solidCount = view.getInt32(8, true);
  const checksum = view.getInt32(12, true);
  let p = headerSize;
  const solids: PhySolid[] = [];
  for (let s = 0; s < solidCount; s++) {
    if (p + 4 > bytes.length) break;
    const size = view.getInt32(p, true);
    const start = p + 4;
    const end = Math.min(bytes.length, start + size);
    p = start + size;
    let surface = start;
    let modelType = 0;
    if (view.getUint32(start, true) === PHY_VPHY_ID) {
      modelType = view.getInt16(start + 6, true);
      surface = start + 28; // compactsurfaceheader_t
    }
    if (modelType !== 0 || surface + IVP_SURFACE_HEADER > end) {
      solids.push({ convexes: [], modelType, massCenter: [0, 0, 0] });
      continue;
    }
    const mc = new Float32Array(3);
    ivpToSource(
      view.getFloat32(surface, true),
      view.getFloat32(surface + 4, true),
      view.getFloat32(surface + 8, true),
      mc,
      0,
    );
    solids.push({
      convexes: readCompactSurface(bytes, view, surface, end),
      modelType,
      massCenter: [mc[0], mc[1], mc[2]],
    });
  }
  const text = new TextDecoder('latin1')
    .decode(bytes.subarray(Math.min(p, bytes.length)))
    .replace(/\0+$/, '');
  return { checksum, solids, text, keyValues: parseKeyValues(text).root };
}

/** Axis-aligned bounds of every convex in the file (Source units), or null if empty. */
export function phyBounds(
  phy: PhyFile,
): { mins: [number, number, number]; maxs: [number, number, number] } | null {
  const mins: [number, number, number] = [Infinity, Infinity, Infinity];
  const maxs: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const s of phy.solids) {
    for (const c of s.convexes) {
      for (let i = 0; i < c.vertices.length; i += 3) {
        any = true;
        for (let k = 0; k < 3; k++) {
          const v = c.vertices[i + k];
          if (v < mins[k]) mins[k] = v;
          if (v > maxs[k]) maxs[k] = v;
        }
      }
    }
  }
  return any ? { mins, maxs } : null;
}
