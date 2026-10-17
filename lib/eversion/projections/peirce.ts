/**
 * Peirce quincuncial (spec §5.1, §5.3, §5.4) — the page folds around from four
 * corners with no polar gap. OWNER: T06.
 *
 * Conformal, with four singular points. The forward map is the incomplete
 * elliptic integral of the first kind with modulus 1/√2 (Carlson `R_F` is the
 * recommended evaluation); the inverse is Jacobi `cn` of complex argument. Both
 * are far too heavy for a fragment shader at 60 fps, which is why EVERY
 * projection is baked to a LUT (spec §5.4) — Peirce is only ever evaluated at
 * bake time, so correctness comes before speed here.
 *
 * Orientation: the page centre is the front point and the four singular points
 * sit at the square's edge midpoints, away from the page centre. Fit: the page
 * is CONTAINED in the quincuncial square, centred, longer side ↔ the square's
 * side; the square outside the page is glass (coverage ≈ `min(A, 1/A)`).
 *
 * T06 adds a private `elliptic.ts` next to this file. Fit shape:
 * {@link PeirceFit}. Tests: S#1 (excluding 1e-3 rad around the four points),
 * S#2, S#4.
 */

import type { Projection } from '../types';
import { stubProjection } from './stub';

export const peirce: Projection = stubProjection('peirce', 'T06');
