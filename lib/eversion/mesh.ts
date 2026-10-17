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

/* eslint-disable @typescript-eslint/no-unused-vars -- contract stub: T09 replaces every body, and this line with them */
import { notImplemented } from './not-implemented';
import type { Mesh, Tier } from './types';

/**
 * The closed-form vertex and triangle counts for an `nTheta × nPhi` mesh — what
 * the tests compare `buildMesh` against for the three tiers of spec §8.2.
 */
export function meshCounts(nTheta: number, nPhi: number): { vertices: number; triangles: number } {
  return notImplemented('meshCounts', 'T09');
}

/**
 * Build the mesh for `nTheta` longitude segments and `nPhi` latitude segments.
 * The `high` mesh (256 × 128) builds in ≤ 5 ms.
 */
export function buildMesh(nTheta: number, nPhi: number): Mesh {
  return notImplemented('buildMesh', 'T09');
}

/** The mesh for a tier (`TIERS[tier].meshTheta × meshPhi`), built once and memoised. */
export function meshForTier(tier: Tier): Mesh {
  return notImplemented('meshForTier', 'T09');
}
