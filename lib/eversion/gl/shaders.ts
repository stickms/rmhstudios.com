/**
 * The eversion's GLSL ES 3.00 sources (spec §4, §5.4–5.5, §10). OWNER: T23.
 * Client-only; no React, no DOM.
 *
 * ## What the shaders are
 *
 * A PORT. The eversion `F`, its normal and the morph are written first in
 * TypeScript (`thurston.ts`, `morph.ts`) and tested in node; this file mirrors
 * them term for term, and the GL parity test (spec §11.2 test 27) renders `F`
 * through transform feedback at 64 values of `e` and compares with the oracle.
 * If the two disagree the oracle wins and the shader is fixed.
 *
 * - **Vertex:** the eversion `F` (Thurston's corrugations, derivation note
 *   `docs/plans/globe-eversion/thurston-derivation.md` §3–§5) with the stage
 *   parameters taken from `u_stageParams` (the CPU runs `stageParams`, so the
 *   GPU does no window math — and only slots 1, 3, 5, 6, 7 are read; `c` and
 *   `r` enter through `κ`); the normal (finite differences, and the exact
 *   surface-of-revolution normal inside the pole zone); the morph, reading the
 *   LUT for `flat(p)`; spin/tilt/radius/centre; the ripple displacement from
 *   `lib/fluid`'s `RIPPLE`.
 * - **Fragment:** the side from `gl_FrontFacing` (front → `before`, back →
 *   `after`, the latter through `u_mAfter`); the page UV from the LUT per
 *   fragment (no per-vertex UV seams); glass edges antialiased with `fwidth`;
 *   the `u_placeholder` → `u_after` mix; Lambert + side tint + fresnel rim; the
 *   13-ring procedural cage; `u_pageAlpha` for the reveal. Every colour is a
 *   `u_col*` uniform — **no raw colour in GLSL**.
 *
 * The names, types and cadences of the uniforms are `UNIFORMS` in `uniforms.ts`
 * — the contract between this file and the renderer (T24). Constants
 * (`WRAP_WAVE`, `LAMBERT_*`, `RIM_*`, `STAGE_PARAM_COUNT`, `RIPPLE`, …) are
 * injected as `#define`s generated from `constants.ts` / `lib/fluid`, so a tuned
 * value changes in one place.
 *
 * ## Numerics that matter (all from the derivation note §10)
 *
 * - Everything is `highp`. The strip coordinate is `fract(nθ/2π)` FIRST (the
 *   argument of `4πv'` stays under 12.6) and the final rotation about the polar
 *   axis uses `ψ = θ` itself, never a value rebuilt from `v'`.
 * - `normalize` is guarded wherever its argument can vanish (`g × du` at the
 *   poles and in the revolution zone, where the offset is multiplied by `m = 0`
 *   anyway).
 * - Normals: central differences with step {@link FD_STEP} outside the pole
 *   zone, the exact revolution-zone normal inside it (and a constant at the
 *   pole itself, where that formula is 0/0). Orientation is the WINDING normal
 *   `∂φF × ∂θF` — outward at `e = 0`, inward at `e = 1`; the fragment shader
 *   flips it for back faces, so lighting always uses the visible side's normal.
 * - The LUT is `RG32F`/`NEAREST` filtered by hand (see `LUT_SAMPLE_GLSL` in
 *   `stub-shaders.ts` for why). T23 adds the discontinuity guard recommended by
 *   `projection-lut.ts#sampleLutGuarded`: if any of the four taps differs from
 *   the nearest by more than `JUMP_UV` the nearest tap is returned unblended,
 *   so a projection's cut (or a clamped pole region) never smears a UV across
 *   the page. The vertex shader reads the LUT with `texelFetch` (LOD 0 by
 *   definition) rather than `textureLod` because the sampler is `NEAREST`.
 *
 * ## Shading and the pixel-exact endpoints
 *
 * The flat page at `wrap = 0` / `unwrap = 0` must equal the capture to the
 * bit (S#29/S#30), so every lighting term is scaled by the vertex's morph
 * weight `w`: at `w = 0` the shader outputs the texture untouched, at `w = 1`
 * the full Lambert + side tint + rim. Glass (UV outside the page) shows the veil
 * colour plus the rim and the cage only.
 *
 * ## The cage
 *
 * A second draw of the same vertex transform. The 13 rings of `lib/globe.ts`
 * (meridians every 30°, parallels every 20° up to ±60°) are drawn as
 * anti-aliased lines from the interpolated `(θ, φ)`, in px via `fwidth`; the
 * meridian through the front point and the equator take `--cage-major`, the rest
 * `--cage-minor` / `--cage-parallel`, like `LiquidGlobe`. Lines near a ripple
 * crest take `--cage-ripple`. The cage fades in with the morph weight.
 *
 * The stub (`stub-shaders.ts`, T24) has the same {@link ShaderSet} shape.
 */

import { GLOBE_PERSP } from '../../globe';
import { RIPPLE } from '../../fluid';
import {
  EVERSION_STRIPS,
  LAMBERT_BASE,
  LAMBERT_GAIN,
  LIGHT_DIRECTION,
  POLE_EPS,
  RIM_POWER,
  RIM_STRENGTH,
  SIDE_DARKEN,
  SIDE_TINT,
  STAGE_PARAM_COUNT,
  WRAP_WAVE,
} from '../constants';
import { JUMP_UV } from '../projection-lut';

/** One linked program's sources. */
export interface ProgramSource {
  readonly vertex: string;
  readonly fragment: string;
}

/**
 * Everything the renderer compiles (spec §8.4: two draw calls — the surface,
 * then the cage lines from the same vertex transform).
 */
export interface ShaderSet {
  /** The page/glass surface. */
  readonly surface: ProgramSource;
  /** The cage lines (may share the surface's vertex source with a pass flag). */
  readonly cage: ProgramSource;
  /**
   * The transform-feedback variant of the vertex shader that outputs `F` only
   * (`renderer.debugEvaluate`, spec §11.2 test 27), and the varying it captures.
   */
  readonly feedback: ProgramSource & { readonly varyings: readonly string[] };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Constants injected as #defines
   ═══════════════════════════════════════════════════════════════════════════ */

/** Finite-difference step for the normal, radians (derivation note §10: 1e-3 in float32). */
export const FD_STEP = 1e-3;

/**
 * The pole zone in latitude: inside it the surface IS the surface of revolution
 * of the profile (the corrugation amplitude is 0 for `π/2 − |φ| < 0.0741`), so
 * the exact normal applies. The note proposes `POLE_EPS = 0.07`; `constants.ts`
 * still says 0.02 until T08 lands, and a zone narrower than 0.07 would make the
 * finite differences straddle the region where `cos φ → 0`. So the zone is
 * `POLE_EPS` clamped into `[0.07, 0.0741]`: never below the note's value, never
 * past the point where the exactness argument stops holding.
 */
export const POLE_ZONE = Math.min(Math.max(POLE_EPS, 0.07), 0.0741);

/** `SIZE0` of the derivation note §5: the corrugation amplitude (internal to thurston.ts, mirrored here). */
const SIZE0 = 0.14;

/**
 * Per-pixel UV change above which the page lookup is treated as crossing a LUT
 * discontinuity (a projection cut): mip selection and glass-edge antialiasing
 * are suppressed there so the seam stays a crisp line instead of smearing the
 * page into its lowest mip. A legitimate gradient is far below this, even at the
 * limb of a 4K-wide page on a small sphere.
 */
const JUMP_GRAD = 0.25;

const f = (x: number) => x.toFixed(8);

/** `#define`s generated from the constants, so GLSL and TypeScript cannot disagree. */
const DEFINES = /* glsl */ `
#define PI 3.14159265358979
#define TAU 6.28318530717959
#define HALF_PI 1.57079632679490
#define WRAP_WAVE ${f(WRAP_WAVE)}
#define GLOBE_PERSP ${f(GLOBE_PERSP)}
#define STAGE_PARAM_COUNT ${STAGE_PARAM_COUNT}
#define STRIPS ${f(EVERSION_STRIPS)}
#define SIZE0 ${f(SIZE0)}
#define FD_STEP ${FD_STEP.toExponential(3)}
#define POLE_ZONE ${f(POLE_ZONE)}
#define JUMP_UV ${f(JUMP_UV)}
#define JUMP_GRAD ${f(JUMP_GRAD)}
#define LAMBERT_BASE ${f(LAMBERT_BASE)}
#define LAMBERT_GAIN ${f(LAMBERT_GAIN)}
#define LIGHT_DIR vec3(${LIGHT_DIRECTION.map(f).join(', ')})
#define SIDE_DARKEN ${f(SIDE_DARKEN)}
#define SIDE_TINT ${f(SIDE_TINT)}
#define RIM_POWER ${f(RIM_POWER)}
#define RIM_STRENGTH ${f(RIM_STRENGTH)}
#define RIPPLE_SPEED ${f(RIPPLE.speed)}
#define RIPPLE_WIDTH ${f(RIPPLE.width)}
#define RIPPLE_AMPLITUDE ${f(RIPPLE.amplitude)}
#define RIPPLE_LIFE ${f(RIPPLE.life)}
`;

/** `#version` line, default precisions and the defines. Exported for the e2e's probe programs. */
export const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
${DEFINES}`;

/* ═══════════════════════════════════════════════════════════════════════════
   The eversion, in GLSL (shared by the surface, the cage and the feedback pass)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * `F(θ, φ, e)` and its normal — a term-for-term port of the derivation note
 * (§3 scalars, §4 profile, §5 corrugation, §8.3 poles) and of `frame`/`point`
 * in `thurston-check.ts`. Needs `u_stageParams` only.
 *
 * The work splits as the note recommends: {@link evertFrame} depends on latitude
 * and the stage (so the three latitudes of a normal cost three frames) and
 * {@link evertPoint} on longitude.
 */
export const EVERSION_GLSL = /* glsl */ `
uniform float u_stageParams[STAGE_PARAM_COUNT];

float quintic01(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}
float smooth3(float x) { return x * x * (3.0 - 2.0 * x); }
float dsmooth3(float x) { return 6.0 * x * (1.0 - x); }

/* Everything that depends on latitude and stage but not on longitude, in
   Thurston's T-frame (polar axis +Z, profile in the plane X = 0). */
struct Frame {
  vec3 P;   /* profile point Sigma(u) */
  vec3 Pu;  /* d Sigma / du */
  vec3 W;   /* 1.1 m t   : longitude direction of the figure-eight */
  vec3 N;   /* m n       : outward normal direction */
  vec3 B;   /* -m_u du   : bend along the meridian */
  float f;  /* kappa FF  : the "form" */
};

Frame evertFrame(float u) {
  u = clamp(u, 0.0, 2.0);
  float p = u_stageParams[1];   /* push */
  float q = u_stageParams[3];   /* unpush */
  float kap = u_stageParams[5]; /* kappa = c (1 - r) */
  float sw = u_stageParams[6];  /* sin(pi w) */
  float cw = u_stageParams[7];  /* cos(pi w) */

  bool south = u > 1.0;
  float sg = south ? -1.0 : 1.0;
  float uf = south ? 2.0 - u : u;

  /* latitude re-parametrisations P1, P2 and the blend weight W (note section 3) */
  float P1 = south ? u * u - 2.0 * u + 2.0 : 2.0 * u - u * u;
  float dP1 = south ? 2.0 * u - 2.0 : 2.0 - 2.0 * u;
  float P2 = south ? -u * u + 4.0 * u - 2.0 : u * u;
  float dP2 = south ? 4.0 - 2.0 * u : 2.0 * u;
  float W = smooth3(uf);
  float dW = sg * dsmooth3(uf);

  float a = HALF_PI * u;
  float a1 = HALF_PI * P1;
  float a2 = HALF_PI * P2;
  float da1 = HALF_PI * dP1;
  float da2 = HALF_PI * dP2;
  float sa = sin(a), ca = cos(a);
  float s1 = sin(a1), c1 = cos(a1);
  float s2 = sin(a2), c2 = cos(a2);

  /* the A (polar caps) and B (belt) arcs after RotZ(+-pi w) / RotY(pi w) */
  float sz = sg * sw;
  vec3 Ab = vec3(0.9 * s1 * sz, 0.9 * s1 * cw, -c1);
  vec3 Abu = vec3(0.9 * c1 * da1 * sz, 0.9 * c1 * da1 * cw, s1 * da1);
  vec3 Abg = vec3(0.9 * s1 * cw, -0.9 * s1 * sz, 0.0);
  vec3 Bb = vec3(-0.5 * c2 * sw, s2, 0.5 * c2 * cw);
  vec3 Bbu = vec3(0.5 * s2 * da2 * sw, c2 * da2, -0.5 * s2 * da2 * cw);
  vec3 Bbg = vec3(s2 * cw, 0.0, s2 * sw);

  vec3 S1 = vec3(0.0, sa, ca);
  vec3 S1u = HALF_PI * vec3(0.0, ca, -sa);
  vec3 S1g = vec3(sa, 0.0, 0.0);

  /* T(w) and its u / longitude derivatives, then the unified push-unpush blend */
  vec3 T = mix(Ab, Bb, W);
  vec3 Tu = (Bb - Ab) * dW + mix(Abu, Bbu, W);
  vec3 Tg = mix(Abg, Bbg, W);
  vec3 P = (1.0 - q) * mix(S1, T, p) - q * S1;
  vec3 Pu = (1.0 - q) * mix(S1u, Tu, p) - q * S1u;
  vec3 g = (1.0 - q) * mix(S1g, Tg, p) - q * S1g;

  /* du = Pu/|Pu|; n = normalize(g x du); t = du x n  (zero where undefined) */
  float nu = length(Pu);
  vec3 du = nu > 1e-8 ? Pu / nu : vec3(0.0);
  vec3 nrm = cross(g, du);
  float nl = length(nrm);
  nrm = nl > 1e-6 ? nrm / nl : vec3(0.0);
  vec3 tdir = cross(du, nrm);

  /* size envelope m(u) = SIZE0 kappa FF S, with FF the quintic latitude ramp */
  float x = 1.06 * uf - 0.05;
  float FF = quintic01(x);
  float dFF = (x > 0.0 && x < 1.0) ? 1.06 * sg * 30.0 * x * x * (1.0 - x) * (1.0 - x) : 0.0;
  float S = smooth3(uf);
  float dS = sg * dsmooth3(uf);
  float m = SIZE0 * kap * FF * S;
  float mu = SIZE0 * kap * (dFF * S + FF * dS);

  Frame fr;
  fr.P = P;
  fr.Pu = Pu;
  fr.W = 1.1 * m * tdir;
  fr.N = m * nrm;
  fr.B = -mu * du;
  fr.f = kap * FF;
  return fr;
}

/* Everything that depends on longitude: the figure-eight cross-section, swept by psi = theta. */
vec3 evertPoint(Frame fr, float theta) {
  float v = fract(STRIPS * theta / TAU);
  float raw = 1.0 - cos(4.0 * PI * v);
  if (v > 0.25 && v < 0.75) raw = 4.0 - raw;
  float H = 0.6 * raw;
  float fp = 2.0 * fr.f - fr.f * fr.f;
  float G = (1.0 - fp) * 2.0 * (1.0 - cos(2.0 * PI * v)) + fp * H;
  float s = sin(4.0 * PI * v);
  float k = H * H / 64.0;
  vec3 o = fr.P + fr.W * s + (fr.N + fr.B * k) * G;
  float cs = cos(theta), sn = sin(theta);
  /* T-frame (X, Y, Z) -> body (X, -Z, Y): a proper rotation (note section 2) */
  return vec3(o.x * cs + o.y * sn, -o.z, -o.x * sn + o.y * cs);
}

float latToU(float phi) { return 1.0 - 2.0 * phi / PI; }

/* F(theta, phi, e) in body space. */
vec3 evertF(float theta, float phi) {
  return evertPoint(evertFrame(latToU(phi)), theta);
}

/* The unit WINDING normal d_phi F x d_theta F (outward at e = 0, inward at e = 1). */
vec3 evertNormal(float theta, float phi, Frame fr) {
  if (abs(phi) > HALF_PI - POLE_ZONE) {
    /* Surface of revolution: N_T ~ z (Pu.P) - P (Pu.z), then RotZ(psi), then the frame map. */
    vec3 nt = vec3(0.0, 0.0, 1.0) * dot(fr.Pu, fr.P) - fr.P * fr.Pu.z;
    float len = length(nt);
    if (len < 1e-7) return vec3(0.0, phi > 0.0 ? -1.0 : 1.0, 0.0); /* the pole itself */
    nt /= len;
    float cs = cos(theta), sn = sin(theta);
    return vec3(nt.x * cs + nt.y * sn, -nt.z, -nt.x * sn + nt.y * cs);
  }
  float h = FD_STEP;
  vec3 dTheta = evertPoint(fr, theta + h) - evertPoint(fr, theta - h);
  vec3 dPhi = evertPoint(evertFrame(latToU(phi + h)), theta) -
              evertPoint(evertFrame(latToU(phi - h)), theta);
  vec3 n = cross(dPhi, dTheta);
  float nl = length(n);
  return nl > 1e-12 ? n / nl : vec3(0.0, 0.0, 1.0);
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   LUT lookup (guarded bilinear)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The page UV of sphere point `(θ, φ)`: four `texelFetch`es of the `RG32F`
 * LUT, bilinear, CLAMPED in both axes (the seam is a discontinuity — see
 * `stub-shaders.ts#LUT_SAMPLE_GLSL`), with the nearest-tap fallback when the
 * 2×2 footprint straddles a jump larger than `JUMP_UV`
 * (`projection-lut.ts#sampleLutGuarded`, the CPU twin). Row 0 is the south pole,
 * column 0 is `θ = −π` (`domain.ts#lutTexel`).
 */
export const LUT_GUARDED_GLSL = /* glsl */ `
vec2 lutUv(float theta, float phi) {
  ivec2 sz = textureSize(u_lut, 0);
  vec2 t = vec2((theta + PI) / TAU * float(sz.x), (phi + HALF_PI) / PI * float(sz.y)) - 0.5;
  vec2 i0 = floor(t);
  vec2 fr = t - i0;
  int x0 = clamp(int(i0.x), 0, sz.x - 1);
  int x1 = clamp(int(i0.x) + 1, 0, sz.x - 1);
  int y0 = clamp(int(i0.y), 0, sz.y - 1);
  int y1 = clamp(int(i0.y) + 1, 0, sz.y - 1);
  vec2 a = texelFetch(u_lut, ivec2(x0, y0), 0).rg;
  vec2 b = texelFetch(u_lut, ivec2(x1, y0), 0).rg;
  vec2 c = texelFetch(u_lut, ivec2(x0, y1), 0).rg;
  vec2 d = texelFetch(u_lut, ivec2(x1, y1), 0).rg;
  vec2 nearest = mix(mix(a, b, step(0.5, fr.x)), mix(c, d, step(0.5, fr.x)), step(0.5, fr.y));
  vec4 jx = abs(vec4(a.x, b.x, c.x, d.x) - nearest.x);
  vec4 jy = abs(vec4(a.y, b.y, c.y, d.y) - nearest.y);
  if (max(max(jx.x, jx.y), max(jx.z, jx.w)) > JUMP_UV ||
      max(max(jy.x, jy.y), max(jy.z, jy.w)) > JUMP_UV) {
    return nearest;
  }
  return mix(mix(a, b, fr.x), mix(c, d, fr.x), fr.y);
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   Vertex shader (surface + cage)
   ═══════════════════════════════════════════════════════════════════════════ */

const VERTEX = `${GLSL_HEADER}
layout(location = 0) in vec2 a_domain;
uniform float u_wrap;
uniform float u_unwrap;
uniform float u_spin;
uniform float u_tilt;
uniform float u_radius;
uniform vec2 u_centre;
uniform vec2 u_viewport;
uniform vec2 u_ripple;
uniform sampler2D u_lut;
out vec2 v_domain;
out float v_morph;
out vec3 v_nview;
out vec3 v_pos;
out float v_ripple;
/* The cage pass runs this very source; invariance keeps both draws bit-identical so LEQUAL never z-fights. */
invariant gl_Position;
${EVERSION_GLSL}
${LUT_GUARDED_GLSL}

/* lib/morph.ts#wrapWeight's smootherstep. */
float smootherstep01(float x) { return quintic01(x); }

/* lib/fluid.ts#rippleWave: a Ricker wavelet that dies with (1 - age/life)^2. */
float rippleAt(float age, float dist) {
  if (!(age >= 0.0) || age >= RIPPLE_LIFE) return 0.0;
  float q = (dist - RIPPLE_SPEED * age) / RIPPLE_WIDTH;
  if (q > 4.0 || q < -4.0) return 0.0;
  float decay = 1.0 - age / RIPPLE_LIFE;
  return RIPPLE_AMPLITUDE * (1.0 - q * q) * exp(-0.5 * q * q) * decay * decay;
}

/* R = Rx(tilt) * Ry(spin): the same arithmetic as viewOf in lib/globe.ts. */
vec3 spinTilt(vec3 q, float cy, float sy, float ct, float st) {
  float x1 = q.x * cy + q.z * sy;
  float z1 = -q.x * sy + q.z * cy;
  return vec3(x1, q.y * ct - z1 * st, q.y * st + z1 * ct);
}

void main() {
  float theta = a_domain.x;
  float phi = a_domain.y;
  float cp0 = cos(phi);
  vec3 p = vec3(cp0 * sin(theta), -sin(phi), cp0 * cos(theta));

  /* The eversion, its winding normal, and the pose. */
  Frame fr = evertFrame(latToU(phi));
  vec3 F = evertPoint(fr, theta);
  vec3 n = evertNormal(theta, phi, fr);
  float cy = cos(u_spin), sy = sin(u_spin);
  float ct = cos(u_tilt), st = sin(u_tilt);
  vec3 v = spinTilt(F, cy, sy, ct, st);
  vec3 nv = spinTilt(n, cy, sy, ct, st);

  /* Ripples radiate from the camera-facing point (+z) in VIEW space, as a radial push. */
  vec3 vdir = v / max(length(v), 1e-4);
  float dist = acos(clamp(vdir.z, -1.0, 1.0));
  float r0 = rippleAt(u_ripple.x, dist);
  float r1 = rippleAt(u_ripple.y, dist);
  v += vdir * (r0 + r1);
  v_ripple = clamp(max(abs(r0), abs(r1)) / RIPPLE_AMPLITUDE, 0.0, 1.0);

  vec3 sphere = vec3(u_centre - 0.5 * u_viewport, 0.0) + v * u_radius;

  /* The page pixel of the clamped extended UV, in the z = 0 plane (scale exactly 1 there). */
  vec2 uv = clamp(lutUv(theta, phi), 0.0, 1.0);
  vec3 flatPos = vec3((uv - 0.5) * u_viewport, 0.0);

  /* The wrap wave: the centre curls onto the globe first, the edges follow (morph.ts). */
  float s = min(u_wrap, u_unwrap);
  float d = acos(clamp(p.z, -1.0, 1.0)) / PI;
  float w = smootherstep01(s * (1.0 + WRAP_WAVE) - WRAP_WAVE * d);
  vec3 pos = flatPos + w * (sphere - flatPos);

  /* The flat page faces the viewer (+z), so its shading normal is (0, 0, 1). */
  v_nview = mix(vec3(0.0, 0.0, 1.0), nv, w);

  /* Camera on +z at D = 2 * GLOBE_PERSP * r: a hand-built projection (morph.ts#projectToViewport). */
  float camDist = 2.0 * GLOBE_PERSP * max(u_radius, 1.0);
  float wc = (camDist - pos.z) / camDist;
  /* Depth spans +-2 radii (the eversion stays inside 1.35 r) rather than +-camDist: ~3x finer steps,
     which keeps the facets on either side of a silhouette edge from tying in the depth test. */
  float ndcZ = clamp(-pos.z / (2.0 * max(u_radius, 1.0)), -1.0, 1.0) * 0.9;
  gl_Position = vec4(pos.x * 2.0 / u_viewport.x, -pos.y * 2.0 / u_viewport.y, ndcZ * wc, wc);
  v_domain = a_domain;
  v_morph = w;
  v_pos = pos;
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   Surface fragment shader
   ═══════════════════════════════════════════════════════════════════════════ */

const SURFACE_FRAGMENT = `${GLSL_HEADER}
in vec2 v_domain;
in float v_morph;
in vec3 v_nview;
in vec3 v_pos;
in float v_ripple;
uniform sampler2D u_lut;
uniform sampler2D u_before;
uniform sampler2D u_after;
uniform sampler2D u_placeholder;
uniform mat3 u_mAfter;
uniform float u_afterMix;
uniform float u_pageAlpha;
uniform float u_radius;
uniform vec4 u_colVeil;
uniform vec4 u_colAccent;
uniform vec4 u_colCageMajor;
out vec4 outColor;
${LUT_GUARDED_GLSL}
void main() {
  float theta = v_domain.x;
  float phi = v_domain.y;
  bool front = gl_FrontFacing;

  /* Which page, and where on it. Back faces read the AFTER page through M_after: P(M_after * p). */
  vec2 uv;
  if (front) {
    uv = lutUv(theta, phi);
  } else {
    float cp = cos(phi);
    vec3 m = u_mAfter * vec3(cp * sin(theta), -sin(phi), cp * cos(theta));
    uv = lutUv(atan(m.x, m.z), asin(clamp(-m.y, -1.0, 1.0)));
  }
  vec2 cuv = clamp(uv, 0.0, 1.0);

  /* Across a LUT cut the UV jumps inside one pixel: do not let that pick the lowest mip or smear the edge. */
  vec2 gx = dFdx(uv);
  vec2 gy = dFdy(uv);
  bool cut = max(max(abs(gx.x), abs(gx.y)), max(abs(gy.x), abs(gy.y))) > JUMP_GRAD;
  if (cut) {
    gx = vec2(1e-4, 0.0);
    gy = vec2(0.0, 1e-4);
  }

  vec3 page;
  if (front) {
    page = textureGrad(u_before, cuv, gx, gy).rgb;
  } else {
    vec3 ph = textureGrad(u_placeholder, cuv, gx, gy).rgb;
    vec3 af = textureGrad(u_after, cuv, gx, gy).rgb;
    page = mix(ph, af, u_afterMix);
  }

  /* Gentle Lambert on the VISIBLE side's normal, and the back side's darken + accent tint (Q18). */
  vec3 n = normalize(v_nview) * (front ? 1.0 : -1.0);
  float lit = LAMBERT_BASE + LAMBERT_GAIN * max(dot(n, normalize(LIGHT_DIR)), 0.0);
  vec3 shaded = page * lit;
  if (!front) {
    shaded = mix(shaded * SIDE_DARKEN, u_colAccent.rgb, SIDE_TINT);
  }
  /* Scaled by the morph weight: the flat page must be the capture, untouched. */
  page = mix(page, shaded, v_morph);

  /* Glass is "the UV lies outside [0,1]^2"; antialias the page edge with fwidth (hard across a cut). */
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float fw = cut ? 0.0 : fwidth(edge);
  float onPage = clamp(edge / max(fw, 1e-6) + 0.5, 0.0, 1.0);
  vec3 rgb = mix(u_colVeil.rgb, page, onPage);

  /* Fresnel rim in --cage-major: strongest at the silhouette, on page and glass alike. */
  float camDist = 2.0 * GLOBE_PERSP * max(u_radius, 1.0);
  vec3 toEye = normalize(vec3(0.0, 0.0, camDist) - v_pos);
  float rim = pow(1.0 - abs(dot(normalize(v_nview), toEye)), RIM_POWER) * RIM_STRENGTH;
  rgb = mix(rgb, u_colCageMajor.rgb, clamp(rim, 0.0, 1.0) * v_morph);

  float a = mix(1.0, u_pageAlpha, onPage);
  outColor = vec4(rgb * a, a);
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   Cage fragment shader
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The 13 rings of `lib/globe.ts` as procedural lines on the sphere's own
 * `(θ, φ)`: a meridian every 30° (6 great circles = 12 half-meridians) and a
 * parallel every 20° from −60° to +60° (7). Coverage is the distance to the
 * nearest ring in angle, divided by `fwidth` of that angle (so in pixels), thresholded
 * at the configured width.
 */
const CAGE_FRAGMENT = `${GLSL_HEADER}
in vec2 v_domain;
in float v_morph;
in float v_ripple;
uniform float u_cageAlpha;
uniform float u_cageWidth;
uniform float u_pixelRatio;
uniform vec4 u_colCageMinor;
uniform vec4 u_colCageParallel;
uniform vec4 u_colCageMajor;
uniform vec4 u_colCageRipple;
out vec4 outColor;

/* Coverage of the line nearest to 'angle' among lines every 'step' radians. */
float lineCover(float angle, float step_) {
  float k = angle / step_;
  float dist = abs(k - floor(k + 0.5)) * step_;
  float px = dist / max(fwidth(angle), 1e-6);
  float half_ = 0.5 * u_cageWidth * u_pixelRatio;
  return 1.0 - smoothstep(half_ - 0.5, half_ + 0.5, px);
}

void main() {
  float theta = v_domain.x;
  float phi = v_domain.y;
  /* Meridians converge on the poles; fade them there so they do not pile up into a blob. */
  float meridianFade = smoothstep(0.05, 0.25, cos(phi));
  float mer = lineCover(theta, PI / 6.0) * meridianFade;
  float par = lineCover(phi, PI / 9.0) * step(abs(phi), 1.0472 + 0.01);

  /* Colour by role (LiquidGlobe): the front meridian (and its mirror) and the equator are 'major'. */
  bool majorMer = abs(theta) < 0.5 * PI / 6.0 || abs(abs(theta) - PI) < 0.5 * PI / 6.0;
  bool majorPar = abs(phi) < 0.5 * PI / 9.0;
  vec4 merCol = majorMer ? u_colCageMajor : u_colCageMinor;
  vec4 parCol = majorPar ? u_colCageMajor : u_colCageParallel;
  float wm = mer * merCol.a;
  float wp = par * parCol.a;
  vec4 col = wm > wp ? merCol : parCol;
  col = mix(col, vec4(u_colCageRipple.rgb, max(col.a, u_colCageRipple.a)), v_ripple);

  float a = max(wm, wp) * u_cageAlpha * v_morph;
  a = clamp(a + v_ripple * max(mer, par) * u_colCageRipple.a * u_cageAlpha * v_morph, 0.0, 1.0);
  outColor = vec4(col.rgb * a, a);
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   Transform-feedback variant
   ═══════════════════════════════════════════════════════════════════════════ */

/** `F(p, e)` in body space, one vec3 per vertex, nothing rasterised (`renderer.debugEvaluate`, S#27). */
const FEEDBACK_VERTEX = `${GLSL_HEADER}
layout(location = 0) in vec2 a_domain;
${EVERSION_GLSL}
out vec3 v_F;
void main() {
  v_F = evertF(a_domain.x, a_domain.y);
  gl_Position = vec4(0.0);
}
`;

const FEEDBACK_FRAGMENT = `${GLSL_HEADER}
out vec4 outColor;
void main() { outColor = vec4(0.0); }
`;

/** The real shader set. */
export function getShaderSet(): ShaderSet {
  return {
    surface: { vertex: VERTEX, fragment: SURFACE_FRAGMENT },
    cage: { vertex: VERTEX, fragment: CAGE_FRAGMENT },
    feedback: { vertex: FEEDBACK_VERTEX, fragment: FEEDBACK_FRAGMENT, varyings: ['v_F'] },
  };
}
