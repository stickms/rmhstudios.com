/**
 * Stereographic from the back pole (spec §5.1, §5.3) — the shrink-wrap.
 * OWNER: T05.
 *
 * Conformal azimuthal. The page is centred on the front tangent plane and
 * scaled so its HALF-WIDTH subtends 150° from the front point; the back cap
 * (and, on tall pages, the region beyond the short sides) is glass, and the
 * page "puckers into one point behind". The back pole is the singular point.
 *
 * Fit shape: {@link StereographicFit}. Tests: S#1, S#2, S#4.
 */

import type { Projection } from '../types';
import { stubProjection } from './stub';

export const stereographic: Projection = stubProjection('stereographic', 'T05');
