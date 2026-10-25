/**
 * The liquid globe's **material**: a thick, gelatinous glass ball, drawn as one
 * fragment shader over the disc (owner, 2026-10-21: "make the liquid globe more
 * jelly refractive reflective like a gelatinous glass surface").
 *
 * The wireframe, the pins and every gesture stay where they were — on the 2D
 * cage canvas and in the DOM — and this is a single layer laid between them and
 * the veil. It owns only what a glass ball does to LIGHT:
 *
 * - **Reflection.** A studio environment (a softbox window up-left, a bright sky
 *   above, a dark floor) mirrored in the surface, weighted by Fresnel, so the
 *   rim brightens at grazing angles and the face stays clear.
 * - **Specular.** A sharp key glint and a broad bloom from the same light, plus a
 *   small kicker opposite it.
 * - **Transmission.** What a ball lens does to the room behind it: the sky is
 *   seen upside-down, as a bright band at the bottom of the ball, and the key
 *   light focuses into a soft caustic on the far side — tinted by the theme
 *   accent, which is the jelly's faint subsurface colour.
 * - **Absorption.** Thickness-weighted body tint, densest where the ball is
 *   thickest, plus a darker edge where light travels furthest through it.
 *
 * ## Plasmatic Jelly, clipped to the sphere
 *
 * The site material (CLAUDE.md "Design system: Plasmatic Jelly") is drawn for every other surface by the slab
 * services on rounded RECTANGLES; the globe is excluded from all of them (`GLOBE_SELECTOR`, lib/jelly/tiers.ts) and
 * draws the same physical layers here, on the circle and on the dough's displaced material, so they squash with it:
 *
 * - **Haze, always moving.** The slab haze's flow-map current (`haze-shader.ts`: curl-bent drift, two-phase
 *   crossfade, ~140 CSS px features, the same `NOISE_GLSL`) at `--site-jelly-haze`, quiet in the interior
 *   (`--site-jelly-quiet`) and full in the rim band. Time comes from the globe's own frame loop on the jelly ambient
 *   clock (`jellyBudget().clockHz`, idle floor, 0 when Still / hidden / off screen); `uAmp` 0 freezes it.
 * - **Dormant plasma.** A core and ridged filaments in `--site-accent`, clipped inside the sphere (0 within 3 px of
 *   the limb, full by 14 px), invisible at rest, woken on hover, bright while pressed, and rung by every ripple
 *   front — a press's charge running through the gel. It never draws an outline.
 * - **RGB-led rim.** A soft `--gel-bevel` band just inside the limb split into `--gel-edge-r/-g/-b`, offset by
 *   `--gel-disperse-*` (red toward the top-left key light, blue away), plus the 1 px `--gel-fresnel` hairline.
 * - **No gloss across the face.** The studio reflection is Fresnel-weighted to the limb, the key glint lives only
 *   near the edge, and the old transmitted sky band is gone; the dent keeps its sheen and lit wall.
 *
 * Refraction of the STRUCTURE inside the ball (the back of the cage, the far
 * pins) is not done here: it is geometry, applied in `LiquidGlobe`'s projection
 * (`lensScale`), so those lines stay vector-crisp and cost nothing extra. The
 * shader would have to sample the cage as a texture every frame to do the same
 * thing worse.
 *
 * ## What it costs
 *
 * A uniform glass sphere looks the same however it is turned, so the material
 * does not depend on the globe's rotation at all. It is redrawn when the
 * SURFACE changes — a ripple is travelling, the soft body is deformed, the plasma
 * level is easing — and otherwise only on the jelly ambient clock (60 Hz engaged,
 * 30 Hz idle, never while Still, hidden, off screen or everting). Spinning alone
 * issues no GL work. One context is created per page and reused by every
 * mount of the globe, so opening the menu never compiles a shader twice.
 */

import { CONTACT, DOUGH_EXTENT, DOUGH_N } from '@/lib/dough';
import { GLASS_OPTICS_GLSL } from '@/lib/liquid/optics';
import { NOISE_GLSL } from '@/lib/liquid/glass/jelly-glsl';
import { LIQUID_GLOBE_MATERIAL_GLSL } from '@/lib/liquid/globe-material';
import type { SharedScene } from '@/lib/liquid/glass/scene-store';

/** Everything the material needs for one frame. All coordinates are in radii of the sphere, y DOWN. */
export interface JellyFrame {
  /**
   * Up to three live ripples: screen-space unit vector to the impact (after the
   * globe's rotation, z toward the viewer) and the ripple's age in seconds. A
   * negative age is an empty slot.
   */
  ripples: Float32Array;
  /** The dough body's grab point and press pressure (see `lib/dough.ts`); the field itself goes up with `setField`. */
  gx: number;
  gy: number;
  pinch: number;
  /** Haze clock, seconds — advanced only while the ambient clock runs. */
  time: number;
  /** Haze motion amplitude: 1 lively, `CALM.amplitude` calm, 0 still (a frozen, static haze). */
  amp: number;
  /** Eased dormant-plasma level: `PLASMA.rest` 0, `PLASMA.wake` on hover, `PLASMA.press` 1 while pressed. */
  plasma: number;
}

/** A theme colour with its alpha, 0–1 sRGB (not premultiplied). */
export type JellyRGBA = [number, number, number, number];

/** Colours resolved from the theme, 0–1 sRGB. */
export interface JellyPalette {
  ink: [number, number, number];
  /** 1 on a light ground, 0 on a dark one. */
  light: number;
  /** The page ground, so the image refracted through the ball is washed toward what actually surrounds it. */
  bg: [number, number, number];
  /** `--site-accent`: the plasma. */
  accent: [number, number, number];
  /** `--site-jelly-haze` with the pane haze alpha (`--site-jelly-haze-pane`). */
  haze: JellyRGBA;
  /** `--site-jelly-quiet`: interior damping of the haze, so the motion behind the pins is a low-contrast drift. */
  quiet: number;
  /** `--gel-edge-r/-g/-b`: the RGB-led rim band. */
  edgeR: JellyRGBA;
  edgeG: JellyRGBA;
  edgeB: JellyRGBA;
  /** `--gel-fresnel`: the 1 px edge. */
  fresnel: JellyRGBA;
  /** `--gel-bevel` and `--gel-disperse-r/-b`, CSS px. */
  bevelPx: number;
  disperseRPx: number;
  disperseBPx: number;
  /** Plasma alpha at level 1 at the core (`PLASMA_LOOK.peakDark` / `peakLight`). */
  plasmaPeak: number;
}

/**
 * Mip level the refracted page is read at. The hub blurs the page behind the globe only lightly (`--hub-page-blur`, 6px) because the ball itself blurs it; a ball
 * showing a SHARPER picture of the thing behind it than the thing itself would read as a sticker, not a lens.
 */
export const JELLY_SCENE_LOD = 5;

/** The ripple's shape — kept in step with `lib/fluid` §RIPPLE by the caller. */
export interface JellyRippleShape {
  speed: number;
  width: number;
  amplitude: number;
  life: number;
}

/**
 * Device-pixel ceiling. The material is gradients and soft glints — nothing in
 * it has a hard edge but the limb, which is antialiased in the shader — so a
 * 1.5x buffer is indistinguishable from 2x at 56% of the fill.
 */
export const JELLY_MAX_DPR = 1.5;

/**
 * The canvas hangs outside the disc on every side by this fraction of the disc's DIAMETER (the same 11% as the cage),
 * because the dough can push the silhouette past its rest position. `radial.css` sizes the canvas from the same number.
 */
export const JELLY_BLEED = 0.11;
/** Half the canvas, in radii of the sphere. */
export const JELLY_EXTENT = 1 + 2 * JELLY_BLEED;

/**
 * The globe's plasma gain over a slab's `PLASMA_LOOK` peak. A slab's plasma is kept faint because body text sits on
 * it; the ball carries no running text (only pins, whose dots are opaque and whose labels sit on the reticle side),
 * and the plasma is the material's identity here, so it may glow brighter — still clipped inside the limb, still 0
 * at rest. At level 1: dark peak 0.14 × 2.5 = 0.35 alpha of `--site-accent` at the core.
 */
export const GLOBE_PLASMA_GAIN = 2.5;

/** Max live ripples the shader takes; matches `MAX_RIPPLES` in LiquidGlobe. */
export const JELLY_RIPPLES = 3;

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vP;
uniform float uE;
void main() {
  // Screen-handed: x right, y DOWN, in radii of the sphere. The canvas spans ±uE radii.
  vP = vec2(aPos.x, -aPos.y) * uE;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vP;
out vec4 outColor;
uniform float uPx;
uniform vec3 uInk;
uniform float uLight;
uniform vec4 uRip[${JELLY_RIPPLES}];
uniform vec4 uShape;
// The dough field: R,G = in-plane displacement of the material that rests at that point, B = height. Half float, linear.
uniform sampler2D uField;
uniform vec2 uContact;
uniform float uPress;
// The page, refracted. uPlace = (centre x, centre y, radius) in viewport CSS px, already shifted by the scroll since the
// snapshot was taken; uSceneInv = 1 / snapshot size.
uniform sampler2D uScene;
uniform vec4 uPlace;
uniform vec2 uSceneInv;
uniform float uSceneOn;
uniform float uLod;
uniform vec3 uBg;
// Plasmatic Jelly layers (see the header). uRpx = sphere radius in CSS px, for px-sized features and clips.
uniform float uRpx;
uniform float uTime;
uniform float uAmp;
uniform float uPlasma;
uniform float uPlasmaPeak;
uniform vec3 uAccent;
uniform vec4 uHaze;
uniform float uQuiet;
uniform vec4 uEdgeR;
uniform vec4 uEdgeG;
uniform vec4 uEdgeB;
uniform vec4 uFresnel;
uniform vec3 uBevel; // x = band width, y = red shift, z = blue shift; CSS px

const float EXTENT = ${DOUGH_EXTENT.toFixed(4)};
const float CONTACT_R = ${CONTACT.toFixed(4)};
const float CELL = ${((2 * DOUGH_EXTENT) / (DOUGH_N - 1)).toFixed(5)};

${GLASS_OPTICS_GLSL}
${LIQUID_GLOBE_MATERIAL_GLSL}
${NOISE_GLSL}

// The haze: the slab haze's flow-map current, on the sphere's own material coordinates (CSS px / 140), so it squashes
// with the dough. Returns the density 0..1; uAmp 0 holds it at the mean.
float globeHaze(vec2 X, float rimBand) {
  float t = uTime * 0.8;
  vec2 p = X * uRpx / 140.0 + 7.3;
  vec2 flow = vec2(0.5, 0.33) + jCurl(p * 0.5 + t * 0.03) * 0.8;
  float ph0 = fract(t * 0.08), ph1 = fract(t * 0.08 + 0.5);
  float w = abs(ph0 * 2.0 - 1.0);
  vec2 warp = 0.35 * vec2(jFbm(p + vec2(t * 0.05, 0.0)), jFbm(p + vec2(5.2, 1.3 - t * 0.04))) - 0.175;
  float density = mix(jFbm(p + warp * 1.6 - flow * ph0 * 1.2), jFbm(p + warp * 1.6 - flow * ph1 * 1.2 + 0.37), w);
  return mix(0.5, density, mix(uQuiet, 1.0, rimBand) * uAmp);
}

// The dormant plasma: a soft core and ridged filaments, clipped inside the limb (0 within 3 px, full by 14 px). Exactly
// 0 at level 0 with no ripple front, so a resting globe shows none. ring = how strongly a ripple front is passing.
float globePlasma(vec2 X, float r, float ring) {
  if (uPlasma <= 0.001 && ring <= 0.001) return 0.0;
  float d = (1.0 - r) * uRpx;
  float clip = smoothstep(3.0, 14.0, d);
  if (clip <= 0.0) return 0.0;
  float t = uTime;
  vec2 drift = vec2(jNoise(vec2(1.7, t * 0.15)), jNoise(vec2(t * 0.13, 4.2))) - 0.5;
  vec2 pc = X - drift * 0.3;
  float core = exp(-dot(pc, pc) / 0.16);
  float n = jFbm(X * uRpx / 90.0 + 13.0 + vec2(t * 0.05, -t * 0.04));
  float fil = pow(1.0 - abs(2.0 * n - 1.0), 6.0) * exp(-dot(pc, pc) / 1.1);
  float body = core * 0.65 + fil * 0.55;
  return clamp(clip * (uPlasma * body + ring * (0.6 + 0.4 * fil + 0.3 * core)), 0.0, 1.0) * uPlasmaPeak;
}

// One channel of the RGB-led rim: a soft band uBevel.x wide just inside the limb of a circle shifted by 'shift' px
// along the key light (positive = toward the top-left).
float globeEdgeBand(vec2 X, float shift) {
  vec2 L = normalize(vec2(-0.5, -0.62));
  float rr = length(X - L * (shift / uRpx));
  float inner = (1.0 - rr) * uRpx;
  float w = max(uBevel.x, 1.0);
  return exp(-pow((inner - w * 0.5) / (w * 0.5), 2.0)) * step(0.0, inner + 0.5);
}

vec3 field(vec2 q) {
  return texture(uField, q / (2.0 * EXTENT) + 0.5).xyz;
}

float wave(float age, float dist) {
  if (age < 0.0 || age >= uShape.w) return 0.0;
  float q = (dist - uShape.x * age) / uShape.y;
  if (abs(q) > 4.0) return 0.0;
  float d = 1.0 - age / uShape.w;
  return uShape.z * (1.0 - q * q) * exp(-0.5 * q * q) * d * d;
}

void main() {
  vec2 p = vP;

  // Which material is at this pixel? The field says where each piece of material went (p = X + u(X)), so invert it:
  // two fixed-point passes are exact for the small, smooth displacements the dough allows. Where the field pushed the
  // limb outward, X falls inside the disc and the silhouette bulges.
  vec2 X = p - field(p).xy;
  X = p - field(X).xy;
  float h = field(p).z;

  float r2 = dot(X, X);
  float r = sqrt(r2);
  float aa = max(fwidth(r), uPx * 0.75);
  float inside = 1.0 - smoothstep(1.0 - aa * 1.5, 1.0, r);
  if (inside <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  vec3 n = vec3(X, sqrt(max(0.0, 1.0 - min(r2, 1.0))));

  // Ripples bend the surface normal, so the light itself runs over the wave.
  float crest = 0.0;
  for (int i = 0; i < ${JELLY_RIPPLES}; i++) {
    vec4 rip = uRip[i];
    if (rip.w < 0.0) continue;
    float c = clamp(dot(n, rip.xyz), -1.0, 1.0);
    float dist = acos(c);
    float hh = wave(rip.w, dist);
    float slope = (wave(rip.w, dist + 0.03) - wave(rip.w, dist - 0.03)) / 0.06;
    vec3 t = rip.xyz - n * c;
    float tl = length(t);
    if (tl > 1e-4) n = normalize(n + (t / tl) * slope * 2.2);
    crest += max(hh, 0.0);
  }

  // The dough's own surface. The height field tilts the normal wherever the dough has been pushed: a wall of the dent
  // leans toward its centre, the shoulder leans away, so the studio's window and glints bend around every dent and
  // ridge, wherever the finger has been, instead of at one fixed point.
  float e = CELL * 1.25;
  vec2 gh = vec2(
    field(p + vec2(e, 0.0)).z - field(p - vec2(e, 0.0)).z,
    field(p + vec2(0.0, e)).z - field(p - vec2(0.0, e)).z
  ) / (2.0 * e);
  n = normalize(vec3(n.xy - gh * 1.7, n.z));

  float nz = max(n.z, 0.0);
  float rim = 1.0 - nz;
  vec3 v = vec3(0.0, 0.0, 1.0);
  vec3 rf = reflect(-v, n);

  // ── Reflection: the studio, mirrored, weighted by Fresnel ──
  float fres = glassFresnel(nz).g;
  vec3 environment = globeEnvironment(rf, vec3(0.0), vec3(1.0));
  float floorDark = smoothstep(-0.1, 0.8, rf.y);
  // Shine lives at the edges: the studio is seen in the limb (Fresnel), the face stays clear of a gloss band.
  float refl = environment.g * fres * smoothstep(0.45, 0.95, r);

  // ── Specular: a small hard glint at the window's hot spot, and a kicker ──
  vec3 L1 = normalize(vec3(-0.5, -0.62, 0.6));
  float k1 = max(dot(n, normalize(L1 + v)), 0.0);
  float spec = globeSpecular(n, v) * smoothstep(0.62, 0.92, r);

  // ── The rim: thick glass is brightest in a hairline right at the limb, and darkest just inside it ──
  float rimLine = smoothstep(0.935, 0.99, r) * (1.0 - smoothstep(0.99, 1.0, r));
  float band = smoothstep(0.7, 0.93, r) * (1.0 - smoothstep(0.93, 0.99, r));
  float hair = 1.0 - smoothstep(0.0, aa * 1.6, abs(r - (1.0 - aa * 0.8)));

  // ── Transmission: the room behind, upside-down, and the key light focused into a crescent ──
  float thick = nz;
  vec3 entryPoint = vec3(X, sqrt(max(0.0, 1.0 - min(r2, 1.0))));
  vec3 exitG;
  vec3 throughRay = glassSphereRay(entryPoint, n, GLASS_IOR_RGB.g, exitG);
  vec2 cdir = normalize(vec2(0.62, 0.78));
  float along = max(dot(r > 1e-4 ? X / r : vec2(0.0), cdir), 0.0);
  float crescent = exp(-pow((r - 0.8) / 0.085, 2.0)) * pow(along, 7.0);
  vec2 dc = X - cdir * 0.55;
  float caustic = crescent * 0.5 + exp(-dot(dc, dc) / 0.09) * 0.07;

  // ── Dough: thinner and brighter under the finger, a soft occlusion in the dent, a faint stress glow ──
  vec2 cg = X - uContact;
  float stress = uPress * exp(-dot(cg, cg) / (2.0 * CONTACT_R * CONTACT_R));
  float dent = smoothstep(0.0, 0.14, -h);
  // A dent in clear gel is read from broad shading on its walls, not from a pin-prick glint: the wall facing the key
  // light is lit, the far wall falls into shadow, and a soft sheen rolls over the shoulder. All of it scales with the
  // dough's own tilt, so an undisturbed ball is exactly as lit as before.
  vec2 tilt = gh * 1.7;
  float bent = smoothstep(0.02, 0.35, length(tilt));
  float emboss = dot(tilt, normalize(vec2(-0.5, -0.62)));
  float litWall = max(-emboss, 0.0) * bent;
  float darkWall = max(emboss, 0.0) * bent;
  float sheen = pow(k1, 14.0) * 0.5 * bent;
  // The shoulder is where the pushed-out material banks up: it catches the light as a thin bright lip.
  float lip = smoothstep(0.004, 0.05, h) * bent;

  // ── Absorption ──
  float body = mix(0.035, 0.085, thick) + uLight * 0.015;
  body = body * (1.0 - 0.45 * dent) + dent * 0.05;
  float edge = band * mix(0.12, 0.2, uLight) + smoothstep(0.86, 1.0, r) * mix(0.03, 0.1, uLight);
  edge += darkWall * 0.15;

  // Composite, premultiplied. Body and edge are a tinted medium (over); the light is added on top of it.
  vec3 hi = vec3(1.0);
  vec3 col = uBg * body + uInk * edge * (1.0 - body);
  float a = body + edge * (1.0 - body);
  col *= 1.0 - floorDark * 0.25 * fres;

  // ── The haze: a translucent gel moving inside the ball, quiet behind the pins, full in the rim band ──
  float rimBand = smoothstep(0.7, 0.95, r);
  float hazeA = uHaze.a * (0.5 + 0.5 * globeHaze(X, rimBand)) * mix(0.75, 1.0, rimBand);
  col = col * (1.0 - hazeA) + uHaze.rgb * hazeA;
  a = a + hazeA * (1.0 - a);

  // ── The page, seen through the ball ──
  // Air -> glass -> air for each wavelength. The background plane is three
  // radii behind the centre, beyond the focal point, so the ball inverts it.
  if (uSceneOn > 0.001) {
    vec3 exitR, exitB;
    vec3 rayR = glassSphereRay(entryPoint, n, GLASS_IOR_RGB.r, exitR);
    vec3 rayB = glassSphereRay(entryPoint, n, GLASS_IOR_RGB.b, exitB);
    vec3 sampleR = glassSphereSample(exitR, rayR, -3.0);
    vec3 sampleG = glassSphereSample(exitG, throughRay, -3.0);
    vec3 sampleB = glassSphereSample(exitB, rayB, -3.0);
    vec2 uvR = (uPlace.xy + sampleR.xy * uPlace.z) * uSceneInv;
    vec2 uvG = (uPlace.xy + sampleG.xy * uPlace.z) * uSceneInv;
    vec2 uvB = (uPlace.xy + sampleB.xy * uPlace.z) * uSceneInv;
    // Premultiplied, and not opaque everywhere: what the capture could not paint is transparent (rgb 0), so its
    // coverage weights the page in. Taken as opaque, those texels (smeared further by the mip blur) darkened the ball.
    vec4 sG = textureLod(uScene, uvG, uLod);
    float sa = sG.a;
    vec3 page = vec3(
      textureLod(uScene, uvR, uLod).r,
      sG.g,
      textureLod(uScene, uvB, uLod).b
    );
    page = mix(page, uBg * sa, 0.28);
    float la = uSceneOn * (1.0 - smoothstep(0.9, 1.0, r)) * 0.94
      * min(sampleR.z, min(sampleG.z, sampleB.z));
    col = col * (1.0 - la * sa) + page * la;
    a = a * (1.0 - la * sa) + la * sa;
  }

  vec3 glow = hi;
  float lightA = refl * 0.7 + spec + rimLine * 0.38 + crest * 3.2 * (0.4 + fres) + stress * 0.06;
  lightA += litWall * 0.42 + sheen + lip * 0.22;
  float transA = caustic * (1.0 - fres * 0.5);
  col += hi * lightA + glow * transA;
  a += lightA * 0.85 + transA * 0.7;

  // ── Dormant plasma, inside the gel: woken by hover, bright under the finger, rung by each ripple front ──
  float ring = clamp(crest * 18.0, 0.0, 1.0);
  float pa = globePlasma(X, r, ring);
  col = col * (1.0 - pa) + uAccent * pa;
  a = a + pa * (1.0 - a);

  // ── The refracting edge: the RGB split leads (red toward the light, blue away), white is the 1 px Fresnel line ──
  vec2 dir = r > 1e-4 ? X / r : vec2(0.0);
  float facing = dot(dir, normalize(vec2(-0.5, -0.62)));
  vec3 rgbEdge =
      uEdgeR.rgb * uEdgeR.a * globeEdgeBand(X, uBevel.y) * (0.6 + 0.4 * facing)
    + uEdgeG.rgb * uEdgeG.a * globeEdgeBand(X, 0.0) * 0.6
    + uEdgeB.rgb * uEdgeB.a * globeEdgeBand(X, uBevel.z) * (0.6 - 0.4 * facing);
  rgbEdge *= 2.2;
  col += rgbEdge + uFresnel.rgb * uFresnel.a * hair;
  a += max(rgbEdge.r, max(rgbEdge.g, rgbEdge.b)) + uFresnel.a * hair;

  a = clamp(a, 0.0, 1.0) * inside;
  col = min(col, vec3(a)) * inside;
  outColor = vec4(col, a);
}`;

type GL = WebGL2RenderingContext;

interface Uniforms {
  e: WebGLUniformLocation | null;
  px: WebGLUniformLocation | null;
  ink: WebGLUniformLocation | null;
  light: WebGLUniformLocation | null;
  rip: WebGLUniformLocation | null;
  shape: WebGLUniformLocation | null;
  field: WebGLUniformLocation | null;
  contact: WebGLUniformLocation | null;
  press: WebGLUniformLocation | null;
  scene: WebGLUniformLocation | null;
  place: WebGLUniformLocation | null;
  sceneInv: WebGLUniformLocation | null;
  sceneOn: WebGLUniformLocation | null;
  lod: WebGLUniformLocation | null;
  bg: WebGLUniformLocation | null;
  rpx: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  amp: WebGLUniformLocation | null;
  plasma: WebGLUniformLocation | null;
  plasmaPeak: WebGLUniformLocation | null;
  accent: WebGLUniformLocation | null;
  haze: WebGLUniformLocation | null;
  quiet: WebGLUniformLocation | null;
  edgeR: WebGLUniformLocation | null;
  edgeG: WebGLUniformLocation | null;
  edgeB: WebGLUniformLocation | null;
  fresnel: WebGLUniformLocation | null;
  bevel: WebGLUniformLocation | null;
}

/** The driver's last compile/link message, kept for diagnostics: a silent fallback is how an engine-specific shader bug hides. */
export let lastShaderError = '';

function compile(gl: GL, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    lastShaderError = gl.getShaderInfoLog(s) ?? 'shader compile failed';
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/**
 * One GL context, one program, one full-screen triangle. WebGL 2 because the dough field is a half-float texture that
 * must filter linearly, which WebGL 1 only offers behind extensions that are missing on parts of the mobile fleet.
 * Without WebGL 2 `create()` returns null and the globe keeps its CSS material (the cage and pins still deform).
 */
export class JellyGlass {
  readonly canvas: HTMLCanvasElement;
  private gl: GL | null = null;
  private u: Uniforms | null = null;
  private tex: WebGLTexture | null = null;
  private sceneTex: WebGLTexture | null = null;
  private sceneVersion = -1;
  private px = 0;
  private cssPx = 0;
  private lost = false;
  private uploaded = -1;
  /** Called when the context is lost or restored, so the owner can swap to or from the CSS material. */
  onChange: (() => void) | null = null;

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.className = 'radial-globe__jelly';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.gl = null;
      this.u = null;
      this.tex = null;
      this.sceneTex = null;
      this.sceneVersion = -1;
      this.onChange?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.px = 0;
      this.uploaded = -1;
      this.sceneVersion = -1;
      this.init();
      this.onChange?.();
    });
  }

  static create(): JellyGlass | null {
    const g = new JellyGlass(document.createElement('canvas'));
    return g.init() ? g : null;
  }

  /** Whether frames drawn now will show. */
  get ready(): boolean {
    return !this.lost && this.gl !== null;
  }

  private init(): boolean {
    const opts: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    };
    const gl = this.canvas.getContext('webgl2', opts) as GL | null;
    if (!gl) return false;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      lastShaderError = gl.getProgramInfoLog(prog) ?? 'program link failed';
      return false;
    }
    gl.useProgram(prog);
    // One oversized triangle covers the viewport with no diagonal seam.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    // The dough field: DOUGH_N² RGBA half floats, linear, clamped. Starts at rest (all zero).
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      DOUGH_N,
      DOUGH_N,
      0,
      gl.RGBA,
      gl.FLOAT,
      new Float32Array(DOUGH_N * DOUGH_N * 4),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const loc = (name: string) => gl.getUniformLocation(prog, name);
    this.u = {
      e: loc('uE'),
      px: loc('uPx'),
      ink: loc('uInk'),
      light: loc('uLight'),
      rip: loc('uRip'),
      shape: loc('uShape'),
      field: loc('uField'),
      contact: loc('uContact'),
      press: loc('uPress'),
      scene: loc('uScene'),
      place: loc('uPlace'),
      sceneInv: loc('uSceneInv'),
      sceneOn: loc('uSceneOn'),
      lod: loc('uLod'),
      bg: loc('uBg'),
      rpx: loc('uRpx'),
      time: loc('uTime'),
      amp: loc('uAmp'),
      plasma: loc('uPlasma'),
      plasmaPeak: loc('uPlasmaPeak'),
      accent: loc('uAccent'),
      haze: loc('uHaze'),
      quiet: loc('uQuiet'),
      edgeR: loc('uEdgeR'),
      edgeG: loc('uEdgeG'),
      edgeB: loc('uEdgeB'),
      fresnel: loc('uFresnel'),
      bevel: loc('uBevel'),
    };
    // Until a palette arrives the jelly layers are off (no haze, no plasma, no rim colour); radius 1 avoids a /0.
    gl.uniform1f(this.u.rpx, 1);
    gl.uniform1i(this.u.field, 0);
    gl.uniform1i(this.u.scene, 1);
    gl.uniform1f(this.u.lod, JELLY_SCENE_LOD);
    gl.uniform1f(this.u.sceneOn, 0);
    gl.uniform1f(this.u.e, JELLY_EXTENT);
    this.tex = tex;
    this.gl = gl;
    this.px = 0;
    return true;
  }

  /**
   * Size the backing store for a disc `cssPx` across. The canvas is larger than the disc by `JELLY_BLEED` on each
   * side so the silhouette has somewhere to go. Only on mount and on a real resize — never per frame.
   */
  resize(cssPx: number, dpr: number): void {
    const px = Math.max(
      1,
      Math.round(cssPx * (1 + 2 * JELLY_BLEED) * Math.min(dpr, JELLY_MAX_DPR)),
    );
    if (px === this.px && cssPx === this.cssPx) return;
    this.px = px;
    this.cssPx = cssPx;
    this.canvas.width = px;
    this.canvas.height = px;
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u) return;
    gl.viewport(0, 0, px, px);
    // One pixel, in radii of the sphere (the canvas spans 2·JELLY_EXTENT radii).
    gl.uniform1f(u.px, (2 * JELLY_EXTENT) / px);
    // The sphere's radius in CSS px: the jelly layers size their features and clips in CSS px, like the slabs'.
    gl.uniform1f(u.rpx, Math.max(1, cssPx / 2));
  }

  palette(p: JellyPalette, shape: JellyRippleShape): void {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u) return;
    gl.uniform3f(u.ink, p.ink[0], p.ink[1], p.ink[2]);
    gl.uniform3f(u.bg, p.bg[0], p.bg[1], p.bg[2]);
    gl.uniform1f(u.light, p.light);
    gl.uniform4f(u.shape, shape.speed, shape.width, shape.amplitude, shape.life);
    gl.uniform3f(u.accent, p.accent[0], p.accent[1], p.accent[2]);
    gl.uniform4f(u.haze, p.haze[0], p.haze[1], p.haze[2], p.haze[3]);
    gl.uniform1f(u.quiet, p.quiet);
    gl.uniform4f(u.edgeR, p.edgeR[0], p.edgeR[1], p.edgeR[2], p.edgeR[3]);
    gl.uniform4f(u.edgeG, p.edgeG[0], p.edgeG[1], p.edgeG[2], p.edgeG[3]);
    gl.uniform4f(u.edgeB, p.edgeB[0], p.edgeB[1], p.edgeB[2], p.edgeB[3]);
    gl.uniform4f(u.fresnel, p.fresnel[0], p.fresnel[1], p.fresnel[2], p.fresnel[3]);
    // The band offsets are the tokens negated, exactly as --gel-edge does it in CSS: red's negative token lands it
    // toward the top-left light, blue's positive one away from it.
    gl.uniform3f(u.bevel, p.bevelPx, -p.disperseRPx, -p.disperseBPx);
    gl.uniform1f(u.plasmaPeak, Math.min(1, p.plasmaPeak * GLOBE_PLASMA_GAIN));
  }

  /** Send the dough body's field to the GPU. A no-op when `version` is what it already holds. */
  setField(data: Float32Array, version: number): void {
    const gl = this.gl;
    if (!gl || !this.tex || this.lost || version === this.uploaded) return;
    this.uploaded = version;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, DOUGH_N, DOUGH_N, gl.RGBA, gl.FLOAT, data);
  }

  /**
   * Hand the shader the page snapshot to refract (or `null` to stop). Uploaded once per new picture and mip-mapped, so
   * the globe can read it at the hub's blur radius. Returns whether a picture is now in use.
   */
  setScene(scene: SharedScene | null): boolean {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u || this.lost) return false;
    if (!scene) {
      gl.uniform1f(u.sceneOn, 0);
      this.sceneVersion = -1;
      return false;
    }
    if (scene.version !== this.sceneVersion) {
      if (!this.sceneTex) this.sceneTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      // Premultiplied, so the mip chain averages coverage rather than smearing transparent black into the page.
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene.bitmap);
      } catch {
        gl.uniform1f(u.sceneOn, 0);
        return false;
      } finally {
        // Unpack state is global; the dough field's float uploads must not be premultiplied.
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      }
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);
      this.sceneVersion = scene.version;
    }
    gl.uniform2f(u.sceneInv, 1 / Math.max(1, scene.width), 1 / Math.max(1, scene.height));
    gl.uniform1f(u.sceneOn, 1);
    return true;
  }

  /**
   * Where the disc is, in viewport CSS px, for mapping a pixel to a place on the snapshot: the centre, the radius, and how
   * far the page has scrolled since the snapshot was taken. Called when the globe has settled and on resize — never per
   * frame, because it is measured from layout.
   */
  place(cx: number, cy: number, radiusCss: number, scrollDx: number, scrollDy: number): void {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u || this.lost) return;
    gl.uniform4f(u.place, cx + scrollDx, cy + scrollDy, radiusCss, 0);
  }

  render(f: JellyFrame): void {
    const gl = this.gl;
    const u = this.u;
    if (!gl || !u || this.lost) return;
    gl.uniform4fv(u.rip, f.ripples);
    gl.uniform2f(u.contact, f.gx, f.gy);
    gl.uniform1f(u.press, f.pinch);
    gl.uniform1f(u.time, f.time);
    gl.uniform1f(u.amp, f.amp);
    gl.uniform1f(u.plasma, f.plasma);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

let shared: JellyGlass | null | undefined;

/**
 * The page's one material instance, created on first use. `null` when WebGL is
 * unavailable or the program will not compile — the globe keeps its CSS glass.
 */
export function acquireJellyGlass(): JellyGlass | null {
  if (shared === undefined) shared = JellyGlass.create();
  return shared;
}

/**
 * Resolve any CSS colour to 0–1 sRGB WITH its alpha (the `--gel-*` tokens are translucent), by letting the canvas
 * parse it onto a transparent pixel. One 1×1 2D context per call, used at mount and on theme change only.
 */
export function resolveRgba(css: string, fallback: JellyRGBA): JellyRGBA {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const a = d[3]! / 255;
    if (a <= 0) return [0, 0, 0, 0];
    // getImageData is un-premultiplied already.
    return [d[0]! / 255, d[1]! / 255, d[2]! / 255, a];
  } catch {
    return fallback;
  }
}

/**
 * Resolve any CSS colour (`rgb()`, `color(srgb …)`, `oklch()`, `color-mix()` as
 * computed) to 0–1 sRGB by letting the canvas parse it. One 1×1 2D context, used
 * once per mount.
 */
export function resolveColor(
  css: string,
  fallback: [number, number, number],
): [number, number, number] {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0]! / 255, d[1]! / 255, d[2]! / 255];
  } catch {
    return fallback;
  }
}
