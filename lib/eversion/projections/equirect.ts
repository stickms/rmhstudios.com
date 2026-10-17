/**
 * Equirectangular / plate carrée (spec §5.1, §5.3, §1.1-6) — the plain texture
 * wrap. OWNER: T04.
 *
 * `x = θ`, `y = φ`. Width ↔ 360° of longitude when `A = H/W ≤ 0.5`, which
 * leaves `φ_max = π·A`. A taller page cannot fit width to 360° (a 9:19.5 phone
 * page would need 390° of latitude), so above `A = 0.5` the policy switches —
 * EXACTLY at 0.5 — to height ↔ 180° with the width covering `360°/(2A)` of
 * longitude, centred on the front; the remaining back gore is glass.
 *
 * Fit shape: {@link EquirectFit} (its `policy` records which side of 0.5 it is
 * on). Tests: S#1, S#4.
 */

import type { Projection } from '../types';
import { stubProjection } from './stub';

export const equirect: Projection = stubProjection('equirect', 'T04');
