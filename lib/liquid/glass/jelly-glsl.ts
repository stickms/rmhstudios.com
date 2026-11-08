/**
 * The cheap value-noise family the liquid globe's haze moves with (`components/radial/jelly-glass.ts`). It used to share
 * this file with the rounded-rect distance field, the lattice warp and the plasma program of the rim and haze shaders
 * (`shader.ts`, `haze-shader.ts`), which are gone with the glass engine (CSS-first jelly).
 *
 * The noise is value noise, not simplex: it runs at a quarter resolution or less and nobody can see the difference.
 * Plain GLSL ES 3.00 — no extensions, no derivatives.
 */

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
