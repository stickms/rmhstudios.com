/**
 * A throwaway UV-sphere mesh for the renderer's headless test (T24). It stands
 * in for `mesh.ts` (T09) so the renderer can be exercised before T09 lands, and
 * the e2e bundle aliases `../mesh` to this file. NOT part of the app bundle.
 *
 * It honours the mesh contract's buffer layout: interleaved `(θ, φ)` floats, a
 * DUPLICATED seam column (`θ = ±π`), `Uint32` indices, and triangles wound so
 * that `((b−a)×(c−a))·centroid > 0` in body space — see {@link windingErrors}.
 * Poles are a grid row with one non-degenerate triangle per cell rather than
 * T09's dedicated fan; the renderer does not care.
 */

import { TIERS } from '../../constants';
import type { Mesh, Tier } from '../../types';

export function buildLocalMesh(nTheta: number, nPhi: number): Mesh {
  const cols = nTheta + 1;
  const rows = nPhi + 1;
  const domain = new Float32Array(cols * rows * 2);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = (j * cols + i) * 2;
      domain[k] = -Math.PI + (i / nTheta) * 2 * Math.PI;
      domain[k + 1] = -Math.PI / 2 + (j / nPhi) * Math.PI;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < nPhi; j++) {
    for (let i = 0; i < nTheta; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // φ grows UP the screen, so (a, c, b) is the outside-counter-clockwise order.
      if (j !== nPhi - 1) indices.push(b, c, d);
      if (j !== 0) indices.push(a, c, b);
    }
  }
  return {
    nTheta,
    nPhi,
    vertexCount: cols * rows,
    indexCount: indices.length,
    domain,
    indices: Uint32Array.from(indices),
    poleFans: { north: { first: 0, count: 0 }, south: { first: 0, count: 0 } },
  };
}

/** Triangles whose winding violates the mesh contract's cross-product test (should be 0). */
export function windingErrors(mesh: Mesh): number {
  const P = (v: number) => {
    const th = mesh.domain[v * 2];
    const ph = mesh.domain[v * 2 + 1];
    return [Math.cos(ph) * Math.sin(th), -Math.sin(ph), Math.cos(ph) * Math.cos(th)];
  };
  let bad = 0;
  for (let t = 0; t < mesh.indexCount; t += 3) {
    const a = P(mesh.indices[t]);
    const b = P(mesh.indices[t + 1]);
    const c = P(mesh.indices[t + 2]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const dot =
      n[0] * (a[0] + b[0] + c[0]) + n[1] * (a[1] + b[1] + c[1]) + n[2] * (a[2] + b[2] + c[2]);
    if (!(dot > 0)) bad++;
  }
  return bad;
}

const memo = new Map<Tier, Mesh>();

/** Same signature as `mesh.ts#meshForTier`. */
export function meshForTier(tier: Tier): Mesh {
  let m = memo.get(tier);
  if (!m) {
    m = buildLocalMesh(TIERS[tier].meshTheta, TIERS[tier].meshPhi);
    memo.set(tier, m);
  }
  return m;
}
