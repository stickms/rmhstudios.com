/**
 * Core collaborators for the host e2e (`testing/e2e/eversion-host.mjs`, T25).
 * The REAL renderer (stub shaders) and the REAL `Timeline`; only the two pieces
 * that belong to other tasks and may not have landed — the end-isometry fit
 * (T13) and the LUT bake (T07) — are replaced: identity orientation, and an
 * identity-mapping LUT so the page texture reads straight through.
 *
 * Shared by the page script (main-thread mode) and the worker entry (worker
 * mode), so both modes run exactly the same collaborators.
 */

import { LUT_SIZE } from '../../../lib/eversion/constants';
import type { CoreDeps } from '../../../lib/eversion/gl/core';
import { defaultDeps } from '../../../lib/eversion/gl/core';

export function identityLut(): Float32Array {
  const [w, h] = LUT_SIZE;
  const lut = new Float32Array(w * h * 2);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const phi = ((j + 0.5) / h) * Math.PI - Math.PI / 2;
      lut[(j * w + i) * 2] = (i + 0.5) / w;
      lut[(j * w + i) * 2 + 1] = 0.5 - phi / Math.PI;
    }
  }
  return lut;
}

export function fixtureDeps(): CoreDeps {
  return {
    ...defaultDeps(),
    bakeLut: () => identityLut(),
    orientation: () => ({
      thetaAlign: 0,
      mAfter: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
    }),
  };
}
