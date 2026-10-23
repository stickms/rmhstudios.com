/**
 * The haze program (01 §2.6): what moves INSIDE a jelly slab. Drawn into a low-res `.jelly-haze-canvas` (≤ 256px on
 * its long side, `policy.ts` `hazeScaleFor`) under the rim canvas, on the ambient clock, for the ambient slots only.
 *
 * - **Current.** Flow-map advection with a two-phase crossfade (the standard water flow-map technique): a steady drift
 *   along the role's axis, bent by a slow curl field, sampled twice half a cycle apart so neither sample stretches.
 *   The field it carries is a warped fbm body plus soft ridged filaments, so the current reads as streaks, not a veil.
 * - **Eddies.** Three counter-rotating Gaussian vortices per surface, wandering slowly, turn the field into spiral
 *   arms within each flow-map phase; under them one level of domain warping churns slowly (`uFlow.y` scales both; 0
 *   on chrome, which only flows).
 * - **Plasma only at the crests.** Colour appears where the density field peaks, mostly near the rim.
 * - **Subsurface rim glow.** Light entering at the lit edge and scattering inward through the haze.
 * - **Quiet interior.** Full contrast in the rim band, damped toward the mean by `uQuiet` further in, so the motion
 *   behind text is a low-contrast drift (01 §5).
 *
 * - **Dormant plasma (#989).** `jPlasma` (`jelly-glsl.ts`): a core and filaments clipped inside the gel, invisible at
 *   `uLevel` 0, woken by hover, bright on press, rung by charge pulses (`uRings`), in the accent colour. Its own motion
 *   runs at `uPlasmaMotion` (1 lively, 0.5 calm); it is drawn here for haze slots only (the rim draws it otherwise).
 *   No broad gloss: the only light is the subsurface glow entering at the lit EDGE.
 *
 * Feature size ≈ 140 CSS px, so the field is low-frequency and the CSS upscale is invisible. Alpha is capped at 0.6
 * here and the legibility gate caps the token values far below that. Output is premultiplied.
 */
import { NOISE_GLSL, PLASMA_GLSL, SDF_GLSL } from './jelly-glsl';

/**
 * The haze's look constants (V1 retune: "the eddies and internal currents within the plasmatic jelly is not present").
 * Measured on /jelly in Midnight after the G1 retune, the hero pane's interior moved ~1 luma level per 750 ms and its
 * interior alpha spanned ~3/255: the value-noise fbm sat near its mean, the two-phase crossfade averaged it further and
 * `--site-jelly-quiet` (0.35) kept a third of what was left. Outside the bevel (`edgeBoost`) nothing here raises the
 * haze's alpha RANGE — that is the
 * `--site-jelly-haze-*` tokens' job, bounded by `lib/__tests__/jelly-legibility.test.ts` (hazeA spans α/2..α at any
 * density) — these decide how much of that range the moving field actually uses, and what shape it moves in.
 *
 * Every rate below is checked against `AMBIENT_BOUNDS` (lib/jelly/tiers.ts) at flow speed 1 (the role maximum; `calm`
 * and the theme gain only slow it): see the per-constant notes.
 */
export const HAZE_LOOK = {
  /**
   * Density remap (smoothstep edges) of the combined field, which lives in ~0.25–0.75 after the crossfade. Narrow on
   * purpose: the bodies stay ≥ 120 px (`AMBIENT_BOUNDS.minFeatureSizePx`) but their fronts are crisp, and a moving
   * front is what the eye catches at the low contrast the legibility bound leaves (a soft 140 px ramp drifting a few
   * px/s is below threshold, above all on a light ground where that bound is ~4 sRGB levels).
   */
  densityLo: 0.38,
  densityHi: 0.62,
  /**
   * The current: the flow-map's travel rate (field units per second per unit of flow; the flow is the role axis × 0.6
   * plus the curl field × 0.4, |flow| ≲ 1.1) and its phase length. 0.035 × 1.1 × 140 ≈ 5.4 px/s, so the current plus
   * the fastest eddy point stays ≤ 12 px/s even where they line up.
   */
  driftRate: 0.035,
  flowPhaseS: 12.5,
  /** Undamped flow band inside the rim, CSS px past the bevel: visible currents run along the edges. */
  edgeFlowPx: 44,
  /** Domain-warp strength of the fbm (the slow churn under the eddies) and the rate its warp field turns. */
  eddyWarp: 1.6,
  eddyRate: 0.06,
  /**
   * Eddies: three Gaussian vortices per surface, each turning the field about its centre. Radius in field units
   * (1 unit = 140 CSS px). The fastest point of a vortex is at r = R/√2, moving ω·R/√2·e^-½ ≈ 0.43·ω·R units/s:
   * 0.43 × 0.095 × 1.15 × 140 ≈ 6.6 px/s. The angle resets with the flow-map phase (12.5 s at speed 1, crossfaded), so a
   * vortex turns at most ω·12.5 ≈ 1.2 rad before it fades into the next phase: arms form, never wind to a point.
   */
  vortexRadius: 1.15,
  vortexSpin: 0.095,
  /** How far each vortex centre wanders (units) and how fast (rad/s): ≤ 0.35 × 0.05 × 140 ≈ 2.5 px/s. */
  vortexWander: 0.35,
  vortexWanderRate: 0.05,
  /**
   * Currents: soft ridged filaments of a lower-frequency noise (1 unit = 200 CSS px, so a filament's spacing stays
   * ≥ 120 px), mixed with the fbm body. Ridge exponent > 1 thins the crests into streaks; kept low so a streak is a
   * soft band, not a line.
   */
  currentWeight: 0.5,
  currentScale: 0.7,
  currentSharp: 2.2,
  /**
   * Extra swing inside the bevel only (d < bezel, fading out over its inner 60%): ±`edgeBoost` × α/2 on top of the
   * α/2…α range, plus ± the theme's `--site-jelly-haze-edge` (absolute alpha), so the currents visibly run along every
   * edge. The bevel is the refracting rim band, never under text
   * (a button's label sits below its 11 px bevel; a card's padding is ≥ its bevel's fading half), which is the one
   * place the haze may leave the range jelly-legibility.test.ts bounds for glyphs. On a light ground that bound is ~4
   * sRGB levels behind text, so these edges carry most of what a person sees moving there.
   */
  edgeBoost: 1.0,
} as const;

export const HAZE_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uSize;      // surface size, CSS px
uniform vec2 uScale;     // backing px per CSS px (x, y)
uniform float uRadius;   // corner radius, CSS px
uniform float uBezel;    // rim band width, CSS px
uniform float uTime;     // ambient clock, seconds (one value per frame for every surface)
uniform float uSeed;     // per-surface 0..1
uniform vec4 uHaze;      // haze colour rgb + role haze alpha
uniform vec3 uPlasmaA;
uniform vec3 uPlasmaB;
uniform float uPlasma;   // role plasma strength x theme gain
uniform vec3 uFlow;      // x = speed, y = eddy amount, z = current axis (radians)
uniform float uQuiet;    // interior damping (--site-jelly-quiet)
uniform float uEdge;     // extra bevel swing, absolute alpha (--site-jelly-haze-edge)
uniform float uAmp;      // motion amplitude: 1 lively, CALM.amplitude under calm
uniform float uPlasmaMotion; // dormant plasma motion: 1 lively, PLASMA_LOOK.calmMotion under calm

${SDF_GLSL}
${NOISE_GLSL}
${PLASMA_GLSL}

// Visibility of the currents (G1, V1). The interior is still damped toward the mean by uQuiet (text sits there); these
// decide how much of the haze's allowed range the flow actually uses and how far in from the rim it runs undamped.
const float DENSITY_LO = ${HAZE_LOOK.densityLo.toFixed(3)};
const float DENSITY_HI = ${HAZE_LOOK.densityHi.toFixed(3)};
const float EDGE_FLOW_PX = ${HAZE_LOOK.edgeFlowPx.toFixed(1)};
const float EDDY_WARP = ${HAZE_LOOK.eddyWarp.toFixed(2)};
const float EDDY_RATE = ${HAZE_LOOK.eddyRate.toFixed(3)};
const float VORTEX_R = ${HAZE_LOOK.vortexRadius.toFixed(3)};
const float VORTEX_SPIN = ${HAZE_LOOK.vortexSpin.toFixed(3)};
const float VORTEX_WANDER = ${HAZE_LOOK.vortexWander.toFixed(3)};
const float VORTEX_WANDER_RATE = ${HAZE_LOOK.vortexWanderRate.toFixed(3)};
const float CURRENT_W = ${HAZE_LOOK.currentWeight.toFixed(3)};
const float CURRENT_SCALE = ${HAZE_LOOK.currentScale.toFixed(3)};
const float CURRENT_SHARP = ${HAZE_LOOK.currentSharp.toFixed(3)};
const float FLOW_PHASE_S = ${HAZE_LOOK.flowPhaseS.toFixed(2)};
const float EDGE_BOOST = ${HAZE_LOOK.edgeBoost.toFixed(3)};
const float DRIFT_RATE = ${HAZE_LOOK.driftRate.toFixed(4)};

// One eddy: turn q about centre c by up to 'ang' radians, Gaussian in distance (differential rotation: spiral arms).
vec2 jSwirl(vec2 q, vec2 c, float ang) {
  vec2 v = q - c;
  float a = ang * exp(-dot(v, v) / (VORTEX_R * VORTEX_R));
  float cs = cos(a), sn = sin(a);
  return c + mat2(cs, sn, -sn, cs) * v;
}

// The field at q after tau seconds of flow-map travel: drift along the axis and the curl field, turned by the
// surface's eddies, then the warped fbm body plus the ridged current filaments. Returns ~0..1.
float jHazeField(vec2 q, vec2 flow, float tau, float t, vec2 cells, float spin) {
  q -= flow * tau;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 home = cells * vec2(0.22 + 0.28 * fi, fract(0.31 + 0.37 * fi + uSeed * 0.6) * 0.7 + 0.15);
    vec2 wob = VORTEX_WANDER * vec2(sin(t * VORTEX_WANDER_RATE + fi * 2.1 + uSeed * 6.3),
                                    cos(t * VORTEX_WANDER_RATE * 0.8 + fi * 1.7 + uSeed * 4.1));
    // Alternate the spin direction so neighbouring eddies counter-rotate, as real ones do.
    float dir = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    q = jSwirl(q, home + wob + uSeed * 17.0, dir * spin * tau);
  }
  vec2 warp = uFlow.y * (vec2(jFbm(q + vec2(t * EDDY_RATE, 0.0)), jFbm(q + vec2(5.2, 1.3 - t * EDDY_RATE * 0.8))) - 0.5);
  float body = jFbm(q + warp * EDDY_WARP);
  float rn = jFbm(q * CURRENT_SCALE + vec2(11.7, 3.1) + warp * 0.6);
  float ridge = pow(1.0 - abs(2.0 * rn - 1.0), CURRENT_SHARP);
  return mix(body, ridge, CURRENT_W);
}

void main() {
  vec2 P = vec2(gl_FragCoord.x, uSize.y * uScale.y - gl_FragCoord.y) / uScale;  // CSS px, y down
  vec2 hs = uSize * 0.5;
  float r = min(uRadius, min(hs.x, hs.y));
  float d = -sdRoundRect(P - hs, hs, r);
  if (d < -1.0) { outColor = vec4(0.0); return; }
  float cover = smoothstep(-1.0, 0.5, d);

  float t = uTime * uFlow.x;
  vec2 p = P / 140.0 + uSeed * 17.0;
  vec2 cells = uSize / 140.0;

  vec2 axis = vec2(cos(uFlow.z), sin(uFlow.z));
  vec2 flow = axis * 0.6 + jCurl(p * 0.5 + t * 0.03) * 0.4;
  // Flow-map phases (FLOW_PHASE_S at speed 1): each sample travels for at most one phase, then fades as the other
  // takes over, so neither sample ever stretches far and an eddy never winds to a point.
  float ph0 = fract(t / FLOW_PHASE_S), ph1 = fract(t / FLOW_PHASE_S + 0.5);
  float w = abs(ph0 * 2.0 - 1.0);
  float spin = VORTEX_SPIN * uFlow.y;
  float n0 = jHazeField(p, flow * DRIFT_RATE, ph0 * FLOW_PHASE_S, t, cells, spin);
  float n1 = jHazeField(p + 0.37, flow * DRIFT_RATE, ph1 * FLOW_PHASE_S, t, cells, spin);
  // The crossfade averages two half-correlated samples toward 0.5; stretch the result back to the full 0..1 the
  // legibility bound already assumes (hazeA spans α/2..α at ANY density, jelly-legibility.test.ts).
  float density = smoothstep(DENSITY_LO, DENSITY_HI, mix(n0, n1, w));

  float band = 1.0 - smoothstep(uBezel, uBezel + EDGE_FLOW_PX, d);
  float k = mix(uQuiet, 1.0, band) * uAmp;
  float dens = mix(0.5, density, k);

  float rimZone = 1.0 - smoothstep(uBezel * 0.4, uBezel, d);
  float hazeA = max(0.0, uHaze.a * (0.5 + 0.5 * dens) + rimZone * uAmp * (density - 0.5) * (EDGE_BOOST * uHaze.a + 2.0 * uEdge));

  float crest = smoothstep(0.62, 0.86, mix(0.5, density, uAmp));
  vec3 plasma = mix(uPlasmaA, uPlasmaB, smoothstep(0.3, 0.7, jNoise(p * 0.7 - t * 0.02)));
  float plasmaA = uPlasma * crest * mix(0.35, 1.0, band);

  vec2 g = sdGrad(P - hs, hs, r);
  float facing = 0.5 + 0.5 * dot(g, normalize(vec2(-0.46, -0.62)));
  float sss = exp(-max(d, 0.0) / 18.0) * facing * (0.6 + 0.4 * dens) * uPlasma * 1.4;

  vec3 col = uHaze.rgb * hazeA + plasma * (plasmaA + sss);
  float a = clamp(hazeA + plasmaA + sss, 0.0, 0.6);
  // Dormant plasma behind the haze crests: 0 at rest, so a resting surface is exactly the haze above.
  float pa = jPlasma(P, uSize, d, uSeed, uTime * uPlasmaMotion);
  col = col * (1.0 - pa) + uAccent * pa;
  a = clamp(a + pa * (1.0 - a), 0.0, 0.6);
  outColor = vec4(min(col, vec3(a)) * cover, a * cover);
}`;
