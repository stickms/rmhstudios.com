# Liquid Glass v2 — True Refraction, Reflection & Liquid Motion

**Date:** 2026-07-21
**Status:** Approved — implementation in progress on `claude/liquid-glass-ui-redesign-jb2p7e`
**Scope:** The site-wide Liquid Glass material system (all `_site/` pages, shared
primitives, shell, in-scope top-level pages). Games/apps stay out of scope
exactly as in v1 (`THEME_EXCLUDED_ROUTES` untouched).
**Predecessor:** [`2026-07-14-liquid-glass-ui-redesign.md`](./2026-07-14-liquid-glass-ui-redesign.md)
(v1 — **implemented and live**; its §1 scope, §6 budgets, §10 a11y and §13 QA
matrices still bind unless amended here).
**Companions:** [`docs/design-language.md`](../design-language.md),
[`docs/page-consistency.md`](../page-consistency.md).

> **For the implementing agent:** v1 built the material system — elevation
> classes, tokens, aurora canvas, pointer light, budgets. It is already live.
> **Do not re-implement v1.** v2 is a surgical upgrade in four moves:
> (1) real lens refraction replacing turbulence, (2) live specular reflection
> on every glass surface, (3) liquid motion made visible (tabs, sheen, aurora
> depth, press physics), (4) deletion of dead/invisible legacy UI. Work only
> your assigned phase (§11). Keep `pnpm exec tsc --noEmit` and `pnpm lint`
> clean. Never edit `app/routeTree.gen.ts`. All colors/radii/shadows via
> `--site-*` tokens. New user-facing strings go through
> `t("key", { defaultValue })` + `pnpm i18n:extract`.

---

## 0. Vision — from *frosted* to *optical*

The v1 system renders **frosted** glass: blur + tint + static rim insets. It
reads as material, but it does not behave like glass, because nothing in it
responds to light or bends it:

1. **Refraction is invisible in production.** `.glass-refract` is applied on
   exactly one shipped surface (`app/routes/login.tsx:358`) plus the design
   lab. And the filter it references (`#glass-distortion`,
   `components/ui/liquid-glass.tsx:164–191`) is **feTurbulence-based** —
   random noise displacement. Real glass doesn't wobble like heat haze; it
   bends the backdrop *at its edges* along a smooth thickness gradient.
2. **Reflection is static.** Rims are fixed `inset` box-shadows
   (`--site-shadow*`, `globals.css:138–143`). The only live light is the
   pointer hotspot on *hovered* `.glass-interactive` elements. Un-hovered
   glass is optically dead — nothing glints as the light (pointer) moves.
3. **Liquid motion shipped but is not visible.** `.glass-liquid` (the
   travelling sheen, `globals.css:788–835`) has **zero** production users.
   The liquid `layoutId` tab capsule exists in exactly one component
   (`components/daily-puzzles/DailyPuzzlesHub.tsx`). The aurora drifts, but as
   a single flat layer — no depth.

v2 fixes all three and deletes what v1 left dead:

- **Every glass surface reflects.** A viewport-anchored specular **rim glint**
  tracks the global pointer across *all* panes/chrome/overlays simultaneously
  — one light, every surface answers it. No pointer (touch/SSR/reduced
  motion): the glint rests at the scene's "sun" (top center). §4.
- **Hero & chrome surfaces refract.** A physically-derived **lens
  displacement map** (smooth edge-bevel height field, not turbulence) bends
  the backdrop at pane edges; a `--prism` variant adds true chromatic
  dispersion (R/G/B displaced at different magnitudes). §3.
- **The material moves like liquid.** Two-layer depth-parallax aurora; a
  shared `LiquidTabs` primitive so active-tab capsules *flow* everywhere;
  hover sheen sweeps on signature CTAs; springy press physics unified on
  `--ease-glass`. §5.
- **Dead UI is removed.** Everything in-code-but-invisible is deleted or
  explicitly deprecated (Appendix D).

Everything remains inside v1's hard budgets (§9) and degradation matrix (§10).

---

## 1. Ground truth — what exists today (verified 2026-07-21)

| Asset | Where | v2 fate |
|---|---|---|
| Elevation classes `.glass-fill/pane/chrome(--aside)/overlay/inset/scrim/opaque` | `app/globals.css:606–691` | Kept. `::before`/`::after` allocation restructured (§2). |
| `.glass-interactive` hover/press + pointer hotspot (`::after`) | `globals.css:696–735` | Kept; press curve moves to `--ease-glass` token; hotspot stays on `::after`. |
| `.glass-refract` edge-band blur + `#glass-distortion` turbulence upgrade | `globals.css:740–777` | **Replaced** by lens refraction (§3). Ring geometry (mask trick) is reused for the glint layer. |
| `.glass-refract--prism` static 2-hairline fringe (`::after`) | `globals.css:767–777` | **Replaced** by true dispersion filter + fringe folded into the `::before` ring (§3.4) — frees `::after` for the hotspot. |
| `.glass-liquid` sheen on `::before` (conflicts with refract) | `globals.css:788–835` | **Rebuilt as background-layer sheen** on the element itself — no pseudo, composes with everything (§5.2). |
| `#glass-distortion` SVG filter (feTurbulence → blur → displacement, scale 80) | `components/ui/liquid-glass.tsx:164–191` | **Deleted**, replaced by `#glass-lens` (+ JS-generated per-size-bucket lens filters) and `#glass-lens-prism` (§3). Keep the id `glass-distortion` as an alias filter only if `.liquid-glass-refract` consumers remain (they won't — Appendix D). |
| `GlassEffect`, `GlassDock`, `GlassButton` | `components/ui/liquid-glass.tsx` | Design-lab-only usage → **deprecate/remove** per Appendix D; `GlassPane` + `GlassFilter` stay canonical. |
| `useGlassLight` (per-element `--glass-px/--glass-py`) | `hooks/useGlassLight.ts` | **Extended**: also writes global `--light-x/--light-y` (§6.1). |
| `useLiquidBackground` (aurora parallax `--aurora-mx/my`) | `hooks/useLiquidBackground.ts` | Kept; second aurora layer consumes the same vars at a different multiplier (§5.1). |
| Aurora canvas `body::before` + `aurora-drift` | `globals.css:531–585` | Kept; gains a depth sibling layer `html::after` (§5.1). |
| Sticky header condensation (`data-scrolled`) | `components/feed/PageLayout.tsx:54–92` | Kept; condensed state also raises blur + glint intensity (§7). |
| `Card` (`glass-fill`, `pane`/`interactive` props) | `components/ui/card.tsx` | Kept; interactive cards gain the hover glint ring (§4.3). |
| `Button` CVA (accent-glass variants, `active:scale-[0.97]`) | `components/ui/button.tsx` | Press physics on `--ease-glass`; opt-in `sheen` treatment for primary CTAs (§5.3). |
| Dialog `.glass-overlay` + `.glass-scrim` | `components/ui/dialog.tsx` | Kept; enter animation gains a spring overshoot (§5.4). |
| Legacy catch-all frost `:is(.absolute,.shadow-xl,.shadow-2xl).bg-site-bg` | `globals.css:599–604` | **Delete after migrating remaining consumers** to `.glass-overlay` (Appendix D). |
| Design lab | `app/routes/liquid-glass.tsx` | Rebuilt to demo v2 optics: refraction on/off, dispersion, glint, sheen, tabs (§8.9). |

The **budget discipline** (v1 §6.1) is unchanged and restated in §9 with the
v2 additions.

---

## 2. Layer architecture v2 — the pseudo-element contract

v1 overloaded `::before` with three different owners (refract ring, liquid
sheen, aside blur), which is *why* the fancy effects never composed and ended
up unused. v2 fixes the contract so every effect has exactly one home and all
of them compose:

| Layer | Owner | Content |
|---|---|---|
| element `background` (multi-layer) | the elevation class | `[sheen (optional, animated)] over [micro-noise (L2+)] over [tint color]` |
| `::before` — **the optics ring** | v2 (this doc) | Edge-masked ring band. Always paints the **specular rim glint** (§4). With `.glass-refract`: additionally applies the **lens `backdrop-filter`** (§3). With `--prism`: additionally paints the chromatic fringe hairlines. |
| `::after` — **the pointer light** | `.glass-interactive` (v1, unchanged) | The hovered radial hotspot at `--glass-px/--glass-py`. |
| `::before` on `.glass-chrome--aside` | **exception** | Stays the blur carrier (containing-block rule v1 §3.3.1 — the aside itself must never have `backdrop-filter`). The aside's optics ring therefore lives on `::after` (`.glass-chrome--aside::after`); the aside is never `.glass-interactive`, so `::after` is free there. Keep this comment in the CSS — it is load-bearing. |

Hard rules (encode as CSS comments):

1. `.glass-liquid` no longer touches any pseudo — it is a background layer
   (§5.2). It now composes freely with `.glass-refract` and
   `.glass-interactive`.
2. The optics ring is `pointer-events: none`, `border-radius: inherit`,
   `z-index: 0`; element content must sit at `z-index: 1+` when it could
   overlap the ring band (headers/heroes already do — verify per surface).
3. Never add a third pseudo owner. If a future effect needs a layer, it must
   ride an existing one (extra background-image layer or box-shadow).

### 2.1 The optics ring — geometry

Reuses v1's proven mask trick (ring = full box minus content-box), applied to
more classes:

```css
/* Which elements carry an optics ring:
   - always-on: .glass-pane, .glass-overlay, .glass-chrome (header/dock bars)
   - hover-only: .glass-fill.glass-interactive (cards — cost gated to the one
     hovered card at a time)
   - variant:   .glass-chrome--aside via ::after (see contract table)        */
:is(.glass-pane, .glass-overlay, .glass-chrome):not(.glass-chrome--aside)::before,
.glass-fill.glass-interactive::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  pointer-events: none;
  padding: var(--glass-bevel, 12px);      /* ring thickness = glass edge bevel */
  -webkit-mask:
    linear-gradient(#000 0 0) content-box exclude,
    linear-gradient(#000 0 0);
  mask:
    linear-gradient(#000 0 0) content-box exclude,
    linear-gradient(#000 0 0);
  /* glint background layers — §4.2 */
}
```

`--glass-bevel` defaults: 12px on panes/overlays, 8px on chrome bars, 6px on
small capsules (`.glass-bevel-sm` utility or per-component override). All
`.glass-*` ring hosts must declare `position: relative` (panes/overlays
already do via `.glass-interactive` or their own layout — add it to the base
classes to be safe).

---

## 3. Refraction — the lens model

### 3.1 Why turbulence must die

`feTurbulence` displaces every pixel by *noise* — the backdrop shimmers
randomly, which the eye reads as heat haze or wet plastic. Optically, a glass
slab with a beveled edge displaces the backdrop by a **smooth vector field**:
zero in the flat center, ramping outward toward each edge (the bevel bends
rays toward the slab's interior, so the edge band shows a compressed copy of
what lies just *outside* the pane — exactly the iOS 26 look).

### 3.2 The displacement map

`feDisplacementMap` samples: `P'(x,y) = P(x + scale·(R−½), y + scale·(G−½))`.
So we encode the vector field as an image: **R = horizontal displacement,
G = vertical displacement, 50 % gray = no displacement.** The map for an
edge-bevel lens is two plateau ramps (only the outer ~22 % of each axis
displaces; the center stays neutral):

```
R channel across x:   0 ──ramp──► 128 ────flat──── 128 ──ramp──► 255
                      │  22%     │       56%        │    22%     │
G channel across y:   same, vertically
```

Built as a **data-URI SVG** (channels combined with `screen` blending —
`screen(rgb(r,0,0), rgb(0,g,0)) = rgb(r,g,0)`):

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <defs>
    <linearGradient id="gx" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"    stop-color="#000000"/>
      <stop offset="0.22" stop-color="#800000"/>
      <stop offset="0.78" stop-color="#800000"/>
      <stop offset="1"    stop-color="#ff0000"/>
    </linearGradient>
    <linearGradient id="gy" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"    stop-color="#000000"/>
      <stop offset="0.22" stop-color="#008000"/>
      <stop offset="0.78" stop-color="#008000"/>
      <stop offset="1"    stop-color="#00ff00"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="black"/>
  <rect width="256" height="256" fill="url(#gx)" style="mix-blend-mode:screen"/>
  <rect width="256" height="256" fill="url(#gy)" style="mix-blend-mode:screen"/>
</svg>
```

(URL-encode and inline as `data:image/svg+xml,…`. The direction is correct:
at the left edge R≈0 → samples shift left → the band shows compressed
*outside* content, i.e. light bent through a thickening edge.)

### 3.3 The filters (`GlassFilter` v2, `components/ui/liquid-glass.tsx`)

`GlassFilter` renders one hidden `<svg id="glass-filters">` (mounted once in
`__root.tsx:256`, unchanged mount) containing:

```xml
<filter id="glass-lens" x="0%" y="0%" width="100%" height="100%"
        color-interpolation-filters="sRGB">
  <feImage href="data:image/svg+xml,…map…" x="0" y="0"
           width="256" height="256" preserveAspectRatio="none" result="map"/>
  <feGaussianBlur in="map" stdDeviation="2" result="soft"/>
  <feDisplacementMap in="SourceGraphic" in2="soft" scale="56"
                     xChannelSelector="R" yChannelSelector="G"/>
</filter>
```

**The feImage sizing caveat (this is the tricky part — read carefully):**
when a filter is referenced from CSS (`backdrop-filter: url(#glass-lens)`),
`feImage` renders the map at its **intrinsic pixel size anchored at the filter
region origin — it does not stretch to the element**. Chromium's handling of
`primitiveUnits="objectBoundingBox"` + `feImage` is historically unreliable.
Therefore:

1. **First, verify declaratively** on the design-lab page: try
   `filterUnits="objectBoundingBox" primitiveUnits="objectBoundingBox"` with
   `<feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none">` and
   a proportionate `scale` (~0.22). If Chromium stretches the map correctly
   across differently-sized test panes, ship that and **skip the JS
   generator** below.
2. **Otherwise use the size-bucket generator** `lib/glass-lens.ts` (client
   module, new):

```ts
// lib/glass-lens.ts — pseudocode contract
// Chromium-only enhancement: backdrop-filter: url() is unsupported elsewhere.
const supported = CSS.supports('backdrop-filter', 'url(#x)');

// Quantize element size to 64px buckets; one <filter> per live bucket.
const bucket = (n: number) => Math.max(64, Math.ceil(n / 64) * 64);

export function initGlassLens(root = document): () => void {
  if (!supported || perfLite() || reducedTransparency()) return () => {};
  const svgDefs = document.getElementById('glass-filters'); // GlassFilter mount
  const ro = new ResizeObserver(entries => { /* rAF-batch → assign() */ });
  const mo = new MutationObserver(/* watch for [data-glass-lens] add/remove */);

  function assign(el: HTMLElement) {
    const w = bucket(el.offsetWidth), h = bucket(el.offsetHeight);
    const id = `glass-lens-${w}x${h}`;
    ensureFilter(svgDefs, id, w, h);          // feImage href = mapDataURI(w, h)
    el.style.setProperty('--glass-lens', `url(#${id})`);
  }
  // mapDataURI(w, h): the §3.2 SVG with width/height = w/h and the ramp stops
  // converted from % to px so the bevel band is a CONSTANT ~26px regardless of
  // pane size (a 900px hero must not get a 200px mush band):
  //   xStops: 0 → 26px → (w-26)px → w   (plateau between)
  // Cache per (w,h); LRU-cap live filters at 8, reuse nearest bucket beyond.
  return () => { ro.disconnect(); mo.disconnect(); };
}
```

   Wire `initGlassLens()` inside the `useGlassLight` effect in
   `components/Providers.tsx` (it is already mounted there — zero new mounts).

3. Elements opt in via the `data-glass-lens` attribute, which `GlassPane
   refract` and the shell surfaces set (§7). CSS consumes the variable:

```css
.glass-refract::before {
  /* ring geometry from §2.1 is shared; this only adds the backdrop bend */
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);              /* FF/Safari fallback: edge blur */
}
@supports (backdrop-filter: url('#glass-lens')) {
  .glass-refract::before {
    -webkit-backdrop-filter: var(--glass-lens, url('#glass-lens')) blur(1px);
    backdrop-filter: var(--glass-lens, url('#glass-lens')) blur(1px);
  }
}
```

The static `#glass-lens` (256×256) is the pre-JS/first-paint default so
refraction appears immediately and is then refined per element.

### 3.4 Chromatic dispersion — `.glass-refract--prism`

Real dispersion: blue bends more than red. One filter, three displacements at
±12 % scale, channel-isolated and re-summed:

```xml
<filter id="glass-lens-prism" x="0%" y="0%" width="100%" height="100%"
        color-interpolation-filters="sRGB">
  <feImage href="…same map…" width="256" height="256"
           preserveAspectRatio="none" result="map"/>
  <feGaussianBlur in="map" stdDeviation="2" result="soft"/>
  <feDisplacementMap in="SourceGraphic" in2="soft" scale="49"
                     xChannelSelector="R" yChannelSelector="G" result="dr"/>
  <feDisplacementMap in="SourceGraphic" in2="soft" scale="56"
                     xChannelSelector="R" yChannelSelector="G" result="dg"/>
  <feDisplacementMap in="SourceGraphic" in2="soft" scale="63"
                     xChannelSelector="R" yChannelSelector="G" result="db"/>
  <feColorMatrix in="dr" result="r" type="matrix"
    values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/>
  <feColorMatrix in="dg" result="g" type="matrix"
    values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"/>
  <feColorMatrix in="db" result="b" type="matrix"
    values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"/>
  <feComposite in="r"  in2="g" operator="arithmetic" k2="1" k3="1" result="rg"/>
  <feComposite in="rg" in2="b" operator="arithmetic" k2="1" k3="1"/>
</filter>
```

- CSS: `.glass-refract--prism::before` swaps to
  `var(--glass-lens-prism, url('#glass-lens-prism')) blur(1px)` under the same
  `@supports` gate. Non-Chromium fallback: the fringe hairlines (below) alone.
- The old static fringe moves off `::after` into the ring's background
  (two offset 1px inner hairlines painted as extra `background-image`
  layers on `::before` — keep the current colors
  `rgba(255,80,120,.14)` / `rgba(80,160,255,.12)` as `box-shadow` insets on
  the *element* is also acceptable; pick whichever composes cleaner).
- **Budget: ≤1 prism element per page** (3 displacement passes ≈ 3× cost).
  Sanctioned users: login card (already `--prism`), the featured membership
  tier on `/store`, the command palette pane, the design lab.

### 3.5 Refraction placement (visibility!)

`.glass-refract` (+`data-glass-lens`) goes on surfaces users actually see —
the v1 ration of "≤2/page" now has *named* occupants (§7 map): the desktop
sidebar rail, the login card, the command palette, one hero pane per flagship
page (library, store, recap/wrapped). Never in scroll containers, never on
list items (unchanged rule).

### 3.6 Universal mirror refraction (the non-Chromium branch)

**Amendment (2026-07-21b).** SVG filters in `backdrop-filter` remain
Chromium-only (WebKit bug 245510 and the Firefox request are open, no ship
signals). But true refraction only *needs* backdrop sampling when the
backdrop is unknown — and after the §8 floating-shell restructure, what sits
behind most refract surfaces is the **aurora canvas we own and can
replicate**. So the fallback branch stops faking (edge blur) and starts
*mirroring*:

```css
/* Non-Chromium engines with a fine pointer: paint a viewport-anchored COPY
   of the aurora into the optics ring and displace the copy with a regular
   `filter` (SVG url() filters in `filter` work in Gecko + WebKit). The ring
   then genuinely bends "the background" — same pixels, actually displaced.
   Gated off touch: iOS degrades background-attachment:fixed, and misregistered
   aurora reads worse than plain blur. */
@supports (filter: url('#glass-lens')) and (not (backdrop-filter: url('#glass-lens'))) {
  @media (hover: hover) and (pointer: fine) {
    .glass-refract::before {
      background-image: var(--site-canvas);
      background-attachment: fixed;
      background-repeat: no-repeat;
      /* Track the parallax the real canvas gets from useLiquidBackground —
         background-position can read the same vars the body::before translate
         uses. The drift keyframe's scale/rotate is NOT mirrored: at a ≤14px
         band behind 1px blur, the low-frequency gradients make the phase
         error imperceptible. */
      background-position: calc(50% + var(--aurora-mx, 0px)) calc(50% + var(--aurora-my, 0px));
      background-size: 104vw 104vh;      /* ≈ body::before oversize, viewport units */
      filter: var(--glass-lens, url('#glass-lens')) blur(1px);
      /* keep frosting whatever real content also passes beneath */
      -webkit-backdrop-filter: blur(2px);
      backdrop-filter: blur(2px);
    }
  }
}
```

- **Registration accuracy is not the goal — plausibility is.** The copy sits
  within a few percent of the real canvas (parallax tracked, drift not); the
  displacement then bends it. At ring scale this is indistinguishable from
  true backdrop refraction over the aurora.
- `lib/glass-lens.ts` gate widens from
  `CSS.supports('backdrop-filter','url(#x)')` to *either* property — the
  per-element bucket vars now serve both branches (`--glass-lens` is consumed
  by `backdrop-filter` on Chromium and by `filter` here).
- **WebKit verification note:** `feDisplacementMap` via `filter: url()` on
  HTML content has a history of WebKit rendering bugs (software paths, DPR
  scaling). QA must eyeball desktop Safari; if it misrenders, the escape
  hatch is *baking*: canvas + lens are both static per (theme × bucket), so
  the pre-refracted band can be generated once (offscreen canvas → data URI)
  and painted as a plain background image — refraction as texture, zero
  filters. Implement only if live Safari testing fails.
- High-contrast / reduced-transparency / perf-lite / forced-colors: the ring
  pseudo is already killed by the §10 blocks — no new gates needed. Touch
  devices keep the static-sun glint ring with plain edge blur (unchanged).

### 3.7 Reactive lens states (press-flex refraction)

The lens gets discrete intensity states — no per-frame filter animation
(continuous backdrop re-filtering is compositor poison), just a **state swap
that rides the existing spring press**:

- `lib/glass-lens.ts` additionally emits a **press variant per live bucket**:
  same map, displacement scale ×1.6, id suffix `-press`, exposed as a second
  var `--glass-lens-press` on the element. (Bucket LRU cap counts pairs;
  cap stays ≤8 filter *pairs*.)
- CSS (both branches):

```css
/* Pressing a refract surface deepens the bend — glass flexing under the
   finger. Rides :active with the --ease-glass transform already on
   .glass-interactive; reduced motion skips the swap. */
@media not (prefers-reduced-motion: reduce) {
  html:not(.reduce-motion) .glass-refract:active::before {
    -webkit-backdrop-filter: var(--glass-lens-press, var(--glass-lens, url('#glass-lens-press'))) blur(1px);
    backdrop-filter: var(--glass-lens-press, var(--glass-lens, url('#glass-lens-press'))) blur(1px);
  }
}
/* mirror branch equivalent swaps the `filter` inside the §3.6 block */
```

- A static `#glass-lens-press` (256×256, scale ×1.6) joins `GlassFilter` as
  the pre-JS default, so the press state exists before hydration.
- **Design lab:** an intensity playground — rest/hover/press 3-way toggle on
  a demo pane plus a "press me" pane wired to the real `:active` path. This
  is where the discrete-state mechanics are reviewed before anyone asks for
  continuous animation (which stays banned by §9).

---

## 4. Reflection — one light, every surface answers

### 4.1 The light model

v1's "one sun, top-slightly-left" becomes a **live scene light**:

- With a fine pointer: the light *is* the pointer, in viewport coordinates.
- Touch / SSR / no JS / reduced-motion: the light rests at the sun default
  (`50 % horizontal, −8 % vertical` — just above the viewport top).
- The pointer hotspot (v1 §5.1, `::after`) is unchanged — it is the light's
  *diffuse* footprint on the hovered surface. The v2 addition is the
  *specular* answer of every other surface: the rim glint.

### 4.2 The rim glint (the signature v2 effect)

One radial gradient, anchored to the **viewport** (`background-attachment:
fixed`), painted only inside each element's optics ring (§2.1 mask). Because
the gradient's positioning area is the viewport, *every element samples the
same light* — as the pointer sweeps the page, each pane's rim brightens on
the side facing the cursor and dims as it passes. Zero per-element JS.

```css
/* inside the §2.1 ring rule */
  background-image:
    radial-gradient(
      var(--glass-glint-size, 340px) circle
        at var(--light-x, 50%) var(--light-y, -8%),
      var(--site-glass-glint, var(--site-glass-rim)) 0%,
      color-mix(in srgb, var(--site-glass-glint, var(--site-glass-rim)) 40%, transparent) 38%,
      transparent 70%
    );
  background-attachment: fixed;
  mix-blend-mode: screen;                /* only ever lightens the rim */
  opacity: var(--glass-glint-opacity, 0.9);
```

Interaction & fallback rules:

```css
/* Hover-gated for repeated cards: at most one card ring paints at a time. */
.glass-fill.glass-interactive::before { opacity: 0; transition: opacity 0.25s ease; }
.glass-fill.glass-interactive:hover::before { opacity: 1; }

/* Touch / coarse pointers: background-attachment:fixed is unreliable on iOS
   and there is no pointer to track — swap to a static element-local top glint
   (the sun), same ring mask. */
@media not ((hover: hover) and (pointer: fine)) {
  :is(.glass-pane, .glass-overlay, .glass-chrome)::before,
  .glass-chrome--aside::after {
    background-image: linear-gradient(
      180deg,
      var(--site-glass-glint, var(--site-glass-rim)),
      transparent 34%
    );
    background-attachment: scroll;
  }
}
```

- The accent warms the glint exactly like v1 warmed the pointer light:
  `lib/appearance.ts` `applyAccent` additionally derives
  `--site-glass-glint: color-mix(in srgb, var(--site-accent) 18%, var(--site-glass-rim))`
  (default when no accent preset: the plain rim token).
- `.glass-chrome[data-scrolled]` raises `--glass-glint-opacity` to 1 —
  condensed chrome catches more light (§7 PageLayout).

### 4.3 Where the glint lives (defaults, no per-page work)

| Surface | Ring behavior |
|---|---|
| `.glass-pane`, `.glass-overlay`, `.glass-chrome` bars, `.glass-chrome--aside` (via `::after`) | Always on. These are few per page (≤8 by budget) — always-on is affordable. |
| `.glass-fill.glass-interactive` (cards, admin tiles, listing tiles, shop items) | Hover-only (opacity fade-in). |
| `.glass-inset`, plain `.glass-fill`, `.glass-scrim` | **No ring.** Wells are holes, not slabs; plain fills are the unlimited cheap tier and must stay pseudo-free. |

### 4.35 Single-sheet edge rework (amendment 2026-07-21b — supersedes the ring-flood glint)

**Owner feedback:** the shipped glint paints the entire `--glass-bevel` band,
and on light themes (Sepia/Light, where `--site-glass-rim` is near-opaque
cream/white) that band + the 1px `--site-border` + the rim insets stack into
a **thick outlined box**. Glass should read as **a single sheet whose edge
catches light** — not a frame.

The fix relocates the specular from the 12px ring-flood to a **hairline of
light living in the border ring itself**, and makes the structural border
disappear into it:

1. **Glint = border-box background layer on the element** (no pseudo). Glass
   surfaces set `border-color: transparent` and paint layered backgrounds:

```css
.glass-pane {
  border: var(--site-border-width) solid transparent;
  background-color: var(--site-glass-tint);      /* fills to border-box — the
                                                    edge is the same material */
  background-image:
    var(--site-glass-noise),                     /* padding-box */
    radial-gradient(                             /* the hairline specular */
      var(--glass-glint-size, 340px) circle
        at var(--light-x, 50%) var(--light-y, -8%),
      color-mix(in srgb, var(--site-glass-glint, var(--site-glass-rim))
        calc(var(--glass-glint-opacity, 0.9) * 100%), transparent) 0%,
      transparent 70%);
  background-clip: padding-box, border-box;      /* glint exists ONLY in the
                                                    1px border ring */
  background-attachment: scroll, fixed;          /* viewport-anchored light */
  background-origin: padding-box, border-box;
}
```

   Same pattern for `.glass-overlay`, `.glass-chrome`, `.glass-chrome--aside`
   (whose `::after` ring is **deleted** — the aside carries glint in its own
   background now), and hover-gated for `.glass-fill.glass-interactive`
   (swap the glint layer in on `:hover`; an instant swap is acceptable, or
   register `@property --glass-glint-o` for a fade where supported).
2. **`::before` returns to refraction-only.** The masked bevel band keeps the
   lens `backdrop-filter`/`filter` (§3.3/§3.6) but paints **no** glint.
   Non-refract surfaces need **no `::before` at all** anymore — delete the
   always-on ring rules (cheaper: fewer painted layers, and the §2 pseudo
   contract simplifies to: `::before` = refraction, `::after` = pointer
   light, aside keeps blur on `::before`).
3. **Structural borders on glass go transparent** — the lit hairline *is*
   the edge. Shape at rest comes from tint contrast + the existing soft rim
   insets in `--site-shadow*` (keep those; they are 1px and subtle).
   `.glass-inset` wells keep a border at half strength
   (`color-mix(in srgb, var(--site-border) 50%, transparent)`) so recessed
   fields still read as carved into the sheet, not outlined on it.
4. **Per-theme glint level:** light themes drop `--glass-glint-opacity` to
   ~0.5 (`.style-light`, `.style-sepia`) — bright rims on bright frost need
   less light to read. Dark themes keep 0.9.
5. **Degradations:** high-contrast and reduced-transparency **restore solid
   borders** (`border-color: var(--site-border)` in their §10 blocks —
   opaque surfaces need real edges; high-contrast keeps its 2px). The
   forced-colors structural-border rule stays. Touch keeps a static top-edge
   glint (element-anchored linear-gradient in the same border-box layer).

**Acceptance (matches the owner's screenshot complaint):** the Sepia
composer must render as one soft sheet — no pale band around the pane, no
double outline between pane and text well; a ≤1px light hairline on the lit
edge is the only edge treatment visible.

### 4.4 The scene light source (JS) — `useGlassLight` v2

Extend `hooks/useGlassLight.ts` (same single listener, same rAF throttle —
**do not add a second `pointermove` listener**):

```ts
// inside the existing rAF callback, alongside the per-element writes:
const q = 8; // quantize to 8px steps — bounds style invalidations to ~1/8th
const lx = Math.round(e.clientX / q) * q;
const ly = Math.round(e.clientY / q) * q;
if (lx !== lastLx || ly !== lastLy) {
  document.documentElement.style.setProperty('--light-x', `${lx}px`);
  document.documentElement.style.setProperty('--light-y', `${ly}px`);
  lastLx = lx; lastLy = ly;
}
// pointerleave (document) → remove both vars (falls back to the sun default).
```

Gates (all already in the hook, extend to the new writes): fine pointer only,
off under `perf-lite`, and **static under reduced motion** — when
`prefers-reduced-motion` / `html.reduce-motion` matches, do not track; the
CSS default sun applies. Cleanup removes the vars.

Cost analysis (encode in a comment): updating two `<html>`-level custom
properties invalidates only elements whose computed styles reference them —
the ≤8 always-on rings + the hovered card. Each repaints a thin masked band.
With 8px quantization + rAF batching this measured well under one frame; the
QA gate (§12) re-verifies with a 4× CPU throttle trace.

---

## 5. Liquid motion

### 5.1 Two-layer depth aurora

The single `body::before` aurora gains a depth sibling so the backdrop
parallaxes at two rates — the difference between "a gradient" and "a scene":

```css
/* Layer 2 — the far field. Counter-drifts slower and follows the pointer at
   ~-0.6× the near layer's parallax, so pointer motion produces depth. Reuses
   --aurora-mx/my (already written by useLiquidBackground) — NO new JS. */
html:not(.app-route):not(.style-high-contrast) body::after {
  content: '';
  position: fixed;
  inset: -18%;
  z-index: -2;                     /* behind body::before */
  pointer-events: none;
  background-image:
    radial-gradient(60% 50% at 24% 30%, var(--site-aurora-far-1, rgba(86,140,255,0.10)), transparent 70%),
    radial-gradient(50% 45% at 78% 66%, var(--site-aurora-far-2, rgba(170,108,255,0.09)), transparent 70%);
  translate: calc(var(--aurora-mx, 0px) * -0.6) calc(var(--aurora-my, 0px) * -0.6);
  transition: translate 0.9s cubic-bezier(0.22, 1, 0.36, 1);   /* lazier trail */
  animation: aurora-drift-far 52s ease-in-out infinite alternate;
  will-change: transform, translate;
}
@keyframes aurora-drift-far {
  0%   { transform: scale(1.10) rotate(0.4deg)  translate3d(-1.2%, 0.8%, 0); }
  50%  { transform: scale(1.04) rotate(-0.5deg) translate3d(1.4%, -1.0%, 0); }
  100% { transform: scale(1.12) rotate(0.3deg)  translate3d(-0.8%, 1.2%, 0); }
}
/* Same kill-switches as the near layer (extend the existing rule at
   globals.css:579–585): perf-lite + high-contrast + reduced motion. */
```

Per-theme far-field colors via two new optional tokens
`--site-aurora-far-1/2` (defaults above work for Glass Dark; give
light/sepia/graphite/nocturne their own two stops next to their
`--site-canvas` definitions — derive from the theme's existing radial colors
at ~40 % of their alpha).

Also enrich the near layer's `aurora-drift` from 3 to 5 keyframes (same 34s,
same amplitude — just a less elliptical, more organic path).

### 5.2 The sheen, rebuilt (and finally used)

`.glass-liquid` becomes pseudo-free — the sheen is a background layer over
the noise/tint layers, so it composes with refract + interactive:

```css
.glass-liquid {
  background-image:
    linear-gradient(
      115deg,
      transparent 30%,
      color-mix(in srgb, var(--site-glass-rim) 60%, transparent) 46%,
      color-mix(in srgb, var(--site-glass-light) 85%, transparent) 50%,
      color-mix(in srgb, var(--site-glass-rim) 60%, transparent) 54%,
      transparent 70%
    ),
    var(--site-glass-noise);                 /* keep L2's noise layer */
  background-size: 260% 100%, auto;
  background-repeat: no-repeat, repeat;
  background-blend-mode: screen, normal;
  background-position: 150% 0, 0 0;
  animation: glass-sheen 9s ease-in-out infinite;
}
@keyframes glass-sheen {
  0%, 22%  { background-position: 150% 0, 0 0; }   /* long dwell off-pane */
  60%, 100% { background-position: -60% 0, 0 0; }
}
/* One-shot hover sweep for signature CTAs (§5.3) — re-triggers per hover. */
.glass-sheen-hover { background-size: 260% 100%, auto; background-repeat: no-repeat, repeat; }
.glass-sheen-hover:hover {
  animation: glass-sheen-once 0.9s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes glass-sheen-once {
  from { background-position: 150% 0, 0 0; }
  to   { background-position: -60% 0, 0 0; }
}
```

(Non-L2 hosts without noise: the second layer resolves to `var(--site-glass-noise)`
which every theme defines — harmless on L1/L3 hosts, or write the single-layer
variants explicitly. Under `perf-lite`/reduced-motion the animations stop via
the existing global resets; the band rests off-pane at `150 %` so nothing is
visually stuck mid-sweep.)

**Production users (new — this is the "visible" part):** the mobile dock, the
sidebar's active nav capsule, `Button` `accent`/`default` via
`.glass-sheen-hover`, the login card, hero panes that already take
`.glass-refract`, the `LiquidTabs` active capsule. Ration: ≤3 ambient
`.glass-liquid` per page; hover sweeps are unlimited (one plays at a time).

### 5.3 Press physics — one curve everywhere

- New token on `:root`: `--ease-glass: cubic-bezier(0.175, 0.885, 0.32, 2.2)`
  (the `EASE.glass`/`GLASS_EASE_CSS` curve from `lib/motion.ts:55–63` — CSS
  and JS now share one definition; `GLASS_EASE_CSS` stays exported for inline
  styles but its value comment points here).
- `.glass-interactive`'s transform transition already uses the curve inline
  (`globals.css:701`) — swap the literal for `var(--ease-glass)`.
- `Button` (`components/ui/button.tsx:9`): the base already has
  `active:scale-[0.97]`; give the transform its spring release by adding
  `[transition:transform_0.34s_var(--ease-glass),color_0.15s_ease,background-color_0.15s_ease,border-color_0.15s_ease,box-shadow_0.15s_ease,opacity_0.15s_ease]`
  to the CVA base (replaces the bare `transition-all`).
- The global mobile press cue `a:active … { opacity: 0.6 }`
  (`globals.css:1681–1689`) **excludes** material-press elements — opacity
  flicker fights the squish. Amend the selector:
  `button:not(:disabled):not([aria-disabled='true']):not([data-slot='button']):active`
  and add `:not(.glass-interactive)` to each branch. Links and legacy buttons
  keep the opacity cue.

### 5.4 Liquid tab capsules — a shared primitive at last

New `components/ui/liquid-tabs.tsx`:

```tsx
// LiquidTabs — the active-tab glass capsule that FLOWS between tabs.
// API sketch (keep it thin — a styled radiogroup/tablist, not a router):
export interface LiquidTab { id: string; label: string; icon?: LucideIcon; count?: number }
export function LiquidTabs({ tabs, value, onChange, size = 'default', className }: {
  tabs: LiquidTab[]; value: string; onChange: (id: string) => void;
  size?: 'sm' | 'default'; className?: string;
}) {
  // - <div role="tablist"> with roving arrow-key nav (copy the pattern from
  //   the creator-studio tab bar — it already implements WAI-ARIA correctly).
  // - Each tab is a <button role="tab"> with the label/icon at z-1.
  // - THE CAPSULE: one <motion.span layoutId={`liquid-tab-${uid}`}> rendered
  //   inside the ACTIVE tab — framer-motion morphs it between positions with
  //   SPRING.snappy (lib/motion.ts). Class: "absolute inset-0 rounded-full
  //   bg-site-accent-dim shadow-[inset_0_1px_0_var(--site-glass-rim)]
  //   glass-liquid" (the capsule itself carries the ambient sheen — it IS a
  //   signature surface).
  // - useReducedMotion() → transition={{ duration: 0 }} (capsule jumps).
  // - uid via useId() so multiple LiquidTabs never share a layoutId.
}
```

**Adopters in this redesign (visibility list — do these, not just the
primitive):**

| Surface | File | Current state |
|---|---|---|
| Feed tabs (For You / Following …) | `components/feed/FeedTabs.tsx` | hand-rolled underline/pill — migrate |
| Creator Studio tab bar | `components/creator-studio/*` (`cstudio-tabs`) | ARIA done, static active pill — migrate visuals only, keep `?tab=` mirroring + roving nav |
| Profile tabs (Posts/Replies/Media) | `components/feed/ProfileColumn.tsx` | static — migrate |
| Search result-type tabs | `components/feed/SearchColumn.tsx` | static — migrate |
| Library sub-tabs (fix from PR #577 preserved) | `components/library/*` | verify no overlap regression after migration |
| RMHLadder sub-nav | `components/rmhladder/RmhLadderShell*` | static — migrate |
| Settings section switcher (if tabbed) | `app/routes/_site/settings*` | inspect; migrate if tabs |
| DailyPuzzlesHub | `components/daily-puzzles/DailyPuzzlesHub.tsx` | already has layoutId — **refactor onto the primitive** so there is exactly one implementation |

### 5.45 Tab sheets & placement (amendment 2026-07-21c)

**Owner request:** tab lists sit on their own **glass sheet**, and always
render **below the hero section or page title** — never buried inside header
chrome — so they read as an obvious, tactile control.

1. **The sheet.** `LiquidTabs` gains a `sheet` prop (default **true**): the
   `role="tablist"` row is wrapped in a pill sheet —
   `glass-fill glass-bevel-sm rounded-full p-1 w-fit` (L1: cheap, repeatable;
   hairline glint edge from §4.35). The active capsule keeps its accent glass
   + `glass-liquid`. Hand-rolled capsule tab bars (creator studio, RMHLadder)
   adopt the same sheet wrapper classes around their existing markup.
2. **Placement rule (new convention, page-consistency checklist item):** tab
   strips are standalone sheets in the content flow, **below** the hero pane
   or the page-title header capsule, separated by the normal gutter
   (`mt-3`/`space-y-3`). They do NOT live inside `headerExtra` or the sticky
   header capsule. A strip that was sticky may stay sticky (`top` offset
   clearing the floating header), but it stays visually its own sheet.
3. **Adopters to move/re-wrap:** Feed (For You/Following + content filters —
   out of the header capsule, below it), `/library` (lib-nav strip moves
   below the hero slab), `/store` (Shop/Market below the "Choose your
   altitude." hero), `/search` (type tabs below the search well), profile
   (below the identity header — verify), creator studio (below "Make
   anything.", keep sticky + `?tab=`), RMHLadder shell nav, DailyPuzzlesHub.
   ARIA/state wiring is untouched — this is wrapper + placement only.

### 5.46 Glass clarity slider (amendment 2026-07-21c)

**Owner request:** the frosted/clear glass control in Settings must
verifiably work — and become a **slider with a live preview**, not just a
toggle.

1. **One axis, five stops** (stepped slider, Radix `Slider` primitive):
   `0 Opaque · 1 Calm · 2 Default · 3 Airy · 4 Clear`. Semantic: how much
   scene shows through the material.
   - `0` = exactly today's reduce-transparency behavior (opaque surfaces, no
     blur) — the existing mechanism (`html.reduce-transparency`) *is* this
     stop; keep it as the implementation.
   - `2` = the shipped default (no modification).
   - `1` / `3` / `4` = multipliers via two `<html>`-level vars set inline by
     the appearance runtime:

```css
/* globals.css — glass classes consume the user factors */
--glass-user-blur: 1;   /* 1: 1.25 · 3: 0.65 · 4: 0.35 */
--glass-user-tint: 1;   /* 1: 1.35 · 3: 0.75 · 4: 0.5  */
/* e.g. .glass-pane blur becomes:
   blur(calc(var(--site-glass-blur-pane) * var(--glass-user-blur, 1))) …
   tint alpha via color-mix(in srgb, var(--site-glass-tint)
   calc(var(--glass-user-tint, 1) * 100%), transparent) — clamp ≤ 1 by
   construction (Calm's 1.35 applies color-mix toward --site-surface-opaque
   instead of >100% alpha). */
```

2. **Persistence & no-flash:** stored like the theme (`localStorage`
   `rmh-glass-level`, default 2), applied pre-paint by the `__root.tsx`
   `themeScript` (level 0 adds `reduce-transparency`, others set the two
   vars inline), synced through `/api/preferences/appearance` (zod: int
   0–4; tiny Prisma prefs addition mirroring reduce-transparency's shape).
   The OS `prefers-reduced-transparency` media query still forces opaque
   regardless of slider (accessibility wins).
3. **Settings UI (Appearance):** replace the bare toggle row with a
   "Glass clarity" block: the stepped slider + stop labels + a **live
   preview card** — a mini aurora swatch (reuses the ThemeGallery
   mini-canvas pattern) with a small `.glass-pane` over it that re-renders
   at the hovered/dragged stop *before* commit (pointer-preview like theme
   hover-preview). Moving the slider also applies live to the whole page
   (it's inline vars — instant). Strings via
   `t('settings-glass-clarity', …)` etc. + `pnpm i18n:extract`.
4. **Interactions with modes:** high-contrast ignores the slider entirely
   (glass is off); `perf-lite` caps the effective blur but not the tint
   factor; the design lab gains a read-only indicator of the active level.
5. **"Ensure it works":** the implementing agent must trace the existing
   reduce-transparency toggle end-to-end (settings control → class → CSS →
   persistence → API sync → no-flash script) and fix anything broken found
   along the way, then wire the slider onto that verified path.

### 5.47 True liquid morphing (amendment 2026-07-21e)

**Owner request:** moving glass should **morph** like Apple's Liquid Glass —
stretch, pinch off, and reabsorb — not slide as a rigid capsule.

Two composable mechanisms; both are progressive polish over the existing
`layoutId` spring (which remains the skeleton and the reduced-motion/perf
fallback):

1. **Velocity squash & stretch** (all engines, near-free). The capsule's
   scale is a function of its own motion: while the `layoutId` transition
   runs, drive `scaleX = 1 + min(|vx|·k, 0.35)` and `scaleY = 1/scaleX`
   (volume conservation) from a framer-motion velocity motion-value
   (`useVelocity` on the capsule's projected x; k ≈ 0.0004). `transformOrigin`
   at the trailing edge. It settles through `EASE.glass`'s overshoot — the
   droplet lands with a wobble.

```tsx
// inside LiquidTabs' capsule (sketch)
const x = useMotionValue(0);            // fed by the layout projection
const vx = useVelocity(x);
const stretch = useTransform(vx, (v) => 1 + Math.min(Math.abs(v) * 0.0004, 0.35));
const squash  = useTransform(stretch, (s) => 1 / s);
<motion.span layoutId={id} style={{ scaleX: stretch, scaleY: squash }} … />
```

2. **Gooey metaball merge** (the Apple-style fusion). A goo filter in
   `GlassFilter`:

```xml
<filter id="glass-goo">
  <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
  <feColorMatrix in="blur" mode="matrix"
    values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>
</filter>
```

   Structure rule (hard): the goo applies to a **capsule-only underlay** — an
   absolutely-positioned layer spanning the control that contains (a) the
   `layoutId` capsule and (b) a small **trail droplet** following the capsule
   center on a softer spring (stiffness ~½). Blur+threshold fuses them: in
   flight the pair reads as a stretching teardrop that pinches off and
   reabsorbs on arrival. **Labels/icons render in a sibling layer above,
   never filtered** (alpha thresholding destroys glyph edges). `filter:
   url(#glass-goo)` is regular `filter` — Gecko/WebKit fine; verify Safari
   once (goo demos are known-good there).

**Where:** `LiquidTabs`' capsule underlay (all §5.45 sheets inherit), the
mobile dock's active pill, the sidebar's active nav capsule. Menus/dialogs
morphing out of their trigger buttons is noted as future work — not in
scope.

**Gates:** reduced motion → capsule jumps (existing; stretch/goo never
mount). `perf-lite` / high-contrast → no goo filter, plain spring slide.
The goo region is one small strip per control and filters tiny solid-color
blobs — cost is negligible next to the backdrop budget, but the underlay
must carry `contain: layout paint` and the filter must not wrap any
backdrop-filter element (nesting a backdrop sampler inside a filtered
subtree re-rasterizes it — keep the capsule underlay backdrop-free; the
capsule's own material is plain accent tint + rim, which it already is).

### 5.48 Liquid open transitions (amendment 2026-07-21e)

**Owner request:** opening things — an RMHark, an image, a book, a blog post
— should **liquidly expand** from the element you touched into the detail
view, with the detail's content (comments, metadata, related items) loading
in with staggered entrances. Mobile-first, glass aesthetics throughout.

**Mechanism (extends what exists — do not reinvent):**
`lib/view-transition.ts` already ships `runViewTransition()` (scoped VT,
`.vt-active` guard, reduced-motion/no-support fallback to instant nav) and
`postMediaVTName()` used by FeedList/RMHarkCard/PostDetail/PostImageGrid for
the media morph. v2 generalizes:

1. **Card-level morphs.** New helper in `lib/view-transition.ts`:

```ts
/** Shared-element name for any card→detail liquid open. kind: 'post' |
 *  'image' | 'book' | 'album' | 'blog' | 'news' | 'build' | 'persona'. */
export function liquidVTName(kind: string, id: string): string {
  return `liquid-${kind}-${id}`;
}
```

   The *clicked card's glass slab* (not just its media) gets
   `viewTransitionName: liquidVTName(kind, id)` set **at click time only**
   (VT names must be unique per document — never on every list item at rest;
   set on pointerdown/click, clear after the transition, exactly how the
   existing media morph manages it — copy that lifecycle). The detail page's
   hero pane carries the same name statically.
2. **Liquid timing for the morph.** In `globals.css`, groups named
   `liquid-*` get the springier glass curve and slightly longer run than the
   default 0.28s:

```css
::view-transition-group(*.liquid) { /* if class syntax unsupported, enumerate: */
}
/* VT names can't be wildcarded cross-browser — instead set the timing on the
   group via the existing global ::view-transition-group(*) block ONLY while
   html.vt-liquid is set (runViewTransition gains an optional {liquid: true}
   that adds the class for the transition's lifetime): */
html.vt-liquid::view-transition-group(*) {
  animation-duration: 0.38s;
  animation-timing-function: var(--ease-glass);
}
```

   (The overshoot is subtle at 0.38s; the snapshot is a flat image so corner
   radii are baked — acceptable, the bounds morph carries the effect.)
3. **Content entrance after the morph.** Detail views mount their secondary
   content (comments/replies, metadata rows, related lists) through the
   existing `staggerContainer`/`staggerItem` + `fadeRise` variants
   (`lib/motion.ts`): first ~8 items stagger at 30ms, the rest mount
   instantly (no long tails on big threads). While loading, skeletons show;
   when data arrives it staggers in. Under reduced motion `MotionConfig`
   already collapses this.
4. **Adopters (each = name the two ends + stagger the detail):**
   - **RMHark → detail/thread** (`RMHarkCard` root ↔ `PostDetail`/
     `ThreadView` hero card; replies stagger). The existing media-level morph
     stays — card and media morph together (nested names are fine).
   - **Image → lightbox** (`PostImageGrid` img ↔ the lightbox/viewer img —
     locate the existing lightbox; if images open in a dialog rather than a
     route, the same-document VT still works via `runViewTransition`).
     Lightbox chrome (close, counters) fadeRise on `.glass-overlay`.
   - **Book spine → reader** (`/library` `BookSpine`/`lib-book` cover ↔
     `library.$slug` reader cover/hero). Reader internals stay out of scope —
     name its existing hero element only.
   - **Blog/news card → reader** (list cards ↔ `/blog/$slug`, `/news/$slug`
     hero + title; article body fadeRise).
   - **Album tile → album viewer**, **build tile → build detail**
     (`builds_.$slug`), **persona tile → persona chat** — same pattern.
5. **Mobile:** VT morphs run on mobile Chromium/Safari; keep the morph
   duration ≤0.38s (long morphs feel laggy under touch); the stagger deltas
   stay ≤30ms. No-VT browsers (older Firefox) get instant nav + the stagger
   — still reads as a designed entrance.
6. **Glass rules:** morph targets are glass slabs — during VT they're
   snapshots, so backdrop blur freezes for the 0.38s (imperceptible; the
   destination re-samples live on arrival). Never set a VT name on an
   element inside a scroll container mid-scroll momentum (iOS jank) — set at
   interaction time, which naturally satisfies this.

### 5.5 Dialog, toast, progress accents

- **Dialog** (`components/ui/dialog.tsx` + its css): content enter re-tuned
  to scale `0.94 → 1` with `var(--ease-glass)` (a whisper of overshoot);
  scrim timing unchanged. Under reduced motion both collapse (existing reset).
- **Toasts** (sonner config in `Providers.tsx`): success toasts get a one-shot
  rim flash — a `box-shadow` keyframe from
  `inset 0 1px 0 var(--site-success)` fading to the standard rim over 0.8s.
- **NavigationProgress** (`components/ui/`): keep the accent core; add a white
  specular cap via a small trailing gradient — reads as light running along a
  glass fiber. (Token-only colors.)

---

### 5.5x Layout clarity, mobile friendliness & tilt light (amendment 2026-07-21d)

**Owner request:** revamp element layout for clarity — nothing overlaps;
verify mobile friendliness end-to-end; and make the glass respond to device
tilt.

**A. No-overlap & clarity pass.** Audit and fix, with live verification
(the dev server + Playwright are available — screenshot desktop 1440px and
mobile 390px, plus programmatic `getBoundingClientRect` intersection checks
on the floating elements):

1. **Floating-element stack:** dock, MiniPlayer, BackToTop, cookie bar,
   toasts — verify vertical stacking on mobile (`.bottom-above-dock`,
   `--safe-bottom`) and that no two overlap when all are visible.
2. **Z-index ladder:** sidebar rail (30), header capsules (10), drawer (60),
   overlays/palette — enumerate and fix any pair that can collide (e.g. an
   open popover under a later sticky capsule).
3. **Tablet rail (Phase B note):** at `md` the 64px rail + `m-3` insets
   compress icon pills — tune the collapsed-rail padding so pills breathe.
4. **Tab sheets on narrow screens:** every §5.45 sheet must scroll
   horizontally (`overflow-x-auto`, no wrap, edge fade mask) — never clip or
   collide with `headerRight` actions at 390px.
5. **Header capsules vs. content:** consistent first-content gutter below
   every capsule (no content sliding under the capsule at rest); breadcrumb +
   long titles truncate rather than push `headerRight` off-viewport.
6. **Spacing rhythm:** gutters between floating panes are the §8 constants
   (`space-y-3` / `gap-4/6`) everywhere — kill ad-hoc `mt-*` drift on the
   restructured pages.

**B. Mobile friendliness.** At 390×844 (and `xs` 480): drawer + dock
gestures still work; feed cards/media never overflow the viewport; tab
sheets scroll; the settings clarity slider is thumb-operable (≥44px target);
forms keep the 16px zoom floor; safe-area insets respected. Fix what fails.

**C. Tilt-driven glass light.** The scene light (§4.4) learns device
orientation, so tilting the phone slides the glint across every pane — the
signature mobile counterpart of pointer tracking:

1. Extend the orientation path in `hooks/useLiquidBackground.ts` (it already
   maps `deviceorientation` on no-permission platforms) — or a sibling in
   `useGlassLight` sharing its listener — to also write quantized
   `--light-x/--light-y` (viewport px: center + gamma/beta normalized ×
   ~40% of viewport). Toggle `html.tilt-live` while orientation events flow.
2. Under `html.tilt-live`, coarse-pointer devices switch their glint from
   the static top-edge gradient to the viewport-anchored radial (same layer,
   `--glass-glint-attach` flips to `fixed`). **iOS caveat:** fixed
   attachment is historically buggy in iOS Safari — verify in the iOS
   simulator profile; if it misrenders, keep iOS on the static gradient and
   ship tilt for Android only (leave the gate commented).
3. **iOS permission:** `DeviceOrientationEvent.requestPermission()` needs a
   user gesture — add a "Tilt effects" enable row in Settings → Appearance
   (only rendered when the permission gate exists), persisting consent as
   `rmh-motion-ok`; auto-enable elsewhere. Off under reduced motion /
   `perf-lite` (same gates as the aurora parallax).
4. The aurora parallax keeps its existing tilt input — light + backdrop
   moving together is what sells the material.

## 6. New tokens & JS surface (complete list)

`:root` additions (each theme may override; sane defaults inherit):

```css
--ease-glass: cubic-bezier(0.175, 0.885, 0.32, 2.2);
--glass-bevel: 12px;               /* optics ring thickness */
--glass-glint-size: 340px;         /* specular falloff radius */
--glass-glint-opacity: 0.9;
--site-glass-glint: var(--site-glass-rim);   /* accent presets re-derive */
--site-aurora-far-1 / --site-aurora-far-2;   /* far-field aurora stops */
/* --light-x / --light-y: NOT declared (absence = sun default in the
   radial-gradient var() fallbacks). Written by useGlassLight v2 only. */
/* --glass-lens / --glass-lens-prism: written by lib/glass-lens.ts only. */
```

JS: `useGlassLight` v2 (§4.4) · `lib/glass-lens.ts` (§3.3) · `LiquidTabs`
(§5.4). Nothing else. Bundle growth budget: ≤4 KB gzipped total.

---

## 7. Visibility map — where a user actually sees v2

Every phase must leave its surfaces *visibly* changed in a normal browsing
session. The acceptance question per surface is literal: *"open the page,
move the mouse — do you see glass react?"*

| Surface (file) | v2 treatment |
|---|---|
| **Desktop sidebar** `app/routes/_site.tsx:84` aside + `components/feed/LeftSidebar.tsx` | Rail keeps `.glass-chrome--aside`; add optics ring on `::after` + `data-glass-lens` + `.glass-refract` adapted to the aside variant (the page edge visibly bends behind the rail — the sanctioned sidebar refract). Active nav capsule gets `.glass-liquid`; nav pills keep pointer light. |
| **Sticky page header** `components/feed/PageLayout.tsx:88–92` | `.glass-chrome` ring glint always on; `[data-scrolled]` → `--glass-glint-opacity: 1` + blur `12px → 18px` (add `--site-glass-blur-chrome-scrolled` or inline the swap). |
| **Mobile dock + drawer** `components/feed/MobileSidebarShell.tsx` (dock markup lives here — the `glass-chrome` bottom bar; verify with grep before editing) | Dock bar: ring glint (static sun variant on touch) + `.glass-liquid` ambient sheen (signature surface #1 on mobile); active tab capsule via `LiquidTabs` pattern. Drawer aside: ring on `::after` like the desktop rail, no refract (it animates). |
| **Feed** (`components/feed/RMHarkCard.tsx`, `FeedTabs.tsx`, composer) | Cards: hover glint ring (via `Card interactive` / `.glass-fill.glass-interactive` default — no per-card work). FeedTabs → `LiquidTabs`. Inline composer pane: `.glass-pane` ring (already L2). |
| **Dialogs / Command palette / popovers** (`ui/dialog.tsx`, `site/CommandPalette.tsx`, `site/NotificationsPopover.tsx`) | `.glass-overlay` ring glint automatic; palette pane additionally `.glass-refract--prism` + `data-glass-lens` (flagship overlay); dialog spring enter. |
| **Buttons** (`ui/button.tsx`) | Spring press (§5.3); `accent`/`default` variants get `.glass-sheen-hover`. |
| **Login** `app/routes/login.tsx:358` | Already `glass-pane glass-refract glass-refract--prism` — becomes the showcase automatically once the lens filters replace turbulence; add `data-glass-lens` + `.glass-liquid`. |
| **Library hero** (`components/library/*`, `lib-hero`) | Hero pane: `.glass-refract` + `data-glass-lens` (page's refract slot) + ring glint. |
| **Store / membership** (`components/membership/MembershipPanel.tsx`, `feed/ShopColumn.tsx`) | Featured tier: the page's `--prism` slot + `.glass-liquid`. Shop tiles: hover glint (interactive fills). |
| **Settings** (`ThemeGallery`, appearance) | Theme swatches render mini glass cards — ensure the glint ring shows in swatches (pure CSS, they inherit). No new toggles needed: all v2 optics obey the existing Reduce-transparency toggle + perf-lite. |
| **Admin dashboard** `app/routes/_site/admin/index.tsx` | Link tiles already `.glass-interactive` → hover glint free. Everything else in admin: **no new optics** (density rule v1 §9.9 stands — glint on hover only). |
| **Design lab** `app/routes/liquid-glass.tsx` | Rebuild sections: lens vs turbulence comparison, prism on/off, glint playground (drag a fake light), sheen, LiquidTabs demo, degradation preview toggles. This page is the §12 acceptance instrument. |

---

## 8. Layout restructure — the floating glass shell

> **Amendment (2026-07-21, owner request):** v2 is *not* CSS-only. The page
> layout itself is restructured so the glass has something to float over.
> This supersedes v1 §15's "no layout changes" non-goal.

### 8.1 The problem with the current anatomy

The shell is an **app frame**: a full-height sidebar flush against a bordered
center column (`border-r border-site-border`) with a full-bleed sticky
header, and the feed is a Twitter-style divided list
(`RMHarkCard.tsx:207` — `px-4 py-3 border-b border-site-border` rows).
Everything touches everything; the aurora only peeks through tints. Glass
panes read best when they **float** — discrete slabs with the lit scene
visible in the gutters around them.

### 8.2 Floating shell (Phase B — one change, every page inherits)

1. **Sidebar → floating rail.** Keep the fixed aside + spacer geometry
   *exactly* (`_site.tsx:84` — widths, z-index, containing-block rule §3.3.1
   all untouched). Inside the aside, wrap `LeftSidebar` in an inner rail
   panel: `m-3 h-[calc(100%-1.5rem)] rounded-site glass-chrome--aside
   overflow-hidden flex flex-col` + the optics ring (`::after`) +
   `data-glass-lens .glass-refract` treatment adapted to the aside variant.
   Remove the aside's `border-r` (the rail's own rim replaces it). The page
   edge now visibly bends and glints behind a floating rounded rail.
2. **Sticky header → floating capsule.** In `PageLayout.tsx:88–92`: the
   header becomes `sticky top-3 z-10 mx-3 rounded-site glass-chrome
   shadow-site-sm` (+ ring) instead of full-bleed `top-0 … border-b`.
   Scroll condensation stays (height + tint + now glint §7). The same
   treatment applies to the feed's own sticky header
   (`FeedColumn.tsx:138`) and any column header using the
   `sticky top-0 … glass-chrome border-b` pattern
   (`components/feed/ColumnHeader.tsx` if shared — grep
   `sticky top-0 z-10` under `components/feed/`).
3. **Center column → transparent track.** Remove
   `border-r border-site-border` from the column wrappers (`PageLayout.tsx:80`
   and the feed-column pages that hand-write it — grep
   `border-r border-site-border` in `app/routes/_site/` +
   `components/feed/`). Columns keep their `max-width`/`pb-dock`; the shell's
   outer flex gains aurora gutters: `md:gap-4 xl:gap-6 md:px-4` on the
   `_site.tsx:61` flex row. The **content floats as panes; the column itself
   stays transparent** (no giant blur surface — budget).
4. **Right sidebar → floating widget stack.** `RightSidebar.tsx` sections are
   already `glass-fill` cards — wrap the aside content in
   `sticky top-3 space-y-3` and drop any leftover left hairline.
5. **Landmark fix (while in here):** `AnimatedMain` renders
   `<main id="main-content">` *inside* the shell's
   `<main id="main-content" class="contents">` (`_site.tsx` ~line 100) —
   nested mains + duplicate id. Change `AnimatedMain` to render a `<div>`
   (verify with grep that no top-level route depends on its landmark; the
   shell's `<main>` keeps the id and the skip-link target).
6. **Mobile:** the drawer/dock mechanics are untouched. The floating header
   capsule insets `mx-2 top-2` below `md`; columns stay edge-to-edge
   (gutters are a ≥`md` luxury — phone width is too precious).

### 8.3 Feed restructure (Phase C — the flagship visible change)

- **Post rows → floating glass cards.** `RMHarkCard` root
  (`RMHarkCard.tsx:207`): `px-4 py-3 border-b border-site-border` becomes
  `glass-fill rounded-site px-4 py-3` (border comes from `.glass-fill`).
  The list container (`FeedList.tsx` / `FeedColumn.tsx:231`) swaps
  `divide/border-b` for `space-y-3 px-3 pt-3` — aurora gaps between every
  post. Media inside cards rounds to `rounded-site-sm` and stays within the
  card radius.
- **Virtualization guard:** `.feed-card-cv`'s
  `contain-intrinsic-size: auto 320px` (`globals.css:2406–2409`) accounts for
  the new gap (`auto 332px`) so restore-scroll stays accurate.
- **Composer** (inline feed composer): its own `.glass-pane rounded-site mx-3`
  slab, separated from the first post by a gutter.
- **Pinned hero / announcements** (`PinnedHero.tsx`, `FeedAnnouncements.tsx`):
  become `.glass-pane` slabs with the ring; the hero may take the page's
  `.glass-refract` slot on `/`.
- Thread/detail internals (`ThreadView`, `PostDetail`) keep their connector
  hairlines *inside* their card — only the outer framing floats.

### 8.4 Per-page restructures (Phase C, flagships)

| Page | Restructure |
|---|---|
| `/library` | Hero becomes a full-width floating `.glass-pane .glass-refract` slab with the stats `<dl>` etched into it (v1 §9.2 finally realized); shelves separated by aurora gutters instead of section borders. |
| `/store` | Tier cards become three floating `.glass-pane` slabs over open canvas (featured = prism + sheen), shop grid floats below with gutters — delete any wrapper borders. |
| `/settings` | Section groups become discrete floating panes (`space-y-4`, no divide-y between groups); rows keep hairlines *inside* panes. |
| `/profile/$id`, `/u/$userid` | Identity header becomes a floating pane overlapping the banner (negative margin), tabs → `LiquidTabs`, content cards float with gutters. |
| `/notifications`, `/messages` | Rows stay dense **inside** one floating `.glass-fill` container card per group (density pages don't explode into per-row cards). |
| Admin | **No restructure** — density rule stands; admin inherits the shell only. |

### 8.5 Still explicitly unchanged

- Elevation tiers, blur radii, tint tokens, theme catalog, accent presets,
  `THEME_BG`, anti-FOUC script.
- Containing-block rules (aside blur on pseudo; `.glass-opaque`;
  `[data-drawer-active]`) — §2.
- Column `max-width` constants (`lib/layout-width.ts`) — gutters come from
  flex `gap`, not width math.
- No new fonts, icons, routes, or dependencies (`framer-motion` exists).
- Games/apps (`THEME_EXCLUDED_ROUTES`), API routes, auth, economy.

---

## 9. Performance budgets (v1 §6.1 amended)

| Budget | Limit |
|---|---|
| Elements with any `backdrop-filter` per viewport | **≤8** (unchanged) |
| Lens-displacement (`.glass-refract`) elements per page | **≤2** static + the command palette while open |
| `--prism` (3-pass) elements per page | **≤1** (+ design lab) |
| Ambient `.glass-liquid` sheens per page | **≤3**; hover sweeps unrestricted |
| Always-on glint rings per viewport | **≤10** (comes free with the ≤8 backdrop budget + dock/aside) |
| Live lens `<filter>` nodes (size buckets) | **≤8**, LRU |
| `--light-x/y` writes | rAF-throttled + 8px quantized, single listener |
| New JS | ≤4 KB gz | 
| Repeated list items (L1) | still **zero** backdrop-filter, **zero** always-on pseudo paint (hover-only ring) |
| New layout-triggering animations | 0 (background-position/transform/opacity only) |

Regression gates: RUM INP p75 <200ms unchanged; steady-scroll trace on `/`,
`/library`, `/store` at 4× CPU throttle — no frame >16ms attributable to ring
repaint or aurora layer 2; toggling `perf-lite` must visibly remove: lens
refraction, glint tracking (static sun remains), sheen, far aurora.

Engine matrix (delta from v1 §6.3): `backdrop-filter: url()` — Chromium only
(unchanged); `background-attachment: fixed` — gated off touch/iOS by the §4.2
media query; `mix-blend-mode: screen` + `mask` — all evergreen engines;
`feComposite arithmetic` — all engines that run SVG filters (only Chromium
reaches it via `backdrop-filter` anyway).

---

## 10. Accessibility & degradation (v1 §10 amended)

One rule set, four triggers — extend the **existing** blocks at
`globals.css:853–927` (do not fork new ones):

| Trigger | v2 behavior |
|---|---|
| `.style-high-contrast` | All optics dead: add the new ring pseudos (`:is(.glass-pane,.glass-overlay,.glass-chrome)::before`, `.glass-chrome--aside::after`, `.glass-fill.glass-interactive::before`) and `body::after` to the existing `display:none` list; `.glass-liquid` background-image → `none`. |
| `prefers-reduced-transparency` / `html.reduce-transparency` | Rings + lens + sheen off (same selectors); surfaces already go opaque. |
| `prefers-reduced-motion` / `html.reduce-motion` | Sheen/aurora frozen by the existing global reset; glint becomes **static sun** (JS stops tracking, §4.4); LiquidTabs capsule jumps; dialog spring collapses. The static sun glint itself is *not* motion — it stays. |
| `html.perf-lite` | Lens filters not generated (JS gate) + `--glass-lens` ignored; ring `background-attachment` → `scroll` with static sun; sheen off; `body::after` off. Chrome/overlay blur stays (identity), exactly like v1. |
| `forced-colors: active` | Rings/sheen paint nothing visible (backgrounds stripped); keep the existing structural-border rule; verify the new pseudos don't paint (add `background: none`). |
| RTL | The light is physical, not directional UI — **no flipping** (v1 rule). LiquidTabs uses logical positioning; framer-motion `layoutId` handles RTL automatically — verify with `ar`. |
| Contrast | The glint is `screen`-blended rim light on non-text bands — no text sits in the ring (rule §2.2). Axe pass on `/`, `/store`, `/library` per theme stays the gate. |

---

## 11. Implementation phases — sized for parallel Opus subagents

Rules for every phase agent:
- Read this doc + `docs/design-language.md` first. Touch **only** your
  phase's files. Never edit `routeTree.gen.ts`, never add dependencies.
- Exit green: `pnpm exec tsc --noEmit` · `pnpm lint` (no new warnings) ·
  `pnpm exec vitest run` (suite must stay green).
- Any string → `t(..., { defaultValue })`; run `pnpm i18n:extract` if added.
- Comment the *constraints*, not the changes (containing-block rules, budget
  rations, pseudo ownership).

| Phase | Contents | Files | Depends on |
|---|---|---|---|
| **A — Optics core** | §2 layer contract; §3 lens map + `#glass-lens`/`#glass-lens-prism` + `lib/glass-lens.ts` + `GlassFilter` v2 (delete turbulence); §4 ring glint CSS + `useGlassLight` v2; §5.1 aurora layer 2 + richer drift; §5.2 sheen rebuild; §5.3 press tokens + button/global-press amendments; §6 tokens; §10 degradation-rule extensions; design lab rebuild | `app/globals.css`, `components/ui/liquid-glass.tsx`, `hooks/useGlassLight.ts`, **new** `lib/glass-lens.ts`, `lib/appearance.ts` (glint derivation), `lib/motion.ts` (comment only), `components/ui/button.tsx`, `app/routes/liquid-glass.tsx` | — |
| **B — Shell restructure & primitives** | §8.2 floating shell (rail, header capsule, transparent track + gutters, right-rail stack, landmark fix); §7 rows: drawer + dock + dialogs/palette/popovers/toasts + `LiquidTabs` primitive + Card hover ring verification + BackToTop/Tooltip | `app/routes/_site.tsx`, `components/feed/LeftSidebar.tsx`, `MobileSidebarShell.tsx`, `PageLayout.tsx`, `AnimatedMain.tsx`, `ColumnHeader.tsx`, `RightSidebar.tsx`, `components/ui/dialog.tsx` (+css), **new** `components/ui/liquid-tabs.tsx`, `components/site/CommandPalette.tsx`, `NotificationsPopover.tsx`, `components/Providers.tsx` (toast opts), `components/ui/card.tsx` | A |
| **C — Page restructure & visibility** | §8.3 feed floating cards + composer/hero slabs; §8.4 flagship restructures (library, store, settings, profile, notifications/messages containers); §7 rows: FeedTabs/Profile/Search/Library/RMHLadder/creator-studio → `LiquidTabs`; login upgrade; shop tiles; DailyPuzzlesHub refactor; `border-r border-site-border` sweep across `_site` columns | `components/feed/RMHarkCard.tsx`, `FeedList.tsx`, `FeedColumn.tsx`, `FeedTabs.tsx`, `PinnedHero.tsx`, `ComposeBox.tsx`, `ProfileColumn.tsx`, `SearchColumn.tsx`, `NotificationsColumn.tsx`, `MessagesColumn.tsx`, `components/library/*`, `components/creator-studio/*`, `components/rmhladder/*`, `components/membership/MembershipPanel.tsx`, `components/feed/ShopColumn.tsx`, `app/routes/_site/settings*`, `app/routes/login.tsx`, `components/daily-puzzles/DailyPuzzlesHub.tsx`, `globals.css` (`.feed-card-cv` size only) | A, B (LiquidTabs + shell) |
| **D — Dead-UI removal** | Appendix D list: delete/deprecate every confirmed-dead item; migrate the last `:is(.absolute,…)` catch-all consumers; final grep gates | per Appendix D | A–C (deletes last) |
| **E — Docs & verification** | Update `docs/design-language.md` (§5.1 table + §7 motion) and `page-consistency.md`; full §12 QA; RUM note; final build | docs, — | A–D |

B and C are parallel-safe after A **except** the shared `LiquidTabs` file —
B creates it, C consumes it (C waits for B's primitive or B hands it over
first; the orchestrator sequences this).

---

## 12. QA / acceptance

1. **Optics correctness (design lab):** lens bends edges inward-compressed
   (no center wobble); prism fringes blue-outward; glint follows a dragged
   pointer across ≥3 panes simultaneously; sheen sweeps ~every 9s on ≤3
   surfaces; all four degradation toggles kill the right things (§10 table).
2. **Visibility smoke (the user-facing bar):** on `/`, `/library`, `/store`,
   `/settings`, `/login` with a mouse: the sidebar is a floating rounded
   glass rail; the header is a floating capsule; feed posts are discrete
   glass cards with aurora visible between them; moving the cursor makes
   rims glint; hovering cards lights them; switching tabs flows a capsule;
   pressing buttons springs; the background has depth-parallax. Each
   verifiable without dev tools.
   **Layout regression guard:** sticky pinning still engages (header capsule
   + feed header), the sidebar user menu still positions against the
   viewport, drawer/dock gestures still work, scroll restoration lands
   correctly on the resized feed cards, and RTL (`ar`) mirrors the gutters
   symmetrically.
3. **Perf:** §9 gates (DevTools trace at 4× throttle; layers panel count of
   backdrop-filters ≤8; no long task >50ms from `pointermove`).
4. **Engines:** Chromium full; Firefox/Safari get edge-blur refract fallback +
   full glint/sheen/tabs; iOS gets static-sun glint (no fixed-attachment
   artifacts — verify on device sim).
5. **Themes:** all 6 — glint must be visible-but-subtle on Glass Light and
   Sepia (light rims on light frost — tune `--glass-glint-opacity` per theme
   if needed); high-contrast shows zero optics.
6. **Greps must return empty** after Phase D: `style-liquid-glass`,
   `vibe-glass`, `liquid-glass-refract`, `glass-distortion` (except the lens
   alias if intentionally kept), plus the Appendix D items.
7. `pnpm exec tsc --noEmit` · `pnpm lint` · `pnpm exec vitest run` ·
   `pnpm build` all green; `pnpm i18n:extract` diff committed if strings
   changed.
8. **Final hygiene sweep (last phase, mandatory).** Every amendment round
   must leave zero superseded code behind — future agents read this repo as
   ground truth. Standing rule for all phases: **when you replace a
   mechanism, delete its predecessor in the same change** (no compatibility
   shims, no "kept just in case" CSS). The closing sweep then verifies:
   - No orphaned selectors/tokens/keyframes from earlier v2 rounds: check at
     minimum the pre-§4.35 ring-glint selectors, `--glass-bevel*` (now
     refraction-ring-only — delete if nothing consumes), old tab
     underline/active styles obsoleted by §5.45 sheets (`FeedTabs`,
     `creator-studio.css` `.cstudio-tabs .is-active` remnants,
     `rmhladder.css` nav rules, `library.css` `lib-nav` positioning), the
     reduce-transparency *toggle* UI leftovers after the §5.46 slider, and
     any unused `--glass-user-*` / tilt / goo scaffolding.
   - Every CSS custom property defined in `globals.css` under the glass
     system has ≥1 consumer (grep); every `.glass-*` class has ≥1 usage or
     a documented escape-hatch note.
   - §12.6 greps still return zero; re-run the Appendix D checks.
   - Docs match final reality: `design-language.md` §5–7,
     `page-consistency.md` checklist, and a status note at the top of the
     v1 plan doc pointing here. Superseded sections *within this doc* keep
     their amendment pointers (they narrate why, which is useful history —
     code carries none of it).

---

## 14. Glass-native user themes & marketplace (amendment 2026-07-21f)

**Owner request:** liquid glass must work with website themes — including
user-made ones; a themes **marketplace** where only **members** can create
but anyone can **buy with RMH coins**; a good **preview system** for
creation; mobile-friendly throughout.

**Ground truth:** a Theme Studio + economy skeleton exists —
`prisma` `UserTheme` (tokens Json v1, status, `priceCoins` 200–5000,
`sales`), `lib/themes/tokens.ts` (strict zod, 9 flat hex colors + radius),
`lib/themes/themes.server.ts`, `components/themes/ThemeStudio.tsx` (144
lines, has buy-with-coins), `ThemeEditor.tsx` (221 lines),
`app/routes/_site/studio/themes.tsx`. **The v1 contract is glass-hostile:**
`--site-canvas` is set to a flat hex (glass over a flat color reads as gray
plastic — §3.2) and no glass tokens exist, so applying a user theme
currently degrades the entire material system. No membership gate found on
creation.

### 14.1 Token contract v2 — themes are tints of the glass

Principle (same as built-in themes, §3.4): **a theme supplies colors and a
few scalar knobs; the system owns the glass geometry** (blur tiers, bevel,
shadow composition, aurora keyframes, glint mechanics). That way every user
theme is automatically a correct glass tint, and future optics upgrades
apply to all sold themes retroactively.

```ts
// lib/themes/tokens.ts — v2 (strict, colors + numbers only, never CSS strings)
{
  v: 2,
  // The scene: base + three aurora glows. The radial GEOMETRY is a fixed
  // system template (same stop positions/alphas as built-in canvases);
  // the theme only colors it.
  canvasBase: hex, glow1: hex, glow2: hex, glow3: hex,
  // The material: one tint color + alpha (clamped 0.04–0.30 dark / ≤0.65
  // when canvasBase luminance is high), rim/glint strength 0–1.
  tint: hex, tintAlpha: number, glintStrength: number,
  // Ink & accent (as v1): text, textMuted, accent, accentFg, border, radius.
  …
}
```

`themeCssVars()` v2 derives the full contract: `--site-canvas` from the
4 scene colors via the standard radial template; `--site-glass-tint(-strong)`
from tint+alpha; rims/glint from tint luminance (light themes get bright
rims at lower `--glass-glint-opacity`, mirroring §4.35.4);
`--site-aurora-far-1/2` at reduced alpha; `--site-surface-opaque` as a solid
mix; depth shadows tinted from `canvasBase`. **v1 themes upcast on read**
(deterministic defaults: glows derived from accent/bg mixes, tintAlpha from
the v1 surface-vs-bg delta) — existing drafts and purchases keep working;
`THEME_TOKENS_VERSION = 2` with a back-compat parse, never a breaking
reject.

Runtime: applying an owned theme sets the derived vars the same way accent
presets do (inline on `<html>`), pre-paint via the no-flash script
(persisted `rmh-user-theme` cache of the derived vars). High-contrast and
the OS/reduced-transparency overrides still win; the §5.46 clarity slider
composes independently (multipliers on top of any theme).

### 14.2 Marketplace

- **Create/publish = members only, server-enforced** in
  `themes.server.ts`/the API routes (use the same membership check the rest
  of the economy uses — locate it, don't invent one). Non-members browsing
  the create tab get a glass upsell CTA → `/store`. Buying stays open to
  anyone with coins (flow exists — verify zod + rate limit + overdraft
  handling on the coin spend; the economy tests in `testing/` show the
  invariants).
- **Browse:** the studio themes tab becomes a marketplace grid — L1
  `.glass-fill.glass-interactive` cards, each with a **live mini-shell
  preview** (see 14.3) rendered under that theme's scoped vars, price chip
  (coins), sales count, author; sort: top / new. Owned themes → inventory
  section with Apply/Remove.
- **Try before buying:** a "Preview" action applies the theme transiently
  site-wide via the existing `themeStore.preview` mechanism with a floating
  glass confirm bar (Buy · Exit preview) — the strongest possible preview is
  the real site.
- Publish flow keeps the 200–5000 coin price validation and DRAFT→PUBLISHED
  transitions; no new moderation machinery (reuse the existing report path
  only if it is a one-liner; otherwise out of scope).

### 14.3 The preview system (creation)

- **Editor = controls + a live glass scene**, not swatches: the preview pane
  renders a **mini site shell** — sidebar-rail sliver, floating header
  capsule, one feed card, a Button row, a LiquidTabs sheet, an input well —
  inside a scoped container carrying the draft's derived vars over the
  draft's own aurora (the §4.35 glint and material read for real, because
  the scoped vars feed the same classes).
- **Preview-on-site** button: transient site-wide application
  (`themeStore.preview`) with a floating exit bar — same mechanism as
  try-before-buy.
- **Contrast guardrails:** live WCAG checks (text vs. tint over the
  brightest glow; accentFg vs. accent) shown as inline warnings; publishing
  with a failing AA pair is blocked server-side (the check is pure math on
  the token values — implement once in `lib/themes/tokens.ts`, shared by
  editor + API).
- **Mobile:** editor stacks (preview above, controls in an accordion/sheet
  below), 44px targets, slider/color inputs thumb-friendly; marketplace
  grid single-column at `xs`.

### 14.4 Verification

tsc/lint/vitest green; economy invariants untouched (coin tests pass);
member gate covered by a unit test on the server function; v1→v2 upcast
round-trip test; editor + marketplace screenshots at 1440px and 390px in
Glass Dark + Sepia.

---

## 15. Consistency & liquid-feel polish (amendment 2026-07-21g)

**Owner feedback after using the shipped build:** (a) many UI elements lack
proper spacing between them; (b) navigating to an RMHark **cancels the
liquid-open animation** — it reads choppy; (c) elements "don't morph much" —
the metaball effect is too subtle; (d) tab styling is not unified (e.g. the
store's Shop/Market tabs vs. everywhere else).

### 15.1 Unify every tab strip (the key ask: consistency)

One visual grammar for all tab strips: **glass sheet + flowing capsule**
(§5.45 + §5.47). Sweep and converge:

- `/store` Shop/Market kept an **underline marker** through Phase G — convert
  to the capsule treatment (keep `?tab=`, roving nav, ARIA; the underline
  dies per §12.8).
- Grep for remaining underline/`border-b`-active tab patterns across
  `components/` + `app/routes/_site/` (`aria-selected` + underline styles,
  accent-underline Link rows used as tabs) and converge each on the
  sheet+capsule grammar — `LiquidTabs` for plain tablists, sheet classes +
  inline `layoutId` capsule where links/richer ARIA demand custom markup
  (the RMHLadder pattern).
- Every converged capsule carries the §5.47 morph underlay — a strip is
  either fully liquid or it isn't shipped.

### 15.2 Fix the choppy liquid open

Root-cause hypothesis (verify in code): `startViewTransition` freezes
rendering until the `update` promise resolves — a slow destination loader
stalls the freeze, and the entrance work after it reads as the animation
"cancelling". Fixes:

- **Readiness budget:** in `runViewTransition`, if the update promise is
  still pending after **~180ms**, call `transition.skipTransition()`
  (feature-detect) — instant swap + normal entrances instead of a stalled
  morph. The skip path must clear `vt-active`/`vt-liquid` synchronously and
  must not double-fire the destination staggers.
- **Warm the destination:** liquid-open cards get TanStack Router
  `preload="intent"` so data is usually cached before the click (verify feed
  card links; add where missing).
- Acceptance: warm navigations morph smoothly; cold ones swap instantly with
  the stagger — never a frozen half-morph.

### 15.3 More pronounced morphing (metaballs)

Tune §5.47 until the merge is *visible* in normal use (design-lab playground
is the instrument):

- Goo: `stdDeviation` toward ~9 with a rebalanced threshold so the fusion
  neck is thicker and lives longer; trail droplet ~70% of capsule height on
  a ~⅓-stiffness spring (visible lag); widen the speed-gated opacity window
  so the teardrop is seen, not glimpsed.
- Stretch cap toward 0.5 for tab-scale distances.
- Optionally a second micro-droplet for jumps >3 tab widths — ship it if the
  lab says yes, note why if not.
- Budgets/gates unchanged (reduced-motion jump; perf-lite plain spring).

### 15.4 Spacing rhythm enforcement

The §8 constants are law: **12px (`space-y-3`/`gap-3`) between sibling glass
elements in a column; `md:gap-4 xl:gap-6` between columns; capsule-to-first-
content `mt-3`.** Sweep the restructured pages for violations (adjacent
cards/sheets/panes at 0–4px, sections butting tab sheets, headerExtra
remnants) and fix to the constants. Add the rhythm rule to the
page-consistency.md checklist. Live-verify with the Phase-H audit-script
pattern (gap measurement between sibling glass rects) on `/`, `/store`,
`/library`, `/settings`, `/studio/themes` at 1440 + 390.

**Internal padding too (owner follow-up):** the rhythm rule covers the
inside of elements, not just gaps between them — text inputs/wells at
`px-3.5 py-2.5` minimum (16px floor on phones stays), buttons per their CVA
sizes, card content `px-4 py-3`+, list rows never letting text touch the
glass edge (≥12px inline padding). Sweep the same five pages for cramped
interiors (inputs, chips, wells, menu rows) and fix to the primitives'
canonical paddings rather than inventing per-page values.

### 15.7 Services dropdown → Services page (owner ask; ships with the §15.6 phase)

The sidebar's "Services" nav group is currently an expanding dropdown of
links. Convert it to a **`/services` page**: the sidebar entry becomes a
plain nav link (dropdown dies per §12.8); the page is a standard
`PageLayout` route ("Services" title capsule) with a **tab sheet below the
title** (§5.45 grammar, morphing capsule) — one tab per current dropdown
child, each tab hosting that service's summary card(s)/link-outs. Keep the
existing child routes reachable exactly as today (tabs link/route to them —
follow the RMHLadder link-tab pattern if children are separate routes, or
`?tab=` panels if they are content sections). i18n via existing nav strings
+ `t()` for new ones; mobile: single column, tab sheet scrolls. Verify the
"RMH Ventures" sibling group for the same treatment IF its children are the
same shape — otherwise leave and note.

### 15.6 Liquid pop — metaball open/close for floating UI (owner follow-up; runs as its own phase after §15.1–15.5)

**Owner ask:** popovers, menus, dropdowns (and selects where technically
possible) must be consistently styled — proper opacity, no content ghosting
— and open/close with a **liquid-glass metaball animation**: the panel
morphs out of its trigger like a droplet budding off, and reabsorbs on
close.

**Hard constraint (from §5.47):** an element with `backdrop-filter` must
never sit inside a `filter: url(#glass-goo)` subtree (it re-rasterizes and
breaks the backdrop sampling). `.glass-overlay` panels blur their backdrop —
so the panel itself can never be goo-filtered. The morph is therefore a
**two-act structure**:

1. **Act 1 — the bud (goo, ~160–200ms):** a dedicated goo underlay (fixed-
   positioned, `contain: layout paint`, `filter: url(#glass-goo)`) contains
   two solid accentless tint blobs (`--site-glass-tint-strong` over
   `--site-surface-opaque` mix — NO backdrop blur): a small disc anchored on
   the trigger and a growing rounded-rect scaling from the trigger toward
   the panel's final rect. Blur+threshold fuses them: the panel visibly buds
   out of the trigger with a liquid neck that pinches off as separation
   completes.
2. **Act 2 — the settle (glass, ~120ms overlap):** the real `.glass-overlay`
   panel fades/scales in **on top** of the blob during the last frames
   (crossfade), then the underlay unmounts. Close plays the acts in reverse
   with shorter timings (~120ms total — closes must feel snappier than
   opens). Content (menu items/text) rides the real panel only — never
   filtered.

**Implementation shape:** one shared primitive — `components/ui/liquid-pop.tsx`
(`useLiquidPop({ triggerRef, panelRef, open })` returning the underlay
portal + data-state hooks) — consumed by: the Radix popover wrapper
(`radix-popover-animate` sites), `NotificationsPopover`, the sidebar user
menu, the feed overflow/repost/attachment menus and hand-rolled dropdowns
(the Phase-D `.glass-overlay` migration list is the inventory),
`EmojiPickerPanel`, `ReactionMenu`, and autocomplete panels
(`MentionTextarea`, `HandleInput`). **Tooltips are exempt** (too frequent,
too small — keep the existing fade). **Native `<select>` popups cannot be
styled or animated** (OS-rendered) — the `Select` primitive stays native by
deliberate v1 decision; document the exemption in design-language.md §5.2
rather than converting to a custom listbox (an a11y-significant rewrite —
propose separately if the owner wants it).

**Opacity/consistency sweep (same phase):** audit every floating panel for
the L4 grammar — `.glass-overlay` background (62% bg mix — no thinner
ad-hoc tints), readable over bright aurora corners in Glass Light/Sepia,
`shadow-site`, hairline+glint edge. Fix stragglers (grep for floating
panels still on `bg-site-bg`/`bg-site-surface` with manual shadows).

**Gates:** reduced motion → instant open/close (no goo, no scale);
perf-lite → skip Act 1, keep the existing fade; high-contrast → no goo, no
fade-scale (opaque panel, instant). Budget: the underlay exists only while
animating (~200ms), one at a time in practice — no standing cost. Escape/
outside-click during Act 1 must resolve cleanly (cancel → reverse from
current progress or instant-close; never a stuck blob).

**Acceptance:** mid-animation frame captures showing the neck between
trigger and panel on open; menus in Glass Light show no content ghosting;
rapid open/close spam (10× toggle) leaves no orphaned underlays.

### 15.5 Sticky stacking (owner follow-up, same round)

Pages with 2+ sticky elements in one column (header capsule + sticky tab
sheet + sticky search, etc.) currently pin them to the **same top offset**,
so they overlap and hide each other while scrolled. Rule: **a column has one
sticky group.** Two compliant shapes:

1. **Merge** — functionally related co-stickies (tabs + search; title +
   filter row) join a single sticky glass container with internal `space-y-2`
   (one backdrop surface, cheaper too). Prefer this when the elements always
   appear/disappear together.
2. **Cascade** — independent stickies get cumulative offsets: the second
   sticky's `top` = first sticky's height + gutter (account for the
   condensed `data-scrolled` height and the smaller `top-2` mobile offset).
   Prefer this when one element can unmount independently.

Sweep every page with multiple stickies (`/search`, feed, creator studio,
library, RMHLadder shell, thread/detail views, any §15.1 convergence that
made a strip sticky) and apply one of the two shapes. Programmatic check:
scrolled to mid-page at 1440 + 390, collect all `position:sticky/fixed`
rects in the column — zero pairwise intersections.

Verification: gates green; before/after screenshots of the `/store` tabs and
one spacing-fixed page; §12.8 applies to every replaced style.

---

## 16. Shader-grade liquid glass & global scheme enforcement (amendment 2026-07-22a)

**Owner feedback with reference implementations:** the SVG blur-threshold
goo "doesn't look liquid at all" — implement like
`bergice/liquidglass` (WebGL fragment shader) and
`jeantimex/glass-effect-webgpu` (WGSL pipeline), cloned read-only at
`<scratchpad>/refs-liquidglass/` (single `index.html`, study its fragment
shader) and `<scratchpad>/refs-glass-webgpu/` (`src/` presets + WGSL —
study the refraction/dispersion/fresnel chain). Also: tabs STILL not
consistent (communities named); a global, *enforced* design scheme; several
concrete visual bugs (list in §16.3).

### 16.1 The liquid layer (Phase M1)

One fixed, full-viewport canvas (`#liquid-layer`, z-index −1) owned by a new
`lib/liquid-gl/` runtime, replacing the CSS aurora layers **when active**:

1. **Scene:** the shader renders the aurora itself — theme scene colors
   passed as uniforms (read the derived `--site-canvas`-family tokens; user
   themes v2 already expose scene colors), with the drift animation and
   `--aurora-mx/my` parallax as uniforms. Owning the scene pixels is what
   makes true refraction possible (the §3.6 insight, now shader-executed).
2. **Liquid bodies:** registered UI shapes rendered as SDF rounded-rects/
   discs with **smooth-min merging** (the real metaball look), refracting
   the shader's own aurora (UV displacement along the SDF normal ×
   thickness profile), fresnel-weighted specular lit from `--light-x/y`
   (pointer/tilt — the existing scene light feeds a uniform), and chromatic
   dispersion (per-channel refraction offsets, per the WebGPU reference).
   Bodies: tab/nav capsules + trail droplets (replaces the SVG `#glass-goo`
   path when active), the liquid-pop menu bud, hero-pane rims. Feed cards
   and content panels stay on DOM `backdrop-filter` (the canvas cannot
   sample DOM content — content-over-content glass remains CSS).
3. **Registration runtime:** `useLiquidBody(ref, kind)` / `data-liquid-body`
   → `lib/liquid-gl/registry.ts`; rects synced from the existing motion
   values (no layout reads in the frame loop), only while animating; body
   cap ~24.
4. **Tiering:** WebGPU (WGSL) → WebGL2 (port the same shader) → **current
   CSS/SVG stack unchanged** (also the reduced-motion / perf-lite /
   high-contrast / reduce-transparency path). `html.liquid-gl` gates: when
   the canvas is live, the CSS aurora layers and SVG goo underlays are
   hidden (never double-render).
5. **Budgets:** one canvas; DPR cap 1.5; pause on `visibilitychange`; idle
   damping (30fps when no body animates and parallax is quiet); zero
   per-frame allocations in the render loop; bundle: the runtime lazy-loads
   after first paint (no LCP cost).
6. **Interactivity mandate (owner):** every body responds — cursor
   (refraction bulges toward the pointer), press (depth pulse via the
   existing press states), tilt (specular uniform already rides
   `--light-x/y`).

### 16.2 Global scheme enforcement (Phase M2)

- **One tablist renderer.** Extend `LiquidTabs` to absorb the remaining
  custom cases: link-tabs (render-prop/asChild so RMHLadder-style route
  tabs keep `<Link>` semantics) and `aria-controls` wiring — then migrate
  EVERY remaining custom capsule strip onto it (communities, store,
  creator studio, RMHLadder, library) and delete the bespoke markup. No
  more "converged styling on custom markup" — one component, one look.
- **Design-lint test** (`lib/__tests__/design-consistency.test.ts`): a
  static scan that FAILS on: `role="tablist"` outside `liquid-tabs.tsx`;
  underline-active-tab patterns (`aria-selected` + `border-b`/underline
  markers); ad-hoc tab `layoutId` capsules outside sanctioned files. The
  "global website design scheme" as an executable gate — future drift
  fails CI, not a review eyeball.

### 16.3 Concrete fixes (Phase M2, from owner screenshots)

1. **Feed filter select shadow:** the select on the feed sheet renders a
   stray/doubled shadow — selects are `.glass-inset` wells (inner shadow
   only); find and delete the extra layer.
2. **Separator rhythm:** horizontal separators (`hr`, standalone
   `border-t/b` dividers) sit flush against neighbors — give separators
   `my-3` (or the divided rows their `py`) per the §15.4 rhythm; sweep.
3. **RelatedPosts:** cards render flush-stacked — `space-y-3`.
4. **PostDetail "← Post" capsule:** no padding below the header capsule —
   apply the standard `mt-3` first-content gutter.
5. **Double load animation on post open:** entrance animations play on the
   skeleton AND replay when data arrives — a jarring double entrance. Rule:
   **one entrance per navigation.** Root-cause (page-enter + stagger, or
   skeleton-stagger + content-stagger), then either crossfade
   skeleton→content with no re-stagger, or suppress the second pass
   (`initial={false}` on the data swap). Verify on a cold load of a post
   URL and a warm in-app open.
6. **Popover smoothness:** profile the liquid-pop open on a mid-tier
   throttle — no frame >16ms (no layout reads mid-animation; will-change
   discipline). (Full shader-driven buds arrive with M1.)
7. **Universal micro-interactivity (owner):** everything clickable or
   hoverable animates — hover raise/glint + press response on every
   interactive element (buttons, links, icon buttons, rows, chips). Audit
   pass with fixes; reduced-motion collapses everything as usual.

Verification for both phases: gates green; design-lint test green; frame
captures (shader teardrop vs SVG for M1; smooth popover trace for M2);
mobile spot-check at 390px.

### 16.4 Navigation freeze (owner regression report — diagnose first, then fix)

**Owner:** "Switching pages seems to freeze everything, it might be an
animation issue?" Treat as P0. Diagnosis mandate — trace before touching
code. Suspects, in likelihood order:

1. **View-Transition freeze windows.** `startViewTransition` halts rendering
   from capture until the update promise resolves. Verify the §15.2 180ms
   `skipTransition()` budget actually engages (feature presence, timer
   correctness, and that the *capture itself* isn't the cost — snapshotting a
   long feed at high DPR can block for hundreds of ms before any timer
   matters). Consider: skip VT entirely when `document.hidden`, when the DOM
   is huge, or when navigation type isn't a card-open.
2. **Continuous rAF + layout reads in the morph underlays.** `useLiquidMorph`
   samples the capsule's projected rect per frame per mounted strip
   (sidebar + every tab sheet). Rule: **samplers idle when nothing
   animates** — subscribe to the layout transition's start/finish (or
   velocity ≈ 0 for N frames → stop; restart on layoutId change), and cache
   rects instead of re-reading layout per frame.
3. **Shader-layer init/nav cost** (only if present on the tested build):
   scene re-parse on theme/route change must be one-shot, never per frame;
   registry cleanup on unmount verified.
4. Anything else the trace actually shows (long tasks > 100ms during nav
   with attributed stacks decide — not intuition).

Fix what the trace convicts; each fix re-traced. Acceptance: navigating
feed → library → store → post → back at 4× CPU throttle shows no main-thread
block > 100ms attributable to the motion system, and no continuously-running
rAF loop while the page is at rest (verify with a 5s idle trace: zero
rAF-driven layout reads).

**16.4b — iOS total-animation freeze (owner report after #589/#591 went
live; same phase, P0).** On iOS "all animation seems frozen". Prime
suspect: the GL tier initializes on iOS Safari (which ships WebGPU and
WebGL2), `html.liquid-gl` hides the CSS aurora and `.lg-goo` underlays —
and then the canvas fails, stalls, or renders invisibly on WebKit, leaving
the site motion-dead. Cannot be reproduced in this container (no WebKit);
therefore the fix is structural trust management, not device debugging:

1. **Verified-frame gating:** never set `html.liquid-gl` at init. Set it
   only after the renderer has produced its first N successful frames AND a
   readback/sanity check confirms non-blank output (or, minimally, no GL
   errors + context not lost). Until then the CSS stack keeps running —
   double rendering for a few frames is invisible (the canvas sits behind
   the opaque CSS aurora until revealed).
2. **Runtime watchdog:** after activation, monitor the loop (frame counter
   heartbeat + `webglcontextlost` / WebGPU `device.lost`). If frames stop
   or the context dies: remove `html.liquid-gl`, tear down, and permanently
   fall back to CSS for the session (persist a `rmh-liquid-gl-failed` flag
   so the next load skips the attempt; clear the flag on app version
   change).
3. **WebKit caution tier:** prefer WebGL2 over WebGPU on WebKit UAs for now
   (Safari WebGPU is young; WebGL2 is battle-tested) — one UA check at
   detect time, documented.
4. **Audit the misdetection paths too:** verify nothing in perf-lite /
   reduce-motion / clarity hydration can misfire on iOS to freeze CSS
   animations sitewide (the global 0.01ms reset) — the GL theory is prime
   but the freeze must be impossible from every path, not just the likely
   one.

---

## 17. Cohesion, smoothness & the no-freeze guarantee (amendment 2026-07-22b — Phase O)

Owner feedback round after §16.4/§16.4b shipped. Six reports, verbatim:
(1) "there's a trailing metaball that appears disconnected from the main
'glass' part"; (2) "the animation when opening a rmhark or going back doesnt
seem to animate smoothly, and reloads on page load interrupting the
smoothness"; (3) "the page still freezes sometimes, like on the settings page
when previewing different themes. ensure no freezes occur throughout the whole
website (e.g. ensure animations always end)"; (4) "the liquid glass 'shadow'
appears to follow the screen when i scroll rather than the element it's
attached to"; (5) "the tabs on the predictions page arent liquid glass";
(6) "spacing below some page headers doesnt exist between it and tabs"
(screenshot: /services — the subtitle sits flush against the hero sheet).

The §16.4 discipline applies to every item: **trace/reproduce first, name the
mechanism, then fix** — no speculative patches. Each subsection below records
the code-level findings already verified plus the mandated fix shape.

### 17.1 Trail droplet cohesion — the tail must never detach

**Mechanism (verified in code).** The trail droplet lags the capsule on a
soft spring (`TRAIL_SPRING` stiffness 165 vs the capsule's ~500,
`liquid-morph.tsx`). Nothing bounds the lag distance. The CSS goo bridge
(`#glass-goo`: blur stdDev 9 → alpha matrix 16/−6) can only fuse blobs whose
edge gap is ≲ 2× the blur radius (~18 px); the GL tier's `smin(d, di, k)`
likewise only bridges within `k`. A fast tab jump (100–300 px) puts the
droplet far outside both ranges mid-flight — it renders as a free-floating
ball, which is exactly the owner's report. It also keeps its full size
(70 % of capsule height) no matter how far it lags, so even the pinch-off
reads as a detached blob rather than a shrinking droplet.

**Fix (at the source, so BOTH tiers inherit it).** Derive the droplet's
rendered position from the spring output but **clamp its centre so its edge
never trails the capsule's trailing edge by more than a merge gap** the goo
and `smin` can both bridge (≈ 8 px CSS; ≤ the shader's `k` in GL). Project
the spring position onto that maximum-lag boundary when it overshoots. Add a
**separation taper**: droplet diameter scales down as lag approaches the
clamp (full size when merged, ~40 % at maximum lag) so reabsorption reads as
surface tension, not teleporting. The `dropSettled` idle check must use the
clamped values. Verify with mid-motion frame captures (CSS tier and GL tier)
on a wide tab jump: no frame may show a fully separated blob.

### 17.2 Liquid open/back smoothness — one motion, no replays

Three distinct complaints hide here; trace each on the RMHark card → detail
path (Performance profile + frame-by-frame screenshots):

1. **The open morph stutters.** Audit what actually runs during the VT:
   the destination's mount work, image decode, and any entrance animation
   that fires *during* the morph. The §15.2 rule stands — `.vt-active`
   stands entrances down — verify nothing mounts motion mid-morph.
2. **"Reloads on page load."** After the morph lands, client-fetched data
   (comments/replies, fresh hero image) re-renders the page and replays
   entrances — the double-load again, one level deeper. Mandates: seed the
   detail view from the feed card's already-known data (React Query
   `initialData` / router loader seed) so the hero and body render
   instantly with no skeleton flash; anything that mounts after the morph
   uses `initial={false}`; the hero image must reuse the card's cached URL
   (same `src`, no swap).
3. **Back is a hard cut.** popstate never goes through `runLiquidOpen`, so
   returning to the feed remounts with full entrances (reads as a reload).
   Attempt the reverse morph: remember the last-opened id, have that feed
   card carry the matching `view-transition-name` while the detail page is
   up, and wrap history-back navigations in `runViewTransition` via the
   router's history subscription. If that cannot be made reliable, the
   documented fallback is a *designed* return: no stagger replay, no
   refetch flash, instant scroll restore — and say so in the report
   (the owner asked to be told what isn't fixable).

**WebKit hazard (fix in the same pass):** `skipTransition()` is
Chromium-only, so on WebKit the 180 ms budget cannot bail out of a slow
loader — the freeze simply holds. Restructure: *before* starting a liquid
VT, race the destination preload against a short budget; start the VT only
when the update will resolve immediately (warm), otherwise navigate plain.
That converts the budget from "escape hatch" (Chromium-only) to
"pre-condition" (universal).

### 17.3 The no-freeze guarantee — every animation ends

**Reported repro:** previewing themes on the settings page freezes the page.
Trace it first: profile a click-through of theme previews on
`/settings/appearance` and in the studio; name the long tasks. Prime
suspects (verify, don't assume): the full-document style recalc from the
root class/vars swap multiplied across every `backdrop-filter` surface;
GL renderer re-init (instead of a uniform retint) per preview; lens map
regeneration; `ThemeMiniShell` render storms. Fix the top offenders —
batch the var writes, retint GL via uniforms without teardown, `contain`
the mini shells, debounce rapid preview clicks.

**Sitewide mandate — "animations always end":**

1. **rAF inventory.** Every `requestAnimationFrame` loop in the repo must
   have a provable settle/stop condition (the §16.4 idle-at-rest pattern).
   Inventory all of them; fix any that can spin forever; then extend the
   design-lint test with a `requestAnimationFrame` file allowlist so a new
   unbounded loop cannot land silently.
2. **VT hard stop.** `vt-active`/`vt-liquid` (and any other freeze-adjacent
   root class) get a watchdog: force-cleared after ~1.5 s even if
   `transition.finished` never settles.
3. **Spring rest.** Custom framer springs must reach rest (`restDelta`/
   `restSpeed` where the defaults can oscillate below visibility forever).

### 17.4 Scroll anchoring — GL bodies must move with their elements

**Mechanism (verified in code).** GL bodies are pushed in *viewport*
coordinates by their owners' samplers, and §16.4 made those samplers stop at
rest — nothing in `lib/liquid-gl/` or any registrar listens to scroll. So
once idle, a scroll moves the element but the shader keeps drawing its
glass/shadow at the stale screen position — the owner's "shadow follows the
screen" report, exactly.

**Fix.** Scroll is a wake signal, same class as `activeKey`/resize/GL-toggle:
every body registrar (`useLiquidMorph`, `useLiquidPop`, and any pane/other
registrar — inventory them all) kicks its sampler on
`scroll` (`window`, `{ passive: true, capture: true }` so nested scroll
containers are caught too). The idle-at-rest loop already keeps sampling
while the box is changing and re-idles after `SETTLE_FRAMES`, so the §16.4
zero-reads-at-rest guarantee is preserved — scroll just re-arms it. Confirm
the squash path stays inert during scroll (`mx/my` are underlay-relative, so
no fake velocity — verify with a trace). Evidence: screenshot glass mid-page,
scroll 500 px, screenshot again — the drawn glass must sit on its element in
both.

### 17.5 Predictions tabs — the strip that escaped the sweep

`RMHCoinsPage.tsx` (~line 93) hand-rolls its Markets/Games switch as plain
buttons with a conditional accent capsule — no `role="tablist"`, which is
precisely why the §16.2 design-lint gate (which only polices `tablist`
usage) never saw it. Convert it to `LiquidTabs` on the standard §5.45 sheet
below the page title, semantics and morph included. Then **sweep for other
escapees** (hand-rolled switchers with no tab semantics: conditional-accent
button rows, segmented controls) and convert what qualifies. Extend the
design-lint gate to catch this shape where a reliable signal exists (e.g.
files matching a conditional active-capsule pattern outside `liquid-tabs`);
if no reliable grep exists, document the manual-review rule instead of
shipping a false-positive-prone check.

### 17.6 Header → tabs rhythm — the missing gap

Owner screenshot (/services): the subtitle sits flush under the hero sheet;
some pages have no breathing room between the header block and the tab
sheet. The §15.4 spacing rhythm already defines the scale — the gap between
a page's title/subtitle block and whatever follows (tab sheet included) must
come from `PageLayout` itself, not per-page margins, so it cannot be missed
again. Audit every page that places a `LiquidTabs` sheet under a
`PageLayout` header (and the /services hero specifically), fix the rhythm in
the shared layer, and screenshot /services + two other tab pages as
evidence.

---

## Appendix D — Dead/invisible UI: removal list

> Populated from the 2026-07-21 repo audit (verified with file:line evidence).
> Phase D executes this list **after** A–C land (some items are replaced, not
> merely deleted). Every deletion must keep `tsc`/`lint`/`vitest` green and be
> followed by the §12.6 greps.

### D1. Delete — confirmed dead, zero consumers

| Item | Evidence | Action |
|---|---|---|
| `.vibe-glass` + `.vibe-card` rule blocks | `components/feed/feed.css:29,41`; repo-wide grep: **zero** TSX consumers (the comment's claimed consumers migrated to `.glass-chrome` in v1) | Delete both blocks + their comment. `.vibe-app` (`_site.tsx:61`) and `.site-logo` in the same file are **live** — do not touch. |
| `pricing-root` class token | `components/membership/MembershipPanel.tsx:171`; no CSS anywhere targets `.pricing-root` (the scoped style block only paints `.pricing-display/price/card/ribbon/btn`) | Remove the `pricing-root` token from the `className` (keep `relative isolate`). |
| `GlassEffect`, `GlassDock`, `GlassButton`, `DockIcon`, `GlassEffectProps` | `components/ui/liquid-glass.tsx`; imported **only** by the design lab (`app/routes/liquid-glass.tsx:6–12`) | Delete the exports; Phase A's lab rebuild demos production classes (`GlassPane`, elevation classes) instead. File keeps `GlassFilter` (v2 lens filters) + `GlassPane`. |
| `.liquid-glass-refract` + its `@supports` block | `globals.css:840–849`; only consumer was `GlassEffect` | Delete once `GlassEffect` is gone (same PR). |
| `#glass-distortion` turbulence filter | `liquid-glass.tsx:164–191` | Replaced by `#glass-lens`/`#glass-lens-prism` in Phase A. Do not keep an alias — §12.6 greps `glass-distortion`. |
| `@keyframes moveBackground` | `globals.css:931–938` ("scrolling backdrop for the /liquid-glass demo") | Delete if the rebuilt lab no longer uses it (it won't — the lab uses the real canvas). |

### D2. Migrate then delete — the last descendant-matched frost

| Item | Evidence | Action |
|---|---|---|
| `:is(.absolute,.shadow-xl,.shadow-2xl).bg-site-bg` catch-all frost | `globals.css:599–604` (+ its echoes in the reduce-transparency blocks at :879–884, :897–902) | Enumerate remaining floating-chrome elements that still paint `bg-site-bg` (grep `absolute` + `bg-site-bg` and `shadow-xl` + `bg-site-bg` combos in `components/`); convert each to `.glass-overlay` explicitly; then delete the catch-all and its echoes. **Do this element-by-element with a visual check** — this rule is the only thing frosting un-migrated menus. |

### D3. Keep — verified live or intentional (do NOT delete)

| Item | Why |
|---|---|
| `GlassFilter` | Load-bearing global mount (`__root.tsx:25,256`) — becomes the v2 lens filter host. |
| `.glass-opaque` | Zero consumers today but a **documented escape hatch** in the design contract (`design-language.md` §5.1); full-screen takeovers need it when they arrive. Keep (5 lines). |
| `.lib-volume`, `LIFT_CARD` | Both live (`library/index.tsx:701` + `library.css:119`; `feed/motionHelpers.ts:8` + ~14 consumers). The v1 plan's "kill" notes are stale — they were migrated, not removed. |
| shadcn token set (`--card`, `--primary`, `--chart-*`, `--sidebar*`, …) | Confined to `components/doctrine/**` + `app/routes/strategies/**` — the Strategies app, which is **out of scope** (v1 §1.3). A future migration candidate, not design-system debt. |
| Theme catalog | `SITE_STYLES` ↔ `.style-*` blocks are a verified 1:1 match; `style-liquid-glass` survives only in comments (fine). |
| `useCardSheen` | Live (`components/user-builds/BuildCard.tsx:9,40`) — unrelated to `.glass-liquid`. |

### D4. Flag to the repo owner — staged feature, not legacy (do NOT delete)

`components/site/FriendsRail.tsx`, `FriendsSheet.tsx` (+`ActivityLine.tsx`,
`hooks/useActiveFriends.ts`): genuinely unmounted (zero importers), **but**
under active development this month (`feat(presence)` 86774bd, RTL fix
e526afb, perf 2f6ea0e) — this is the §9 presence feature built and never
wired into the shell, not old UI. Deleting it would destroy staged work;
mounting it is product scope, not design scope. **Leave the code; report the
dangling mount to the owner.** (Its `glass-*` usage will inherit v2 for free
whenever it mounts.)
