/**
 * Mercator (spec §5.1, §5.3) — the "world map" wrap. OWNER: T04.
 *
 * Conformal cylindrical. Width ↔ 360° of longitude; latitude follows the
 * aspect: with `A = H/W` the page spans `y = ln tan(π/4 + φ/2) ∈ [−πA, πA]`, so
 * `φ_max = 2·atan(e^{π·A}) − π/2` (70.6° at 16:9, ≈ 89.9° at 9:19.5). The caps
 * beyond `φ_max` are glass. The page's left/right edges meet on the back
 * meridian (`θ = ±π`), which is also the mesh seam (`domain.ts`).
 *
 * Fit shape: {@link MercatorFit}. Tests: S#1, S#2, S#4.
 */

import type { Projection } from '../types';
import { stubProjection } from './stub';

export const mercator: Projection = stubProjection('mercator', 'T04');
