/**
 * GLSL shared by the rim program (`shader.ts`) and the haze program (`haze-shader.ts`): the rounded-rect distance
 * field and its gradient, the cheap value-noise family the haze moves with, and the Tier L lattice warp that squishes
 * the rim (01 §2.5, 02 §1.3). One copy, so the two programs can never disagree about where a surface's edge is.
 *
 * The noise is value noise, not simplex: it runs at a quarter resolution or less and nobody can see the difference.
 * Plain GLSL ES 3.00 — no extensions, no derivatives.
 */

/** `sdRoundRect` (signed distance, negative inside) and `sdGrad` (its outward unit gradient, central differences). */
export const SDF_GLSL = /* glsl */ `
float sdRoundRect(vec2 q, vec2 halfSize, float r) {
  vec2 e = abs(q) - halfSize + vec2(r);
  return min(max(e.x, e.y), 0.0) + length(max(e, 0.0)) - r;
}
vec2 sdGrad(vec2 q, vec2 halfSize, float r) {
  const float e = 0.75;
  vec2 g = vec2(
    sdRoundRect(q + vec2(e, 0.0), halfSize, r) - sdRoundRect(q - vec2(e, 0.0), halfSize, r),
    sdRoundRect(q + vec2(0.0, e), halfSize, r) - sdRoundRect(q - vec2(0.0, e), halfSize, r)
  );
  return dot(g, g) > 1e-8 ? normalize(g) : vec2(0.0, -1.0);
}
`;

/** `jHash`, `jNoise`, `jFbm` (3 rotated octaves) and `jCurl` (divergence-free flow: the curl of an fbm potential). */
export const NOISE_GLSL = /* glsl */ `
float jHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float jNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(jHash(i), jHash(i + vec2(1.0, 0.0)), u.x),
             mix(jHash(i + vec2(0.0, 1.0)), jHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
const mat2 J_ROT = mat2(0.8, -0.6, 0.6, 0.8);
float jFbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * jNoise(p); p = J_ROT * p * 2.03; a *= 0.5; }
  return s / 0.875;
}
vec2 jCurl(vec2 p) {
  const float e = 0.35;
  float n1 = jFbm(p + vec2(0.0, e)), n2 = jFbm(p - vec2(0.0, e));
  float n3 = jFbm(p + vec2(e, 0.0)), n4 = jFbm(p - vec2(e, 0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}
`;

/**
 * The Tier L warp. `uJelly[8]` holds the lattice's node offsets (CSS px, clockwise from the top-left corner: corner,
 * top-mid, corner, right-mid, …), exactly `latticeUniform()`'s layout (`lib/jelly/lattice.ts`). `jellyOffset(p, size)`
 * finds the perimeter parameter of the rim point nearest `p` (slab-local px, y down — the same nearest-edge rule as
 * `perimeterParam`) and interpolates the offset there with a periodic Catmull-Rom over the eight nodes. Each half-edge
 * is one segment, so the interpolation is uniform per segment even though the slab is not square.
 */
export const LATTICE_GLSL = /* glsl */ `
uniform vec2 uJelly[8];
uniform float uJellyOn;
vec2 jellyOffset(vec2 p, vec2 size) {
  vec2 c = clamp(p, vec2(0.0), size);
  float dT = c.y, dR = size.x - c.x, dB = size.y - c.y, dL = c.x;
  float m = min(min(dT, dR), min(dB, dL));
  float s;
  float base;
  if (m == dT) { s = c.x / (size.x * 0.5); base = 0.0; }
  else if (m == dR) { s = c.y / (size.y * 0.5); base = 2.0; }
  else if (m == dB) { s = (size.x - c.x) / (size.x * 0.5); base = 4.0; }
  else { s = (size.y - c.y) / (size.y * 0.5); base = 6.0; }
  float k = floor(clamp(s, 0.0, 1.999));
  float t = clamp(s - k, 0.0, 1.0);
  int i = int(base + k);
  vec2 p0 = uJelly[(i + 7) % 8];
  vec2 p1 = uJelly[i];
  vec2 p2 = uJelly[(i + 1) % 8];
  vec2 p3 = uJelly[(i + 2) % 8];
  float t2 = t * t, t3 = t2 * t;
  return 0.5 * (2.0 * p1 + (p2 - p0) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (3.0 * p1 - p0 - 3.0 * p2 + p3) * t3);
}
`;
