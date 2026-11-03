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
// The gradient of sdRoundRect, exactly: the corner arc's radial direction, else the axis of the nearest straight
// edge. It replaces a four-evaluation central difference (≈4× the distance maths per pixel, and quantised where an
// arc meets a straight edge), so the surface normal is both cheaper and smooth to the last pixel of a curve.
vec2 sdGrad(vec2 q, vec2 halfSize, float r) {
  vec2 e = abs(q) - halfSize + vec2(r);
  vec2 ep = max(e, vec2(0.0));
  float l = length(ep);
  vec2 g = l > 1e-4 ? ep / l : (e.x > e.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  return g * vec2(q.x < 0.0 ? -1.0 : 1.0, q.y < 0.0 ? -1.0 : 1.0);
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
 * The Tier L warp. `uJelly[24]` holds the lattice's node offsets (CSS px), exactly `latticeUniform()`'s layout
 * (`lib/jelly/lattice.ts`): six segments per edge, edges clockwise from the top (node `edge·6 + k` sits at `k/6` along
 * its edge, so the corners are 0, 6, 12, 18). `jellyOffset(p, size)` finds the nearest edge of the rest rect and the
 * parameter along it, then interpolates the offset there with a periodic Catmull-Rom over the 24 nodes. Each segment
 * is one span, so the interpolation is uniform per segment even though the slab is not square.
 */
export const LATTICE_GLSL = /* glsl */ `
uniform vec2 uJelly[24];
uniform float uJellyOn;
// Periodic Catmull-Rom over the 24 nodes: segment k (0..5) of the edge whose first node is \`base\`.
vec2 jellyEdge(int base, float s) {
  float k = floor(clamp(s, 0.0, 5.999));
  float t = clamp(s - k, 0.0, 1.0);
  int i = base + int(k);
  vec2 p0 = uJelly[(i + 23) % 24];
  vec2 p1 = uJelly[i];
  vec2 p2 = uJelly[(i + 1) % 24];
  vec2 p3 = uJelly[(i + 2) % 24];
  float t2 = t * t, t3 = t2 * t;
  return 0.5 * (2.0 * p1 + (p2 - p0) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (3.0 * p1 - p0 - 3.0 * p2 + p3) * t3);
}
// The offset at \`p\`: the nearest horizontal edge's (top or bottom) and the nearest vertical edge's (left or right),
// blended across the corner diagonal. Picking only the single nearest edge jumps where two edges are equally near, and
// now that the whole silhouette moves that jump would be a visible seam.
vec2 jellyOffset(vec2 p, vec2 size) {
  vec2 c = clamp(p, vec2(0.0), size);
  bool top = c.y <= size.y - c.y;
  bool left = c.x <= size.x - c.x;
  float dTB = top ? c.y : size.y - c.y;
  float dLR = left ? c.x : size.x - c.x;
  vec2 oTB = top ? jellyEdge(0, c.x / size.x * 6.0) : jellyEdge(12, (size.x - c.x) / size.x * 6.0);
  vec2 oLR = left ? jellyEdge(18, (size.y - c.y) / size.y * 6.0) : jellyEdge(6, c.y / size.y * 6.0);
  return mix(oLR, oTB, smoothstep(-12.0, 12.0, dLR - dTB));
}
`;

/**
 * The dormant plasma (#989), shared by the haze program (haze slots: it moves) and the rim program (every other slab:
 * static, no clock). Needs {@link NOISE_GLSL}. Declares its own uniforms:
 *
 * - `uLevel` — the surface's eased wake level (0 rest → invisible, `PLASMA.wake` hover, 1 press/focus/click).
 * - `uAccent` — the plasma colour, `--site-accent`.
 * - `uPlasmaPeak` — alpha at level 1 at the core (low: text sits over it).
 * - `uRings[4]` — charge rings: x, y (host px), front radius px, strength (0 = unused).
 *
 * `jPlasma(P, size, d, seed, time)` returns the plasma's alpha at `P` (host px, y down), `d` px inside the edge. It is
 * a soft core and ridged filaments reaching out of it, CLIPPED inside the gel (0 within 3px of the edge, full by 14px):
 * plasma never draws an outline. A ring brightens the plasma (filaments first) as its front passes. With the level at
 * 0 and no ring it returns exactly 0, so a surface at rest shows no plasma at all. `time` is 0 in the rim program.
 */
export const PLASMA_GLSL = /* glsl */ `
uniform float uLevel;
uniform vec3 uAccent;
uniform float uPlasmaPeak;
uniform vec4 uRings[4];
const float J_RING_W = 10.0;
float jRings(vec2 P) {
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 r = uRings[i];
    if (r.w <= 0.0) continue;
    float x = (length(P - r.xy) - r.z) / J_RING_W;
    s += r.w * exp(-x * x);
  }
  return min(s, 1.0);
}
float jPlasma(vec2 P, vec2 size, float d, float seed, float time) {
  float ring = jRings(P);
  if (uLevel <= 0.001 && ring <= 0.001) return 0.0;
  float clip = smoothstep(3.0, 14.0, d);
  if (clip <= 0.0) return 0.0;
  float m = max(min(size.x, size.y), 1.0);
  vec2 p = (P - size * 0.5) / m;
  vec2 drift = vec2(jNoise(vec2(seed * 9.0, time * 0.15)), jNoise(vec2(time * 0.13, seed * 5.0))) - 0.5;
  vec2 pc = p - drift * 0.2;
  float core = exp(-dot(pc, pc) / 0.045);
  float n = jFbm(P / 90.0 + seed * 13.0 + vec2(time * 0.05, -time * 0.04));
  float fil = pow(1.0 - abs(2.0 * n - 1.0), 6.0) * exp(-dot(pc, pc) / 0.4);
  float body = core * 0.65 + fil * 0.55;
  return clamp(clip * (uLevel * body + ring * (0.6 + 0.4 * fil + 0.3 * core)), 0.0, 1.0) * uPlasmaPeak;
}
`;
