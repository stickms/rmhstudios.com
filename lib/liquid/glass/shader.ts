/**
 * The glass slab shader. One fragment program draws any rounded-rect glass surface from its size, radius and bevel.
 *
 * The slab is modelled, not decorated. A rounded-rect signed distance gives each pixel its depth `d` inside the
 * edge; a convex bevel height field `h(d)` (steep at the rim, flat inside `uBezel`) gives it a surface normal; and
 * everything the eye reads as glass follows from that normal:
 *
 * - **Refraction.** A ray straight down meets the surface, bends by Snell's law (air → N-BK7 crown glass) and travels
 *   the glass thickness before it reaches the page, so the page seen at the rim comes from `thickness · tan(θ₁ - θ₂)`
 *   away. Red, green and blue have independent wavelength-dependent indices and rays, which is where dispersion comes
 *   from. The page is a snapshot texture (`uScene`); with none, the rim is simply not refracted.
 * - **Reflection.** Fresnel reflectance (Schlick) brightens grazing angles; a fixed key light up-left and the CURSOR
 *   (a point light above the surface) add Blinn-Phong glints that slide around the bevel as it moves; a dimmer
 *   counter-glint on the far edge is the light bouncing inside the slab.
 *
 * The INTERIOR is deliberately left transparent: only the bevel band is painted opaque (the refracted page), fading
 * to nothing where the surface goes flat — which is also where refraction goes to zero, so there is no seam and no
 * double image. Everything inside is the live DOM showing through, so video, typing and feeds never go stale under
 * the glass. A flat pane of glass does not bend what is behind it either.
 *
 * Output is premultiplied alpha. GLSL ES 3.00 (WebGL 2), no derivatives: anti-aliasing is one CSS pixel by
 * construction (`uPx`), so the look does not depend on an engine's `fwidth`.
 *
 * ## Plasmatic Jelly (01 §2.7, 02 §1.3)
 *
 * The slab is jelly now, not clear glass, and keeps everything above. Additions, all static per surface — the rim
 * still never reads a clock (24 full-res slabs on a clock would be ~17M fragments per refresh; the motion lives in the
 * low-res haze canvas under it):
 *
 * - **Haze veil.** The refracted band is veiled with the surface's haze colour (`uHaze`), and the dispersion spread
 *   is softened to `uDispersion` (0.8) of crown glass's.
 * - **No plasma outline.** The inner edge line is light only; plasma lives inside the gel (#989, below).
 * - **Squish.** A woken Tier L lattice (`uJelly[8]`, `uJellyOn`) moves the edge along its normal, full at the rim and
 *   zero `min(2·bevel, bevel + 8)` px inside, so the lit edge squishes and the interior — where text sits — does not.
 *   The canvas may overdraw its host by `uMargin` (≤ 2px) so an outward bulge is not clipped; bulges never exceed it.
 *
 * ## #989 material layers (on top of the above)
 *
 * - **Edge refraction, RGB-led.** A soft band `uBand.x` px inside the edge (`--gel-bevel`) carries a distinct R/G/B
 *   split: each channel's band is displaced in screen space by `uDisperse` px (`--gel-disperse-r/-g/-b`, signed:
 *   negative = toward the top-left key light, so red leans to the light and blue away) and tinted `uEdgeR/G/B`
 *   (`--gel-edge-r/-g/-b`), so the fringes separate along the lit and the shaded edges and merge along the others.
 *   White is secondary (a weak core where all three overlap). Refracting slabs also split their snapshot samples the
 *   same way. Plus a 1 CSS px Fresnel edge (`uFresnel`, `--gel-fresnel`).
 * - **Molded shoulder** (2026-10-25, `uMold` = `--gel-mold`, `--gel-feather`). The slab rises out of the ground instead
 *   of being outlined on it: the outermost pixels dissolve into the ground over `uMold.y` px, the shoulder that faces
 *   the key light catches a broad soft sheen, and the far shoulder rolls down into shadow — darkened toward black,
 *   never drawn in the theme's ink, which on a dark ground is light and would draw a line. With the mould on, nothing
 *   bright may sit on the outermost pixels where the bevel is steepest (every specular, the inner stroke, the near-edge
 *   shade and the Fresnel line fade out there), and the RGB band moves inward onto the shoulder, so the dispersion reads
 *   as light inside the jelly, not as a coloured outline: it widens to a soft tint across the shoulder. All of it stays inside the outer 60% of the bevel, clear of
 *   the padding text sits in. `uMold.x` 0 is the pre-2026-10-25 outlined rim, exactly.
 * - **Gel depth** (`--gel-body` → `--gel-depth`) is the host's CSS coat (`--liquid-coat`); the shader does not draw it
 *   again.
 * - **No gloss across the face.** Every specular term is masked to the bevel band (`edgeOnly`); there is no sheen
 *   band, no face bloom and no cursor hotspot on the flat face. Shine lives at the edges and in the dent.
 * - **Dormant plasma** (`jPlasma`, `jelly-glsl.ts`) in the interior for slabs WITHOUT a haze canvas (`uPlasmaInRim`;
 *   a haze slot draws its own, moving). Static here: the rim still never reads a clock.
 * - **The dent** (`uDentOn`, `uDent` = x, y, depth 0..1, σ px; `lib/jelly/lattice-inputs.ts` `dentOf`): a soft rim glow
 *   around the bowl and a specular light dot (`uSpecular`, `--gel-specular`) on its far slope, away from the light.
 *   `uDentStretch` stretches the slab's distance field toward a drag that left the element (rubber band), never past
 *   `uMargin`. The outline indent itself is the lattice's (`uJelly`), not drawn twice.
 */

import { GLASS_OPTICS_GLSL } from '../optics';
import { LATTICE_GLSL, NOISE_GLSL, PLASMA_GLSL, SDF_GLSL } from './jelly-glsl';

export const VERT = `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uSize;        // surface size, CSS px
uniform float uPx;         // one device pixel, CSS px
uniform float uRadius;     // corner radius, CSS px
uniform float uBezel;      // bevel width, CSS px
uniform float uThickness;  // glass thickness behind the bevel, CSS px (how far refraction reaches)

uniform sampler2D uScene;  // page snapshot, row 0 = top
uniform vec4 uSceneMap;    // x,y = scene position of the surface's top-left (CSS px); z,w = 1/scene size
uniform float uSceneOn;    // 0..1, fades the refracted rim in

uniform vec4 uTint;        // the surface's own tint (rgb, alpha) — the refracted rim must match the interior
uniform vec3 uRim;         // colour of the light (the theme's glass-light)
uniform vec3 uInk;         // the theme's ink: what the shaded side of the slab is drawn with
uniform float uDark;       // 1 on a dark ground
uniform vec3 uLight;       // cursor light: x,y in surface CSS px, z = height above the surface
uniform float uLightOn;    // 0..1
uniform vec2 uTilt;        // smoothed unit-disc cursor pose; optical tilt only, no text transform

uniform float uMargin;     // canvas overdraw past the host on every side, CSS px (0..2)
uniform float uSeed;       // per-surface 0..1
uniform vec4 uHaze;        // haze colour rgb + the role's haze alpha
uniform float uDispersion; // 1.0 = crown glass, 0.8 = jelly

// #989 material layers
uniform vec3 uDisperse;    // R/G/B band displacement, px (--gel-disperse-r/-g/-b); negative = toward the light
uniform vec2 uBand;        // x = RGB band depth inside the edge, px (--gel-bevel); y = band gain
uniform vec4 uEdgeR;       // the band's channel tints + alpha (--gel-edge-r/-g/-b)
uniform vec4 uEdgeG;
uniform vec4 uEdgeB;
uniform vec4 uFresnel;     // 1px Fresnel edge colour + alpha (--gel-fresnel)
uniform float uPlasmaInRim; // 1 when this slab has no haze canvas: the dormant plasma is drawn here
uniform vec4 uDent;        // dent x, y (host px), depth 0..1, sigma px
uniform vec2 uDentStretch; // rubber-band stretch, px
uniform float uDentOn;
uniform vec4 uSpecular;    // dent light dot colour + alpha (--gel-specular)
uniform vec2 uMold;        // x = shoulder depth 0..1.5 (--gel-mold), y = edge feather px (--gel-feather)

${GLASS_OPTICS_GLSL}
${SDF_GLSL}
${NOISE_GLSL}
${LATTICE_GLSL}
${PLASMA_GLSL}

float jBand(float x, float w) { return exp(-(x * x) / (w * w)); }

void main() {
  // CSS px, y down, origin at the HOST's top-left (the canvas starts uMargin px outside it).
  vec2 P = vec2(gl_FragCoord.x, (uSize.y + 2.0 * uMargin) / uPx - gl_FragCoord.y) * uPx - uMargin;
  vec2 hs = uSize * 0.5;
  vec2 q = P - hs;
  float r = min(uRadius, min(hs.x, hs.y));
  float sd0 = sdRoundRect(q, hs, r);
  float sd = sd0;
  // Rubber band: a drag that left the element stretches the slab toward it, more on the leading side.
  if (uDentOn > 0.5) {
    float sl = length(uDentStretch);
    if (sl > 0.01) {
      vec2 sdir = uDentStretch / sl;
      float lead = clamp(dot(q, sdir) / max(dot(abs(sdir), hs), 1.0), 0.0, 1.0);
      sd = max(sdRoundRect(q - uDentStretch * lead, hs, r), sd0 - uMargin);
    }
  }
  // Tier L squish: move the edge along its normal by the lattice offset there, only within the rim band.
  if (uJellyOn > 0.5) {
    float bz0 = max(uBezel, 2.0);
    float fallJ = 1.0 - smoothstep(bz0, min(2.0 * bz0, bz0 + 8.0), -sd);
    if (fallJ > 0.0) {
      float push = dot(jellyOffset(P, uSize), sdGrad(q, hs, r));
      sd -= min(push, uMargin) * fallJ;
    }
  }
  float d = -sd;                                  // depth inside the (squished) edge, px
  if (d < -uPx) {
    outColor = vec4(0.0);
    return;
  }
  float mold = clamp(uMold.x, 0.0, 1.5);
  float moldOn = min(mold, 1.0);
  float cover = smoothstep(-uPx, uPx * 0.5 + max(uMold.y, 0.0), d);

  // ── Bevel geometry ──
  float bz = max(uBezel, 2.0);
  float t = clamp(d / bz, 0.0, 1.0);
  float tt = max(t, 0.035);
  // Convex squircle profile h = bz·(1 - (1 - t)^3)^(1/3); its slope is finite everywhere but the very rim.
  float inner = max(1.0 - pow(1.0 - tt, 3.0), 1e-4);
  float slope = t >= 1.0 ? 0.0 : min(pow(1.0 - tt, 2.0) / pow(inner, 2.0 / 3.0), 4.5);
  // Outward unit normal of the boundary, by central differences of the distance field.
  vec2 g = sdGrad(q, hs, r);
  // A gentle ~2.6 degree optical rock toward the cursor. It changes the rim's
  // refraction and reflections without shifting pixels of live text or the hit area.
  vec3 n = normalize(vec3(g * slope + uTilt * 0.045, 1.0));
  // Shine lives at the edges: every specular term below is confined to the bevel band.
  float edgeOnly = 1.0 - smoothstep(0.6, 1.0, t);

  vec3 key = normalize(vec3(-0.46, -0.62, 0.64));
  vec2 Ld = normalize(key.xy);                    // toward the top-left key light, screen space
  float sh = dot(g, Ld);                          // +1 on edges that face the light

  // ── Refraction of the page, in the bevel band only ──
  vec4 rim = vec4(0.0);
  float band = (1.0 - smoothstep(0.55, 1.0, t)) * uSceneOn;
  if (band > 0.001) {
    vec2 base = P + uSceneMap.xy;
    // Jelly disperses a little less than crown glass: the spread around green is scaled by uDispersion.
    vec3 ior = GLASS_IOR_RGB.g + (GLASS_IOR_RGB - GLASS_IOR_RGB.g) * uDispersion;
    // RGB-led: the channels are also split along the light direction (negative disperse = toward it).
    float fall = 1.0 - t;
    vec2 uvR = (base + glassSlabOffset(n, ior.r, uThickness) - Ld * uDisperse.r * fall) * uSceneMap.zw;
    vec2 uvG = (base + glassSlabOffset(n, ior.g, uThickness) - Ld * uDisperse.g * fall) * uSceneMap.zw;
    vec2 uvB = (base + glassSlabOffset(n, ior.b, uThickness) - Ld * uDisperse.b * fall) * uSceneMap.zw;
    vec4 sR = texture(uScene, uvR);
    vec4 sG = texture(uScene, uvG);
    vec4 sB = texture(uScene, uvB);
    // The picture is premultiplied and NOT opaque everywhere: anything it could not paint (a WebGL canvas, a region no
    // background covers) is transparent, i.e. rgb 0. Painting those texels as an opaque rim is what turned the edges
    // black once a snapshot landed; the sampled coverage keeps them clear, so the live DOM shows through instead.
    float sa = sG.a;
    vec3 c = vec3(sR.r, sG.g, sB.b);
    // The slab's own tint, so the rim matches the interior it fades into.
    c = mix(c, uTint.rgb * sa, uTint.a);
    // Jelly is slightly hazy, not perfectly clear: veil the refracted band with the haze.
    c = mix(c, uHaze.rgb * sa, uHaze.a * 0.45);
    rim = vec4(c, sa) * band;
  }

  // ── Light (edges only) ──
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 fillL = normalize(vec3(0.55, 0.5, 0.67));
  float fres = glassFresnel(n.z).g;
  float keySpec = pow(max(dot(n, normalize(key + V)), 0.0), 120.0) * 0.8 * edgeOnly;
  float fillSpec = pow(max(dot(n, normalize(fillL + V)), 0.0), 70.0) * 0.26 * edgeOnly;

  // The cursor is a point light hovering above the glass; it glints on the bevel, never as a hotspot on the face.
  vec3 toL = vec3(uLight.xy - P, uLight.z);
  float distL = length(toL);
  vec3 Lc = toL / max(distL, 1e-3);
  float reach = uLight.z * 2.4;
  float fallL = uLightOn / (1.0 + (distL * distL) / (reach * reach));
  float curSpec = pow(max(dot(n, normalize(Lc + V)), 0.0), 80.0) * 1.3 * fallL * edgeOnly;

  // The inner edge: a thin bright line, strongest on the edges that face a light.
  float stroke = (1.0 - smoothstep(0.0, uPx * 1.8, d - uPx * 0.5)) * smoothstep(-uPx, 0.0, d);
  float facing = 0.5 + 0.5 * sh;
  float facingC = 0.5 + 0.5 * dot(g, normalize(uLight.xy - P + 1e-3)) * uLightOn;
  float lineK = stroke * (0.18 + 0.55 * facing + 0.5 * facingC * uLightOn) * (1.0 - moldOn);

  // A dimmer glint on the far edge: light bouncing inside the slab.
  float counter = pow(max(dot(n, normalize(vec3(-key.xy, 0.55) + V)), 0.0), 70.0) * 0.24 * edgeOnly;
  float body = (1.0 - t) * 0.035 * max(dot(n, key), 0.0);
  // The molded shoulder (see the header). \`rise\` keeps every bright term off the outermost, steepest pixels.
  float rise = smoothstep(0.0, 0.3, t);
  float lift = mix(1.0, rise, moldOn);
  float moldHi = rise * (1.0 - smoothstep(0.25, 0.6, t)) * pow(0.5 + 0.5 * sh, 1.5) * mold;
  // The shadow peaks a little inside the edge and fades toward it, so the outermost pixels meet the ground, not a stroke.
  float moldLo = smoothstep(0.0, 0.22, t) * (1.0 - smoothstep(0.22, 0.62, t)) * mix(0.3, 1.0, 0.5 - 0.5 * sh) * mold;

  // The shaded half. Glass on a pale ground reads through its DARK edge — refraction throws a thin shadow right at the
  // rim, and the side turned away from the light is denser — not through white highlights, which vanish on white.
  // Drawn with the theme's ink so it works in monochrome and on every other ground.
  float bevelW = 1.0 - smoothstep(0.0, 1.0, t);
  float away = 0.5 - 0.5 * sh;
  float shade = bevelW * (0.01 + 0.055 * away * away) + (1.0 - smoothstep(0.0, uPx * 2.6, d)) * 0.045;
  // The molded shoulder's own shadow replaces the ink shade: in ink it would draw a light line on a dark ground.
  float shadeA = clamp(shade * mix(1.0, 0.5, uDark), 0.0, 0.5) * (1.0 - moldOn);

  float k = mix(1.0, 0.82, uDark);
  // White is secondary: the lit terms are kept under the RGB band below.
  float lit =
    ((keySpec + fillSpec + curSpec + counter + body + fres * 0.07 * edgeOnly) * lift + lineK + moldHi * 0.32) * k * 0.8;
  float litA = clamp(lit, 0.0, 1.0);
  vec3 glint = mix(vec3(1.0), uRim, 0.35);

  // ── The RGB-led refraction band (--gel-bevel, --gel-disperse-*) ──
  // Molded: the band spreads across the shoulder as a soft iridescent tint (a wide, lower Gaussian), never a line.
  float bw = mix(max(1.2, uBand.x * 0.45), max(2.0, bz * 0.3), moldOn);
  // Molded: the band sits on the shoulder, a third of the way in, not on the outline.
  float d0 = mix(min(uBand.x, bz), max(uBand.x, bz * 0.3), moldOn);
  // A channel displaced by v = -Ld·disperse sits where d(P - v) = d - sh·disperse reaches the band depth.
  float fR = jBand(d - sh * uDisperse.r - d0, bw) * uEdgeR.a;
  float fG = jBand(d - sh * uDisperse.g - d0, bw) * uEdgeG.a;
  float fB = jBand(d - sh * uDisperse.b - d0, bw) * uEdgeB.a;
  float bandK = uBand.y * (0.55 + 0.45 * abs(sh)) * smoothstep(-uPx, uPx, d) * lift * mix(1.0, 0.42 * (0.25 + 0.75 * facing), moldOn);
  // White is secondary: a weak core only where all three channels overlap.
  vec3 rgbBand = (uEdgeR.rgb * fR + uEdgeG.rgb * fG + uEdgeB.rgb * fB + vec3(0.25 * min(fR, min(fG, fB)))) * bandK;
  float rgbA = clamp((fR + fG + fB) * bandK, 0.0, 1.0);

  // ── The 1px Fresnel edge (--gel-fresnel) ──
  float fresEdge = (1.0 - smoothstep(uPx * 0.5, 1.0 + uPx * 0.5, d)) * smoothstep(-uPx, 0.0, d);
  float fresA = fresEdge * uFresnel.a * (0.75 + 0.25 * facing) * (1.0 - moldOn);

  // Composite, premultiplied: plasma at the back, then the refracted rim, shade, band, light and edge.
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (uPlasmaInRim > 0.5) {
    float pa = jPlasma(P, uSize, d, uSeed, 0.0);
    col = col * (1.0 - pa) + uAccent * pa;
    a = a + pa * (1.0 - a);
  }
  col = col * (1.0 - rim.a) + rim.rgb;
  a = a + rim.a * (1.0 - a);
  col = col * (1.0 - shadeA) + uInk * shadeA * (0.5 + 0.5 * rim.a);
  a = a + shadeA * (1.0 - a);
  // The far shoulder rolls into shadow: darkened toward black (premultiplied: colour scales, alpha grows).
  float moldA = clamp(moldLo * 0.62, 0.0, 0.78);
  col *= 1.0 - moldA;
  a = a + moldA * (1.0 - a);
  col += rgbBand + glint * litA * (1.0 - 0.15 * rim.a) + uFresnel.rgb * fresA;
  a = a + (rgbA + litA * 0.9 + fresA) * (1.0 - a);

  // ── The dent: a soft rim glow round the bowl and a light dot on its far slope ──
  if (uDentOn > 0.5 && uDent.z > 0.001) {
    float R = max(uDent.w, 1.0);
    float x = (length(P - uDent.xy) - R * 1.15) / (R * 0.35);
    float inside = smoothstep(2.0, 8.0, d);
    float glowA = exp(-x * x) * uDent.z * 0.2 * inside;
    vec2 spot = uDent.xy - Ld * R * 0.6;
    float sx = length(P - spot) / max(R * 0.16, 1.5);
    float dotA = exp(-sx * sx * 2.0) * uDent.z * uSpecular.a * inside;
    col += mix(uRim, uAccent, 0.35) * glowA + uSpecular.rgb * dotA;
    a = a + (glowA + dotA) * (1.0 - a);
  }

  a = clamp(a, 0.0, 1.0);
  outColor = vec4(min(col, vec3(a)) * cover, a * cover);
}`;
