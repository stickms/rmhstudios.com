# Liquid Glass UI Redesign — Design Document

**Date:** 2026-07-14
**Status:** Implemented — then extended/superseded in named areas (see the note below).
**Scope:** Every non-game, non-app surface of rmhstudios.com — the entire `_site/`
shell (all ~90 sidebar-layout pages, including every admin/backend page), the
shared primitive layer, and the in-scope top-level pages (login, legal, blog/news
readers, offline, security).
**Companions:** [`docs/design-language.md`](../design-language.md) (current visual
system), [`docs/page-consistency.md`](../page-consistency.md) (page recipes),
[`docs/misc/UI_REDESIGN.md`](../misc/UI_REDESIGN.md) (the previous, superseded
minimal-redesign vision).

> **Status (2026-07-21): IMPLEMENTED, then extended.** This redesign shipped in
> full. Several areas were subsequently reworked or superseded by
> [`docs/plans/2026-07-21-liquid-glass-v2-optics.md`](./2026-07-21-liquid-glass-v2-optics.md)
> — "Liquid Glass v2 — True Refraction, Reflection & Liquid Motion": the optics
> (turbulence → lens refraction + a border-box rim glint), the floating-shell
> layout restructure, `LiquidTabs` sheets placed below heroes, the five-stop
> glass-clarity slider (replacing the reduce-transparency toggle), liquid
> morph/open transitions, device-tilt light, and glass-native user themes.
> **Where the two docs disagree, the v2 doc is authoritative and the code is
> ground truth.** This doc is retained for its rationale and history; its body is
> not rewritten.

> **For the implementing agent:** read `docs/design-language.md` and
> `docs/page-consistency.md` first — this redesign *evolves* that system, it does
> not discard it. The `--site-*` token contract, `components/ui/` primitives,
> `PageLayout`, i18n, SEO, and a11y rules all still apply. Work phase-by-phase
> (§12), keep `pnpm exec tsc --noEmit` / `pnpm lint` clean at every phase, run
> `pnpm i18n:extract` after adding strings, and never edit `routeTree.gen.ts`.

---

## 0. Vision

Today, **Liquid Glass is the site's default theme but not its design system.** It
is implemented as a `.style-liquid-glass` class whose token overrides are propped
up by ~200 lines of fragile descendant-selector patches in `app/globals.css`
(frosting anything classed `.bg-site-surface`, special-casing the pricing panel,
the library tiles, autofill, drawers…). Components know nothing about glass;
glass is sprayed onto them from the outside.

This redesign inverts that: **glass becomes the material system of the site.**
Every surface a user touches outside of games and apps — the sidebar, every
page header, every card, dialog, table, form, admin queue, the library shelves,
the creator studio tabs, the shop — is rebuilt as physically-plausible layered
glass that:

- **Looks realistic** — thickness, edge refraction, a consistent top-lit specular
  model, depth-graded blur and shadow, micro-imperfections (§4).
- **Reacts** — specular highlights track the pointer, panes flex on press, chrome
  condenses on scroll, tab indicators flow like liquid (§5).
- **Stays fast** — a strict elevation budget decides which elements get true
  `backdrop-filter` and which get cheap translucent fills; repeated list items
  never blur; refraction is rationed to hero/chrome elements (§6).

Themes survive as **tints of the glass** (Glass Dark, Glass Light, Graphite,
Sepia, Nocturne) over per-theme aurora canvases; `high-contrast` remains fully
opaque and blur-free, and OS/user "reduce transparency" collapses everything to
opaque surfaces (§3.4, §10).

---

## 1. Scope

### 1.1 In scope

1. **The material/token layer** — `app/globals.css`, `stores/themeStore.ts`,
   `lib/appearance.ts`, `components/Providers.tsx`, the anti-FOUC script in
   `app/routes/__root.tsx`.
2. **All shared primitives** — every file in `components/ui/` (§7), plus shared
   composites: sonner Toaster config, `site/CommandPalette`,
   `site/NotificationsPopover`, `site/CookieConsent`, `site/KeyboardShortcuts`,
   the feed modals mounted in `_site.tsx` (`WelcomeModal`, `WhatsNewModal`,
   `FreeMonthModal`, `LanguageFirstRunModal`), `ComposeModal`, `ShareModal`,
   `ProfileEditModal`, `moderation/ReportDialog`, `errors/RouteErrorFallback`,
   `errors/NotFound`, `MiniPlayer`.
3. **The `_site` shell** — `app/routes/_site.tsx`, `components/feed/LeftSidebar`,
   `MobileSidebarShell`, `MobileNav`, `MobileHeader`, `MobileMenuButton`,
   `PageLayout`, `AnimatedMain`, `RightSidebar`, `components/feed/feed.css`.
4. **Every `_site/` page** (~90 URLs — full checklist in Appendix A), including
   **all 16 admin/backend URLs** under `_site/admin/`, with dedicated deep
   treatments for **Library** (§9.2), **Creator Studio** (§9.3), and
   **Store/Shop/Storefront/Membership** (§9.4).
5. **Top-level non-game pages** — `/login`, `/offline`, `/security`, the four
   legal pages (`/terms`, `/privacy`, `/cookies`, `/copyright`), and the
   full-screen article readers `/blog/$slug`, `/news/$slug` (§9.10).
6. **The `/liquid-glass` showcase** — repurposed as the design-lab page for the
   new system (§9.11).

### 1.2 Phase-gated (included, but last and lighter-touch)

The bespoke marketing landings — `/adaptive-intelligence`, `/rmh-capital`,
`/rmh-pmc`, `/optimization` — carry their own brand systems (own fonts/CSS).
They adopt the glass *chrome* (nav, cards, footers) while keeping their brand
palettes. Scheduled as the final visual phase (§12, Phase 7) so the core site
never waits on them.

### 1.3 Out of scope (do not touch)

- Games and full apps and their internals: `altair`, `cookgame`, `daily`,
  `dream-rift`, `forest-explorer`, `house-always-wins`, `kowloon-knockout`,
  `laundry-sort`, `lights-out`, `neon-driftway`, `rmh-farming-sim`,
  `rochester-offensive`, `slice-it`, `synapse-storm`, `temple-of-joy`,
  `velum2099`, `versecraft`, `void-breaker`, `rmhtube`, `rmhmusic`, `rmhtype`,
  `rmhstudy`, `rmhcode`, `rmhbox`, `studio`, `strategies`, plus the
  player/reader/editor internals (`v.$slug`, `v.new`, `builds_.$slug`,
  `user-builds.$slug`, `library.$slug`, `library.albums.$albumId`), `secret/*`,
  `discord/*`, `embed.post.$id`. Their **hub/browse pages inside `_site/` are
  in scope** (e.g. `/library`, `/create`, `/study`, `/rmhladder`); their
  full-screen internals are not. `THEME_EXCLUDED_ROUTES` stays as-is.
- Route structure, data loading, API routes, backend services.
- The coin economy, Stripe, auth flows (visual skin only on their pages).

---

## 2. Current state (what exists, what carries forward)

| Asset | Where | Fate |
|---|---|---|
| `--site-*` token contract + `@theme inline` utilities | `app/globals.css` | **Kept.** Extended with `--site-glass-*` and `--site-canvas` for every theme (§3.2). |
| `.style-liquid-glass` token block (translucent surfaces, cyan accent, rim-highlight shadows, 22/14px radii, aurora `--site-canvas`) | `globals.css` ~347–393 | **Promoted to `:root`** — becomes the default theme's values (§3.4). |
| `.style-liquid-glass` scoped element patches (frost-everything descendant rules, `.pricing-root`, `.lib-volume`, drawer, autofill, floating-chrome rules) | `globals.css` ~395–543 | **Deleted** after components migrate to explicit glass classes (§3.3). This is the single biggest cleanup of the project. |
| `.vibe-glass` chrome frosting | `components/feed/feed.css` | **Replaced** by `.glass-chrome` (§3.3); consumers: `PageLayout`, `MobileNav`, `MobileHeader`. |
| `GlassEffect`/`GlassDock`/`GlassButton`/`GlassFilter` | `components/ui/liquid-glass.tsx` | **Kept and expanded** into the canonical glass primitive module (§7.1). `GlassFilter` stays mounted once in `__root.tsx`. |
| `.liquid-glass-refract` + `#glass-distortion` SVG displacement | `globals.css` ~545–559 | **Kept**, re-tuned for edge-weighted refraction (§4.3). |
| `prefers-reduced-transparency` fallback | `globals.css` ~516–543 | **Kept and generalized** to the new glass classes + a user-facing settings toggle (§10). |
| Motion systems: `lib/motion.ts` (fast UI tokens) + `components/motion/` (scroll reveals) | — | **Kept.** New glass interactions use `lib/motion.ts` tokens + the existing `GLASS_EASE` spring (§5). |
| 7-theme catalog, accent presets, anti-FOUC script, ThemeGallery | `stores/themeStore.ts`, `lib/appearance.ts`, `__root.tsx`, `components/settings/ThemeGallery.tsx` | **Restructured**: themes become glass tints; `liquid-glass` id retired into `default` (§3.4, §11). |

Known patch points that must die with this redesign (grep targets):
`.style-liquid-glass` (globals.css), `.vibe-glass` (feed.css + 4 consumers),
the scoped `<style>` painting `--site-bg` in
`components/membership/MembershipPanel.tsx` (`.pricing-root`), and the
opaque-`--site-surface` `color-mix` assumption in `components/library/library.css`
(`.lib-book__3d`).

---

## 3. Architecture: from theme patch to material system

### 3.1 Why the current approach can't scale

The current liquid-glass theme frosts surfaces from the *outside*:
`.style-liquid-glass :is(.bg-site-surface, …) { backdrop-filter: blur(16px) }`.
Consequences:

- **Fragile:** it keys on literal utility class names; any component that
  composes its background differently silently loses (or gains) frost. The
  `.pricing-root` and `.lib-volume` patches exist because of this.
- **Slow:** *every* `bg-site-surface` element gets its own `backdrop-filter`
  layer — a feed with 30 cards pays for 30 backdrop readbacks. Blur cost should
  be a design decision per component, not a side effect of a background class.
- **Unownable:** components can't express "I am chrome" vs "I am a list row";
  the containing-block hazards of `backdrop-filter` (it re-anchors
  `position: fixed` descendants) are handled by ad-hoc pseudo-element tricks
  documented only in CSS comments.

### 3.2 New token group: the glass material contract

Add to `:root` in `app/globals.css` (every theme re-tints these, exactly like
the existing `--site-*` groups). Names stay in the `--site-` namespace so the
theme contract remains one flat list:

```css
:root {
  /* Canvas — the scene behind the glass. Every theme MUST define one; glass
     over a flat color reads as gray plastic. (Already exists for liquid-glass;
     generalized to all themes.) */
  --site-canvas: /* per-theme layered radial gradients + base linear */;

  /* Tint plates */
  --site-glass-tint: rgba(255, 255, 255, 0.10);        /* resting fill */
  --site-glass-tint-strong: rgba(255, 255, 255, 0.17); /* hover / raised */
  --site-glass-ink: color-mix(in srgb, var(--site-bg) 45%, transparent);
                                                       /* recessed fills (inputs) */

  /* Backdrop treatment, by elevation tier (§4.4) */
  --site-glass-blur-pane: 16px;
  --site-glass-blur-chrome: 24px;
  --site-glass-blur-overlay: 28px;
  --site-glass-saturate: 160%;

  /* Lighting */
  --site-glass-rim: rgba(255, 255, 255, 0.28);      /* top specular edge */
  --site-glass-rim-soft: rgba(255, 255, 255, 0.10); /* hairline all-round */
  --site-glass-light: rgba(255, 255, 255, 0.14);    /* pointer highlight */

  /* Depth shadows (compose into --site-shadow / --site-shadow-sm as today) */
  --site-glass-depth: 0 24px 64px rgba(2, 10, 28, 0.60);
  --site-glass-depth-sm: 0 4px 16px rgba(2, 10, 28, 0.28);
}
```

The existing `--site-shadow` / `--site-shadow-sm` keep their current
liquid-glass composition (inset rim + drop shadow) and are *derived from* the
tokens above, so `Card`, `Dialog`, etc. continue to pick up rim lighting through
`shadow-site`/`shadow-site-sm` with zero component changes.

### 3.3 Glass component classes (the elevation system)

New `@layer components` block in `globals.css` (or a new `app/glass.css`
imported from it). These are **explicit opt-ins placed on components** — never
descendant-matched:

| Class | Tier | Backdrop | Use for | Replaces |
|---|---|---|---|---|
| `.glass-fill` | L1 | **none** | Repeated content: feed cards, list rows, table rows, grid tiles, admin queue items. Translucent tint + rim via `shadow-site-sm`. Cheap — unlimited per page. | the implicit frosting of every `bg-site-surface` |
| `.glass-pane` | L2 | `blur(var(--site-glass-blur-pane)) saturate(var(--site-glass-saturate))` | Singular panels: hero sections, composer, membership tier cards, settings sections, sidebars-within-pages. Budgeted (§6.1). | ad-hoc `backdrop-blur-*` |
| `.glass-chrome` | L3 | `blur(var(--site-glass-blur-chrome)) saturate(170%)` + `background: color-mix(in srgb, var(--site-bg) 32%, transparent)` | Persistent chrome: desktop sidebar, sticky page headers, mobile top bars, mobile dock. | `.vibe-glass` |
| `.glass-overlay` | L4 | `blur(var(--site-glass-blur-overlay)) saturate(180%)` + `background: color-mix(in srgb, var(--site-bg) 62%, transparent)` | Floating UI: dialog content, popovers, menus, command palette, toasts, tooltips. More opaque so content never ghosts through text. | `.style-liquid-glass :is(.absolute,.shadow-xl,.shadow-2xl).bg-site-bg` |
| `.glass-scrim` | — | `blur(8px)` + `bg-black/50` | Dialog/drawer backdrops. | dialog overlay's `backdrop-blur-md` |
| `.glass-inset` | — | none | Recessed surfaces (inputs, search fields, wells): `background: var(--site-glass-ink)` + inverted inner shadow (§7.2). | input `bg-site-surface` |
| `.glass-interactive` | modifier | — | Adds hover tint-raise, press flex, and the pointer specular layer; pairs with `data-glass-light` (§5.1–5.2). | `LIFT_CARD` (kept as alias) |
| `.glass-refract` | modifier | adds `url(#glass-distortion)` on Chromium | Edge refraction for hero/chrome elements only — max 2 per page (§4.3, §6.1). | `.liquid-glass-refract` |

Rules carried over from the current implementation (encode as comments on the
classes, they are load-bearing):

1. **Never put a backdrop tier class on an ancestor of a `position: fixed`
   element** — `backdrop-filter` creates a containing block. The desktop
   `<aside>` keeps the existing `::before` pseudo-element pattern (blur lives
   on the pseudo, the aside itself stays filter-free so `LeftSidebar`'s
   non-portaled fixed user menu keeps the viewport as its containing block).
   Bake this into `.glass-chrome--aside` variant.
2. **Full-screen fixed takeovers stay opaque** (e.g. the admin MDX editor):
   keep an explicit `.glass-opaque` escape hatch (`background: var(--site-bg)`).
3. **The mobile push-drawer panel goes opaque while `data-drawer-active`**
   (otherwise the sidebar ghosts through during the slide) — keep the existing
   `[data-drawer-active]` rule, retargeted at the new classes.
4. Every glass class ships `-webkit-backdrop-filter` alongside
   `backdrop-filter` (Safari).

All primitives set `data-slot` already; new glass variants hook the same
attributes so future themes can restyle.

### 3.4 Themes become glass tints

`SITE_STYLES` (in `stores/themeStore.ts`) is restructured — same mechanism
(`.style-*` class on `<html>`, `:root` = default), new catalog:

| id | Label | Canvas | Glass |
|---|---|---|---|
| `default` | **Glass Dark** | The current liquid-glass aurora (deep-ocean navy + blue/violet/teal/pink radials) | The current liquid-glass tokens, promoted from `.style-liquid-glass` to `:root`. |
| `light` | **Glass Light** | Daylight canvas: near-white base with soft pastel sky radials (blue/lilac/mint at low alpha) | White frost at higher opacity (`--site-glass-tint: rgba(255,255,255,0.55)`), dark text, rim = white 0.65 top edge, depth shadows lighter and cooler. |
| `graphite` | Graphite Glass | Monochrome smoke gradients over near-black | Neutral gray tint, silver rims, desaturated (saturate 120%). |
| `sepia` | Sepia Glass | Warm parchment gradients | Warm white tint, amber accent, golden rim. |
| `nocturne` | Nocturne Glass | Deep-navy nightscape, sky-blue aurora | Cool blue-shifted tint + rims. |
| `high-contrast` | High Contrast | Flat black (unchanged) | **No glass at all**: opaque surfaces, no blur, 2px borders, yellow accent — token values unchanged from today. A global rule neutralizes every glass class under `.style-high-contrast` (§10). |

- The `liquid-glass` theme id is **retired**; the existing self-heal in
  `Providers.tsx` (unknown persisted style → `DEFAULT_STYLE`) migrates stored
  prefs, and the `/api/preferences/appearance` validation derives from
  `SITE_STYLES` so no API change is needed. `DEFAULT_STYLE` becomes `"default"`.
- `THEME_BG` continues to hold the opaque base color per theme (anti-FOUC and
  overscroll); each theme also defines `--site-canvas`, painted on `body` with
  `background-attachment: fixed` exactly as liquid-glass does today (already
  verified to degrade gracefully on iOS).
- **Accent presets are unchanged** (14 presets overriding `--site-accent*`).
  New nicety: glass focus rings and the pointer light multiply with the accent
  (`color-mix(in srgb, var(--site-accent) 20%, var(--site-glass-light))`) so an
  accent choice subtly warms the glass.
- `components/settings/ThemeGallery.tsx` already reads
  `var(--site-canvas, var(--site-bg))` for the liquid-glass swatch — with every
  theme defining `--site-canvas` the gallery previews become uniform for free.

---

## 4. The glass material: realism spec

The reason most "glassmorphism" looks like fog on plastic is uniform treatment.
Real glass has **thickness, a light source, and imperfections**. Every glass
element in this system is built from the same layer stack, and every deviation
below is what sells the realism.

### 4.1 Layer stack (bottom → top)

1. **Backdrop refraction** *(optional, `.glass-refract`, Chromium only)* — the
   backdrop is displaced through `#glass-distortion` before blurring, so edges
   of shapes behind the glass bend. §4.3.
2. **Backdrop blur + saturation** — `blur() saturate()` per elevation tier.
   Saturation ≥ 150% is mandatory: real glass concentrates color, it never
   grays it out.
3. **Tint plate** — `--site-glass-tint`. This is the *body* of the glass.
4. **Specular rim** *(via `--site-shadow*` insets)* — the top inner edge
   catches the light: `inset 0 1px 0 var(--site-glass-rim)`, plus a 0.5px
   all-round hairline `inset 0 0 0 0.5px var(--site-glass-rim-soft)`. On
   hover the rim brightens (glass turning toward the light).
5. **Depth shadow** — `--site-glass-depth(-sm)` drop shadow. Blur radius and
   tint opacity **increase together with elevation** — that co-variance is what
   the eye reads as height.
6. **Pointer specular** *(interactive elements)* — a radial highlight that
   tracks the cursor (§5.1).
7. **Content** — always fully opaque and **never distorted**. Text and images
   sit *on* glass; only the backdrop refracts. (This is why `GlassEffect`
   layers content at `z-30` above the refraction/tint/rim layers — keep that
   structure.)
8. **Micro-noise** *(panes L2+ only)* — a tiled 64×64 data-URI noise PNG at
   2–3% opacity on the tint plate. Kills gradient banding on large panes and
   reads as material texture. One shared background-image, zero runtime cost.

### 4.2 Lighting model — one sun

**All specular cues assume light from the top, slightly left**, sitewide:

- Rim: top inner edge brightest; sides at ~35% of top; bottom edge gets a
  *dark* inner hairline (`inset 0 -1px 0 rgba(0,0,0,0.12)`) — glass bottoms
  occlude, they don't glow.
- Recessed elements (`.glass-inset`, §7.2) invert this: dark top inner shadow,
  faint light bottom inner edge — a hole in the glass instead of a slab on it.
- Drop shadows fall straight down (0 y-positive offsets only, as today).
- The pointer light (§5.1) is the one exception — it's *your* light, not the
  sun's, and only appears on hover.

Never mix directions. A single inconsistent bottom-lit card breaks the whole
scene.

### 4.3 Refraction (the "realistic" differentiator)

Current state: `#glass-distortion` (feTurbulence → feGaussianBlur →
feDisplacementMap, `scale=200`) displaces the whole backdrop uniformly. Real
glass refracts hardest at its **edges** (thickness gradient), and a scale-200
full-surface wobble reads as heat haze.

Changes:

1. Keep `GlassFilter` mounted once in `__root.tsx`; reduce `scale` to ~80 for
   chrome usage.
2. **Edge-weight the refraction layer** with a CSS mask so the center of the
   pane is optically clean and only a ~14px inner ring displaces:

```css
.glass-refract::before {
  /* the refraction layer (replaces .liquid-glass-refract usage) */
  content: "";
  position: absolute; inset: 0; z-index: 0;
  border-radius: inherit;
  pointer-events: none;
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  /* only the rim band refracts — center stays clean */
  -webkit-mask: linear-gradient(#000 0 0) content-box exclude,
                linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box exclude,
        linear-gradient(#000 0 0);
  padding: 14px;
}
@supports (backdrop-filter: url(#glass-distortion)) {
  .glass-refract::before {
    -webkit-backdrop-filter: url(#glass-distortion) blur(2px);
    backdrop-filter: url(#glass-distortion) blur(2px);
  }
}
```

3. Firefox/Safari (no `url()` in `backdrop-filter`): the `@supports` gate keeps
   them on the plain edge blur — the mask still gives them an "edge thickness"
   cue for free.
4. Ration: **≤ 2 `.glass-refract` elements per page** (§6.1). Intended users:
   the desktop sidebar pane, page-hero panes (library hero, membership panel,
   login card), never list items or scroll containers.
5. *(Optional, off by default)* `.glass-refract--prism` adds a 1px chromatic
   fringe on the rim via two offset low-alpha red/blue inner hairlines — for
   the featured membership tier and the design-lab page only.

### 4.4 Elevation tiers (recap table)

| Tier | Class | Blur | Tint | Shadow | Examples |
|---|---|---|---|---|---|
| L0 | — (canvas) | — | — | — | `body` aurora |
| L1 | `.glass-fill` | none | `--site-glass-tint` | `shadow-site-sm` | feed cards, rows, tiles |
| L2 | `.glass-pane` | 16px | tint (+noise) | `shadow-site-sm` | heroes, panels, tier cards |
| L3 | `.glass-chrome` | 24px | bg-mix 32% | border-b hairline | sidebar, sticky headers, dock |
| L4 | `.glass-overlay` | 28px | bg-mix 62% | `shadow-site` | dialogs, menus, palette, toasts |

L1 having **no blur** is deliberate and is both the performance backbone (§6)
and physically right: thin glass shelves over an already-frosted scene don't
re-blur it; the tint + rim reads as glass because the *canvas* provides the
color variance underneath.

---

## 5. Reactivity spec

All timings come from `lib/motion.ts` (`DURATION`, `EASE`, `SPRING`); the
springy overshoot cases use the existing `GLASS_EASE`
(`cubic-bezier(0.175, 0.885, 0.32, 2.2)`) exported from
`components/ui/liquid-glass.tsx` (move it to `lib/motion.ts` as `EASE.glass`).
Everything in this section is suppressed by `prefers-reduced-motion` (via the
existing global CSS block + `MotionConfig`) and by `.perf-lite` (§6.4).

### 5.1 Pointer-tracked specular highlight

The signature "reactive" behavior: a soft radial light follows the cursor
across interactive glass.

- **Implementation:** one document-level `pointermove` listener (new
  `hooks/useGlassLight.ts`, mounted once in `Providers.tsx`), rAF-throttled.
  On each frame it finds `event.target.closest('[data-glass-light]')` and
  writes `--glass-px` / `--glass-py` (percent coords within the element) onto
  that element only; clears on `pointerleave`. No React re-renders — CSS
  custom properties only.
- **CSS:**

```css
.glass-interactive { position: relative; }
.glass-interactive::after {
  content: ""; position: absolute; inset: 0; z-index: 1;
  border-radius: inherit; pointer-events: none;
  background: radial-gradient(140px circle at var(--glass-px, 50%) var(--glass-py, -30%),
              var(--site-glass-light), transparent 70%);
  opacity: 0;
  transition: opacity 0.18s var(--ease-standard);
}
.glass-interactive:hover::after { opacity: 1; }
```

- **Gates:** wrapped in `@media (hover: hover) and (pointer: fine)` — touch
  devices never pay for it. The hook subscribes only when that media query
  matches, unsubscribes under `.perf-lite`.
- **Where:** nav pills in `LeftSidebar`, cards (`Card`, build/album/listing
  tiles, admin dashboard cards), buttons (`outline`/`secondary`/`ghost`
  variants), membership tier cards, shop items. Applied by adding
  `glass-interactive` + `data-glass-light` in the primitive, not per page.

### 5.2 Press flex & hover raise

- **Hover:** background steps `--site-glass-tint` → `--site-glass-tint-strong`,
  rim brightens (`--site-glass-rim` at 1.3× alpha via a `:hover` shadow swap),
  depth shadow grows ~20%. This replaces `LIFT_CARD`'s translate with a
  *material* response — glass gets lighter, not airborne. (Keep a 1px
  translateY for cards only; chrome never moves.)
- **Press:** `transform: scale(0.985)` + tint momentarily to
  `--site-surface-active` equivalent; release springs back with `EASE.glass`.
  Buttons keep their existing `active:opacity` feedback removed in favor of
  this (opacity flicker fights the material illusion).
- Implemented inside `Button`, `Card`, and `.glass-interactive` — pages get it
  for free.

### 5.3 Scroll-reactive chrome (condensing headers)

iOS-style: chrome is airier at rest, condenses when content scrolls under it.

- `PageLayout` renders a 1px sentinel `<div>` above the scroll content; an
  `IntersectionObserver` toggles `data-scrolled` on the sticky header.
- CSS (on `.glass-chrome[data-scrolled]`): background mix 32% → 55%, blur 16px
  → 24px, bottom hairline fades in, height eases `h-18` → `h-15`
  (transitioning `height` is fine here — it's a single sticky element, not a
  layout-thrash risk; under reduced motion it snaps).
- Same pattern for `MobileTopBar`. The mobile dock (§8.3) condenses on
  *downward* scroll (existing scroll direction detection in `BackToTop` shows
  the pattern) — shrinks label row, keeps icons.

### 5.4 Liquid state transitions

- **Tab indicators** (Creator Studio `cstudio-tabs`, settings sections,
  RMHLadder sub-nav): the active-tab background becomes a framer-motion
  `layoutId` glass capsule that *flows* between tabs (spring `SPRING.snappy`).
  Under reduced motion it jumps.
- **Dialogs/popovers:** enter with `modalContent` variant plus a one-time blur
  ramp (backdrop-filter transitions from `blur(0)` are janky — instead fade
  the *scrim* in and scale the pre-blurred pane from 0.96; this is what
  `dialog.css` already does, keep its keyframe approach and just re-skin).
- **Toasts:** slide-in from bottom-left as small L4 panes; success toasts get a
  brief rim flash in `--site-success`.
- **NavigationProgress:** restyle as a light refraction streak — accent core
  with a white specular cap (`box-shadow: 0 0 8px var(--site-accent)` stays).
- **Celebrations:** `useCelebration` already reads `--site-accent`/`--site-success`
  from the DOM — no change needed; confetti over glass looks great as-is.

---

## 6. Performance & optimization spec

`backdrop-filter` forces a backdrop readback + filter pass per element per
frame region; SVG displacement filters are the most expensive variant. The
whole optimization story is **rationing**, enforced by the elevation system.

### 6.1 Hard budgets (acceptance criteria for every phase)

| Budget | Limit |
|---|---|
| Elements with any `backdrop-filter` in a typical viewport | **≤ 8** (3 chrome: sidebar, header, mobile nav/dock + ≤ 5 panes/overlays) |
| `backdrop-filter` on repeated list/feed/table items | **0** — L1 `.glass-fill` only |
| `.glass-refract` (displacement) elements per page | **≤ 2**, chrome/hero only, never inside scroll containers |
| Blur radius | ≤ 28px (cost scales with radius × area) |
| `will-change` | Never persistent; only set during an active transition, removed after |
| Nested backdrop-filters (glass inside glass both blurring) | **0** — inner elements use `.glass-fill`. Visually redundant, doubly expensive. |
| New layout-triggering animations | 0 (transform/opacity/background only; the §5.3 header height ease is the one sanctioned exception) |

### 6.2 Structural optimizations

- **The L1/L2 split is the big win vs today:** the current theme frosts every
  `bg-site-surface` element; the redesign frosts *named panes only*. A feed
  page goes from ~30 backdrop layers to ~4.
- `content-visibility: auto` + `contain-intrinsic-size` on below-fold page
  sections that are already discrete (library shelves, admin tables, settings
  groups) — glass or not, skipped rendering is the cheapest rendering.
- The aurora canvas stays a **single fixed background on `body`** — one paint,
  shared by every blur sample. Do not add per-section decorative gradients
  behind glass; they multiply blur cost for no visual gain.
- Pointer light writes CSS vars on **one element at a time**, rAF-throttled;
  repaint is confined to that element's composited layer. No
  React state, no per-card listeners (event delegation from one root listener).
- Scroll reactions are class/attribute toggles from IntersectionObserver — no
  scroll-position reads in rAF loops.
- Skeletons/shimmer stay transform-based (`animate-shimmer` translates a
  gradient, already reduced-motion-safe).

### 6.3 Engine matrix

| Engine | Blur/saturate | `url(#glass-distortion)` | `prefers-reduced-transparency` | Notes |
|---|---|---|---|---|
| Chromium | ✅ | ✅ | ✅ (118+) | Full experience. |
| Safari/WebKit | ✅ (needs `-webkit-` prefix — every class ships both) | ❌ → `@supports` falls back to edge blur | ✅ (recent) | Watch rounded-corner bleed on filtered layers; `overflow: hidden` + `border-radius: inherit` on the filter pseudo (already the `GlassEffect` pattern). `background-attachment: fixed` degrades to scroll on iOS — accepted today, stays accepted. |
| Firefox | ✅ | ❌ → same fallback | ❌ (as of writing) → the settings toggle (§10) covers it | Slightly weaker `color-mix` alpha rendering in old versions — all mixes have solid `THEME_BG` behind them. |

### 6.4 Device tiering — `.perf-lite`

One-time heuristic in `Providers.tsx` (alongside the theme effect):

```ts
const lite = (navigator.deviceMemory ?? 8) <= 4
  || navigator.hardwareConcurrency <= 4;
document.documentElement.classList.toggle('perf-lite', lite);
```

Under `html.perf-lite`: `.glass-refract` disabled, pointer light disabled,
L2 panes drop to L1 fills (chrome + overlays keep blur — they're few and they
carry the identity). This is CSS-only demotion; no component logic branches.

### 6.5 Measurement & regression guardrails

- The existing Core Web Vitals RUM (`lib/rum.ts` → `/api/rum`) is the
  before/after ledger. Targets: **INP p75 < 200ms unchanged or better, LCP
  within ±5% of pre-redesign, CLS delta 0**.
- Per-phase manual trace: Chrome DevTools Performance on `/` (feed), `/library`,
  `/store`, `/admin/users` — no frame > 16ms during steady scroll on a mid-tier
  device profile (4× CPU throttle), no long task > 50ms attributable to
  `pointermove`.
- `pnpm build` bundle check: the redesign is ~99% CSS + one small hook; flag
  any JS bundle growth > 5KB gzipped.

---

## 7. Component redesign (`components/ui/` + shared composites)

### 7.1 The glass primitive module

`components/ui/liquid-glass.tsx` is promoted to the canonical module (rename
exports stay for compat):

- `GlassEffect` — keeps its layer structure (refract → tint → rim → content),
  re-based on the tokens (`rgba(255,255,255,0.25)` hardcodes → `--site-glass-*`)
  so it obeys themes/high-contrast/reduced-transparency.
- `GlassDock` — becomes the base of the mobile dock (§8.3) and the MiniPlayer.
- `GlassButton` — demoted to design-lab/showcase use; site buttons are `Button`.
- `GlassFilter` — unchanged mount, re-tuned per §4.3.
- New: `GlassPane` — thin wrapper = `div.glass-pane.glass-interactive?` with
  `data-glass-light`, for pages that need a one-off pane without hand-writing
  the class trio.

### 7.2 Primitive-by-primitive spec

| Primitive (file) | Redesign |
|---|---|
| `Button` (`button.tsx`) | Stays CVA + `rounded-full` capsules. `default`/`accent`: accent-tinted glass — `background: color-mix(in srgb, var(--site-accent) 82%, transparent)` + top rim + `text-site-accent-fg`; reads as colored glass, not flat paint. `secondary`: L1 fill. `outline`: hairline + transparent body, fills to tint on hover. `ghost`: no body, tint on hover. `destructive`/`danger`: danger-tinted glass. All get §5.2 press flex + (non-solid variants) pointer light. `loading` behavior unchanged. |
| `IconButton`, `CopyButton`, `BackToTop` | Inherit Button. `BackToTop` becomes a floating L4 glass disc. |
| `Card` (`card.tsx`) | Default = **L1 `.glass-fill`** (cards are the repeated element). New prop `pane` → L2 `.glass-pane` for singular panels. `CardTitle` keeps display font; add optional etched header divider (`border-b border-site-border/60`). Hover treatment via `.glass-interactive` when the card is a link target. |
| `Dialog` (`dialog.tsx`, `dialog.css`) | Overlay → `.glass-scrim`. Content → `.glass-overlay` + `shadow-site` + `.glass-refract` *not* applied (budget). Keep the data-state keyframes; re-tune to scale 0.96→1 with `EASE.glass`. `ConfirmDialog` inherits. |
| `Input`, `Textarea`, `Select` | **`.glass-inset`** — recessed wells: `background: var(--site-glass-ink)`, `box-shadow: inset 0 1px 2px rgba(0,0,0,0.35), inset 0 -1px 0 var(--site-glass-rim-soft)`, hairline border. Focus: accent border + the existing soft accent ring; the well "fills with light" (`background` lightens one step). **No backdrop blur on inputs** — legibility + cost. Keep the 16px mobile font floor and the pinned opaque autofill fix (retarget the existing rule from `.style-liquid-glass` scope to global). |
| `Label` | Unchanged. |
| `Switch` | Track becomes a tiny glass tube (inset shadow like inputs); knob becomes a convex glass bead — white-top radial + tiny drop shadow; on-state floods the tube with accent-tinted glass. Replace the hardcoded knob `shadow-[…]` with tokens. |
| `Slider` | Track = glass tube (inset), range = accent glass fill, thumb = glass bead (same treatment as Switch knob). |
| `Badge` | Stays a capsule; variants become tinted micro-glass: e.g. `success` = `bg-site-success/15` + `inset 0 1px 0` success-tinted rim. No blur (repeated element). |
| `NotificationBadge` | Danger glass capsule; keep `bg-site-danger` core for legibility, add rim. |
| `Tooltip` | Already `bg-site-surface/90 backdrop-blur-xl` — formalize to `.glass-overlay` (it's floating UI), keep framer-motion behavior. |
| `EmptyState` | The icon sits in an **etched glass medallion**: a `.glass-inset` circle with the icon at `text-site-text-dim` — "sandblasted into the pane". |
| `Skeleton` | Fill = `--site-glass-tint` at half alpha; shimmer highlight = `--site-glass-rim-soft` sweep. Reads as light moving through frosted glass. |
| `Spinner` | Unchanged (accent `Loader2`). |
| `Breadcrumbs`, `Pagination` | Token-level updates only; active pagination page = accent glass capsule (match Button `default`). |
| `NavigationProgress` | §5.4 light streak. |
| `RoutePending` | Inherits Skeleton changes. |
| `resizable.tsx` | Handle grip becomes a small glass pill; drag state brightens rim. |
| `OptimizedImage`, `BlurImage`, `UserAvatar`, `TwemojiProvider`, `AnimatedCount`, `ViewTransitionLink`, `BackNavAnimation` | No visual change (content layer, not chrome). `UserAvatar` gains an optional 1px rim ring (`ring-1 ring-site-glass-rim-soft`) where it sits directly on canvas. |
| `ui/skeletons/PostCardSkeleton` | Inherits Skeleton; matches new card padding/radii. |

### 7.3 Shared composites

- **sonner Toaster** (`Providers.tsx` `toastOptions.style`): swap to L4 glass —
  `background: color-mix(in srgb, var(--site-bg) 62%, transparent)`,
  `backdropFilter: 'blur(28px) saturate(180%)'`, rim via boxShadow token,
  `borderRadius: 'var(--site-radius-sm)'`. Verify legibility over bright aurora
  corners in Glass Light.
- **CommandPalette** (`site/CommandPalette.tsx`): the flagship overlay — L4
  `.glass-overlay` + the sanctioned second `.glass-refract` slot on pages where
  it opens; input row is `.glass-inset`; results are L1 rows with pointer
  light; selected row = accent glass capsule.
- **NotificationsPopover**, hand-rolled menus (LeftSidebar user menu),
  `EmojiPickerPanel`, `ReactionMenu`: `.glass-overlay`. This *replaces* the
  brittle `:is(.absolute,.shadow-xl,.shadow-2xl).bg-site-bg` catch-all — each
  gets the class explicitly.
- **Global modals** (`WelcomeModal`, `WhatsNewModal`, `FreeMonthModal`,
  `LanguageFirstRunModal`, `ComposeModal`, `ShareModal`, `ProfileEditModal`,
  `ImageCropModal`, `EngagementListModal`, `SocialListModal`, `InsightsModal`,
  `AddToPlaylistDialog`, `moderation/ReportDialog`): all inherit the new
  `Dialog`; audit each for hand-rolled surfaces that need `.glass-fill`.
- **CookieConsent**: bottom glass bar (L3 chrome treatment, condensed).
- **KeyboardShortcuts**: L4 dialog; key caps become tiny glass beads (`kbd`
  styled like Switch knobs).
- **MiniPlayer**: rebuilt on `GlassDock` — a floating glass sliver docked above
  the mobile nav / bottom-left on desktop; artwork stays opaque (content rule).
- **errors/NotFound + RouteErrorFallback**: centered L2 pane with etched
  medallion (EmptyState pattern), keeps shell.

---

## 8. Shell redesign

### 8.1 Desktop sidebar (`_site.tsx` aside + `LeftSidebar.tsx`)

- Geometry unchanged (`md:w-16` rail / `xl:w-64`, fixed, `border-r`) — no
  layout regressions, no relearning.
- Material: the aside keeps the `::before` blur pseudo pattern
  (`.glass-chrome--aside`, blur 24px sat 170%, bg mix 52% → tuned to 40% for
  more aurora) and gains the **one sanctioned sidebar `.glass-refract`** on the
  pseudo — the page edge visibly bends behind the rail.
- Nav pills: idle = transparent; hover = L1 tint + pointer light; active =
  accent glass capsule (`bg-site-accent-dim` + accent rim + accent text —
  today's colors, new lighting). The "More" group's staggered submenu keeps its
  framer-motion but children slide behind a shared glass capsule indicator
  (§5.4 layoutId pattern).
- Logo plate: `site-logo` sits on a faint horizontal rim divider; no box.
- Notification bell popover + user menu → `.glass-overlay` (§7.3). The user
  menu is the known non-portaled `position: fixed` element — it is why the
  aside itself must never carry `backdrop-filter` (rule §3.3.1; keep the
  comment in code).
- Admin link keeps its badge; no special material.

### 8.2 Mobile drawer (`MobileSidebarShell.tsx`)

- Unchanged mechanics (push-drawer, gestures, scrim, `data-scroll-root`).
- Drawer aside: `.glass-chrome--aside`. Scrim: `.glass-scrim` at lower blur
  (4px — it animates during drag; blur must stay cheap and constant, never
  transitioned during the gesture).
- The sliding page panel keeps the **opaque-while-`data-drawer-active`** rule
  (§3.3.3) — verified necessity from the current implementation.

### 8.3 Mobile bottom nav → floating glass dock (`MobileNav.tsx`)

The signature mobile move: the full-bleed bottom bar becomes an **inset
floating dock** (iOS-26 style):

- `fixed bottom-3 inset-x-3` (+ `pb-safe` margin handling), `rounded-site`
  capsule, `.glass-chrome`, strong rim, `shadow-site`.
- Same 5 tabs; active tab = accent glass capsule sliding via `layoutId`.
- The compose FAB docks *into* the dock's right end as an accent glass disc
  (today it floats separately above the bar).
- Condenses on downward scroll (§5.3): height shrinks, labels fade, icons
  remain; expands on upward scroll or at rest.
- **Layout consequence:** content bottom padding changes from `pb-16` to
  `pb-24` equivalents — update `PageLayout`/`AnimatedMain` padding and the
  `page-consistency.md` checklist (`pb-16 md:pb-0` → `pb-24 md:pb-0`).
  `BackToTop` floats above the dock.

### 8.4 Page header (`PageLayout.tsx`)

- Sticky header: `.vibe-glass` → `.glass-chrome` + scroll condensation (§5.3).
- `h1` unchanged (display font, tracking). Breadcrumbs/back arrow unchanged.
- `headerRight` actions render as glass icon capsules (IconButton inherits).
- `headerExtra` rows (filter bars, tab strips) sit *inside* the chrome pane so
  the header reads as one slab of glass.
- The center column keeps `border-r border-site-border` (a hairline glass edge
  against the canvas) and all width constants from `lib/layout-width.ts` —
  **no width changes**.
- `RightSidebar` sections: `bg-site-surface … border` boxes → L1 `.glass-fill`
  cards; the OnlineNow pill and TodayWidget become small glass capsules.

### 8.5 The canvas

- `body` paints `--site-canvas` per theme (fixed attachment; iOS degradation
  accepted). The aurora is re-tuned per theme (§3.4 table).
- `.page-root` enter animation, `html.nav-pop`, View Transitions: unchanged.

---

## 9. Page-by-page coverage

Global rule: **pages should need almost no bespoke work.** The primitives
(§7), shell (§8), and elevation classes (§3.3) do the heavy lifting; a page's
"redesign" is mostly (a) swapping ad-hoc `bg-site-surface border …` divs to
`Card`/`.glass-fill`/`.glass-pane`, (b) deleting page-local styling that fights
the material, (c) the specific touches below. Appendix A is the full checklist;
this section gives per-area direction.

### 9.1 Feed & social core (`/`, `/explore`, `/search`, `/communities`, `/c/$slug`, `/tag/$tag`, `/thread/$rootId`, `/bookmarks`, `/drafts`, `/share`)

- Post cards (`RMHarkCard`): **L1 fills** (never blur — the densest list on the
  site). Media stays opaque and edge-to-edge within the card's radius. Action
  bar icons get pointer light; reaction chips become micro-glass capsules.
- Composer (`ComposeModal` + inline feed composer): the inline composer is an
  L2 pane (one per page, budget-friendly); the avatar sits on it, the
  text well is `.glass-inset`.
- `/search`: search field = large `.glass-inset` well with accent focus flood;
  result-type tab strip = liquid capsule tabs (§5.4); result rows = L1.
- `/communities`: community cards L1 + pointer light; join buttons accent glass.
- `/c/$slug`: community banner image stays opaque; the info bar overlapping it
  becomes an L2 pane with `.glass-refract` *only if* the page has no other
  refract user (budget).
- `/thread/$rootId`: ancestor chain connectors become 1px light hairlines
  (`--site-glass-rim-soft`); reply composer inset.
- `/drafts`, `/bookmarks`, `/share`: inherit list/card treatment; empty states
  get the etched medallion for free.

### 9.2 Library (`/library`) — deep treatment

Design stance: **books and photos are content, not glass** (§4.1.7). The
*furniture* is glass — shelves, plinths, chrome. Reference: a museum vitrine.

- **Hero (`lib-hero`):** becomes the page's L2 `.glass-pane` +
  `.glass-refract` (the page's hero refract slot). Eyebrow, `h1`, lede
  unchanged typographically. The stats `<dl>` (Volumes / Pages / Albums /
  Collections) becomes an **etched glass plate**: numbers in display font,
  labels `font-mono text-xs uppercase tracking-widest text-site-text-dim`,
  separated by vertical light hairlines — engraved into the hero pane, not
  boxed onto it.
- **Search (`lib-search`):** large `.glass-inset` well; live-filter behavior
  unchanged; the clear button is a tiny glass disc.
- **Shelves (`lib__shelf`, Curated / Community uploads):** each shelf row gets
  a **glass ledge** — a 10px high `.glass-fill` strip under the row of spines
  with a soft vertical gradient streak (`linear-gradient` pseudo) suggesting
  the covers' reflection. Book spines (`BookSpine`, `lib-book__3d`) keep their
  3D cover treatment; **fix the tile properly**: `library.css` currently
  `color-mix`es from `--site-surface` assuming opacity — replace with
  `--site-glass-tint` tokens and delete the `.style-liquid-glass .lib-volume`
  patch. Page-count badge → micro-glass Badge; hover = pointer light + rim
  brighten (no scale jump — books are heavy).
- **`LibraryAlbums` / `LibraryCollections` / `LibraryBlogRow`:** tiles are L1
  fills with opaque imagery; collection headers get the etched-label treatment;
  the blog row's horizontal scroller gets edge fade masks
  (`mask-image: linear-gradient`) so cards dissolve at the pane edge.
- **Admin affordances** (context menu, drag-reorder, edit/hide/curate/delete,
  reported flag): context menu → `.glass-overlay`; drag state lifts the spine
  with `shadow-site` + slight tilt; reported flag = danger-tinted rim on the
  tile. `UploadModal` / `LibraryEditModal` inherit the new Dialog.
- The admin migrate-to-S3 banner: warning-tinted L1 strip (rim in
  `--site-warning`).
- **Out of scope here:** the reader (`library.$slug`) and album viewer
  (`library.albums.$albumId`) — top-level, excluded.

### 9.3 Creator Studio (`/create`) — deep treatment

- **Header (`cstudio-head`):** "Make anything." sits directly on canvas (no
  pane) — large display type over the aurora is a statement the glass frames.
- **Tab bar (`cstudio-tabs`):** the marquee §5.4 implementation — a sticky
  `.glass-chrome` strip (it's persistent chrome while scrolling the gallery)
  whose active tab is a **liquid glass capsule** morphing between the five tabs
  (Pages / Games / Apps / User Builds / AI Personas) with `layoutId` + spring.
  Keeps WAI-ARIA `role="tablist"` + roving arrow-key nav + `?tab=` mirroring
  exactly as-is. Each tab keeps its lucide icon; icons refract a hint of accent
  when active.
- **Galleries (`PagesTab`, `CuratedBuildsTab`, `UserBuildsTab`, `PersonasTab`):**
  tiles are L1 fills; thumbnails opaque; title/meta rows on a bottom in-card
  gradient scrim (not blur — repeated elements). Pointer light on tiles.
  Infinite-scroll cursors and search unchanged; skeletons inherit §7.2.
- **`RankedSummary`** (Games tab): standings strip as an L2 pane with etched
  rank numerals; medal positions get success/warning-tinted rims.
- **Personas chat (`/personas/$id`):** chat bubbles — user bubbles accent
  glass, persona bubbles L1 fill; input row `.glass-inset`; typing indicator
  = three tiny glass beads.
- Legacy galleries (`/builds`, `/v`, `/personas` index, `/user-builds`) are
  thin/redirect shells into the Studio — verify they inherit and delete any
  local styling. `user-builds/submit` + `manage`: standard form treatment
  (§9.8 pattern).
- Consolidate the four CSS files this page imports (`creator-studio.css`,
  `storefront.css`, `builds.css`, `vibe.css`) down to token-based classes as
  encountered; delete rules the glass classes obsolete.

### 9.4 Store / Shop / Storefront / Membership — deep treatment

`/store` (MembershipPanel + ShopColumn), `/store/$userid` (StorefrontColumn),
`/shop`, `/pricing` (legacy shells), plus `/predictions` economy styling.

- **MembershipPanel:** the current scoped `<style>` painting `.pricing-root`
  with raw `--site-bg` is **deleted** (with its globals.css patch). Tier cards
  become L2 `.glass-pane`s on the canvas. The **featured/current tier** gets
  the premium treatment: `.glass-refract` (this page's hero slot) + the
  optional `--prism` chromatic rim (§4.3.5) + a slow 8s specular sweep across
  the rim (paused under reduced motion, static under `.perf-lite`). Price
  numerals in display font; feature lists separated by light hairlines; the
  CTA is the accent glass Button. `currentTier` state = success-tinted rim +
  etched "Current plan" label.
- **ShopColumn (coin/cosmetics catalog):** item grid = L1 fills; **rarity is
  rim color** — common: default rim; rare: accent-tinted rim; epic+: warm
  (warning) tinted rim — glass color communicates value without breaking the
  material. Owned items: etched check medallion overlay + reduced tint.
  Coin-balance chip: glass capsule + `AnimatedCount`, docked in the sticky
  header via `headerRight`. Purchase confirm → new `ConfirmDialog`; success →
  toast + `useCelebration` (already theme-aware).
- **`showHero` shop hero (`/shop`):** L2 pane with the coin iconography
  refracting the aurora; `/shop` and `/pricing` otherwise inherit `/store`
  components — verify no local surface styling remains.
- **StorefrontColumn (`/store/$userid`):** seller header = L2 pane (avatar,
  name, stats etched); item grid inherits ShopColumn treatment; the not-found
  state uses the standard `NotFound`.
- **`/predictions`:** market cards L1; live-odds bars = glass tubes filled
  with accent liquid (Slider track treatment); resolved markets get
  success/danger rims; the admin resolution flow is on `/admin/predictions`
  (§9.9).

### 9.5 Messaging & notifications (`/messages`, `/messages/$id`, `/groups`, `/groups/$id`, `/notifications`)

- Conversation list rows: L1 + unread = accent left rim edge; presence dots
  unchanged.
- Thread view: bubbles per §9.3 personas pattern; the message input bar is a
  **docked L3 chrome strip** (sticky bottom, one blur element) with an
  `.glass-inset` field; `ChatPanel`/`EmojiPickerPanel`/`ReactionMenu` → §7.3.
- `/notifications`: rows L1, type icons in small etched medallions; mark-read
  sweeps the row tint out.

### 9.6 Profile & personal (`/profile/$id`, `/u/$userid`, `/u/$userid/post/$postid`, `/progress`, `/achievements`, `/recap`, `/wrapped`)

- Profile header: banner image opaque; the identity bar overlapping it = L2
  pane (avatar with rim ring, handle, follow Button accent glass); stat row
  etched.
- Tab strips (Posts/Replies/Media…) = liquid capsule tabs.
- `/progress`: XP/streak bars = glass tubes with accent liquid; milestone
  markers = glass beads.
- `/achievements`: badges become **cast-glass medallions** — locked ones
  frosted at 40% tint with etched outlines; unlocked ones full tint + rim.
- `/recap`, `/wrapped`: these are showpieces — allowed one `.glass-refract`
  hero pane each + stat cards as L2 panes; keep their celebratory motion within
  `lib/motion.ts` tokens.

### 9.7 Hubs (`/study/*`, `/homes/*`, `/rmhladder/*`, `/rideshare/*`, `/developer/*`, `/playlists`, `/leaderboard`, `/ranked`, `/analytics`, `/roadmap`, `/quotes`, `/news`, `/blog`, `/music-trivia`)

All standard-pattern pages — primitives do the work. Specifics worth calling:

- **RMHLadder** (11 pages inside `RmhLadderShell`): the sub-nav becomes a
  liquid capsule tab strip; `rmhladder.css` audited to tokens. Jobs list =
  L1 rows; job detail = L2 pane; source-status dots on `/companies` and
  `/health` keep semantic colors with tinted rims; `/pipeline`'s ladder/editor
  panels are L2 panes with `.glass-inset` editors; `/resume` upload dropzone =
  dashed-rim `.glass-inset` well.
- **RMHHomes** (6 pages): `ListingCard` L1 + pointer light; the MapLibre map
  keeps `--site-map-filter` (canvas tint, unchanged); listing detail hero
  images opaque with an L2 info pane; `/homes/submit` + `/manage` + `/saved` +
  `/watches` standard forms/lists.
- **Developer portal** (`/developer`, `/developer/docs/*`): `KeysManager` key
  rows = L1 with mono keys in `.glass-inset` wells + `CopyButton`; docs pages
  get glass code blocks (inset wells, mono, no blur) and a sticky glass local
  ToC on `lg+`.
- **`/study/*`:** deck cards L1; the deck-study page's flashcard is the one
  place a **flip animation on a glass pane** is sanctioned (transform-only,
  reduced-motion → crossfade).
- **`/leaderboard`, `/ranked`, `/analytics`:** table treatment per §9.9;
  `/analytics` charts recolor from tokens only.
- `/roadmap`, `/quotes`, `/news`, `/blog` (in-shell lists): L1 cards; nothing
  bespoke. `/music-trivia` inherits shell styling but its game internals stay
  as they are.

### 9.8 Settings (`/settings`, `/settings/privacy`, `/settings/security`)

- Section groups become L2 panes (few per page, budget fine) with etched
  section labels; individual rows divided by light hairlines.
- Controls inherit §7.2 (`Switch` beads, `Select` wells).
- **ThemeGallery:** swatches now render each theme's `--site-canvas` +
  miniature glass card mock; preview-on-hover behavior unchanged.
- **New control (this project adds it):** "Reduce transparency" toggle (§10) in
  Appearance, next to theme/accent pickers. Strings via
  `t("settings-reduce-transparency", { defaultValue: "Reduce transparency" })`
  etc., then `pnpm i18n:extract`.
- `/settings/security`: `PasskeyManager`/`SessionManager` rows L1; danger zone
  (`DeleteAccountPanel`) = danger-rimmed pane.

### 9.9 Admin & backend (all 16 URLs under `/admin`) — full coverage

Admin pages already share `PageLayout` + card/table patterns, so they inherit
most of the redesign structurally — but they are the most **density-sensitive**
surfaces. Admin rules:

1. **Readability over spectacle:** admin uses L1 fills and chrome only — no
   refraction, no prism, minimal panes. Data density wins.
2. **Tables:** header row = sticky `.glass-chrome` strip within the scroll
   container; body rows = L1 with hairline dividers (`divide-site-border`);
   hover = tint raise only (no pointer light in dense tables — too busy);
   numeric cells `font-mono`.
3. **Queues** (`/admin/reports`, `/admin/security-reports`,
   `/admin/library-quota`, `/admin/predictions`, `/admin/rideshare`): queue
   cards = L1 with **status-tinted rims** (pending: warning; resolved:
   success; escalated/dangerous: danger). Action buttons: approve = accent
   glass, destructive = danger glass + `useConfirm`.
4. **Dashboard (`/admin/index`):** the 13 link cards become L1
   `.glass-interactive` tiles with pointer light, lucide icon in an etched
   medallion, count badges as glass capsules (report count keeps
   `useAdminReviewCount`).
5. **CRUD editors** (`/admin/blog/new`, `/admin/blog/$slug/edit`,
   `/admin/albums/*`, `/admin/announcements`): form fields per §7.2; the MDX
   editor's full-screen takeover keeps `.glass-opaque` (rule §3.3.2 — it must
   hide the page beneath). Bulk-upload dropzones = dashed-rim inset wells.
6. **`/admin/users`:** the table pattern + role/state Badges; impersonation or
   destructive controls always behind `useConfirm` (existing behavior, keep).
7. **`/admin/audit`:** monospace log rows, L1, timestamp column dim; filter
   bar in `headerExtra` inside the header chrome.
8. **`/admin/analytics`, `/admin/library-storage`:** stat tiles = L2 panes
   (few), charts/meters recolor via tokens; storage meters = glass tube bars.
9. The `admin/route.tsx` gate is untouched (auth logic out of scope).

### 9.10 Top-level in-scope pages

- **`/login`:** the flagship first impression. Full-viewport aurora canvas; a
  centered L2 `.glass-pane` + `.glass-refract` card holding the logo, OAuth
  provider buttons (glass capsules with brand icons at full color — content,
  not chrome), passkey button, and legal footnote. Provider buttons stack keeps
  current behavior/order. Error states as danger-rim inline strips, not toasts.
- **Legal pages (`/terms`, `/privacy`, `/cookies`, `/copyright`):** long-form
  reading on a single wide L2 pane ("document under glass") with an etched
  header; a sticky glass mini-ToC on `lg+`. Typography unchanged.
- **`/blog/$slug`, `/news/$slug` (article readers):** hero image opaque; the
  article column is one L2 pane; pull-quotes get light-hairline left rims;
  code blocks = inset wells; share row = glass capsules. (Their in-shell list
  pages are covered in §9.7.)
- **`/offline`:** single centered pane + etched medallion (wifi-off icon);
  works with zero network (no external assets — noise texture is a data URI,
  aurora is CSS).
- **`/security`:** document-under-glass like legal, plus the disclosure
  contact card as an L1 fill with `CopyButton`.

### 9.11 The design lab (`/liquid-glass`)

Repurposed from a demo into the living reference: swatches of all elevation
tiers, the lighting model, pointer light, refraction on/off comparison,
reduced-transparency preview toggle, and per-theme canvas previews. The
Unsplash background is replaced by the real canvas (removes the external
dependency). This page is where reviewers verify §4/§5 acceptance criteria.

---

## 10. Accessibility

- **Contrast floors on glass:** text tokens must clear WCAG AA against the
  *brightest* region of each theme's canvas as seen through the relevant tier.
  The current Glass Dark values already encode this (`--site-text-muted` at
  0.82 alpha, documented in globals.css) — preserve that comment and apply the
  same audit to Glass Light and each curated tint. Acceptance: axe/manual
  checks on `/`, `/library`, `/store`, `/admin/reports` per theme.
- **`high-contrast` neutralization (one global rule):**

```css
.style-high-contrast :is(.glass-fill, .glass-pane, .glass-chrome,
                         .glass-overlay, .glass-inset) {
  background: var(--site-surface) !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
.style-high-contrast .glass-refract::before { display: none; }
```

- **Reduce transparency — three triggers, one behavior:**
  `@media (prefers-reduced-transparency: reduce)`, `html.reduce-transparency`
  (the new user setting, persisted like the theme and synced via
  `/api/preferences/appearance`), and `html.perf-lite` (blur demotion only,
  keeps translucency). The media-query fallback block that exists today for
  `.style-liquid-glass` is generalized to the glass classes: opaque surfaces
  in the same hues, zero blur. Firefox users (no media query support) get the
  manual setting.
- **Reduced motion:** already comprehensively handled (global CSS neutralize +
  `MotionConfig`); new behaviors comply by construction: pointer light is
  opacity-gated (its `transition` collapses to 0.01ms → effectively instant,
  acceptable), liquid tabs jump, specular sweeps pause, header condensation
  snaps, flashcard flip crossfades.
- **Focus:** the global `:focus-visible` accent outline stays the single
  source of truth. Audit: outline contrast ≥ 3:1 against glass fills per theme
  (the accent tokens already vary per theme; Glass Light may need a darker
  focus accent — test).
- **Forced colors / Windows High Contrast:** glass backgrounds go
  transparent under `forced-colors: active`; add `border: 1px solid` structural
  borders on `.glass-*` so panes keep their shape when the UA strips
  backgrounds.
- RTL: nothing in the glass system is directional except the lighting model's
  "slightly left" bias — which does **not** flip (physical light, not UI
  direction). `.rtl-flip` usage unchanged.
- jsx-a11y warn count: no new warnings (CI-checked).

---

## 11. Theme runtime migration details

Ordered, concrete (all in Phase 1):

1. `app/globals.css`: move the `.style-liquid-glass` **token block** into
   `:root` (replacing the old Dark values); write new token blocks for
   `light`/`graphite`/`sepia`/`nocturne` as glass tints (§3.4) and add
   `--site-canvas` to each; leave `high-contrast` values untouched; add the
   `--site-glass-*` group (§3.2) to `:root` + per-theme overrides; add the
   glass component classes (§3.3); generalize the reduced-transparency block;
   add the high-contrast neutralization; delete the `.style-liquid-glass`
   scoped element rules once §7/§8 consumers are migrated.
2. `stores/themeStore.ts`: new `SITE_STYLES` (6 entries, labels per §3.4),
   `DEFAULT_STYLE = "default"`, `THEME_BG` values updated (`default` →
   `#0d1b2e`, `light` → its new canvas base, …).
3. `components/Providers.tsx`: add `"liquid-glass"` to the legacy-id self-heal
   list so persisted prefs migrate silently; add the `.perf-lite` heuristic
   (§6.4) and the `reduce-transparency` class application; sonner
   `toastOptions` re-skin (§7.3).
4. `app/routes/__root.tsx` inline `themeScript`: no structural change (it
   derives from `THEME_BG`); verify the pre-hydration background matches the
   new values; apply persisted `reduce-transparency` pre-paint alongside the
   style class (same pattern as accent).
5. `lib/appearance.ts`: accent presets unchanged; add the accent-tinted
   `--site-glass-light` derivation to `applyAccent` (one extra property).
6. `/api/preferences/appearance`: validation derives from `SITE_STYLES` —
   confirm the `reduce-transparency` boolean is added to its zod schema and
   Prisma prefs shape (tiny migration).
7. `components/settings/ThemeGallery.tsx`: renders from the new catalog; add
   the reduce-transparency toggle beside it.
8. Docs: rewrite `docs/design-language.md` §1–2 and §5–8 to describe the glass
   contract (do this in the final phase; this design doc is the spec until
   then), update `page-consistency.md` checklist items (`.vibe-glass` →
   `.glass-chrome`, `pb-16` → `pb-24`, glass-class dos/don'ts), touch
   `components/CLAUDE.md` and `app/CLAUDE.md` conventions lists.

---

## 12. Implementation phases

Each phase ends green: `pnpm exec tsc --noEmit`, `pnpm lint` (no new
warnings), `pnpm exec vitest run`, `pnpm build`, manual check of the §6.1
budgets on the phase's pages, in Glass Dark + Glass Light + High Contrast +
reduced-motion + reduced-transparency.

| Phase | Contents | Key files | Exit criteria |
|---|---|---|---|
| **0. Foundations** | Glass tokens + component classes + noise asset; `useGlassLight` hook; `EASE.glass` into `lib/motion.ts`; `.perf-lite`; re-tuned `GlassFilter`; design-lab page rebuilt as reference | `globals.css`, `hooks/useGlassLight.ts`, `lib/motion.ts`, `components/ui/liquid-glass.tsx`, `app/routes/liquid-glass.tsx`, `Providers.tsx` | New classes exist + design lab demonstrates all tiers; zero visual change elsewhere |
| **1. Theme migration** | §11 items 1–7: tokens to `:root`, new catalog, self-heal, canvases, reduce-transparency setting + API | `globals.css`, `stores/themeStore.ts`, `Providers.tsx`, `__root.tsx`, `lib/appearance.ts`, `ThemeGallery.tsx`, prefs API + schema | All 6 themes render; `liquid-glass` id migrates; no FOUC; gallery previews correct |
| **2. Primitives** | Every `components/ui/` change in §7.2 + shared composites §7.3 (Toaster, palette, popovers, global modals, CookieConsent, KeyboardShortcuts, MiniPlayer, errors) | `components/ui/*`, `site/*`, `Providers.tsx` | Primitive gallery on design lab matches spec; budgets hold on a modal-open feed page |
| **3. Shell** | Sidebar, drawer, floating dock, PageLayout scroll-condensation, RightSidebar; delete `.vibe-glass` (feed.css) after consumers move; `pb-16`→`pb-24` sweep | `_site.tsx`, `feed/LeftSidebar.tsx`, `MobileSidebarShell.tsx`, `MobileNav.tsx`, `MobileHeader.tsx`, `PageLayout.tsx`, `AnimatedMain.tsx`, `feed/feed.css` | Shell is glass on every `_site` page; drawer/dock gestures still 60fps; fixed-menu containing-block regression test passes |
| **4. Feed & social + messaging + profile** | §9.1, §9.5, §9.6 | `feed/*`, `messages/groups/notifications` routes, profile routes | Feed scroll trace clean (no per-card blur); thread + DMs verified |
| **5. Library, Studio, Store** | §9.2, §9.3, §9.4 — the three deep treatments; delete `.pricing-root` + `.lib-volume` patches and `MembershipPanel` scoped style | `library/*`, `creator-studio/*` + `create` route, `feed/ShopColumn.tsx`, `feed/StorefrontColumn.tsx`, `membership/MembershipPanel.tsx`, `library.css`, `storefront.css`, `builds.css`, `creator-studio.css` | The three flagship pages match spec; refract budget ≤2/page; rarity rims + tier prism verified |
| **6. Hubs + settings + admin** | §9.7, §9.8, §9.9 — every remaining `_site` page including all 16 admin URLs | hub routes + components, `settings/*`, `admin/*` | Appendix A checklist fully ticked for `_site/`; admin tables readable at density; queues show status rims |
| **7. Top-level + marketing** | §9.10 login/legal/readers/offline/security; §1.2 marketing landings (glass chrome, brand palettes kept) | `login.tsx`, legal routes, `blog.$slug.tsx`, `news.$slug.tsx`, `offline.tsx`, `security.tsx`, marketing routes | Login showcase approved; readers AA-clean; marketing pages keep brand identity |
| **8. Cleanup & docs** | Delete `.style-liquid-glass` scoped rules + any dead CSS; final RUM comparison; rewrite design-language.md / page-consistency.md; `pnpm i18n:extract` + `i18n:coverage` final pass | `globals.css`, docs | `grep -r "style-liquid-glass\|vibe-glass" app components` returns nothing; RUM targets met (§6.5); docs current |

Phases 4–7 are independently shippable behind normal review; 0–3 land in
order. Do not start deleting old CSS (phase 8 items) early — the descendant
patches keep unmigrated pages presentable during the transition.

---

## 13. Verification & QA matrix

Per phase, and in full before phase 8 closes:

- **Browsers:** Chromium (full), Safari macOS + iOS (prefix + fallback paths,
  fixed-attachment degradation, rounded-corner filter bleed), Firefox
  (no-displacement fallback, manual reduce-transparency toggle).
- **Themes:** all 6 — with special attention to Glass Light text contrast and
  High Contrast's total glass neutralization.
- **Preferences:** reduced motion, reduced transparency (media + setting),
  forced-colors, RTL (`ar` locale spot-check on shell + library + store).
- **Devices:** desktop, `xs` 480px, iOS safe-area (dock inset + `pb-safe`),
  4× CPU throttle scroll traces on `/`, `/library`, `/store`, `/admin/users`.
- **Budgets:** §6.1 table audited via DevTools layers panel on each flagship
  page.
- **Regression:** the §3.3 containing-block cases — sidebar user menu position,
  admin MDX editor opacity, drawer slide opacity; autofill rendering on
  `/login` and `/settings`; skeleton/pending states; `EmptyState` on every
  zero-data page encountered.
- **CI:** existing `web-ci.yml` (typecheck/lint/tests/build/audit) plus visual
  spot-screenshots of the design-lab page per theme attached to the PR.

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Blur cost tanks low-end scroll perf | The L1 no-blur rule for all repeated elements (the current implementation's biggest cost is removed, not added); `.perf-lite`; budgets in every phase's exit criteria |
| `backdrop-filter` containing-block breaks a fixed element somewhere unaudited | The explicit-class model makes every blur surface greppable (`glass-pane|glass-chrome|glass-overlay`); rule §3.3.1 comments; phase-3 regression test |
| Glass Light fails contrast on bright aurora | Token audit gate in §10; canvas radials capped in luminance; muted-text alpha tuned per theme like Glass Dark's 0.82 |
| Theme-id migration surprises signed-in users | Self-heal already exists and is extended; account-sync API validation derives from `SITE_STYLES`; visual change is intended (it's a redesign) but preference *choice* (light vs dark vs high-contrast) is preserved 1:1 |
| Transition period looks inconsistent | Old descendant patches stay until phase 8; phases are page-area-atomic so each PR ships a coherent area |
| Safari filter/radius rendering bugs | The `GlassEffect` pseudo-element + `border-radius: inherit` + `overflow: hidden` pattern is the known-good recipe; design lab is the canary page tested on WebKit each phase |
| Scope creep into games/apps | `THEME_EXCLUDED_ROUTES` untouched; §1.3 list is the contract; reviewers reject any diff under excluded paths |

---

## 15. Non-goals

- No route moves, renames, or layout-width changes (`lib/layout-width.ts`
  constants frozen).
- No new fonts, no icon-set change (lucide stays), no `react-icons`.
- No dark/light auto-switching by OS (explicit theme choice stays).
- No component-library swap — Radix + CVA + the existing primitive set remain.
- No redesign of emails, OG images, or the `rmhcode` CLI output.
- No behavioral changes to auth, payments, moderation, or data flows.

---

## Appendix A — Full page checklist (implementation tracking)

Tick per page when it passes the §12 phase exit criteria.

**Shell (Phase 3):** `_site.tsx` aside/main structure · LeftSidebar ·
MobileSidebarShell · MobileNav→dock · MobileHeader/TopBar · PageLayout ·
AnimatedMain · RightSidebar · BackToTop · skip link visual

**Feed/social (4):** `/` · `/explore` · `/search` · `/communities` ·
`/c/$slug` · `/tag/$tag` · `/thread/$rootId` · `/bookmarks` · `/drafts` ·
`/share`

**Messaging (4):** `/messages` · `/messages/$conversationId` · `/groups` ·
`/groups/$id` · `/notifications`

**Profile/personal (4):** `/profile/$id` · `/u/$userid` ·
`/u/$userid/post/$postid` · `/progress` · `/achievements` · `/recap` ·
`/wrapped`

**Library (5):** `/library` (hero · search · blog row · albums · collections ·
curated shelf · community shelf · admin affordances · upload/edit modals) ·
`/playlists`

**Creator Studio (5):** `/create` (tab bar · Pages · Games+Ranked · Apps ·
User Builds · Personas) · `/personas/$id` · `/builds` · `/v` · `/personas` ·
`/user-builds` · `/user-builds/manage` · `/user-builds/submit` · `/ranked` ·
`/leaderboard` · `/analytics`

**Store/economy (5):** `/store` (MembershipPanel · ShopColumn) ·
`/store/$userid` · `/shop` · `/pricing` · `/predictions` · `/wallet`
(redirect — verify only)

**Hubs (6):** `/study` · `/study/browse` · `/study/$deckId` · `/homes` ·
`/homes/listing/$id` · `/homes/manage` · `/homes/saved` · `/homes/submit` ·
`/homes/watches` · `/rmhladder` (+shell) · `/rmhladder/jobs` ·
`/rmhladder/jobs/$jobId` · `/rmhladder/alerts` · `/rmhladder/companies` ·
`/rmhladder/health` · `/rmhladder/pipeline` · `/rmhladder/resume` ·
`/rmhladder/review` · `/rmhladder/settings` · `/rideshare` ·
`/rideshare/ride` · `/rideshare/drive` · `/developer` · `/developer/docs` ·
`/developer/docs/$page` · `/roadmap` · `/quotes` · `/news` · `/blog` ·
`/music-trivia`

**Settings (6):** `/settings` (+ ThemeGallery + new reduce-transparency
toggle) · `/settings/privacy` · `/settings/security`

**Admin — all backend pages (6):** `/admin` (dashboard) · `/admin/users` ·
`/admin/user-builds` · `/admin/reports` · `/admin/security-reports` ·
`/admin/library-quota` · `/admin/library-storage` · `/admin/announcements` ·
`/admin/predictions` · `/admin/analytics` · `/admin/rideshare` ·
`/admin/audit` · `/admin/albums` · `/admin/albums/$id` · `/admin/blog` ·
`/admin/blog/new` · `/admin/blog/$slug/edit`

**Top-level (7):** `/login` · `/terms` · `/privacy` · `/cookies` ·
`/copyright` · `/security` · `/offline` · `/blog/$slug` · `/news/$slug` ·
`/liquid-glass` (design lab, Phase 0) · marketing: `/adaptive-intelligence` ·
`/rmh-capital` · `/rmh-pmc` · `/optimization`

**Global overlays (2–3):** Dialog/ConfirmDialog · Toaster · Tooltip ·
CommandPalette · NotificationsPopover · user menu · ComposeModal · ShareModal ·
ProfileEditModal · ReportDialog · Welcome/WhatsNew/FreeMonth/LanguageFirstRun ·
CookieConsent · KeyboardShortcuts · MiniPlayer · EmojiPicker/ReactionMenu ·
NotFound/RouteErrorFallback

---

## Appendix B — Reference CSS starter (Phase 0 seed)

Normative reference for the implementing agent — adapt, don't paste blindly.
Assumes the §3.2 tokens exist.

```css
/* ============ Glass elevation system ============ */
@layer components {
  .glass-fill {
    background: var(--site-glass-tint);
    /* rim + resting depth come from the shadow token, as Card does today */
    box-shadow: var(--site-shadow-sm);
    border: var(--site-border-width) solid var(--site-border);
    border-radius: var(--site-radius);
  }

  .glass-pane {
    background: var(--site-glass-tint);
    box-shadow: var(--site-shadow-sm);
    border: var(--site-border-width) solid var(--site-border);
    border-radius: var(--site-radius);
    -webkit-backdrop-filter: blur(var(--site-glass-blur-pane))
      saturate(var(--site-glass-saturate));
    backdrop-filter: blur(var(--site-glass-blur-pane))
      saturate(var(--site-glass-saturate));
    background-image: var(--glass-noise); /* data-URI, 2–3% opacity */
  }

  .glass-chrome {
    background: color-mix(in srgb, var(--site-bg) 32%, transparent);
    -webkit-backdrop-filter: blur(var(--site-glass-blur-chrome)) saturate(170%);
    backdrop-filter: blur(var(--site-glass-blur-chrome)) saturate(170%);
  }
  .glass-chrome[data-scrolled] {
    background: color-mix(in srgb, var(--site-bg) 55%, transparent);
  }
  /* Fixed asides: blur on ::before so fixed descendants keep the viewport
     as containing block (LeftSidebar user menu). NEVER put backdrop-filter
     on the aside itself. */
  .glass-chrome--aside { background: color-mix(in srgb, var(--site-bg) 40%, transparent); }
  .glass-chrome--aside::before {
    content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    -webkit-backdrop-filter: blur(var(--site-glass-blur-chrome)) saturate(170%);
    backdrop-filter: blur(var(--site-glass-blur-chrome)) saturate(170%);
  }

  .glass-overlay {
    background: color-mix(in srgb, var(--site-bg) 62%, transparent);
    box-shadow: var(--site-shadow);
    border: var(--site-border-width) solid var(--site-border);
    border-radius: var(--site-radius);
    -webkit-backdrop-filter: blur(var(--site-glass-blur-overlay)) saturate(180%);
    backdrop-filter: blur(var(--site-glass-blur-overlay)) saturate(180%);
  }

  .glass-scrim {
    background: rgb(0 0 0 / 0.5);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
  }

  .glass-inset {
    background: var(--site-glass-ink);
    border: var(--site-border-width) solid var(--site-border);
    border-radius: var(--site-radius-sm);
    box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.35),
                inset 0 -1px 0 var(--site-glass-rim-soft);
  }

  .glass-opaque { background: var(--site-bg); } /* full-screen takeovers */

  /* Interactivity (§5.1–5.2) */
  .glass-interactive { position: relative; transition:
      background var(--site-transition-speed), box-shadow var(--site-transition-speed),
      transform var(--site-transition-speed); }
  .glass-interactive:hover { background: var(--site-glass-tint-strong); }
  .glass-interactive:active { transform: scale(0.985); }
  @media (hover: hover) and (pointer: fine) {
    .glass-interactive::after {
      content: ""; position: absolute; inset: 0; z-index: 1;
      border-radius: inherit; pointer-events: none;
      background: radial-gradient(140px circle at
        var(--glass-px, 50%) var(--glass-py, -30%),
        var(--site-glass-light), transparent 70%);
      opacity: 0; transition: opacity 0.18s;
    }
    .glass-interactive:hover::after { opacity: 1; }
  }
}

/* ============ Global degradations ============ */
@media (prefers-reduced-transparency: reduce) { /* + html.reduce-transparency */
  :is(.glass-fill, .glass-pane, .glass-chrome, .glass-chrome--aside,
      .glass-overlay, .glass-inset) {
    background: var(--site-surface-opaque, var(--site-surface));
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  .glass-chrome--aside::before { display: none; }
  .glass-refract::before { display: none; }
}

html.perf-lite :is(.glass-pane) {           /* demote panes to fills */
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
html.perf-lite .glass-refract::before { display: none; }
html.perf-lite .glass-interactive::after { display: none; }

@media (forced-colors: active) {
  :is(.glass-fill, .glass-pane, .glass-chrome, .glass-overlay, .glass-inset) {
    border: 1px solid; /* keep structure when backgrounds are stripped */
  }
}
```

```ts
// hooks/useGlassLight.ts — sketch (§5.1). Mounted once in Providers.tsx.
export function useGlassLight() {
  useEffect(() => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (document.documentElement.classList.contains('perf-lite')) return;
    let raf = 0;
    let last: HTMLElement | null = null;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = (e.target as Element | null)
          ?.closest<HTMLElement>('[data-glass-light]') ?? null;
        if (last && last !== el) {
          last.style.removeProperty('--glass-px');
          last.style.removeProperty('--glass-py');
        }
        if (el) {
          const r = el.getBoundingClientRect();
          el.style.setProperty('--glass-px', `${((e.clientX - r.left) / r.width) * 100}%`);
          el.style.setProperty('--glass-py', `${((e.clientY - r.top) / r.height) * 100}%`);
        }
        last = el;
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
}
```
