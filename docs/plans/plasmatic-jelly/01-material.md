# Plasmatic Jelly 01: the material

Status: plan, 2026-10-23. Scope: haze, internal motion (eddies, currents, plasma
flow), the 3D translucent rim, colour, and the CSS fallback tier. Out of scope
here, owned by sibling plans: soft-body response (02), electric arcs (03),
coverage/a11y/perf audit (04), gates and docs migration (05). Where this plan
touches their ground, it names the interface and stops.

Baseline studied: `docs/liquid-glass-system.md`, `docs/design-language.md` §0/§5.1,
`lib/liquid/glass/{engine,shader,renderer,policy,color}.ts`, `lib/liquid/runtime.ts`,
`app/liquid-glass.css`, `app/globals.css` (theme blocks), `components/shared/app-theme.css`,
`lib/__tests__/{filter-cost-budget,raf-loop-allowlist}.test.ts`.

---

## 0. Decisions at a glance

| #   | Decision                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | **Class names stay `glass-*`.** The material behind them changes. 494 files reference the roles, CI gates key on them, and the role names describe elevation, not optics. "Jelly" is the material name in tokens, docs and new modules.                                                                                                                      |
| D2  | **New `--site-jelly-*` / `--app-jelly-*` tokens** for haze, plasma and flow. `--site-glass-tint/rim/light/ink` keep their meaning (body tint, hairline, light colour, shaded side) and are reused unchanged. Dead blur tokens (`--site-glass-blur-*`, `--site-glass-saturate`) are retired by 05.                                                             |
| D3  | **Two canvases per shader surface.** The existing full-res rim canvas stays event-driven. A new low-res **haze canvas** (≤ 0.25 CSS scale) is redrawn on an ambient clock. The rim never redraws just because the haze moves.                                                                                                                                 |
| D4  | **The ambient clock is a bounded continuous loop:** 30 Hz with recent input, 12 Hz after 20 s idle, 0 Hz when hidden / no haze surfaces / degraded. This amends the "no resting loop" rule and the `raf-loop-allowlist` justification for `engine.ts` (05 owns the text).                                                                                    |
| D5  | **Outside the 8-surface budget, motion is CSS on the compositor:** an injected clipped carrier (`.jelly-flow`) with 1–2 transform-animated gradient spans, attached only while visible, capped by count and area. No `@property` animation, no SVG turbulence, no `backdrop-filter`, no animated gradient positions.                                          |
| D6  | **Colour lives in the light, never in the ink.** Each theme gets a two-hue plasma pair (`--site-jelly-plasma-a/-b`) at low strength. Plasma appears in the rim zone, the subsurface glow and the current crests. The interior haze is near-neutral. Text and hairlines stay monochrome tokens.                                                              |
| D7  | **Haze sits behind content, never over it.** Both canvases and the carrier paint under in-flow children (negative z-index in an isolated host). Haze can lower text contrast only through the ground, and a test bounds it (§5).                                                                                                                                |
| D8  | **High contrast, forced colours, reduced transparency and print get no jelly.** `perf-lite` keeps a static haze and the CSS rim but no motion. Handheld keeps motion at reduced rate and cap.                                                                                                                                                               |
| D9  | **Ship behind `html[data-material="jelly"]`**, stamped by the pre-paint script, default on. Removing the attribute restores Liquid Glass during the migration and lets the four plans land independently. 05 deletes the flag once glass rules are gone.                                                                                                   |

---

## 1. Visual definition per role

Vocabulary:

- **Haze**: a milky scattering veil. Measured as the alpha of `--site-jelly-haze` at the densest point of the flow. Glass was 0 here.
- **Flow**: luminance and density variation that moves. Two scales: **drift** (large soft blobs, 160–400 px features, 20–40 s periods) and **current** (elongated bands that slide along the long axis, 8–14 px/s). Shader surfaces add **eddies** (domain-warped curl, 60–120 px).
- **Plasma**: the coloured light inside. Strength is the peak alpha of the plasma tint at a current crest.
- **Rim**: the existing bevel slab (Snell refraction, Fresnel, key/cursor glints, shaded side). Kept. Jelly adds a haze veil on the refracted band, a plasma tint in the inner edge and subsurface glow.

| Role                                      | Renderer                                  | Haze α light / dark | Flow                                                                    | Plasma strength       | Rim                                                                                     |
| ----------------------------------------- | ----------------------------------------- | ------------------- | ----------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------- |
| `.glass-fill` (cards, rows, tiles)        | CSS carrier                               | 0.10 / 0.07         | drift ×1 + current ×1, speed 1.0                                        | 0.05                  | CSS: hairline + lit top edge + static inset glow (§3.4)                                 |
| `.glass-inset`, `input`, `textarea`       | CSS carrier, rim-band mask only           | 0.04 / 0.04         | current only, confined to an 8 px edge band, speed 0.6; interior static | 0.04, rises to 0.08 on `:focus-visible` | CSS: half-strength hairline; focus ring unchanged                                       |
| `.glass-pane`                             | shader (haze + rim), else CSS carrier     | 0.14 / 0.10         | eddies + drift, speed 1.0                                               | 0.06                  | shader bevel + plasma inner edge + subsurface glow                                      |
| `.glass-chrome`                           | shader, else CSS carrier                  | 0.18 / 0.14         | horizontal current along the long axis, speed 0.7; no eddies           | 0.05, biased to the bottom edge | shader bevel; denser haze carries legibility over scrolling text                        |
| `.glass-overlay`                          | shader (priority 0), else CSS carrier     | 0.06 / 0.05 (on top of the 86% fill) | drift only, speed 0.6                                                  | 0.07 at rim, 0.02 interior | shader bevel; strongest subsurface glow, so floating UI reads as lit from inside         |
| `.app-glass`                              | shader, else CSS carrier                  | from `--app-jelly-*`, same as pane | as pane                                                                 | as pane, plasma from `--app-accent` | as pane                                                                                 |
| Buttons: `default` / `accent` (filled)    | CSS carrier, 1 span                       | 0 (solid fill keeps its colour) | current ×1 as a ±4% luminance band across the fill, speed 1.2           | uses own fill as the light; no extra hue | existing coat + 1 px inner top light                                                     |
| Buttons: `secondary` / `outline`          | CSS carrier, 1 span                       | as fill             | drift ×1                                                                | 0.04                  | as fill                                                                                 |
| Buttons: `ghost` / `link`                 | none at rest; the evert hover layer gets a 1-span carrier while hovered | 0                   | while hovered only                                                      | 0.04 in hover layer   | none                                                                                    |
| Tab tracks, segmented thumbs (`.glass-bevel-sm`) | as inset; thumb as filled button     | as inset            | as inset                                                                | as inset              | as today                                                                                |
| `.glass-scrim`                            | none                                      | n/a                 | none                                                                    | none                  | none                                                                                    |

Rules that apply to every role:

1. **Interior quiet zone.** Flow contrast is full inside the rim band (bevel + 24 px) and multiplied by `--site-jelly-quiet` (0.35) further in. Text normally sits in the interior.
2. **Phase is per element.** Every surface gets a stable seed (a hash of its registration order), so two adjacent cards never pulse in sync. Synchronised motion reads as an animation. Desynchronised motion reads as a material.
3. **Hover and press do not change haze colour.** They raise plasma strength ×1.6 and flow speed ×1.4 for the hovered surface. The deformation itself belongs to 02. Arcs belong to 03 and read `--site-jelly-arc` (defined here, §4).
4. **No drop shadows.** Jelly still is not lifted by a shadow. The only new shadow is the static inset glow on the CSS tier (§3.4).

---

## 2. Shader design

### 2.1 Pipeline

```
admitted surface (≤ 8, same admission as today)
 ├─ .jelly-haze-canvas  z:-3  low-res, redrawn on the ambient clock   ← NEW program HAZE_FRAG
 ├─ .liquid-glass-canvas z:-2 full-res, redrawn on events (as today)   ← FRAG + jelly terms
 └─ evert hover ::before z:-1, then live content
```

- One `GlassRenderer`, one WebGL2 context, **two programs**. `drawHaze(o, target)` renders into the shared framebuffer at haze resolution and copies with `drawImage`, exactly as `draw()` does.
- Haze resolution: `hazeScaleFor(w, h)` in `policy.ts` returns `min(0.25, 256 / max(w, h))` CSS→device scale, so no haze canvas exceeds 256 px on its long side. The canvas is CSS-stretched (`image-rendering: auto`); the field is low-frequency, so bilinear upscale is invisible. Cost ceiling: 8 × 256 × 256 = 524k fragments per tick, against roughly 8 × 1.3M today for one full-res rim redraw.
- The rim program stays event-driven. It reads `uTime` only for the slow plasma tint of the inner edge, quantised so it redraws at most every 500 ms. That is the one jelly cost on the rim canvas.

### 2.2 Ambient clock (`engine.ts` + `policy.ts`)

```ts
// policy.ts (pure, unit-tested)
export const JELLY_CLOCK = { activeHz: 30, idleHz: 12, idleAfterMs: 20_000, coarseHz: 15 } as const;
export function ambientHz(s: { hidden: boolean; hazeSurfaces: number; degraded: boolean;
  msSinceInput: number; coarse: boolean }): number {
  if (s.hidden || s.degraded || s.hazeSurfaces === 0) return 0;
  const hz = s.msSinceInput > JELLY_CLOCK.idleAfterMs ? JELLY_CLOCK.idleHz : JELLY_CLOCK.activeHz;
  return s.coarse ? Math.min(hz, JELLY_CLOCK.coarseHz) : hz;
}
```

- The existing `frame()` gains a `hazeDue(now)` check. When due, it redraws every admitted haze canvas, using geometry already read in the same frame. `again` is also true while `ambientHz > 0`. The loop therefore stops on exactly the conditions above, which gives the allowlist entry a provable stop.
- `uTime = (performance.now() / 1000) % 3600`. The time is continuous across rate changes, so going idle never makes the field jump.
- No haze redraws during an active scroll. The canvases scroll with their hosts, so a frozen field is correct, and the next tick resumes the field.

### 2.3 New uniforms

| Uniform       | Type  | Source                                                                       | Program     |
| ------------- | ----- | ---------------------------------------------------------------------------- | ----------- |
| `uTime`       | float | ambient clock, seconds                                                       | haze, rim   |
| `uSeed`       | float | per-surface hash, 0..1                                                       | haze, rim   |
| `uHaze`       | vec4  | `--site-jelly-haze` rgb + role haze α                                         | haze, rim   |
| `uPlasmaA/B`  | vec3  | `--site-jelly-plasma-a/-b`                                                   | haze, rim   |
| `uPlasma`     | float | role plasma strength × hover boost                                           | haze, rim   |
| `uFlow`       | vec3  | x = speed, y = eddy amount (0 on chrome), z = current axis angle (radians)   | haze        |
| `uQuiet`      | float | `--site-jelly-quiet`                                                         | haze        |
| `uScale`      | float | haze canvas scale, used for `P` reconstruction                               | haze        |
| `uDeform`     | vec4  | **reserved for 02** (press centre xy, depth, radius); 01 passes zeros        | haze, rim   |

`engine.ts` reads the tokens with the same computed-style path and `resolveColor` cache it uses for `uTint`/`uRim`. Role values for haze α, plasma strength and flow come from custom properties on the host (`--jelly-haze-a`, `--jelly-plasma-k`, `--jelly-flow-speed`, `--jelly-flow-axis`), which the CSS sets per role (§3.3). The engine therefore holds no per-role table.

### 2.4 Shared GLSL chunk (`lib/liquid/glass/noise-glsl.ts`)

The noise is cheap value noise, not simplex. It runs at quarter resolution and nobody can see the difference.

```glsl
float jHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float jNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(jHash(i), jHash(i + vec2(1, 0)), u.x),
             mix(jHash(i + vec2(0, 1)), jHash(i + vec2(1, 1)), u.x), u.y);
}
// 3 octaves, rotated per octave to kill grid alignment.
const mat2 J_ROT = mat2(0.8, -0.6, 0.6, 0.8);
float jFbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * jNoise(p); p = J_ROT * p * 2.03; a *= 0.5; }
  return s / 0.875;
}
// Divergence-free 2D flow: the curl of a scalar potential (finite differences).
vec2 jCurl(vec2 p) {
  const float e = 0.35;
  float n1 = jFbm(p + vec2(0, e)), n2 = jFbm(p - vec2(0, e));
  float n3 = jFbm(p + vec2(e, 0)), n4 = jFbm(p - vec2(e, 0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}
```

### 2.5 Haze program (`lib/liquid/glass/haze-shader.ts`, `HAZE_FRAG`)

The haze uses flow-map advection with a two-phase crossfade (the standard water flow-map technique). It gives a continuous current without the stretching that pure advection accumulates. Domain warping on top gives the eddies.

```glsl
void main() {
  vec2 P = vec2(gl_FragCoord.x, uSize.y * uScale - gl_FragCoord.y) / uScale; // CSS px, y down
  vec2 hs = uSize * 0.5;
  float r = min(uRadius, min(hs.x, hs.y));
  float d = -sdRoundRect(P - hs, hs, r);
  if (d < -1.0) { outColor = vec4(0); return; }
  float cover = smoothstep(-1.0, 0.5, d);

  float t = uTime * uFlow.x;
  vec2 p = P / 140.0 + uSeed * 17.0;                    // ~140 px base feature

  // Current: a steady drift along the role's axis, bent by a slow curl field.
  vec2 axis = vec2(cos(uFlow.z), sin(uFlow.z));
  vec2 flow = axis * 0.6 + jCurl(p * 0.5 + t * 0.03) * 0.8;
  // Two-phase flow map: two samples half a cycle apart, crossfaded, so neither stretches.
  float ph0 = fract(t * 0.08), ph1 = fract(t * 0.08 + 0.5);
  float w = abs(ph0 * 2.0 - 1.0);
  // Eddies: one level of domain warping, rotating slowly.
  vec2 warp = uFlow.y * vec2(jFbm(p + vec2(t * 0.05, 0)), jFbm(p + vec2(5.2, 1.3 - t * 0.04))) - 0.5 * uFlow.y;
  float n0 = jFbm(p + warp * 1.6 - flow * ph0 * 1.2);
  float n1 = jFbm(p + warp * 1.6 - flow * ph1 * 1.2 + 0.37);
  float density = mix(n0, n1, w);                       // 0..1, the haze field

  // Quiet interior: full contrast in the rim band, damped further in.
  float band = 1.0 - smoothstep(uBezel, uBezel + 24.0, d);
  float k = mix(uQuiet, 1.0, band);
  float dens = mix(0.5, density, k);

  // Haze: milky veil, density-modulated around its mean (mean alpha = uHaze.a * 0.75).
  float hazeA = uHaze.a * (0.5 + 0.5 * dens);

  // Plasma: colour only at the current CRESTS (top ~15% of density), mostly near the rim.
  float crest = smoothstep(0.62, 0.86, density);
  vec3 plasma = mix(uPlasmaA, uPlasmaB, smoothstep(0.3, 0.7, jNoise(p * 0.7 - t * 0.02)));
  float plasmaA = uPlasma * crest * mix(0.35, 1.0, band);

  // Subsurface glow: light entering at the lit rim and scattering inward through the haze.
  vec2 g = normalize(sdGrad(P - hs, hs, r));
  float facing = 0.5 + 0.5 * dot(g, normalize(vec2(-0.46, -0.62)));
  float sss = exp(-max(d, 0.0) / 18.0) * facing * (0.6 + 0.4 * dens) * uPlasma * 1.4;

  vec3 col = uHaze.rgb * hazeA + plasma * (plasmaA + sss);   // premultiplied
  float a = clamp(hazeA + plasmaA + sss, 0.0, 0.6);
  outColor = vec4(min(col, vec3(a)) * cover, a * cover);
}
```

Notes:

- `sdGrad` is the central-difference gradient already inlined in `FRAG`. Lift it and `sdRoundRect` into `noise-glsl.ts` (renamed `jelly-glsl.ts` if preferred) so both programs share one copy.
- Alpha is capped at 0.6 in the shader, and the legibility test (§5) caps the token values well below that.
- On chrome (`uFlow.y = 0`) the eddies vanish and the current runs along `uFlow.z = 0` (horizontal).

### 2.6 Rim program changes (`shader.ts`, additive)

The rim keeps everything it has. Three additions:

```glsl
// (a) Jelly is slightly hazy, not perfectly clear: veil the refracted band, and soften dispersion a touch.
c = mix(c, uHaze.rgb * sa, uHaze.a * 0.45);            // after the uTint mix
// GLASS_IOR_RGB spread scaled by 0.8 via a new uniform uDispersion (1.0 = glass, 0.8 = jelly)

// (b) Plasma in the inner edge line: the lit stroke takes a slow hue between A and B.
vec3 edgeHue = mix(uPlasmaA, uPlasmaB, 0.5 + 0.5 * sin(uTime * 0.21 + uSeed * 6.28 + P.x * 0.004));
vec3 glint = mix(mix(vec3(1.0), uRim, 0.35), edgeHue, clamp(uPlasma * 3.0, 0.0, 0.35) * stroke);

// (c) Subsurface under the cursor: the existing curGlow takes the plasma colour, and is a bit wider.
float glowR = reach * 0.55;
vec3 curCol = mix(glint, edgeHue, 0.5) * curGlow * 1.3;   // added into col, not into litA's white
```

`uTime` in the rim program is quantised to 0.5 s steps by the engine, so the rim redraws at most at 2 Hz for (b). Hover, cursor and tilt redraws are unchanged.

### 2.7 Budget and what draws motion outside it

| Surface                                   | Haze/motion                                   | Rim                     |
| ----------------------------------------- | --------------------------------------------- | ----------------------- |
| Admitted (≤ 8; overlay → chrome → pane → other) | haze canvas                                   | rim canvas              |
| Visible eligible role beyond the 8        | CSS carrier (`.jelly-flow`), counted in the carrier cap | CSS rim (§3.4)          |
| `.glass-fill`, controls, fields           | CSS carrier                                   | CSS rim                 |
| Over the carrier cap, or `perf-lite`      | static CSS haze (no motion)                   | CSS rim                 |

When a surface gains a shader slot, the engine sets `data-liquid-canvas="on"` (existing). The CSS removes the carrier's visibility through that attribute, so a host never shows both. The carrier service also skips hosts that carry the attribute. The two never fight over an element.

---

## 3. CSS tier (no WebGL, no backdrop-filter)

### 3.1 Rejected techniques (with reasons for the record)

| Technique                                                                 | Why not                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animated `@property` angles/positions in gradients                        | A registered custom property animation repaints the element's box every frame on the main thread. With dozens of cards running `infinite` animations, this is the §5.1.2 regression (737 Mpx repainted) times N. Allowed only for one-shot hover transitions, as `--glass-glint-hover` is today. |
| SVG `feTurbulence` / `filter: url()`                                      | Re-runs the filter graph per frame over the filter region. `filter-cost-budget.test.ts` already bans it on viewport layers and chained after `url()`, and the lens/goo bank was removed for exactly this cost. Not on per-card layers either. |
| `background-position` animation                                           | Paint property (§5.1.2).                                                                                                                                                                                      |
| Host `overflow: clip` + `::after` (the `.glass-liquid` trick)             | It would clip hanging badges, focus rings and absolutely positioned children on 494 files' worth of cards. `::before` is owned by the evert hover layer. Fine for one signature pane, wrong for every card.      |
| `backdrop-filter`                                                         | Banned in every glass role. Unchanged.                                                                                                                                                                        |

### 3.2 The carrier

The carrier follows the `.liquid-light` pattern already in `liquid-glass.css`: a clipped, `contain: strict` child that owns the moving thing. The host does not change.

```html
<!-- injected by lib/liquid/jelly/flow-carriers.ts as the host's FIRST child -->
<span class="jelly-flow" aria-hidden="true" style="--jelly-phase:-13.7s">
  <span class="jelly-flow__drift"></span>
  <span class="jelly-flow__current"></span>   <!-- omitted on controls and handheld -->
</span>
```

```css
[data-material='jelly'] [data-jelly-flow='on'] { isolation: isolate; }
.jelly-flow {
  position: absolute; inset: 0; z-index: -3;
  overflow: hidden; border-radius: inherit; contain: strict; pointer-events: none;
}
.jelly-flow > span {
  position: absolute; inset: -20%;               /* 140% of host: room to move, bounded raster */
  will-change: transform;
  animation-delay: var(--jelly-phase);            /* desync per element */
}
.jelly-flow__drift {
  background:
    radial-gradient(40% 55% at 30% 35%, color-mix(in srgb, var(--site-jelly-haze) calc(var(--jelly-haze-a) * 140%), transparent), transparent 70%),
    radial-gradient(35% 45% at 72% 68%, color-mix(in srgb, var(--site-jelly-plasma-a) calc(var(--jelly-plasma-k) * 100%), transparent), transparent 70%),
    url('/jelly/haze-tile.webp') 0 0 / 192px repeat;  /* grain at --site-jelly-grain opacity is baked in the tile */
  animation: jelly-drift calc(29s / var(--jelly-flow-speed, 1)) var(--ease-in-out, ease-in-out) infinite alternate;
}
.jelly-flow__current {
  background: linear-gradient(var(--jelly-flow-axis-deg, 100deg), transparent 30%,
    color-mix(in srgb, var(--site-jelly-plasma-b) calc(var(--jelly-plasma-k) * 80%), transparent) 50%, transparent 70%);
  animation: jelly-current calc(17s / var(--jelly-flow-speed, 1)) linear infinite;
}
@keyframes jelly-drift {
  0%   { transform: translate3d(-4%, -3%, 0) rotate(-4deg) scale(1.02); }
  50%  { transform: translate3d(3%, 2%, 0) rotate(3deg) scale(0.98); }
  100% { transform: translate3d(-1%, 4%, 0) rotate(6deg) scale(1.04); }
}
@keyframes jelly-current {
  from { transform: translate3d(-35%, 0, 0); }
  to   { transform: translate3d(35%, 0, 0); }
}
.jelly-flow--rim-only { mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); padding: 8px; } /* fields */
[data-liquid-canvas='on'] > .jelly-flow { display: none; }
```

Raw rgba and hex values appear only in the token blocks (§4). The rules above use tokens only, so they pass the palette gate.

### 3.3 Per-role knobs (CSS custom properties on the host, read by both tiers)

```css
[data-material='jelly'] .glass-fill    { --jelly-haze-a: var(--site-jelly-haze-fill);    --jelly-plasma-k: 0.05; --jelly-flow-speed: 1;   }
[data-material='jelly'] .glass-pane    { --jelly-haze-a: var(--site-jelly-haze-pane);    --jelly-plasma-k: 0.06; --jelly-flow-speed: 1;   }
[data-material='jelly'] .glass-chrome  { --jelly-haze-a: var(--site-jelly-haze-chrome);  --jelly-plasma-k: 0.05; --jelly-flow-speed: 0.7; --jelly-flow-axis-deg: 90deg; }
[data-material='jelly'] .glass-overlay { --jelly-haze-a: var(--site-jelly-haze-overlay); --jelly-plasma-k: 0.07; --jelly-flow-speed: 0.6; }
[data-material='jelly'] :is(.glass-inset,[data-slot='input'],[data-slot='textarea']) { --jelly-haze-a: var(--site-jelly-haze-inset); --jelly-plasma-k: 0.04; --jelly-flow-speed: 0.6; }
```

Hover boost: `.glass-interactive:hover > .jelly-flow { opacity: 1 }` against a resting opacity of 0.75. Opacity is compositor-only. Speed changes are not applied in CSS, because changing a running animation's duration makes it jump. The shader tier boosts speed.

### 3.4 Static CSS rim (every non-shader surface)

The existing hairline and `--liquid-coat` stay. Jelly adds one static inset glow, which reads as subsurface scattering and costs nothing at rest:

```css
[data-material='jelly'] :is(.glass-fill,.glass-pane,.glass-chrome,.glass-overlay):not([data-liquid-canvas='on']) {
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--site-glass-light) 60%, transparent),
              inset 0 0 14px -4px color-mix(in srgb, var(--site-jelly-plasma-a) calc(var(--jelly-plasma-k) * 220%), transparent);
}
```

This reverses the "no inset highlights" line in the glass contract for the CSS tier only. 05 updates `liquid-glass-system.md`. `hover-css.ts` must keep this out of hover transitions, which it already does by forbidding shadow transitions.

### 3.5 Carrier service (`lib/liquid/jelly/flow-carriers.ts`)

- **Discovery.** A selector of all roles plus `[data-slot='button']:not([data-variant='ghost'],[data-variant='link'])`, minus the existing `EXCLUDE` list from `runtime.ts` plus `[data-jelly-flow='off']`. A `MutationObserver` (childList, subtree, debounced 200 ms) feeds an `IntersectionObserver` with `rootMargin: 200px`.
- **Attach on intersect, detach on leave.** A 2,000-row feed therefore never holds more than the visible carriers. The carrier is created once per host, kept in a `WeakMap`, and toggled with `hidden` rather than rebuilt.
- **Caps** (`policy.ts`, pure): `carrierCap = { desktop: 40, handheld: 16 }`. The total carrier area may not exceed 1.5 × the viewport area. Priority is overlay → chrome → pane → fill → inset → control, then document order. Hosts over the cap keep the static haze and get no carrier.
- **Phase.** `--jelly-phase = -(hash(order) * 29)s` is written once at attach. Nothing runs per frame and nothing reads geometry per pointer event.
- **Degraded** (`reduce-transparency`, `style-high-contrast`, `perf-lite`, `forced-colors`, `app-high-contrast`, print): the service does not install, and CSS hides any carrier as a second line.
- **No JS** (SSR first paint, chunk failure): roles show the static haze from §3.6. That is a complete material.

### 3.6 Static haze (the floor)

Every role always gets a static haze layer in its `background-image` stack (after `--liquid-coat`), so the material reads as jelly before or without JS:

```css
--jelly-static-haze: radial-gradient(120% 90% at 25% 15%, color-mix(in srgb, var(--site-jelly-haze) calc(var(--jelly-haze-a) * 100%), transparent), transparent 70%);
```

`.glass-fill`'s rule must keep tinting with `background-color` (the §5.1.2 rule), so this layer survives re-tints.

---

## 4. Tokens

### 4.1 New site tokens (declared in `:root`, overridden per theme)

| Token                         | Meaning                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `--site-jelly-haze`           | haze colour (opaque; alpha comes from the role)                       |
| `--site-jelly-haze-fill/-inset/-pane/-chrome/-overlay` | role haze α (unitless 0..1)                    |
| `--site-jelly-plasma-a/-b`    | the plasma pair (opaque)                                             |
| `--site-jelly-plasma-gain`    | theme multiplier on every role's plasma strength (dark grounds show glow more, so they need less) |
| `--site-jelly-quiet`          | interior flow damping (0.35)                                         |
| `--site-jelly-arc`            | arc core colour, **for 03** (defaults to `color-mix(plasma-a 70%, white)`) |
| `--site-jelly-on`             | 1 / 0. High contrast sets 0. Read by the engine and services as a cheap kill switch |

### 4.2 Per-theme values

The plasma takes the theme's accent hue where the accent has one. The monochrome themes get a fixed cool pair that matches the existing aurora behind the default ground ("only the light behind the glass has colour").

| Theme (class)                 | haze        | haze α fill/inset/pane/chrome/overlay | plasma-a  | plasma-b  | gain |
| ----------------------------- | ----------- | ------------------------------------- | --------- | --------- | ---- |
| default / `:root` (Daylight)  | `#ffffff`   | .10/.04/.14/.18/.06                   | `#7b6cff` | `#3cc4dc` | 1.0  |
| `.style-light`                | `#f4f7fd`   | .10/.04/.14/.18/.06                   | `var(--site-accent)` (`#6a4fd0`) | `#3fb6e8` | 1.0  |
| `.style-graphite` (Midnight)  | `#c9d2e3`   | .07/.04/.10/.14/.05                   | `var(--site-accent)` (`#2997ff`) | `#9b6bff` | 0.8  |
| `.style-sepia`                | `#fff6e6`   | .10/.04/.14/.18/.06                   | `#e2a04f` | `#d9776a` | 0.9  |
| `.style-nocturne`             | `#b4c8ff`   | .07/.04/.10/.14/.05                   | `#6f9bff` | `#47d1c4` | 0.8  |
| `.style-ultra`                | `#bff4ff`   | .06/.04/.09/.13/.05                   | `#76f7ff` | `#c86bff` | 0.9  |
| `.style-high-contrast`        | `transparent` | 0/0/0/0/0                           | `transparent` | `transparent` | 0 (`--site-jelly-on: 0`) |

Starting values only. They must pass §5, and the a11y owner (04) signs off on the browser review.

### 4.3 App tier (`components/shared/app-theme.css`)

`--app-jelly-haze: color-mix(in srgb, var(--app-text) 18%, white)`, `--app-jelly-plasma-a: var(--app-accent)`, `--app-jelly-plasma-b: color-mix(in oklch, var(--app-accent), #9b6bff 45%)`, `--app-jelly-haze-pane: .09` (dark default), `.12` (light). `.app-high-contrast` sets everything to 0 or transparent. `.app-glass` maps `--jelly-*` host knobs from these, so the engine and the carrier read one contract on both tiers.

### 4.4 Names

- **Keep the `glass-*` classes.** Renaming 494 files buys nothing, collides with every CI gate's selectors and allowlists, and four plans would be rebasing over it. Documentation calls them "jelly roles (`glass-*` classes)". A future rename, if ever wanted, is a mechanical codemod after the material ships, owned by 05.
- **Keep `--site-glass-tint/-rim/-light/-ink/-overlay-fill`.** They still mean body tint, hairline, light and shaded side. **Add** `--site-jelly-*` for the new physics. **Retire** (05) `--site-glass-blur-*`, `--site-glass-saturate`, `--glass-blur-*`, which nothing in a no-backdrop-filter system can consume.
- Engine modules keep their paths (`lib/liquid/glass/*`). New jelly-only modules go in `lib/liquid/jelly/`.

---

## 5. Legibility rules

1. **Haze is under the text, always.** Canvases sit at z −3/−2 and the carrier at −3 in an isolated host. Nothing jelly paints at z ≥ 0 inside a host. 05 adds a gate for this.
2. **Contrast bound, tested.** New `lib/__tests__/jelly-legibility.test.ts` parses each theme block in `globals.css`. Per role it composites the worst case: `--site-bg` → role tint (`liquid-glass.css` tint mixes) → haze at **max** density (`α × 1.0`) and at min (`α × 0.5`) → plasma at the role's peak (`k × gain`, colour A and B). It asserts:
   - `--site-text` ≥ 4.5:1 and `--site-text-muted` ≥ 3:1 against every composite;
   - the composite's relative-luminance spread (max − min across the flow) ≤ **0.04** for fill/pane/overlay and ≤ 0.05 for chrome. This bounds visible flicker behind glyphs.
3. **Motion behind text is slow and large.** Feature size ≥ 120 px (`P / 140`, CSS gradients ≥ 35% of host). Drift ≤ 12 px/s. No luminance change faster than a 6 s half-period. Nothing strobes, and the current crests have no hard edges (smoothstep ≥ 0.2 wide).
4. **The interior is quiet** (`--site-jelly-quiet` 0.35, §1 rule 1). Plasma above 0.35× strength appears only in the rim band.
5. **Fields stay still where the caret is.** Insets animate their 8 px edge band only (`.jelly-flow--rim-only`).
6. **Overlays keep their 86% legible fill.** Jelly adds haze on top, never in place of it. `--site-glass-overlay-fill` is unchanged.
7. **Legibility never depends on the optic** (design-language §0.6): text must still hold on `--site-surface-opaque`, which is what every degraded path shows.

---

## 6. Implementation: files and ownership

Work splits into four parallel lanes (M1–M4) with one-way interfaces. Interfaces exist first: tokens (M2) and pure policy (M1a) land in the first commit. Every lane uses tokens and runs behind `[data-material='jelly']`.

### M1: shader tier (owner: shader implementer)

| File                                          | Change                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/liquid/glass/jelly-glsl.ts` **(new)**    | `jHash/jNoise/jFbm/jCurl`, plus `sdRoundRect`/`sdGrad` lifted from `shader.ts`                                                                                      |
| `lib/liquid/glass/haze-shader.ts` **(new)**   | `HAZE_FRAG` (§2.5); reuses `VERT`                                                                                                                                   |
| `lib/liquid/glass/shader.ts`                  | import the shared SDF; add `uTime, uSeed, uHaze, uPlasmaA/B, uPlasma, uDispersion, uDeform`; rim additions (§2.6)                                                  |
| `lib/liquid/glass/renderer.ts`                | second program + uniform table; `drawHaze(o, target)`; `GlassDraw` gains jelly fields                                                                             |
| `lib/liquid/glass/policy.ts` (M1a, first)     | `JELLY_CLOCK`, `ambientHz()`, `hazeScaleFor()`, `CARRIER_CAP`, `carrierAdmit()` (priority + area cap), `seedFor(order)`                                            |
| `lib/liquid/glass/engine.ts`                  | create and remove `.jelly-haze-canvas` alongside the rim canvas; ambient clock in `frame()`; read `--site-jelly-*` and host `--jelly-*` knobs; honour `--site-jelly-on`; quantise rim `uTime` |
| `lib/liquid/glass/scene.ts`                   | make sure `.jelly-haze-canvas` and `.jelly-flow` are excluded from snapshot capture (canvases already are; verify the carrier spans)                                  |
| `lib/liquid/glass/__tests__/jelly-policy.test.ts` **(new)** | clock stop conditions, haze scale ≤ 256 px, carrier cap, area cap, priority order                                                                                 |

### M2: tokens and CSS material (owner: CSS implementer)

| File                                      | Change                                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/globals.css`                         | `--site-jelly-*` in `:root` and every `.style-*` block (§4.2); import `./jelly-material.css` right after `./liquid-glass.css`                                   |
| `app/jelly-material.css` **(new)**        | §3.2–3.6: role knobs, carrier, keyframes, static haze, CSS rim, degradation block (high contrast / reduced transparency / forced colours / print hide everything; `perf-lite` hides `.jelly-flow` and keeps the static haze) |
| `app/liquid-glass.css`                    | only: z-index note (−3 haze), `isolation` for `[data-jelly-flow='on']`, and stop `background-image: none` on `[data-liquid-canvas='on']` from also killing the static haze when the haze canvas fails |
| `components/shared/app-theme.css`         | `--app-jelly-*` (§4.3); `.app-glass` knob mapping; `.app-high-contrast` zeroing                                                                                |
| `lib/__tests__/filter-cost-budget.test.ts` | add `app/jelly-material.css` to `SHEETS` (its rules must stay filter-free)                                                                                      |
| `app/routes/__root.tsx` pre-paint script      | stamp `data-material="jelly"` on `<html>` (shared with 05, who owns the flag's removal)                                                                         |

### M3: carrier service (owner: runtime implementer)

| File                                          | Change                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `lib/liquid/jelly/flow-carriers.ts` **(new)** | §3.5. Pure DOM service, no rAF, no per-frame work. Uses `carrierAdmit`/`seedFor` from `policy.ts`                               |
| `hooks/useLiquidInteractions.ts`              | install `installJellyFlow()` immediately, next to `installLiquidInteractions()` (CSS-only cost, so no idle deferral is needed) |
| `lib/liquid/runtime.ts`                       | export the shared `EXCLUDE` list instead of duplicating it                                                                     |

### M4: asset and legibility gate (owner: whoever lands M2; small)

| File                                             | Change                                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `scripts/generate-jelly-haze-tile.mjs` **(new)** | renders a 192 px tileable fbm grain (alpha ≤ 0.06, neutral) to `public/jelly/haze-tile.webp` (< 8 KB)       |
| `public/jelly/haze-tile.webp` **(new, generated)** | committed output; a missing asset degrades to gradient-only, never to a broken layer                       |
| `lib/__tests__/jelly-legibility.test.ts` **(new)** | §5.2                                                                                                       |

### Hand-offs (not done in this plan)

- **02 soft-body:** owns `uDeform` and any host transform. It may scale the carrier's `--jelly-flow-speed` during a press. It must not touch `.jelly-flow` internals.
- **03 arcs:** consumes `--site-jelly-arc` and `--site-jelly-plasma-a/-b`. A click-arc may raise `uPlasma` for 300 ms through an engine hook `pulse(el, k)`. M1 exposes that hook as a no-op stub.
- **04 coverage/perf:** final caps (8 shader / 40 carriers / 1.5 viewports), the handheld numbers, browser review on default, graphite and high contrast at phone and desktop widths.
- **05 gates/docs:** rewrite `docs/liquid-glass-system.md` → `docs/jelly-system.md`; amend design-language §5.1 and the "no resting loop" / "no inset highlights" lines; update the `raf-loop-allowlist` justification for `engine.ts` to the D4 stop conditions; retire the blur tokens; remove the `data-material` flag.

### Order

1. M1a policy + M2 tokens (one commit, no visual change: values unused).
2. M2 CSS + M4 tile + legibility test (CSS tier visible behind the flag).
3. M3 carriers (motion on cards).
4. M1 shader (haze canvases and rim changes on the 8 prominent surfaces).

Each step is independently shippable and passes `pnpm check:consistency`.
