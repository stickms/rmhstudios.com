/**
 * The haze program (01 §2.6): what moves INSIDE a jelly slab. Drawn into a low-res `.jelly-haze-canvas` (≤ 256px on
 * its long side, `policy.ts` `hazeScaleFor`) under the rim canvas, on the ambient clock, for the ambient slots only.
 *
 * - **Current.** Flow-map advection with a two-phase crossfade (the standard water flow-map technique): a steady drift
 *   along the role's axis, bent by a slow curl field, sampled twice half a cycle apart so neither sample stretches.
 * - **Eddies.** One level of domain warping, rotating slowly (`uFlow.y`; 0 on chrome, which only flows).
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
uniform float uAmp;      // motion amplitude: 1 lively, CALM.amplitude under calm
uniform float uPlasmaMotion; // dormant plasma motion: 1 lively, PLASMA_LOOK.calmMotion under calm

${SDF_GLSL}
${NOISE_GLSL}
${PLASMA_GLSL}

void main() {
  vec2 P = vec2(gl_FragCoord.x, uSize.y * uScale.y - gl_FragCoord.y) / uScale;  // CSS px, y down
  vec2 hs = uSize * 0.5;
  float r = min(uRadius, min(hs.x, hs.y));
  float d = -sdRoundRect(P - hs, hs, r);
  if (d < -1.0) { outColor = vec4(0.0); return; }
  float cover = smoothstep(-1.0, 0.5, d);

  float t = uTime * uFlow.x;
  vec2 p = P / 140.0 + uSeed * 17.0;

  vec2 axis = vec2(cos(uFlow.z), sin(uFlow.z));
  vec2 flow = axis * 0.6 + jCurl(p * 0.5 + t * 0.03) * 0.8;
  float ph0 = fract(t * 0.08), ph1 = fract(t * 0.08 + 0.5);
  float w = abs(ph0 * 2.0 - 1.0);
  vec2 warp = uFlow.y * vec2(jFbm(p + vec2(t * 0.05, 0.0)), jFbm(p + vec2(5.2, 1.3 - t * 0.04))) - 0.5 * uFlow.y;
  float n0 = jFbm(p + warp * 1.6 - flow * ph0 * 1.2);
  float n1 = jFbm(p + warp * 1.6 - flow * ph1 * 1.2 + 0.37);
  float density = mix(n0, n1, w);

  float band = 1.0 - smoothstep(uBezel, uBezel + 24.0, d);
  float k = mix(uQuiet, 1.0, band) * uAmp;
  float dens = mix(0.5, density, k);

  float hazeA = uHaze.a * (0.5 + 0.5 * dens);

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
