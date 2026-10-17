/**
 * The `(θ, φ)` grid the eversion is evaluated on (spec §4.4, §4.5, §8.2).
 * OWNER: T09. Pure, client-safe.
 *
 * ## What the mesh must guarantee
 *
 * - **Winding defines the sides.** Every triangle is COUNTER-CLOCKWISE seen from
 *   outside the round sphere at `e = 0`: for each, `((b−a) × (c−a)) · centroid`
 *   is positive when its vertices are mapped onto the unit sphere. With
 *   `FRONT_FACE = CCW` and culling off, `gl_FrontFacing` is then true on the
 *   original outer side, and the pages stay on their own side through every
 *   self-intersection of the eversion (spec §4.5).
 * - **A closed seam.** The seam column is DUPLICATED (`θ = −π` and `θ = +π` are
 *   both present) so the domain coordinates are continuous inside every
 *   triangle; the two columns coincide in 3D. (The seam is on the back meridian,
 *   not at `θ = 0` — see `domain.ts`.)
 * - **Real poles.** Each pole has a dedicated triangle fan, not a row of
 *   duplicated degenerate vertices (spec §4.4). The fans are reported in
 *   {@link Mesh.poleFans} so the shader can be told apart from the body.
 * - **No degenerate triangles; every index in range.**
 *
 * The mesh is built once per tier and kept (`meshForTier`); a governor step
 * changes DPR, never the mesh, because swapping geometry mid-run would pop.
 */

import { PHI_MAX, PHI_MIN, THETA_MAX, THETA_MIN, TAU } from './domain';
import { TIERS } from './constants';
import type { IndexRange, Mesh, Tier } from './types';

function checkResolution(nTheta: number, nPhi: number): void {
  if (!Number.isInteger(nTheta) || !Number.isInteger(nPhi) || nTheta < 3 || nPhi < 2) {
    throw new RangeError(
      `eversion: mesh needs integer nTheta >= 3 and nPhi >= 2 (got ${nTheta} x ${nPhi})`,
    );
  }
}

/**
 * The closed-form vertex and triangle counts for an `nTheta × nPhi` mesh — what
 * the tests compare `buildMesh` against for the three tiers of spec §8.2.
 *
 * Layout: `nPhi − 1` interior latitude rings of `nTheta + 1` vertices each (the
 * `+ 1` is the duplicated seam column), plus one apex vertex per fan triangle at
 * each pole (`2 · nTheta`). Triangles: two per quad in the `nPhi − 2` bands
 * between interior rings, plus one per longitude segment in each fan.
 *
 * The apex is per TRIANGLE, not per pole, deliberately. A pole has no longitude,
 * so a single shared apex would have to carry one arbitrary `θ`, and the domain
 * coordinate would then be discontinuous inside every fan triangle — the exact
 * property the duplicated seam exists to prevent. Giving each fan triangle an
 * apex at its own mid-longitude costs `nTheta` extra vertices per pole, keeps
 * `(θ, φ)` smooth, and still has no zero-area triangles (spec §4.4's "no
 * degenerate row of duplicated vertices").
 */
export function meshCounts(nTheta: number, nPhi: number): { vertices: number; triangles: number } {
  checkResolution(nTheta, nPhi);
  return {
    vertices: (nPhi - 1) * (nTheta + 1) + 2 * nTheta,
    triangles: 2 * nTheta * (nPhi - 1),
  };
}

/**
 * Build the mesh for `nTheta` longitude segments and `nPhi` latitude segments.
 * The `high` mesh (256 × 128) builds in ≤ 5 ms.
 *
 * ## Winding
 *
 * Body space is screen-handed with y DOWN (see `domain.ts`), which flips the
 * naive "θ right, φ up" intuition: at the front point `∂θ p = +x` and
 * `∂φ p = −y` (north is up the screen), so `∂θ × ∂φ = −z` points INTO the
 * sphere. A triangle that runs θ first and φ second is therefore clockwise from
 * outside; every triangle here is wound `(a, c, b)` against the grid's natural
 * `(a, b, c)` to be counter-clockwise from outside. The tests verify this
 * against the real `spherePoint`, not against this reasoning.
 */
export function buildMesh(nTheta: number, nPhi: number): Mesh {
  const { vertices, triangles } = meshCounts(nTheta, nPhi);
  const domain = new Float32Array(vertices * 2);
  const indices = new Uint32Array(triangles * 3);
  const stride = nTheta + 1;
  const dTheta = TAU / nTheta;
  const dPhi = (PHI_MAX - PHI_MIN) / nPhi;

  // Interior rings j = 1…nPhi−1 (ring row r = j − 1). Column i = nTheta is
  // θ = +π, a second copy of column 0 (θ = −π): the duplicated seam.
  let v = 0;
  for (let j = 1; j < nPhi; j++) {
    const phi = PHI_MIN + j * dPhi;
    for (let i = 0; i <= nTheta; i++) {
      domain[v++] = i === nTheta ? THETA_MAX : THETA_MIN + i * dTheta;
      domain[v++] = phi;
    }
  }
  const southApex = v / 2;
  for (let i = 0; i < nTheta; i++) {
    domain[v++] = THETA_MIN + (i + 0.5) * dTheta;
    domain[v++] = PHI_MIN;
  }
  const northApex = v / 2;
  for (let i = 0; i < nTheta; i++) {
    domain[v++] = THETA_MIN + (i + 0.5) * dTheta;
    domain[v++] = PHI_MAX;
  }

  let k = 0;
  for (let r = 0; r < nPhi - 2; r++) {
    for (let i = 0; i < nTheta; i++) {
      const v00 = r * stride + i;
      const v10 = v00 + 1;
      const v01 = v00 + stride;
      const v11 = v01 + 1;
      indices[k++] = v00;
      indices[k++] = v01;
      indices[k++] = v10;
      indices[k++] = v10;
      indices[k++] = v01;
      indices[k++] = v11;
    }
  }

  const southFirst = k;
  for (let i = 0; i < nTheta; i++) {
    indices[k++] = southApex + i;
    indices[k++] = i;
    indices[k++] = i + 1;
  }
  const south: IndexRange = { first: southFirst, count: k - southFirst };

  const northFirst = k;
  const lastRing = (nPhi - 2) * stride;
  for (let i = 0; i < nTheta; i++) {
    indices[k++] = northApex + i;
    indices[k++] = lastRing + i + 1;
    indices[k++] = lastRing + i;
  }
  const north: IndexRange = { first: northFirst, count: k - northFirst };

  return {
    nTheta,
    nPhi,
    vertexCount: vertices,
    indexCount: indices.length,
    domain,
    indices,
    poleFans: { north, south },
  };
}

const tierMeshes = new Map<Tier, Mesh>();

/** The mesh for a tier (`TIERS[tier].meshTheta × meshPhi`), built once and memoised. */
export function meshForTier(tier: Tier): Mesh {
  let mesh = tierMeshes.get(tier);
  if (!mesh) {
    mesh = buildMesh(TIERS[tier].meshTheta, TIERS[tier].meshPhi);
    tierMeshes.set(tier, mesh);
  }
  return mesh;
}
