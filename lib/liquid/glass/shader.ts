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
 */

import { GLASS_OPTICS_GLSL } from '../optics';

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

${GLASS_OPTICS_GLSL}

float sdRoundRect(vec2 q, vec2 halfSize, float r) {
  vec2 e = abs(q) - halfSize + vec2(r);
  return min(max(e.x, e.y), 0.0) + length(max(e, 0.0)) - r;
}

void main() {
  vec2 P = vec2(gl_FragCoord.x, uSize.y / uPx - gl_FragCoord.y) * uPx;   // CSS px, y down, top-left origin
  vec2 hs = uSize * 0.5;
  vec2 q = P - hs;
  float r = min(uRadius, min(hs.x, hs.y));
  float sd = sdRoundRect(q, hs, r);
  float d = -sd;                                  // depth inside the edge, px
  if (d < -uPx) {
    outColor = vec4(0.0);
    return;
  }
  float cover = smoothstep(-uPx, uPx * 0.5, d);

  // ── Bevel geometry ──
  float bz = max(uBezel, 2.0);
  float t = clamp(d / bz, 0.0, 1.0);
  float tt = max(t, 0.035);
  // Convex squircle profile h = bz·(1 - (1 - t)^3)^(1/3); its slope is finite everywhere but the very rim.
  float inner = max(1.0 - pow(1.0 - tt, 3.0), 1e-4);
  float slope = t >= 1.0 ? 0.0 : min(pow(1.0 - tt, 2.0) / pow(inner, 2.0 / 3.0), 4.5);
  // Outward unit normal of the boundary, by central differences of the distance field.
  float e = 0.75;
  vec2 g = vec2(
    sdRoundRect(q + vec2(e, 0.0), hs, r) - sdRoundRect(q - vec2(e, 0.0), hs, r),
    sdRoundRect(q + vec2(0.0, e), hs, r) - sdRoundRect(q - vec2(0.0, e), hs, r)
  );
  g = dot(g, g) > 1e-8 ? normalize(g) : vec2(0.0, -1.0);
  // A gentle ~2.6 degree optical rock toward the cursor. It changes the rim's
  // refraction and reflections without shifting pixels of live text or the hit area.
  vec3 n = normalize(vec3(g * slope + uTilt * 0.045, 1.0));

  // ── Refraction of the page, in the bevel band only ──
  vec4 rim = vec4(0.0);
  float band = (1.0 - smoothstep(0.55, 1.0, t)) * uSceneOn;
  if (band > 0.001) {
    vec2 base = P + uSceneMap.xy;
    vec2 uvR = (base + glassSlabOffset(n, GLASS_IOR_RGB.r, uThickness)) * uSceneMap.zw;
    vec2 uvG = (base + glassSlabOffset(n, GLASS_IOR_RGB.g, uThickness)) * uSceneMap.zw;
    vec2 uvB = (base + glassSlabOffset(n, GLASS_IOR_RGB.b, uThickness)) * uSceneMap.zw;
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
    rim = vec4(c, sa) * band;
  }

  // ── Light ──
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 key = normalize(vec3(-0.46, -0.62, 0.64));
  vec3 fillL = normalize(vec3(0.55, 0.5, 0.67));
  float fres = glassFresnel(n.z).g;
  float keySpec = pow(max(dot(n, normalize(key + V)), 0.0), 120.0) * 0.8;
  float fillSpec = pow(max(dot(n, normalize(fillL + V)), 0.0), 70.0) * 0.26;

  // The cursor is a point light hovering above the glass.
  vec3 toL = vec3(uLight.xy - P, uLight.z);
  float distL = length(toL);
  vec3 Lc = toL / max(distL, 1e-3);
  float reach = uLight.z * 2.4;
  float fall = uLightOn / (1.0 + (distL * distL) / (reach * reach));
  float curSpec = pow(max(dot(n, normalize(Lc + V)), 0.0), 80.0) * 1.3 * fall;
  // The light also falls on the FACE, not only the rim: a soft bloom under the cursor across the whole surface, so a
  // hover lights the element it is over rather than just the thin bevel band at its edge.
  float glowR = reach * 0.42;
  float curGlow = exp(-dot(uLight.xy - P, uLight.xy - P) / (2.0 * glowR * glowR)) * 0.055 * uLightOn;

  // The inner edge: a thin bright line, strongest on the edges that face a light.
  float stroke = (1.0 - smoothstep(0.0, uPx * 1.8, d - uPx * 0.5)) * smoothstep(-uPx, 0.0, d);
  float facing = 0.5 + 0.5 * dot(g, normalize(key.xy));
  float facingC = 0.5 + 0.5 * dot(g, normalize(uLight.xy - P + 1e-3)) * uLightOn;
  float lineK = stroke * (0.18 + 0.55 * facing + 0.5 * facingC * uLightOn);

  // A dimmer glint on the far edge: light bouncing inside the slab, plus a soft sheen across the face.
  float counter = pow(max(dot(n, normalize(vec3(-key.xy, 0.55) + V)), 0.0), 70.0) * 0.24;
  float sheen = 0.045 * smoothstep(0.0, 1.0, 1.0 - dot(P / uSize, vec2(0.62, 0.78)));
  float body = (1.0 - t) * 0.035 * max(dot(n, key), 0.0);

  // The shaded half. Glass on a pale ground reads through its DARK edge — refraction throws a thin shadow right at the
  // rim, and the side turned away from the light is denser — not through white highlights, which vanish on white.
  // Drawn with the theme's ink so it works in monochrome and on every other ground.
  float bevelW = 1.0 - smoothstep(0.0, 1.0, t);
  float away = 0.5 - 0.5 * dot(g, normalize(key.xy));
  float shade = bevelW * (0.01 + 0.055 * away * away) + (1.0 - smoothstep(0.0, uPx * 2.6, d)) * 0.045;
  float shadeA = clamp(shade * mix(1.0, 0.5, uDark), 0.0, 0.5);

  float k = mix(1.0, 0.82, uDark);
  float lit = (keySpec + fillSpec + curSpec + counter + lineK + sheen + body + fres * 0.07 + curGlow) * k;
  float litA = clamp(lit, 0.0, 1.0);
  vec3 glint = mix(vec3(1.0), uRim, 0.35);

  // Composite, premultiplied: the refracted rim first, the light over it.
  vec3 col = rim.rgb * (1.0 - shadeA) + uInk * shadeA * (0.5 + 0.5 * rim.a) + glint * litA * (1.0 - 0.15 * rim.a);
  float a = clamp(rim.a + shadeA * (1.0 - rim.a) + litA * 0.9, 0.0, 1.0);
  outColor = vec4(min(col, vec3(a)) * cover, a * cover);
}`;
