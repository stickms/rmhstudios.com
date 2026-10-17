/**
 * A round-sphere stand-in for the eversion shaders (spec §4.5, §5.5, §10).
 * OWNER: T24. Client-only; no React, no DOM.
 *
 * ## Why a stub exists
 *
 * T23 (the real `F`, its normal, the morph and the shading) depends on T08,
 * T12, T13 AND this renderer. The harness, the host and the controller depend
 * on a renderer that draws SOMETHING with the right interface. Shipping a
 * stand-in with the same {@link ShaderSet} shape and the exact uniform names of
 * `uniforms.ts` is what lets those lanes integrate in parallel; when T23 lands,
 * `renderer.ts` switches to `getShaderSet()` and nothing else changes.
 *
 * ## What it honours, and the shortcuts it takes
 *
 * - **The morph.** `pos = mix(flat, sphere, w)` with the spec's per-vertex wave
 *   `w = smootherstep(s·(1+k) − k·d)`, `s = min(wrap, unwrap)` (`wrap` runs
 *   0→1 at the start, `unwrap` 1→0 at the end, the other channel idling at 1).
 *   `flat` is the page pixel of the vertex's CLAMPED extended UV (so glass
 *   vertices sit on the page border), at `z = 0`, which is the plane where the
 *   perspective scale is exactly 1 — pixel-exact for any radius. This part is
 *   the real morph, not a simplification.
 * - **Spin, tilt, radius, centre.** `R = Rx(tilt)·Ry(spin)` in the same
 *   arithmetic as `viewOf` in `lib/globe.ts`; the camera is `2·GLOBE_PERSP·r`
 *   away, so the sphere has the 2D cage's own bulge.
 * - **Both sides.** `gl_FrontFacing` selects the page: front → `before`, back →
 *   `after` (through `u_mAfter`), with `u_placeholder → u_after` mixed by
 *   `u_afterMix`.
 * - **The page through the LUT.** One LUT lookup per fragment, with the bilinear
 *   filter done by hand (see {@link LUT_SAMPLE_GLSL} for why).
 * - **Glass** (UV outside `[0,1]²`) shows `u_colVeil`, antialiased with `fwidth`.
 *   `u_pageAlpha` fades the page, `bgAlpha` is the renderer's clear.
 * - **The eversion is FAKED.** `F(p, e)` is `(1 − 2e)·p`: the sphere deflates
 *   through its centre and inflates inside out. That is a point reflection
 *   (`det = −1`), so it flips the triangle winding exactly as the real eversion
 *   does at `e = 1`, which is what makes "forced flip shows `after`" testable
 *   before T23. At `e = 0` it is the round sphere the spec calls `F(·, 0)`.
 * - **Not modelled:** the corrugations, lighting and rim, the ripples, the POP.
 *   The cage is a thin procedural grid on the same triangles (a second draw of
 *   the same vertex shader, depth-tested `LEQUAL`, blended over the surface).
 *
 * ## Contract notes for T23
 *
 * - `u_lut` is `RG32F` sampled `NEAREST` (see {@link LUT_SAMPLE_GLSL}); T23 may
 *   paste that function.
 * - `invariant gl_Position` is declared in both vertex shaders so the cage lines
 *   and the surface agree to the bit and `LEQUAL` never z-fights.
 * - No raw colour is written in GLSL: every colour is a `u_col*` uniform.
 */

import { GLOBE_PERSP } from '../../globe';
import { WRAP_WAVE } from '../constants';
import type { ShaderSet } from './shaders';

/**
 * Bilinear LUT filtering by hand: four `texelFetch`es and `mix`.
 *
 * ## Why not a `LINEAR` sampler
 *
 * The LUT carries page UV; a half-float (`RG16F`) texel resolves one part in
 * 2048, about 2 px at 4096 px, and the page is looked up per fragment — that is
 * visible as a wobble on text. `RG32F` is exact but is only LINEAR-filterable
 * with `OES_texture_float_linear`, which not every mobile GPU exposes. `NEAREST`
 * on `RG32F` is core WebGL2 everywhere, and four fetches per fragment are nothing
 * next to the page tap. The cost is 4 MB
 * instead of 2 MB of GPU memory, once per navigation, freed on `done`.
 *
 * The filter CLAMPS in both axes; it does not wrap in longitude, although
 * `domain.ts` says "REPEAT in s". The seam is at the back meridian, where the
 * extended UV is discontinuous (a projection's page edge is exactly there), so
 * blending the last column with the first would invent a UV halfway across the
 * page for the half-texel either side of the seam — and the mesh's duplicated
 * seam vertices at `θ = ±π` would both land on it. Clamping costs at most half
 * a texel of extrapolation where the LUT happens to be continuous. Row 0 is the
 * south pole, column 0 is `θ = −π` (`domain.ts#lutTexel`).
 */
export const LUT_SAMPLE_GLSL = /* glsl */ `
vec2 lutUv(float theta, float phi) {
  ivec2 sz = textureSize(u_lut, 0);
  vec2 t = vec2((theta + PI) / TAU * float(sz.x), (phi + HALF_PI) / PI * float(sz.y)) - 0.5;
  vec2 i0 = floor(t);
  vec2 f = t - i0;
  int x0 = clamp(int(i0.x), 0, sz.x - 1);
  int x1 = clamp(int(i0.x) + 1, 0, sz.x - 1);
  int y0 = clamp(int(i0.y), 0, sz.y - 1);
  int y1 = clamp(int(i0.y) + 1, 0, sz.y - 1);
  vec2 a = texelFetch(u_lut, ivec2(x0, y0), 0).rg;
  vec2 b = texelFetch(u_lut, ivec2(x1, y0), 0).rg;
  vec2 c = texelFetch(u_lut, ivec2(x0, y1), 0).rg;
  vec2 d = texelFetch(u_lut, ivec2(x1, y1), 0).rg;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

/** `#define`s generated from the constants, so GLSL and TypeScript cannot disagree. */
const DEFINES = /* glsl */ `
#define PI 3.14159265358979
#define TAU 6.28318530717959
#define HALF_PI 1.57079632679490
#define WRAP_WAVE ${WRAP_WAVE.toFixed(6)}
#define GLOBE_PERSP ${GLOBE_PERSP.toFixed(6)}
`;

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
${DEFINES}`;

/** The shared vertex shader: morph, spin/tilt, camera. Surface and cage both use it. */
const VERTEX = `${HEADER}
layout(location = 0) in vec2 a_domain;
uniform float u_wrap;
uniform float u_unwrap;
uniform float u_evert;
uniform float u_spin;
uniform float u_tilt;
uniform float u_radius;
uniform vec2 u_centre;
uniform vec2 u_viewport;
uniform sampler2D u_lut;
out vec2 v_domain;
out float v_morph;
invariant gl_Position;
${LUT_SAMPLE_GLSL}
float smootherstep01(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}
void main() {
  float theta = a_domain.x;
  float phi = a_domain.y;
  float cp0 = cos(phi);
  vec3 p = vec3(cp0 * sin(theta), -sin(phi), cp0 * cos(theta));

  // The faked eversion: through the centre and out the other side (det = -1).
  vec3 q = p * (1.0 - 2.0 * u_evert);

  // R = Rx(tilt) * Ry(spin), the same arithmetic as viewOf in lib/globe.ts.
  float cy = cos(u_spin), sy = sin(u_spin);
  float ct = cos(u_tilt), st = sin(u_tilt);
  float x1 = q.x * cy + q.z * sy;
  float z1 = -q.x * sy + q.z * cy;
  vec3 v = vec3(x1, q.y * ct - z1 * st, q.y * st + z1 * ct);
  vec3 sphere = vec3(u_centre - 0.5 * u_viewport, 0.0) + v * u_radius;

  // The page pixel of the clamped extended UV, in the z = 0 plane.
  vec2 uv = clamp(lutUv(theta, phi), 0.0, 1.0);
  vec3 flatPos = vec3((uv - 0.5) * u_viewport, 0.0);

  // The wrap wave: the centre curls onto the globe first, the edges follow.
  float s = min(u_wrap, u_unwrap);
  float d = acos(clamp(p.z, -1.0, 1.0)) / PI;
  float w = smootherstep01(s * (1.0 + WRAP_WAVE) - WRAP_WAVE * d);
  vec3 pos = mix(flatPos, sphere, w);

  // Camera on +z at 2 * GLOBE_PERSP * r: the z = 0 plane has scale exactly 1.
  float dist = 2.0 * GLOBE_PERSP * max(u_radius, 1.0);
  float wc = (dist - pos.z) / dist;
  float ndcZ = clamp(-pos.z / dist, -1.0, 1.0) * 0.9;
  gl_Position = vec4(pos.x * 2.0 / u_viewport.x, -pos.y * 2.0 / u_viewport.y, ndcZ * wc, wc);
  v_domain = a_domain;
  v_morph = w;
}
`;

const SURFACE_FRAGMENT = `${HEADER}
in vec2 v_domain;
in float v_morph;
uniform sampler2D u_lut;
uniform sampler2D u_before;
uniform sampler2D u_after;
uniform sampler2D u_placeholder;
uniform mat3 u_mAfter;
uniform float u_afterMix;
uniform float u_pageAlpha;
uniform vec4 u_colVeil;
out vec4 outColor;
${LUT_SAMPLE_GLSL}
void main() {
  float theta = v_domain.x;
  float phi = v_domain.y;
  vec2 uv;
  if (gl_FrontFacing) {
    uv = lutUv(theta, phi);
  } else {
    float cp = cos(phi);
    vec3 m = u_mAfter * vec3(cp * sin(theta), -sin(phi), cp * cos(theta));
    uv = lutUv(atan(m.x, m.z), asin(clamp(-m.y, -1.0, 1.0)));
  }
  vec2 cuv = clamp(uv, 0.0, 1.0);
  vec3 page;
  if (gl_FrontFacing) {
    page = texture(u_before, cuv).rgb;
  } else {
    page = mix(texture(u_placeholder, cuv).rgb, texture(u_after, cuv).rgb, u_afterMix);
  }
  // Glass is "the UV lies outside [0,1]^2"; antialias the page edge with fwidth.
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float onPage = clamp(edge / max(fwidth(edge), 1e-6) + 0.5, 0.0, 1.0);
  vec3 rgb = mix(u_colVeil.rgb, page, onPage);
  float a = mix(1.0, u_pageAlpha, onPage);
  outColor = vec4(rgb * a, a);
}
`;

/** A procedural grid on the sphere's own (theta, phi): 30 degree meridians, 20 degree parallels. */
const CAGE_FRAGMENT = `${HEADER}
in vec2 v_domain;
in float v_morph;
uniform float u_cageAlpha;
uniform float u_cageWidth;
uniform float u_pixelRatio;
uniform vec4 u_colCageMinor;
uniform vec4 u_colCageParallel;
uniform vec4 u_colCageMajor;
out vec4 outColor;
float lineCover(float angle, float step) {
  float k = angle / step;
  float dist = abs(k - floor(k + 0.5)) * step;
  float px = dist / max(fwidth(angle), 1e-6);
  float half_ = 0.5 * u_cageWidth * u_pixelRatio;
  return 1.0 - smoothstep(half_ - 0.5, half_ + 0.5, px);
}
void main() {
  float mer = lineCover(v_domain.x, PI / 6.0);
  float par = lineCover(v_domain.y, PI / 9.0) * step(abs(v_domain.y), 1.0472);
  vec4 col = mer > par ? u_colCageMinor : u_colCageParallel;
  if (abs(v_domain.y) < 0.01 || abs(v_domain.x) < 0.01) col = u_colCageMajor;
  float a = max(mer, par) * col.a * u_cageAlpha * v_morph;
  outColor = vec4(col.rgb * a, a);
}
`;

/** Transform-feedback variant: `F(p, e)` only. For the stub that is the faked eversion. */
const FEEDBACK_VERTEX = `${HEADER}
layout(location = 0) in vec2 a_domain;
uniform float u_evert;
out vec3 v_F;
void main() {
  float cp = cos(a_domain.y);
  v_F = vec3(cp * sin(a_domain.x), -sin(a_domain.y), cp * cos(a_domain.x)) * (1.0 - 2.0 * u_evert);
  gl_Position = vec4(0.0);
}
`;

const FEEDBACK_FRAGMENT = `${HEADER}
out vec4 outColor;
void main() { outColor = vec4(0.0); }
`;

/** The stub {@link ShaderSet}: same shape as T23's, so the renderer treats them alike. */
export function getStubShaderSet(): ShaderSet {
  return {
    surface: { vertex: VERTEX, fragment: SURFACE_FRAGMENT },
    cage: { vertex: VERTEX, fragment: CAGE_FRAGMENT },
    feedback: { vertex: FEEDBACK_VERTEX, fragment: FEEDBACK_FRAGMENT, varyings: ['v_F'] },
  };
}
