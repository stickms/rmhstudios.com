/**
 * Mesh x page layout (spec §4.4, §4.5, §5.5): no triangle may straddle a page's cut.
 *
 * During WRAP the flat target of a vertex is `P(p)` and during UNWRAP `P(M_after · p)`; a triangle whose
 * corners the projection puts on opposite sides of the page's left/right edge is stretched across the page
 * and shows up as a smear band. The mesh duplicates a seam column at θ = ±π (the BEFORE page's seam) and at
 * θ = 0 (the AFTER page's: `M_after = −I` sends θ = 0 to θ' = π), so for the seam-only projections no triangle
 * may span a large share of the page in either layout.
 */

import { describe, expect, it } from 'vitest';
import { LUT_SIZE } from '../constants';
import { EQUATOR_BIAS_TEXELS } from '../gl/shaders';
import { SPIN_AXIS } from '../domain';
import { buildMesh } from '../mesh';
import { afterDomainTransform, alignAngle } from '../orientation';
import { bakeLut, sampleLutGuarded } from '../projection-lut';
import { getProjection } from '../projections';
import { PROJECTION_IDS } from '../types';
import type { Mat3, ProjectionId } from '../types';

const R_END: Mat3 = new Float64Array([-1, 0, 0, 0, -1, 0, 0, 0, -1]);

/** Triangles with an edge longer than `limit` page-fractions under a layout, and the longest edge. */
function straddlers(id: ProjectionId, layout: 'before' | 'after', limit: number) {
  const mesh = buildMesh(128, 64);
  const proj = getProjection(id);
  const lut = bakeLut(proj, proj.fit(390, 844));
  const m = afterDomainTransform(R_END, SPIN_AXIS, alignAngle(R_END));
  const uv = new Float64Array(mesh.vertexCount * 2);
  const o = new Float64Array(2);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const th = mesh.domain[2 * i]!;
    const ph = mesh.domain[2 * i + 1]!;
    let t = th;
    let p = ph;
    if (layout === 'after') {
      const x = Math.cos(ph) * Math.sin(th);
      const y = -Math.sin(ph);
      const z = Math.cos(ph) * Math.cos(th);
      const px = m[0]! * x + m[3]! * y + m[6]! * z;
      const py = m[1]! * x + m[4]! * y + m[7]! * z;
      const pz = m[2]! * x + m[5]! * y + m[8]! * z;
      t = Math.atan2(px, pz);
      p = Math.asin(Math.max(-1, Math.min(1, -py)));
    }
    // the vertex shader's equator-copy bias (gl/shaders.ts#EQUATOR_BIAS_TEXELS)
    if (Math.abs(p) < 1e-6) p += (p < 0 ? -1 : 1) * EQUATOR_BIAS_TEXELS * (Math.PI / LUT_SIZE[1]);
    sampleLutGuarded(lut, LUT_SIZE, t, p, o);
    uv[2 * i] = Math.min(1, Math.max(0, o[0]!));
    uv[2 * i + 1] = Math.min(1, Math.max(0, o[1]!));
  }
  let worst = 0;
  let wide = 0;
  for (let t = 0; t < mesh.indexCount; t += 3) {
    let w = 0;
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[t + k]!;
      const b = mesh.indices[t + ((k + 1) % 3)]!;
      w = Math.max(w, Math.hypot(uv[2 * a]! - uv[2 * b]!, uv[2 * a + 1]! - uv[2 * b + 1]!));
    }
    worst = Math.max(worst, w);
    if (w > limit) wide++;
  }
  return { worst, wide };
}

/**
 * Projections whose only cuts are the seam (and Peirce's back equator): no triangle may span more than 30% of the
 * page, in either layout. Lambert and stereographic send the BACK POINT to a whole circle (the page's rim), a cut
 * no mesh can duplicate away: the triangles around that one point stay stretched, bounded by the point's
 * neighbourhood (measured: 36 and 44 of 32 768 at 128 x 64 — about 0.1%).
 */
const CLEAN: ProjectionId[] = ['mercator', 'equirect', 'peirce'];
const BACK_POINT_CUT: Partial<Record<ProjectionId, number>> = { lambert: 40, stereographic: 48 };

describe('no triangle straddles a page cut (S§4.5)', () => {
  for (const id of PROJECTION_IDS) {
    for (const layout of ['before', 'after'] as const) {
      it(`${id} ${layout}`, () => {
        const r = straddlers(id, layout, 0.3);
        if (CLEAN.includes(id)) expect(r.wide).toBe(0);
        else expect(r.wide).toBeLessThanOrEqual(BACK_POINT_CUT[id] ?? 0);
      });
    }
  }
});
