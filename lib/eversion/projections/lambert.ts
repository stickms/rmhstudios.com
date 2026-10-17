/**
 * Lambert azimuthal equal-area (spec §5.1, §5.3). OWNER: T05.
 *
 * Equal-area azimuthal about the front point. The page's CORNERS sit on the
 * projection's bounding circle (radius 2 for the unit sphere), so the whole
 * page reaches the back point and the page "closes around the globe into a
 * single point"; the four lens-shaped gaps between the page edges and the
 * circle are glass.
 *
 * Fit shape: {@link LambertFit}. Tests: S#1, S#3 (`det J / cos φ` constant to
 * 1e-6), S#4.
 */

import type { Projection } from '../types';
import { stubProjection } from './stub';

export const lambert: Projection = stubProjection('lambert', 'T05');
