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
 * - **Closed seams, two of them.** The BEFORE page's seam (`θ = ±π`, the back
 *   meridian) and the AFTER page's seam (`θ = 0`: the AFTER side is laid out by
 *   `P(M_after · p)` and `M_after = Ry(θ_align)·(−I)` sends `θ = 0` to
 *   `θ' = π`) are each DUPLICATED: the columns `θ = −π`, `0⁻` (−1e-7), `0⁺` (+1e-7), `+π` are all
 *   present, the triangles on each side reference their own copy, and the two
 *   copies coincide in 3D. Domain coordinates are therefore continuous inside
 *   every triangle AND no triangle straddles either page's left/right edge
 *   (otherwise a column of triangles is stretched across the page mid-UNWRAP).
 * - **Real poles, as a row.** Each pole is a full ROW of `nTheta + 2` vertices
 *   (one per column, `|φ| = π/2`), forming quads with the last ring. In 3D the
 *   row collapses to the pole (the quads' pole-side triangles have zero area,
 *   which rasterises to nothing); in the flat layout the row sits on the page's
 *   top/bottom edge, so a tall page whose projection extends past the last
 *   ring (Mercator on a phone) is still covered. A single apex per fan triangle
 *   (the previous design) mapped to a comb of slivers there.
 * - **Every index in range; no zero-area triangle except the pole-side
 *   halves of the pole quads** ({@link Mesh.poleFans} lists exactly those bands).
 *
 * The mesh is built once per tier and kept (`meshForTier`); a governor step
 * changes DPR, never the mesh, because swapping geometry mid-run would pop.
 */

import { PHI_MAX, PHI_MIN, THETA_MAX, THETA_MIN, TAU } from './domain';
import { TIERS } from './constants';
import type { IndexRange, Mesh, Tier } from './types';

function checkResolution(nTheta: number, nPhi: number): void {
  if (
    !Number.isInteger(nTheta) ||
    !Number.isInteger(nPhi) ||
    nTheta < 4 ||
    nTheta % 2 !== 0 ||
    nPhi < 4 ||
    nPhi % 2 !== 0
  ) {
    throw new RangeError(
      `eversion: mesh needs integer even nTheta >= 4 and even nPhi >= 4 (got ${nTheta} x ${nPhi})`,
    );
  }
}

/**
 * How far the two `θ = 0` copies sit either side of 0 (radians). The shader derives everything from `(θ, φ)`
 * alone, and the AFTER layout `atan2(M·p)` is decided by the SIGN of a quantity that is exactly 0 at `θ = 0`;
 * left unnudged both copies would land on the same side of the AFTER page. At 1e-7 rad the two copies are
 * ~3e-5 px apart on a 300 px sphere: the gap between them (no triangle spans it) cannot be sampled.
 */
export const SEAM_EPS = 1e-7;

/**
 * The same for the EQUATOR, which Peirce cuts along on its back (`|θ| ≥ π/2`; the AFTER layout puts the cut on the
 * front half). The equator row is duplicated at `φ = ∓EQUATOR_EPS` with no band between the copies, so the
 * triangles below reference the south copy and those above the north copy. The vertex shader biases the page
 * lookup of a vertex this close to the equator by a thousandth of a LUT texel toward its own side
 * (`EQUATOR_BIAS_TEXELS` in `gl/shaders.ts`), which is what makes the two copies land on opposite sides of a cut, and is
 * ~1e-3 px of motion where there is no cut.
 */
export const EQUATOR_EPS = 1e-7;

/**
 * The pole rows' latitude as stored in the Float32 domain: the largest float32 STRICTLY INSIDE `±π/2`.
 * `Math.fround(π/2)` is 1.5707963705 > π/2, whose cosine is NEGATIVE (−4.4e-8): the pole vertex would then sit
 * on the far side of the pole, and any layout that derives a longitude from the vertex's position (the AFTER
 * page's `atan2(M·p)`) would put it half a turn from its neighbours. Strictly inside, `cos φ > 0` and the
 * longitude is the column's own. The point is still within 1.2e-7 rad of the pole.
 */
const POLE_PHI = (() => {
  let x = Math.fround(PHI_MAX);
  while (x >= PHI_MAX) x = Math.fround(x - 1e-7);
  return x;
})();

/**
 * The closed-form vertex and triangle counts for an `nTheta × nPhi` mesh — what
 * the tests compare `buildMesh` against for the three tiers of spec §8.2.
 *
 * Layout: `nPhi + 2` latitude rows (the two pole rows included, and the equator
 * row DUPLICATED: see {@link SEAM_EPS}) of `nTheta + 2`
 * vertices each (`+ 2` for the duplicated seam columns at `θ = ±π` and `θ = 0`).
 * Triangles: two per quad, `nTheta` quads per band (the band between the two
 * `θ = 0` copies is not drawn), `nPhi` bands (the one between the two equator
 * rows is not drawn).
 */
export function meshCounts(nTheta: number, nPhi: number): { vertices: number; triangles: number } {
  checkResolution(nTheta, nPhi);
  return {
    vertices: (nPhi + 2) * (nTheta + 2),
    triangles: 2 * nTheta * nPhi,
  };
}

/**
 * Build the mesh for `nTheta` longitude segments (even, so `θ = 0` is a column)
 * and `nPhi` latitude segments.
 *
 * ## Winding
 *
 * Body space is screen-handed with y DOWN (see `domain.ts`), which flips the
 * naive "θ right, φ up" intuition: at the front point `∂θ p = +x` and
 * `∂φ p = −y` (north is up the screen), so `∂θ × ∂φ = −z` points INTO the
 * sphere. A triangle that runs θ first and φ second is therefore clockwise from
 * outside; every quad here is split `(v00, v01, v10)`, `(v10, v01, v11)` with
 * `v01` the next row of latitude, which is counter-clockwise from outside. The
 * tests verify this against the real `spherePoint`, not against this reasoning.
 */
export function buildMesh(nTheta: number, nPhi: number): Mesh {
  const { vertices, triangles } = meshCounts(nTheta, nPhi);
  const domain = new Float32Array(vertices * 2);
  const indices = new Uint32Array(triangles * 3);
  const stride = nTheta + 2;
  const half = nTheta / 2;
  const dTheta = TAU / nTheta;
  const dPhi = (PHI_MAX - PHI_MIN) / nPhi;

  // Stored rows r = 0…nPhi + 1: latitude index j = r up to the equator and j = r − 1 after it, so the
  // equator (j = nPhi / 2) appears twice (φ = ∓EQUATOR_EPS) and r = 0, nPhi + 1 are the pole rows.
  // Columns 0…half run
  // θ = −π…0 (the last is the west copy of the AFTER seam); columns half+1…nTheta+1
  // run θ = 0…+π (the first is the east copy; the last is the BEFORE seam's second copy).
  const colTheta = new Float64Array(stride);
  for (let c = 0; c < stride; c++) {
    if (c === 0) colTheta[c] = THETA_MIN;
    else if (c === stride - 1) colTheta[c] = THETA_MAX;
    else if (c <= half) colTheta[c] = c === half ? -SEAM_EPS : THETA_MIN + c * dTheta;
    else colTheta[c] = c === half + 1 ? SEAM_EPS : (c - half - 1) * dTheta;
  }
  let v = 0;
  const eq = nPhi / 2;
  for (let r = 0; r <= nPhi + 1; r++) {
    const j = r <= eq ? r : r - 1;
    let phi = PHI_MIN + j * dPhi;
    if (r === 0) phi = -POLE_PHI;
    else if (r === nPhi + 1) phi = POLE_PHI;
    else if (r === eq) phi = -EQUATOR_EPS;
    else if (r === eq + 1) phi = EQUATOR_EPS;
    for (let c = 0; c < stride; c++) {
      domain[v++] = colTheta[c]!;
      domain[v++] = phi;
    }
  }

  let k = 0;
  const band = (r: number) => {
    for (let c = 0; c < stride - 1; c++) {
      if (c === half) continue; // between the two θ = 0 copies: no triangles
      const v00 = r * stride + c;
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
  };
  for (let r = 1; r < nPhi; r++) if (r !== eq) band(r);
  const southFirst = k;
  band(0);
  const south: IndexRange = { first: southFirst, count: k - southFirst };
  const northFirst = k;
  band(nPhi);
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
