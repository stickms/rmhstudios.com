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
 * - The LUT is `RG32F`/`NEAREST` filtered by hand (see `LUT_GUARDED_GLSL`
 *   for why). T23 adds the discontinuity guard recommended by
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
 */

import { GLOBE_PERSP } from '../../globe';
import { RIPPLE } from '../../fluid';
import {
  EVERSION_STRIPS,
  LAMBERT_BASE,
  LAMBERT_GAIN,
  GLASS_FILL,
  GLASS_RIM_ALPHA,
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
import { COSMOS_MAX_BODIES } from '../cosmos';
import type { Tier } from '../types';

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
  /**
   * The surface again, for the azimuthal projections: the same source plus a `gl_FragDepth` write that sends a masked
   * wedge to the back. Any fragment shader that writes depth loses early-z, so the other projections never use it.
   */
  readonly surfaceMasked: ProgramSource;
  /** The cage lines (may share the surface's vertex source with a pass flag). */
  readonly cage: ProgramSource;
  /**
   * The transform-feedback variant of the vertex shader that outputs `F` only
   * (`renderer.debugEvaluate`, spec §11.2 test 27), and the varying it captures.
   */
  readonly feedback: ProgramSource & { readonly varyings: readonly string[] };
  /** The cosmos's bodies and its starfield (mid and high only; `null` on low, which never compiles them). */
  readonly cosmos: ProgramSource | null;
  readonly stars: ProgramSource | null;
  readonly quality: Quality;
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

/**
 * The morph weight below which a fragment is on the flat page for all practical purposes (`w < FLAT_SNAP` moves a
 * vertex < 0.4 px even on a 1440 px page). Such a fragment shows the page at its own pixel; see the surface shader.
 */
const FLAT_SNAP = 5e-4;

/**
 * Azimuthal projections (Lambert, stereographic) send the back point to the page's whole border, so the mesh
 * triangles around it have corners on opposite sides of the page: mid-morph they are stretched wedges, and the
 * page texels they carry are smeared. The wedge is masked ANALYTICALLY: a cap on the angular distance of the
 * fragment's sphere point from the projection's back point, in the frame the fragment's page lookup is made in
 * (the body for the BEFORE side, `M_after * body` for the AFTER side). It does not depend on how the mesh is
 * triangulated, on screen-space derivatives (2x2 quad blocks) or on the LUT's nearest-tap guard, so its edge is a
 * circle with a quintic falloff over a few mesh cells, not a saw of triangle edges.
 *
 * The cap is `1` within WEDGE_CAP_FROM mesh cells of the back point and `0` beyond WEDGE_CAP_TO (`u_meshCell` is the
 * tier's cell, radians). A masked fragment shows the identity page while the morph is young (so the exact flat
 * endpoint is untouched, WEDGE_EARLY_*), then fades to GLASS: no page texel, a faint fill and a Fresnel rim,
 * and pushed to the back of the depth buffer (when it is not in front of anything the glass is what is seen;
 * in front of real page the page wins, so a stretched triangle can never hide it).
 */
const WEDGE_CAP_FROM = 2.0;
const WEDGE_CAP_TO = 7.0;
/** Morph weight at which the vertices' flat positions have stopped mattering (the sphere has taken over). */
const WEDGE_WRAPPED_FROM = 0.9;
const WEDGE_EARLY_FROM = 0.02;
const WEDGE_EARLY_TO = 0.12;
/** The eversion progress band, at each end, over which a wrong-way face turns to glass. */
const EVERT_END_FROM = 0.02;
const EVERT_END_TO = 0.08;
/** Half-width of the facing ramp: `dot(normal, toEye)` from `-FACING_BAND` (back) to `+FACING_BAND` (front). */
const FACING_BAND = 0.12;
/** The window depth of a fully masked fragment: just inside the far plane (the clear value is exactly 1). */
const MASK_DEPTH = 0.999999;
/** How quickly a masked fragment's depth leaves the surface: it is fully at the back by `1 / MASK_DEPTH_RATE`. */
const MASK_DEPTH_RATE = 4;

/**
 * The vertex-side page lookup of the duplicated EQUATOR vertices (`|φ'| < 1e-6`; see `mesh.ts#EQUATOR_EPS`) is nudged
 * by this many LUT texels toward the vertex's own side of the equator, so the south copy reads the texel row below a
 * cut along the equator (Peirce's back equator, in either layout) and the north copy the row above. Float32 cannot
 * resolve the copies' own 1e-7 rad offset in the LUT coordinate; 2e-3 texel is ~100 ulps and ~0.002 px of motion.
 */
export const EQUATOR_BIAS_TEXELS = 2e-3;

/**
 * Pole-row extrapolation factor: the half-texel step from the last LUT row to the one below, times this, is added
 * to the pole vertex's UV (then clamped to the page). 4 = two whole texels past the last row's centre.
 */
const POLE_EXTRAP = 4;

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
#define FLAT_SNAP ${f(FLAT_SNAP)}
#define WEDGE_CAP_FROM ${f(WEDGE_CAP_FROM)}
#define WEDGE_CAP_TO ${f(WEDGE_CAP_TO)}
#define WEDGE_WRAPPED_FROM ${f(WEDGE_WRAPPED_FROM)}
#define WEDGE_EARLY_FROM ${f(WEDGE_EARLY_FROM)}
#define WEDGE_EARLY_TO ${f(WEDGE_EARLY_TO)}
#define EVERT_END_FROM ${f(EVERT_END_FROM)}
#define EVERT_END_TO ${f(EVERT_END_TO)}
#define FACING_BAND ${f(FACING_BAND)}
#define MASK_DEPTH ${f(MASK_DEPTH)}
#define MASK_DEPTH_RATE ${f(MASK_DEPTH_RATE)}
#define EQUATOR_BIAS ${f(EQUATOR_BIAS_TEXELS)}
#define POLE_EXTRAP ${f(POLE_EXTRAP)}
#define LAMBERT_BASE ${f(LAMBERT_BASE)}
#define LAMBERT_GAIN ${f(LAMBERT_GAIN)}
#define LIGHT_DIR vec3(${LIGHT_DIRECTION.map(f).join(', ')})
#define SIDE_DARKEN ${f(SIDE_DARKEN)}
#define SIDE_TINT ${f(SIDE_TINT)}
#define RIM_POWER ${f(RIM_POWER)}
#define RIM_STRENGTH ${f(RIM_STRENGTH)}
#define GLASS_FILL ${f(GLASS_FILL)}
#define GLASS_RIM_ALPHA ${f(GLASS_RIM_ALPHA)}
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
 * the original LUT sampler), with the nearest-tap fallback when the
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

/**
 * `wedge()` for the fragment shaders that declare `u_meshCell`, `u_mAfter`, `u_unwrap`, `u_azimuthal`, `v_domain` and
 * `v_morph`: how much of this fragment sits on the stretched azimuthal wedge, 0 to 1 (see {@link WEDGE_CAP_FROM}).
 * Always 0 for the other projections and at the flat end. `wedgeCap(q)` is the same cap for any point `q` of the
 * unit sphere in a projection's own frame (its back point is `(0, 0, -1)`).
 */
const WEDGE_GLSL = /* glsl */ `
uniform float u_meshCell;
float quintic5(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}
float wedgeCap(vec3 q) {
  float ang = atan(length(q.xy), -q.z);
  float from = WEDGE_CAP_FROM * u_meshCell;
  return 1.0 - quintic5((ang - from) / ((WEDGE_CAP_TO - WEDGE_CAP_FROM) * u_meshCell));
}
float wedge() {
  if (u_azimuthal < 0.5 || v_morph <= 0.0) return 0.0;
  float cp = cos(v_domain.y);
  vec3 p = vec3(cp * sin(v_domain.x), -sin(v_domain.y), cp * cos(v_domain.x));
  /* The geometric wedge is the vertices' FLAT positions being stretched, so it matters only as far as the vertex
     is still partway to the flat page: a fully wrapped sphere has none (its back point can be anywhere on screen,
     e.g. at the centre of the everted globe). */
  float stillFlat = 1.0 - quintic5((v_morph - WEDGE_WRAPPED_FROM) / (1.0 - WEDGE_WRAPPED_FROM));
  return wedgeCap(u_unwrap < 1.0 ? u_mAfter * p : p) * stillFlat;
}
/* Of that, the part that has become glass (0 while the morph is young). */
float wedgeGlass(float wedgeAmount) {
  return wedgeAmount * quintic5((v_morph - WEDGE_EARLY_FROM) / (WEDGE_EARLY_TO - WEDGE_EARLY_FROM));
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   Quality (amendment 2026-10-18: "optimised on low-end, liquid and photorealistic on high-end")
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The shader quality a renderer compiles, from its tier: `0` low, `1` mid, `2` high.
 *
 * - **0 (low):** exactly the original shading — fixed light, Lambert, side tint, Fresnel rim, the cage. No
 *   cosmos program is ever compiled. This is the cheap path and it stays bit-for-bit what it was.
 * - **1 (mid):** a slow liquid swell on the surface (vertex only), the scene's light (it turns toward the
 *   cosmos's sun), a GGX highlight and a Schlick-Fresnel reflection of a procedural studio environment: a clear
 *   coat on the page, a dielectric where there is no page. The cosmos, with one sun and plain Lambert.
 * - **2 (high):** on top, a flowing micro-surface on the shading normal (the "liquid" sheen), a thin-film
 *   shimmer and a dispersed (chromatic) rim on the glass, the starfield refracted through it; in the cosmos, both
 *   suns, atmospheres, ocean glint, and shadows (moons on planets, rings on the giant and the giant on its rings).
 *
 * Every added term is multiplied by the morph weight (and glass by its lift), so the flat endpoints are the
 * capture to the bit at every quality (S#29/S#30), and nothing about a run's timing or geometry changes.
 */
export type Quality = 0 | 1 | 2;
export function qualityForTier(tier: Tier | undefined): Quality {
  return tier === 'high' ? 2 : tier === 'mid' ? 1 : 0;
}

/** The liquid swell's amplitude, in globe radii (vertex; mid and high). */
const LIQUID_SWELL = 0.011;
/** The micro-surface's strength on the shading normal (fragment; high). */
const LIQUID_NORMAL = 0.16;
/** How much of the environment the page's clear coat reflects at grazing incidence. */
const COAT_REFLECT = 0.42;
/** The page coat's highlight strength. */
const COAT_SPEC = 0.55;
/** How much of the environment the glass reflects (times Fresnel). */
const GLASS_REFLECT = 1.15;
/** How far (CSS px) the glass displaces what is seen through it, per unit of normal tilt. */
const GLASS_REFRACT_PX = 26;
/** Thin-film shimmer strength on the glass (high). */
const THIN_FILM = 0.22;
/** GGX roughness (alpha = roughness^2), and the highlight's gain. */
const ROUGHNESS = 0.24;
const SPEC_GAIN = 0.32;

const MATERIAL_DEFINES = `
#define LIQUID_SWELL ${f(LIQUID_SWELL)}
#define LIQUID_NORMAL ${f(LIQUID_NORMAL)}
#define COAT_REFLECT ${f(COAT_REFLECT)}
#define COAT_SPEC ${f(COAT_SPEC)}
#define GLASS_REFLECT ${f(GLASS_REFLECT)}
#define GLASS_REFRACT_PX ${f(GLASS_REFRACT_PX)}
#define THIN_FILM ${f(THIN_FILM)}
#define ROUGHNESS ${f(ROUGHNESS)}
#define SPEC_GAIN ${f(SPEC_GAIN)}
#define COSMOS_N ${COSMOS_MAX_BODIES}
`;

/** Hashes and value noise, for the starfield and the planets. No texture, no raw colour. */
const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0;
  float amp = 0.5;
  for (int o = 0; o < (QUALITY >= 2 ? 4 : 2); o++) {
    s += amp * vnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return s / (QUALITY >= 2 ? 0.9375 : 0.75);
}

/* Point stars on three cell grids (CSS px), each ~1 px with a little twinkle. */
float starLayer(vec2 p, float cell, float thresh, float seed) {
  vec2 c = floor(p / cell);
  float h = hash12(c + seed);
  if (h < thresh) return 0.0;
  vec2 o = vec2(hash12(c + seed + 17.0), hash12(c + seed + 31.0));
  vec2 sp = (c + 0.15 + 0.7 * o) * cell;
  vec2 dd = p - sp;
  return ((h - thresh) / (1.0 - thresh)) * exp(-dot(dd, dd) / 0.9);
}
vec3 starfield(vec2 p, float t) {
  float s = starLayer(p, 6.0, 0.972, 0.0) + 1.4 * starLayer(p, 13.0, 0.95, 5.0) +
            1.9 * starLayer(p, 31.0, 0.9, 11.0);
  float twinkle = 0.78 + 0.22 * sin(t * 2.3 + p.x * 0.071 + p.y * 0.113);
  return vec3(s * twinkle);
}
`;

/**
 * The liquid-glass material of the surface (mid and high). Reads `u_spin`, `u_tilt`, `u_time`, `u_evert` and
 * `u_lightCol`; the caller supplies the visible-side normal, the light and the background colour.
 */
const MATERIAL_GLSL = /* glsl */ `
${MATERIAL_DEFINES}
${NOISE_GLSL}
float fresnelSchlick(float c) {
  float m = 1.0 - c;
  float m2 = m * m;
  return 0.04 + 0.96 * m2 * m2 * m;
}
/* R = Rx(tilt) * Ry(spin), as the vertex shader poses the surface. */
vec3 poseDir(vec3 q) {
  float cy = cos(u_spin), sy = sin(u_spin), ct = cos(u_tilt), st = sin(u_tilt);
  float x1 = q.x * cy + q.z * sy;
  float z1 = -q.x * sy + q.z * cy;
  return vec3(x1, q.y * ct - z1 * st, q.y * st + z1 * ct);
}
/* High: a flowing micro-surface riding the body's own coordinates (so it travels with the eversion), strongest
   while the sphere is turning inside out. Its gradient tilts the shading normal: the liquid sheen. */
vec3 liquidNormal(vec3 n, vec3 body, float w) {
#if QUALITY >= 2
  float t = u_time;
  vec3 k1 = vec3(7.0, 3.0, -4.0);
  vec3 k2 = vec3(-5.0, 8.0, 2.0);
  vec3 k3 = vec3(3.0, -6.0, 9.0);
  vec3 g = k1 * cos(dot(body, k1) + 1.9 * t) * 0.5
         + k2 * cos(dot(body, k2) - 1.4 * t) * 0.32
         + k3 * cos(dot(body, k3) + 2.6 * t) * 0.18;
  g = poseDir(g) / 9.0;
  g -= n * dot(g, n);
  float activity = 0.55 + 0.45 * sin(PI * clamp(u_evert, 0.0, 1.0));
  return normalize(n + g * LIQUID_NORMAL * activity * w);
#else
  return n;
#endif
}
/* A studio, not a sky: a soft vertical gradient from the background toward the light's colour, the key light's
   reflection, and two tall softboxes either side of the viewer. y is DOWN in view space. */
vec3 envLight(vec3 r, vec3 l, vec3 bg) {
  float up = clamp(0.5 - 0.5 * r.y, 0.0, 1.0);
  vec3 sky = mix(bg * 0.55, mix(bg, u_lightCol.rgb, 0.5), up);
  float key = pow(max(dot(r, l), 0.0), 18.0);
  float ax = abs(r.x);
  float strip = smoothstep(0.55, 0.72, ax) * (1.0 - smoothstep(0.86, 0.95, ax)) *
                smoothstep(-0.2, 0.5, 0.3 - r.y);
  return sky + u_lightCol.rgb * (key * 1.6 + strip * 0.32);
}
/* GGX (Trowbridge-Reitz) highlight with Schlick Fresnel on the half vector. */
vec3 specularLight(vec3 n, vec3 v, vec3 l) {
  vec3 h = normalize(l + v);
  float nh = max(dot(n, h), 0.0);
  float nl = max(dot(n, l), 0.0);
  float a = ROUGHNESS * ROUGHNESS;
  float a2 = a * a;
  float d = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * d * d);
  float spec = D * nl * 0.25 * fresnelSchlick(max(dot(h, v), 0.0));
  return vec3(min(spec, 8.0) * SPEC_GAIN);
}
/* High: interference colours of a thin film, zero-mean so it shimmers without tinting. */
vec3 thinFilm(float nv, float t) {
  vec3 phase = vec3(0.0, 0.33, 0.67) + 1.8 * (1.0 - nv) + 0.12 * sin(t * 0.7);
  return 0.5 * cos(TAU * phase);
}
/* High: a rim whose red, green and blue fall off at slightly different rates (dispersion). */
vec3 dispersedRim(float facing) {
  float x = clamp(1.0 - abs(facing), 0.0, 1.0);
  return vec3(pow(x, RIM_POWER * 0.8), pow(x, RIM_POWER), pow(x, RIM_POWER * 1.25)) * RIM_STRENGTH * 0.9;
}
`;

/* ═══════════════════════════════════════════════════════════════════════════
   The cosmos (mid and high, large screens; lib/eversion/cosmos.ts)
   ═══════════════════════════════════════════════════════════════════════════ */

/** A full-screen triangle for the starfield, drawn first (additive over the clear). */
const STARS_VERTEX = `${GLSL_HEADER}
void main() {
  vec2 c = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(c, 0.0, 1.0);
}
`;

function starsFragment(quality: Quality): string {
  return `${GLSL_HEADER}
#define QUALITY ${quality}
${MATERIAL_DEFINES}
uniform vec4 u_cosmos;
uniform float u_pixelRatio;
uniform float u_spin;
uniform vec4 u_colAccent;
out vec4 outColor;
${NOISE_GLSL}
void main() {
  /* The sky drifts a little with the globe's spin: parallax, so the camera reads as moving through space. */
  vec2 p = gl_FragCoord.xy / u_pixelRatio + vec2(u_spin * 14.0, 0.0);
  vec3 c = starfield(p, u_cosmos.z) * u_cosmos.y;
#if QUALITY >= 2
  /* A faint nebula in the accent's hue. */
  float neb = fbm(vec3(p * 0.0024, 0.37 * u_cosmos.z * 0.05));
  c += u_colAccent.rgb * smoothstep(0.45, 0.95, neb) * 0.09 * u_cosmos.y;
#endif
  /* Premultiplied with alpha 0: light added to whatever the clear is. */
  outColor = vec4(c, 0.0);
}
`;
}

/**
 * The bodies: one quad per body (instanced, no vertex buffer), ray-traced as a sphere in the fragment shader.
 * `u_bodyBase` offsets the instance index, so the bodies behind the globe and those in front are two draws.
 */
const COSMOS_VERTEX = `${GLSL_HEADER}
${MATERIAL_DEFINES}
uniform vec4 u_bodyPos[COSMOS_N];
uniform vec4 u_bodyInfo[COSMOS_N];
uniform float u_bodyBase;
uniform vec2 u_viewport;
uniform float u_radius;
out vec2 v_local;
flat out int v_index;
void main() {
  int i = int(u_bodyBase + 0.5) + gl_InstanceID;
  vec4 b = u_bodyPos[i];
  vec4 info = u_bodyInfo[i];
  int kind = int(info.x + 0.5);
  /* How far past the disc the quad reaches: a sun's corona, a ring, an atmosphere's halo. */
  float extent = kind == 0 ? 3.2 : info.z > 0.0 ? 2.45 : (kind == 2 || kind == 4) ? 1.16 : 1.04;
  int k = gl_VertexID % 6;
  vec2 c = vec2(k == 1 || k == 2 || k == 4 ? 1.0 : -1.0, k == 2 || k == 4 || k == 5 ? 1.0 : -1.0);
  /* The globe's camera (vertex shader): on +z at 2 * GLOBE_PERSP * r. */
  float camDist = 2.0 * GLOBE_PERSP * max(u_radius, 1.0);
  float wc = max((camDist - b.z) / camDist, 0.25);
  vec2 centre = b.xy / wc;
  vec2 pos = centre + c * (b.w / wc) * extent;
  gl_Position = info.w > 0.0 ? vec4(pos.x * 2.0 / u_viewport.x, -pos.y * 2.0 / u_viewport.y, 0.0, 1.0)
                             : vec4(2.0, 2.0, 2.0, 1.0);
  v_local = c * extent;
  v_index = i;
}
`;

function cosmosFragment(quality: Quality): string {
  return `${GLSL_HEADER}
#define QUALITY ${quality}
${MATERIAL_DEFINES}
in vec2 v_local;
flat in int v_index;
uniform vec4 u_bodyPos[COSMOS_N];
uniform vec4 u_bodyInfo[COSMOS_N];
uniform vec4 u_bodyAlbedo[COSMOS_N];
uniform vec4 u_bodyAlbedo2[COSMOS_N];
uniform vec4 u_sunPos[2];
uniform vec4 u_sunCol[2];
uniform vec4 u_cosmos;
uniform vec4 u_space;
uniform vec4 u_colVeil;
out vec4 outColor;
${NOISE_GLSL}

/* Ring density across its radius (in planet radii): a few bands with a gap, soft at both edges. */
float ringDensity(float rho) {
  if (rho < 1.32 || rho > 2.4) return 0.0;
  float edge = smoothstep(1.32, 1.42, rho) * (1.0 - smoothstep(2.25, 2.4, rho));
  float bands = 0.55 + 0.45 * sin(rho * 37.0) * sin(rho * 11.0 + 1.3);
  float gap = 1.0 - 0.85 * (1.0 - smoothstep(0.0, 0.04, abs(rho - 1.86)));
  return edge * bands * gap;
}

/* The surface pattern of each kind, on the body's own rotating coordinates. */
vec3 surfaceAlbedo(int kind, vec3 q, vec3 a1, vec3 a2, float seed, float t, out float water) {
  water = 0.0;
  vec3 sp = q * 2.2 + seed;
  if (kind == 3) {
    float warp = fbm(sp * 1.4) * 2.4;
    float bands = 0.5 + 0.5 * sin(q.y * 15.0 + warp);
    vec3 c = mix(a1, a2, bands);
    /* A storm. */
    float storm = 1.0 - smoothstep(0.0, 0.16, length(vec2(q.x * 0.7 - 0.28, q.y - 0.32)));
    return mix(c, a2 * 0.8, storm * 0.8);
  }
  if (kind == 2) {
    float land = smoothstep(0.52, 0.56, fbm(sp * 1.2));
    water = 1.0 - land;
    vec3 c = mix(a1, a2, land);
    float cloud = smoothstep(0.55, 0.8, fbm(sp * 1.8 + vec3(t * 0.04, 0.0, 0.0)));
    return mix(c, mix(a1, vec3(dot(a1, vec3(0.3)) + 0.7), 0.9), cloud * 0.85);
  }
  if (kind == 4) {
    float bands = 0.5 + 0.5 * sin(q.y * 6.0 + fbm(sp) * 1.2);
    return mix(a1, a2, bands * 0.6);
  }
  /* rocky and moons: mottled ground and pocks */
  float n = fbm(sp * 1.6);
  float pock = smoothstep(0.62, 0.7, vnoise(sp * 5.0));
  return mix(a2, a1, n) * (1.0 - 0.3 * pock);
}

/* High: how much of sun k's light reaches world point wp (moons and planets cast shadows on each other). */
float occlusion(vec3 wp, vec3 l, int self) {
#if QUALITY >= 2
  float lit = 1.0;
  for (int j = 0; j < COSMOS_N; j++) {
    if (j == self) continue;
    vec4 o = u_bodyPos[j];
    vec4 info = u_bodyInfo[j];
    if (info.w <= 0.0 || int(info.x + 0.5) == 0) continue;
    vec3 oc = wp - o.xyz;
    float b = dot(oc, l);
    if (b > 0.0) continue;
    float c = dot(oc, oc) - o.w * o.w;
    float h = b * b - c;
    /* soft-edged: the penumbra is the band where the ray grazes the occluder */
    lit *= 1.0 - smoothstep(-0.15, 0.25, h / max(o.w * o.w, 1.0)) * 0.92;
  }
  return lit;
#else
  return 1.0;
#endif
}

void main() {
  int i = v_index;
  vec4 B = u_bodyPos[i];
  vec4 info = u_bodyInfo[i];
  vec4 A = u_bodyAlbedo[i];
  vec4 A2 = u_bodyAlbedo2[i];
  float alpha = info.w;
  vec2 p = v_local;
  float d = length(p);
  float aa = max(fwidth(d), 1e-3);
  int kind = int(info.x + 0.5);
  float t = u_cosmos.z;
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);

  if (kind == 0) {
    /* A star: limb-darkened disc, granulation on high, and a corona added to whatever is behind it. */
    float mu = sqrt(max(1.0 - d * d, 0.0));
    /* White-hot at the centre, the star's colour toward a darkened limb: brighter than any background, so it
       reads as a light source on a light theme too. */
    vec3 core = mix(A.rgb, vec3(1.0), 0.6 * mu) * (0.72 + 0.28 * pow(mu, 0.5));
#if QUALITY >= 2
    core *= 0.92 + 0.16 * fbm(vec3(p * 5.0, t * 0.3));
#endif
    float r = max(d - 1.0, 0.0);
    float corona = exp(-3.2 * r) * 0.55 + exp(-0.75 * r) * 0.16;
#if QUALITY >= 2
    float ang = atan(p.y, p.x);
    corona *= 0.82 + 0.3 * pow(abs(sin(ang * 5.0 + t * 0.12)), 6.0) + 0.12 * fbm(vec3(ang * 2.0, r * 1.5, t * 0.2));
#endif
    corona *= (1.0 - disc) * smoothstep(3.2, 2.2, d);
    vec3 glow = A.rgb * corona * max(A.a, 0.35);
    outColor = vec4((core * disc + glow) * alpha, disc * alpha);
    return;
  }

  /* The sphere's visible point and normal (y down, z toward the viewer), and its place in the world. */
  vec3 N = vec3(p, sqrt(max(1.0 - d * d, 0.0)));
  vec3 wp = B.xyz + N * B.w;
  float rot = t * 0.12 + info.y;
  vec3 q = vec3(N.x * cos(rot) + N.z * sin(rot), N.y, -N.x * sin(rot) + N.z * cos(rot));
  float water;
  vec3 albedo = surfaceAlbedo(kind, q, A.rgb, A2.rgb, info.y, t, water);

  /* Ambient from the sky, and a faint fill from the viewer's side (the globe's own glow) so a moon's night side
     reads as a body, not a hole. */
  vec3 ambient = mix(u_colVeil.rgb, u_space.rgb, u_space.a) * 0.1 + u_sunCol[0].rgb * u_sunCol[0].a * 0.04;
  vec3 light = ambient + u_sunCol[0].rgb * u_sunCol[0].a * 0.1 * max(N.z, 0.0);
  vec3 glint = vec3(0.0);
  vec3 limb = vec3(0.0);
  vec3 L0 = normalize(u_sunPos[0].xyz - wp);
  /* The ring's plane, tilted toward the viewer. */
  vec3 nr = normalize(vec3(0.16, -cos(info.z), sin(info.z)));
  for (int k = 0; k < (QUALITY >= 2 ? 2 : 1); k++) {
    vec4 sun = u_sunCol[k];
    if (sun.a <= 0.0) continue;
    vec3 l = normalize(u_sunPos[k].xyz - wp);
    float nl = max(dot(N, l), 0.0);
    float sh = occlusion(wp, l, i);
#if QUALITY >= 2
    if (info.z > 0.0) {
      /* The ring's shadow on the planet. */
      float tt = -dot(N, nr) / dot(l, nr);
      if (tt > 0.0) sh *= 1.0 - 0.75 * ringDensity(length(N + l * tt));
    }
    if (kind == 2) {
      vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
      glint += sun.rgb * sun.a * pow(max(dot(N, h), 0.0), 90.0) * water * sh * 0.9;
    }
#endif
    light += sun.rgb * sun.a * nl * sh;
    /* Atmosphere: forward-scattered light at the limb, on the lit side. */
    float rim = pow(1.0 - N.z, 2.6) * A.a;
    limb += mix(A.rgb, sun.rgb, 0.55) * rim * smoothstep(-0.25, 0.4, dot(vec3(p, 0.0), l)) * sun.a;
  }
  vec3 col = albedo * light + glint + limb * 0.9;
  vec4 sphere = vec4(col * disc, disc);

  /* An atmosphere's halo just outside the disc. */
  if (A.a > 0.0 && d > 1.0) {
    float h = 1.0 - smoothstep(1.0, 1.14, d);
    float lit = smoothstep(-0.4, 0.5, dot(normalize(vec3(p, 0.0)), L0));
    sphere.rgb += mix(A.rgb, u_sunCol[0].rgb, 0.5) * h * h * A.a * 0.55 * lit * u_sunCol[0].a;
  }

  vec4 outc = sphere;
  if (info.z > 0.0) {
    /* The ring: where the view ray meets its plane, composited in depth order with the planet. */
    float zr = -(p.x * nr.x + p.y * nr.y) / nr.z;
    vec3 rp = vec3(p, zr);
    float dens = ringDensity(length(rp));
    if (dens > 0.0) {
      vec3 rw = B.xyz + rp * B.w;
      vec3 l = normalize(u_sunPos[0].xyz - rw);
      float lit = 0.35 + 0.65 * abs(dot(nr, l));
#if QUALITY >= 2
      /* The planet's shadow on its rings. */
      float b = dot(rp, l);
      float c = dot(rp, rp) - 1.0;
      if (b < 0.0 && b * b - c > 0.0) lit *= 0.12;
#endif
      vec3 rc = mix(A.rgb, A2.rgb, 0.5 + 0.5 * sin(length(rp) * 23.0)) * lit * u_sunCol[0].rgb * u_sunCol[0].a;
      float ra = dens * 0.85;
      vec4 ring = vec4(rc * ra + ambient * ra, ra);
      bool ringInFront = d >= 1.0 || zr > N.z;
      outc = ringInFront ? ring + sphere * (1.0 - ring.a) : sphere + ring * (1.0 - sphere.a);
    }
  }
  outColor = outc * alpha;
}
`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Vertex shader (surface + cage)
   ═══════════════════════════════════════════════════════════════════════════ */

function vertexSource(quality: Quality): string {
  return `${GLSL_HEADER}
#define QUALITY ${quality}
${MATERIAL_DEFINES}
layout(location = 0) in vec2 a_domain;
uniform float u_time;
uniform float u_evert;
uniform float u_wrap;
uniform float u_unwrap;
uniform float u_spin;
uniform float u_tilt;
uniform float u_radius;
uniform vec2 u_centre;
uniform vec2 u_viewport;
uniform float u_ripple;
uniform mat3 u_mAfter;
uniform sampler2D u_lut;
out vec2 v_domain;
out float v_morph;
out vec3 v_nview;
out vec3 v_pos;
out vec2 v_flat;
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

#if QUALITY >= 1
  /* Liquid: a slow, low-order swell travelling over the surface (it rides the body's own (theta, phi), so it
     moves with the eversion), stronger while the sphere turns inside out. Added along the normal in radius units;
     the wrap weight below scales the whole surface back onto the flat page, so the endpoints are untouched. */
  float swell = sin(3.0 * p.x + 2.0 * p.y + 1.7 * u_time) * 0.55
              + sin(-2.0 * p.z + 3.0 * p.x - 1.3 * u_time) * 0.3
              + sin(5.0 * p.y - 2.3 * u_time + 1.1) * 0.15;
  v += nv * swell * LIQUID_SWELL * (0.45 + 0.55 * sin(PI * clamp(u_evert, 0.0, 1.0)));
#endif

  /* Ripples radiate from the camera-facing point (+z) in VIEW space, as a radial push. */
  vec3 vdir = v / max(length(v), 1e-4);
  float dist = acos(clamp(vdir.z, -1.0, 1.0));
  float r0 = rippleAt(u_ripple, dist);
  v += vdir * r0;
  v_ripple = clamp(abs(r0) / RIPPLE_AMPLITUDE, 0.0, 1.0);

  vec3 sphere = vec3(u_centre - 0.5 * u_viewport, 0.0) + v * u_radius;

  /* UNWRAP flattens onto the AFTER page: the vertex goes to the pixel of P(M_after * p), the very lookup its
     back face samples (spec 4.5, 5.5), so the page it lands on is the one the fragment shows. The wrap runs
     with u_unwrap = 1 and the unwrap with u_wrap = 1; at the hand-over every vertex has w = 1, so nothing jumps. */
  bool unwrapping = u_unwrap < 1.0;
  vec3 pl = unwrapping ? u_mAfter * p : p;
  /* The longitude atan2 derives at a pole vertex is noise (cos(phi) is ~1e-7 there and GL's sin/cos are not that
     accurate), which would send each pole-row vertex to a random page column. Lay the pole row out as the
     last LUT row's centre instead: same longitude as its column, extrapolated to the pole just below. */
  float lutRows = float(textureSize(u_lut, 0).y);
  float pitch = PI / lutRows;
  float phiL = clamp(phi, -HALF_PI + 0.5 * pitch, HALF_PI - 0.5 * pitch);
  float cpL = cos(phiL);
  vec3 plL = u_mAfter * vec3(cpL * sin(theta), -sin(phiL), cpL * cos(theta));
  vec2 tp = unwrapping ? vec2(atan(plL.x, plL.z), asin(clamp(-plL.y, -1.0, 1.0))) : vec2(theta, phi);

  /* The two copies of the duplicated equator row must read opposite sides of an equatorial cut (mesh.ts). */
  if (abs(tp.y) < 1e-6) {
    tp.y += (tp.y < 0.0 ? -1.0 : 1.0) * EQUATOR_BIAS * pitch;
  }

  /* The page pixel of the clamped extended UV, in the z = 0 plane (scale exactly 1 there). */
  vec2 uv = lutUv(tp.x, tp.y);
  /* The pole row samples the LUT's last texel row, up to half a texel (and, on a tall Mercator page, up to ~8%
     of the page) short of the true pole; extrapolate its UV past the pole and let the clamp put it on the edge.
     Overshoot is harmless: the pole row is degenerate in 3D and at the flat end the fragments read their own pixel. */
  if (abs(phi) > HALF_PI - 1e-5) {
    uv += (uv - lutUv(tp.x, tp.y - (tp.y < 0.0 ? -1.0 : 1.0) * pitch)) * POLE_EXTRAP;
  }
  uv = clamp(uv, 0.0, 1.0);
  vec3 flatPos = vec3((uv - 0.5) * u_viewport, 0.0);

  /* The wrap wave: the centre curls onto the globe first, the edges follow (morph.ts). */
  float s = min(u_wrap, u_unwrap);
  float d = acos(clamp(pl.z, -1.0, 1.0)) / PI;
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
  v_flat = flatPos.xy;
}
`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Surface fragment shader
   ═══════════════════════════════════════════════════════════════════════════ */

function surfaceFragment(maskDepth: boolean, maskView: boolean, quality: Quality): string {
  return `${GLSL_HEADER}
#define QUALITY ${quality}
${maskDepth && !maskView ? '#define MASK_TO_BACK 1' : ''}
${maskView ? '#define MASK_VIEW 1' : ''}
in vec2 v_domain;
in float v_morph;
in vec3 v_nview;
in vec3 v_pos;
in vec2 v_flat;
in float v_ripple;
uniform float u_azimuthal;
uniform float u_evert;
uniform sampler2D u_lut;
uniform sampler2D u_before;
uniform sampler2D u_after;
uniform sampler2D u_placeholder;
uniform mat3 u_mAfter;
uniform vec2 u_viewport;
uniform float u_unwrap;
uniform float u_afterMix;
uniform float u_pageAlpha;
uniform float u_radius;
uniform vec4 u_colVeil;
uniform vec4 u_colAccent;
uniform vec4 u_colCageMajor;
uniform float u_whiten;
uniform float u_planet;
uniform float u_time;
uniform float u_spin;
uniform float u_tilt;
uniform float u_pixelRatio;
uniform vec3 u_lightDir;
uniform vec4 u_lightCol;
uniform vec4 u_space;
uniform vec4 u_cosmos;
out vec4 outColor;
${LUT_GUARDED_GLSL}
${WEDGE_GLSL}
${quality >= 1 ? MATERIAL_GLSL : ''}
/* A dark page is a WHITE planet (owner, 2026-10-18: on a dark theme the page wrapped on the globe was a black ball
   lost against the dark sky). Its lightness is inverted with the hue kept (c + 1 - 2 L): the dark ground goes near
   white, light text goes dark, mid-tone accents barely move, so the page stays legible. u_whiten is how dark the
   theme's page is (0 on a light theme); u_planet is how much the globe is a planet (cosmos.ts#planetWeight: in
   through WRAP, out through the first half of UNWRAP, uniformly, so no part of the surface is left white as it
   lands). The quick ramp on the morph weight keeps any vertex still on the page plane untouched, so the flat first
   and last frames are the captures to the bit. */
vec3 planetTone(vec3 c) {
  float k = u_whiten * u_planet * clamp(v_morph * 6.0, 0.0, 1.0);
  if (k <= 0.0) return c;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(c, clamp(c + 1.0 - 2.0 * l, 0.0, 1.0), k);
}
void main() {
  float theta = v_domain.x;
  float phi = v_domain.y;
  float cp0 = cos(phi);
  vec3 body = vec3(cp0 * sin(theta), -sin(phi), cp0 * cos(theta));
  vec3 mb = u_mAfter * body;

  /* Which way the surface faces the eye, as a continuous number: the winding normal against the direction to the
     eye (the camera sits on +z over the viewport centre, as the vertex shader's). It drives the mask, which therefore
     has no per-triangle edge; the page SIDE below is still the rasteriser's, an occlusion edge at the silhouette. */
  float camDist = 2.0 * GLOBE_PERSP * max(u_radius, 1.0);
  vec3 toEye = normalize(vec3(0.0, 0.0, camDist) - v_pos);
  float facing = dot(normalize(v_nview), toEye);
  float frontness = quintic5(0.5 + 0.5 * facing / FACING_BAND);

  /* The azimuthal wedge, masked analytically (see WEDGE_CAP_FROM). Geometry side: the cap about the back point of
     the frame the VERTEX's flat position was taken in. Texture side: the cap about the back point of the frame this
     fragment's own lookup is made in, front (BEFORE through the body) and back (AFTER through M_after) blended by
     the facing ramp. */
  float wedgeAmt = wedge();
  if (u_azimuthal > 0.5) {
    wedgeAmt = max(wedgeAmt, mix(wedgeCap(mb), wedgeCap(body), frontness));
    /* Near either end of the eversion one side of the surface is the whole picture (BEFORE outside, AFTER once
       everted). A fragment facing the OTHER way there is the mesh's folded skirt around the back point, not
       geometry the viewer should see: it is glass, fading in with the eversion's distance from the end. */
    float wrongWay = u_evert < 0.5
      ? (1.0 - frontness) * (1.0 - quintic5((u_evert - EVERT_END_FROM) / (EVERT_END_TO - EVERT_END_FROM)))
      : frontness * quintic5((u_evert - (1.0 - EVERT_END_TO)) / (EVERT_END_TO - EVERT_END_FROM));
    wedgeAmt = max(wedgeAmt, wrongWay);
  }
  float wedgeG = wedgeGlass(wedgeAmt);

  /* The flat endpoints ARE the page (S#15: wrap = 0 is the BEFORE capture, the UNWRAP end the AFTER page). Where
     the morph weight is ~0 the fragment shows the page at its own pixel and on the side the phase names, instead
     of trusting the mesh: a triangle whose corners the projection puts on opposite sides of a cut (the Lambert
     corners, the AFTER side's cut, the coarse rows of a tall Mercator page) is stretched across the page, and
     its per-fragment lookup is not the pixel it covers. Under it the shown page is the identity by construction;
     a nonzero weight is past the snap and everything is the lookup again. A young wedge is the same. */
  float flatness = max(1.0 - smoothstep(0.0, FLAT_SNAP, v_morph), wedgeAmt - wedgeG);
  vec2 pageUv = v_pos.xy / u_viewport + 0.5;

  /* 1 = the BEFORE side, 0 = the AFTER side. A blend (not a switch) wherever the page is part way to the flat
     identity, so nothing flips at a threshold. */
  float side = mix(gl_FrontFacing ? 1.0 : 0.0, u_unwrap >= 1.0 ? 1.0 : 0.0, flatness);

  /* Where on which page. Back faces read the AFTER page through M_after: P(M_after * p). */
  vec2 uvF = vec2(0.0);
  vec2 uvB = vec2(0.0);
  if (side > 0.0) uvF = mix(lutUv(theta, phi), pageUv, flatness);
  if (side < 1.0) uvB = mix(lutUv(atan(mb.x, mb.z), asin(clamp(-mb.y, -1.0, 1.0))), pageUv, flatness);
  vec2 uv = mix(uvB, uvF, side);

  /* Across a LUT cut the UV jumps inside one pixel: do not let that pick the lowest mip or smear the edge. */
  vec2 gx = dFdx(uv);
  vec2 gy = dFdy(uv);
  bool cut = max(max(abs(gx.x), abs(gx.y)), max(abs(gy.x), abs(gy.y))) > JUMP_GRAD;
  if (cut) {
    gx = vec2(1e-4, 0.0);
    gy = vec2(0.0, 1e-4);
  }

  /* Gentle Lambert on the VISIBLE side's normal, and the back side's darken + accent tint (Q18); scaled by the
     morph weight, since the flat page must be the capture, untouched. Low keeps the fixed light; mid and high take the
     scene's (it turns toward the cosmos's sun as that arrives, cosmos.ts). */
  vec3 nn = normalize(v_nview);
#if QUALITY >= 1
  vec3 L = normalize(u_lightDir);
  /* The background the glass sits against: the veil, deepened toward space while the cosmos is present. */
  vec3 veil = mix(u_colVeil.rgb, u_space.rgb, u_space.a);
#else
  vec3 L = normalize(LIGHT_DIR);
  vec3 veil = u_colVeil.rgb;
#endif
  float litF = LAMBERT_BASE + LAMBERT_GAIN * max(dot(nn, L), 0.0);
  float litB = LAMBERT_BASE + LAMBERT_GAIN * max(dot(-nn, L), 0.0);
  vec3 page = vec3(0.0);
  if (side > 0.0) {
    vec3 pg = planetTone(textureGrad(u_before, clamp(uvF, 0.0, 1.0), gx, gy).rgb);
    page += side * mix(pg, pg * litF, v_morph);
  }
  if (side < 1.0) {
    vec2 cb = clamp(uvB, 0.0, 1.0);
    vec3 pg = planetTone(
      mix(textureGrad(u_placeholder, cb, gx, gy).rgb, textureGrad(u_after, cb, gx, gy).rgb, u_afterMix));
    vec3 shaded = mix(pg * litB * SIDE_DARKEN, u_colAccent.rgb, SIDE_TINT);
    page += (1.0 - side) * mix(pg, shaded, v_morph);
  }

  /* Glass is "the UV lies outside [0,1]^2"; antialias the page edge with fwidth (hard across a cut). */
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float fw = cut ? 0.0 : fwidth(edge);
  float onPage = clamp(edge / max(fw, 1e-6) + 0.5, 0.0, 1.0) * (1.0 - wedgeG);

  /* Glass: a faint fill and a bright Fresnel rim, present only where the wrap wave has lifted the surface off the
     flat page, so it condenses instead of appearing. A masked wedge is this. */
  float lift = quintic5(v_morph * 2.0);
  /* Clamped: |facing| can round past 1, and pow() of a negative base is undefined (NaN on some mobile GPUs). */
  float rim = pow(clamp(1.0 - abs(facing), 0.0, 1.0), RIM_POWER) * RIM_STRENGTH;
  float glassRim = clamp(rim, 0.0, 1.0) * lift;
  float glassA = clamp(GLASS_FILL * lift + glassRim * GLASS_RIM_ALPHA, 0.0, 1.0);
  vec3 glassRgb = mix(veil, u_colCageMajor.rgb, glassRim);

#if QUALITY >= 1
  /* The liquid-glass material (MATERIAL_GLSL): a clear coat over the page and a dielectric where there is no
     page, lit by the scene's light and a procedural studio environment. Every term is scaled by the morph weight
     (and the glass by its lift), so at the flat endpoints it is exactly zero and the page is the capture. */
  vec3 V = toEye;
  vec3 N = facing >= 0.0 ? nn : -nn;
  N = liquidNormal(N, body, v_morph);
  float nv = max(dot(N, V), 1e-3);
  float F = fresnelSchlick(nv);
  vec3 R = reflect(-V, N);
  vec3 env = envLight(R, L, veil);
  vec3 spec = specularLight(N, V, L) * u_lightCol.rgb;

  /* Page: a thin lacquer. Reflection strongest at grazing angles, where the page is least readable anyway. */
  vec3 coat = mix(page, env, F * COAT_REFLECT) + spec * COAT_SPEC;
  page = mix(page, coat, v_morph);

  /* Glass: what is behind it (the veil, or the starfield seen through it, refracted), the environment at Fresnel
     strength, the highlight, and on high a thin-film shimmer and a dispersed rim. */
  vec3 behind = veil;
#if QUALITY >= 2
  vec2 refr = N.xy * GLASS_REFRACT_PX;
  behind += starfield(gl_FragCoord.xy / u_pixelRatio + refr, u_cosmos.z) * u_cosmos.y;
#endif
  vec3 glass = mix(behind, env, clamp(F * GLASS_REFLECT + 0.06, 0.0, 1.0)) + spec;
#if QUALITY >= 2
  glass += thinFilm(nv, u_time) * F * THIN_FILM;
  glass += dispersedRim(facing) * u_colCageMajor.rgb * lift;
#else
  glass = mix(glass, u_colCageMajor.rgb, glassRim * 0.8);
#endif
  glassA = clamp(glassA + F * 0.5 * lift, 0.0, 1.0);
  glassRgb = glass;
#endif

  vec3 rgb = mix(veil, page, onPage);

  /* Fresnel rim in --cage-major: strongest at the silhouette, on page and glass alike. */
  rgb = mix(rgb, u_colCageMajor.rgb, clamp(rim, 0.0, 1.0) * v_morph);

  /* The whole surface dissolves with the page (amended 2026-10-18): the final dissolve overlaps UNWRAP's tail, so the
     page's antialiased edge, any glass left at it and the clear colour (bgAlpha) all follow u_pageAlpha, and
     nothing is left at the viewport's border when the canvas goes. It is 1 until the reveal. */
  float a = u_pageAlpha;

  /* Where there is no page the surface is glass over the background (the clear colour) it sits against. */
#if QUALITY >= 1
  rgb = mix(rgb, mix(veil, glassRgb, glassA), (1.0 - onPage) * lift);
#endif
  /* A masked wedge: the glass over the veil it sits against (the clear colour), in place of the page. */
  rgb = mix(rgb, mix(veil, glassRgb, glassA), wedgeG);

  outColor = vec4(rgb * a, a);
#ifdef MASK_VIEW
  /* The e2e's view of the mask itself: red is the wedge amount, green marks a surface fragment. It never pushes
     the fragment back (MASK_TO_BACK is off): the nearest sheet shows, so the field is not cut by depth contests. */
  outColor = vec4(wedgeAmt, 1.0, 0.0, 1.0);
#endif
#ifdef MASK_TO_BACK
  /* A masked wedge goes to the back, so a stretched triangle can never hide real page (see WEDGE_CAP_FROM). It
     leaves the surface quickly so the depth contest with real page is decided where the mask is faint. */
  gl_FragDepth = mix(gl_FragCoord.z, MASK_DEPTH, quintic5(wedgeG * MASK_DEPTH_RATE));
#endif
}
`;
}

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
in vec2 v_flat;
in float v_morph;
in float v_ripple;
uniform sampler2D u_lut;
uniform vec2 u_viewport;
uniform mat3 u_mAfter;
uniform float u_unwrap;
uniform float u_azimuthal;
uniform float u_cageAlpha;
uniform float u_cageWidth;
uniform float u_pixelRatio;
uniform vec4 u_colCageMinor;
uniform vec4 u_colCageParallel;
uniform vec4 u_colCageMajor;
uniform vec4 u_colCageRipple;
out vec4 outColor;
${LUT_GUARDED_GLSL}
${WEDGE_GLSL}

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

  float fade = 1.0 - wedgeGlass(wedge());
  float a = max(wm, wp) * u_cageAlpha * v_morph * fade;
  a = clamp(a + v_ripple * max(mer, par) * u_colCageRipple.a * u_cageAlpha * v_morph * fade, 0.0, 1.0);
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

/**
 * The real shader set, for a tier (see {@link Quality}; no tier is the low set, the original shading).
 */
export function getShaderSet(options: { maskView?: boolean; tier?: Tier } = {}): ShaderSet {
  const maskView = options.maskView === true;
  const quality = qualityForTier(options.tier);
  const vertex = vertexSource(quality);
  return {
    surface: { vertex, fragment: surfaceFragment(false, maskView, quality) },
    surfaceMasked: { vertex, fragment: surfaceFragment(true, maskView, quality) },
    cage: { vertex, fragment: CAGE_FRAGMENT },
    feedback: { vertex: FEEDBACK_VERTEX, fragment: FEEDBACK_FRAGMENT, varyings: ['v_F'] },
    cosmos: quality >= 1 ? { vertex: COSMOS_VERTEX, fragment: cosmosFragment(quality) } : null,
    stars: quality >= 1 ? { vertex: STARS_VERTEX, fragment: starsFragment(quality) } : null,
    quality,
  };
}
