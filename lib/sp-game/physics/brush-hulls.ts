/**
 * BSP brushes as convex vertex sets: every vertex of a brush is the meeting
 * point of three of its side planes that lies inside all of them. Bevel sides
 * are redundant for the shape and skipped. Used to give the physics engine the
 * world's solid brushes as convex hulls (vphysics builds the world collision
 * from the same brushes).
 */

import type { BspFile } from '../../tf2-game/formats/bsp';

const IN_EPS = 0.01;
const DUP_EPS = 0.01;

/** Vertices of brush `b` (xyz flat, Source units), or null when degenerate. */
export function brushVertices(bsp: BspFile, b: number): Float32Array | null {
  const first = bsp.brushes.firstSide[b];
  const n = bsp.brushes.numSides[b];
  const nx: number[] = [];
  const ny: number[] = [];
  const nz: number[] = [];
  const nd: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = first + i;
    if (bsp.brushSides.bevel[s]) continue;
    const p = bsp.brushSides.planeNum[s];
    nx.push(bsp.planes.normal[p * 3]);
    ny.push(bsp.planes.normal[p * 3 + 1]);
    nz.push(bsp.planes.normal[p * 3 + 2]);
    nd.push(bsp.planes.dist[p]);
  }
  const m = nx.length;
  if (m < 4) return null;
  const pts: number[] = [];
  for (let i = 0; i < m - 2; i++) {
    for (let j = i + 1; j < m - 1; j++) {
      // n_i × n_j
      const cx = ny[i] * nz[j] - nz[i] * ny[j];
      const cy = nz[i] * nx[j] - nx[i] * nz[j];
      const cz = nx[i] * ny[j] - ny[i] * nx[j];
      for (let k = j + 1; k < m; k++) {
        const det = cx * nx[k] + cy * ny[k] + cz * nz[k];
        if (Math.abs(det) < 1e-6) continue;
        // p = (d_i (n_j × n_k) + d_j (n_k × n_i) + d_k (n_i × n_j)) / det
        const jkx = ny[j] * nz[k] - nz[j] * ny[k];
        const jky = nz[j] * nx[k] - nx[j] * nz[k];
        const jkz = nx[j] * ny[k] - ny[j] * nx[k];
        const kix = ny[k] * nz[i] - nz[k] * ny[i];
        const kiy = nz[k] * nx[i] - nx[k] * nz[i];
        const kiz = nx[k] * ny[i] - ny[k] * nx[i];
        const px = (nd[i] * jkx + nd[j] * kix + nd[k] * cx) / det;
        const py = (nd[i] * jky + nd[j] * kiy + nd[k] * cy) / det;
        const pz = (nd[i] * jkz + nd[j] * kiz + nd[k] * cz) / det;
        let inside = true;
        for (let q = 0; q < m; q++) {
          if (nx[q] * px + ny[q] * py + nz[q] * pz - nd[q] > IN_EPS) {
            inside = false;
            break;
          }
        }
        if (!inside) continue;
        let dup = false;
        for (let t = 0; t < pts.length; t += 3) {
          if (Math.abs(pts[t] - px) < DUP_EPS && Math.abs(pts[t + 1] - py) < DUP_EPS && Math.abs(pts[t + 2] - pz) < DUP_EPS) {
            dup = true;
            break;
          }
        }
        if (!dup) pts.push(px, py, pz);
      }
    }
  }
  if (pts.length < 12) return null;
  return Float32Array.from(pts);
}

/** The first textured side's texinfo of a brush (its material), or −1. */
export function brushTexInfo(bsp: BspFile, b: number): number {
  const first = bsp.brushes.firstSide[b];
  const n = bsp.brushes.numSides[b];
  for (let i = 0; i < n; i++) {
    const s = first + i;
    if (bsp.brushSides.bevel[s]) continue;
    const t = bsp.brushSides.texInfo[s];
    if (t >= 0) return t;
  }
  return -1;
}
