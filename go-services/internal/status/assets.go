package status

// darkTokens is the Midnight palette (.style-graphite in globals.css). It is
// stated once and applied twice: under the OS dark preference unless the
// visitor pinned the light theme, and unconditionally when they pinned dark.
const darkTokens = `
    color-scheme: dark;
    --site-bg: #000000;
    --site-bg-subtle: rgba(255, 255, 255, 0.05);
    --site-surface: rgba(28, 28, 30, 0.72);
    --site-surface-opaque: #1c1c1e;
    --site-border: rgba(255, 255, 255, 0.12);
    --site-border-bright: rgba(255, 255, 255, 0.26);
    --site-text: #f5f5f7;
    --site-text-muted: #a1a1a6;
    --site-text-dim: #86868b;
    --site-accent: #2997ff;
    --site-accent-fg: #001227;
    --site-success: #30d158;
    --site-danger: #ff453a;
    --site-warning: #ff9f0a;
    --site-glass-tint: rgba(28, 28, 30, 0.62);
    --site-glass-rim: rgba(255, 255, 255, 0.14);
    --site-shadow-sm: 0 2px 12px rgba(0, 0, 0, 0.5);
    --site-canvas:
      radial-gradient(120% 80% at 50% -10%, rgba(255, 255, 255, 0.035), transparent 60%),
      linear-gradient(180deg, #000000 0%, #08080a 60%, #000000 100%);
    --site-aurora-far-1: rgba(255, 255, 255, 0.02);
    --site-aurora-far-2: rgba(255, 255, 255, 0.015);
    --cage-minor: rgba(245, 245, 247, 0.2);
    --cage-parallel: rgba(245, 245, 247, 0.13);
    --cage-major: rgba(245, 245, 247, 0.34);
    --bar-empty: rgba(255, 255, 255, 0.07);
    --site-info: #2997ff;
`

const darkThemeCSS = `@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {` + darkTokens + `  }
}
:root[data-theme='dark'] {` + darkTokens + `}
:root[data-theme='light'] { color-scheme: light; }
`

// ── Styles ───────────────────────────────────────────────────────────────────
//
// A raw string literal, so no `%` in this CSS needs doubling — the old renderer
// passed the whole stylesheet through fmt.Sprintf, which is why every gradient
// stop in it was written `62%%`.
const dashboardCSS = `
/* ═══ Tokens ══════════════════════════════════════════════════════════════
   Quoted from app/globals.css. Daylight (:root there) is the base; Midnight
   (.style-graphite) answers the OS preference, since a standalone page cannot
   read the visitor's account theme. The site ships exactly these two monochrome
   palettes plus High contrast, and prefers-contrast is handled further down.

   The --cage-* inks are stated as literal rgba rather than the site's
   color-mix(in srgb, var(--site-text) N%, transparent): the wireframe is
   stroked onto a canvas, and a canvas needs a RESOLVED colour string. The
   computed value of an unregistered custom property is its literal text, so the
   site registers these with @property; this page authors both palettes by hand
   and can simply say what they are. */
:root {
  color-scheme: light;
  --site-bg: #ffffff;
  --site-bg-subtle: rgba(0, 0, 0, 0.045);
  --site-surface: rgba(255, 255, 255, 0.72);
  --site-surface-opaque: #ffffff;
  --site-border: rgba(0, 0, 0, 0.16);
  --site-border-bright: #000000;
  --site-text: #000000;
  --site-text-muted: #565656;
  --site-text-dim: #767676;
  --site-accent: #000000;
  --site-accent-fg: #ffffff;
  --site-success: #167d3a;
  --site-danger: #c40016;
  --site-warning: #7a4a00;
  --site-glass-tint: rgba(255, 255, 255, 0.78);
  --site-glass-rim: rgba(0, 0, 0, 0.12);
  --site-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04), 0 6px 20px -8px rgba(0, 0, 0, 0.06);
  --site-canvas:
    radial-gradient(70% 55% at 18% 4%, rgba(0, 0, 0, 0.055), transparent 62%),
    radial-gradient(60% 50% at 88% 12%, rgba(0, 0, 0, 0.045), transparent 60%),
    radial-gradient(90% 70% at 50% 42%, rgba(0, 0, 0, 0.05), transparent 62%),
    linear-gradient(180deg, #ffffff 0%, #fbfbfb 55%, #ffffff 100%);
  --site-aurora-far-1: rgba(0, 0, 0, 0.02);
  --site-aurora-far-2: rgba(0, 0, 0, 0.03);
  --cage-minor: rgba(0, 0, 0, 0.2);
  --cage-parallel: rgba(0, 0, 0, 0.13);
  --cage-major: rgba(0, 0, 0, 0.34);
  --bar-empty: rgba(0, 0, 0, 0.07);
  --site-info: #0a58ca;
}
` + darkThemeCSS + `:root {
  /* Geometry + type, unchanged between the two palettes. */
  --site-radius: 22px;
  --site-radius-sm: 14px;
  --site-border-width: 1px;
  --site-font-display: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter Variable', Inter, system-ui, sans-serif;
  --site-font-body: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter Variable', Inter, system-ui, sans-serif;
  --site-display-3: clamp(1.9rem, 5.5vw, 4.5rem);
  --site-display-3-leading: 1;
  --site-display-3-tracking: -0.05em;
  --site-display-weight: 500;
  --site-kicker-size: 0.6875rem;
  --site-kicker-tracking: 0.2em;
  --site-kicker-weight: 700;
  --site-letter-spacing: -0.022em;
  --ease-glass: cubic-bezier(0.16, 1, 0.3, 1);
  --gutter: clamp(0.9rem, 4vw, 2.25rem);
  --col: 52rem;
  --topbar-h: 3.5rem;
  /* The one colour the WHOLE page keys off: the overall verdict. Set per state
     below, read by the globe's rim, the headline mark and the browser tab dot. */
  --signal: var(--site-text-dim);
}
html[data-status='up'] { --signal: var(--site-success); }
html[data-status='degraded'] { --signal: var(--site-warning); }
html[data-status='down'] { --signal: var(--site-danger); }
html[data-status='maintenance'] { --signal: var(--site-info); }

/* Per-state colour for anything that carries a state: cards, pills, dots, pins,
   bars, tallies. Declared ONCE, inherited by everything inside. */
[data-status='up'] { --state: var(--site-success); }
[data-status='degraded'] { --state: var(--site-warning); }
[data-status='down'] { --state: var(--site-danger); }
[data-status='unknown'] { --state: var(--site-text-dim); }
[data-status='maintenance'] { --state: var(--site-info); }

* { box-sizing: border-box; }

html {
  /* THEME_BG's job: paint the ground synchronously so overscroll and the frames
     before the aurora resolves are never a white flash on a black page. */
  background: var(--site-bg);
}

body {
  margin: 0;
  min-height: 100dvh;
  font-family: var(--site-font-body);
  font-size: 1rem;
  line-height: 1.5;
  letter-spacing: var(--site-letter-spacing);
  color: var(--site-text);
  background: transparent;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  /* viewport-fit=cover is set, so the page owes the notch its own inset. */
  padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}

/* ═══ The ground ══════════════════════════════════════════════════════════
   Two fixed layers, exactly as globals.css paints them: the near aurora on the
   theme canvas, and a slower far field behind it, both oversized so the drift
   never reveals an unpainted edge. Transform/opacity only — this layer is
   composited and never re-laid-out, and nothing above it is blurred. */
.site-aurora {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  contain: layout style;
}
.site-aurora::before,
.site-aurora::after {
  content: '';
  position: absolute;
  pointer-events: none;
  transform-origin: center;
}
.site-aurora::before {
  inset: -14%;
  z-index: -1;
  background-image: var(--site-canvas);
  background-repeat: no-repeat;
  background-size: 100% 100%;
  animation: aurora-drift 34s ease-in-out infinite alternate;
}
.site-aurora::after {
  inset: -18%;
  z-index: -2;
  background-image:
    radial-gradient(60% 50% at 24% 30%, var(--site-aurora-far-1), transparent 70%),
    radial-gradient(50% 45% at 78% 66%, var(--site-aurora-far-2), transparent 70%);
  animation: aurora-drift-far 52s ease-in-out infinite alternate;
}
@keyframes aurora-drift {
  0% { transform: scale(1.06) rotate(0deg) translate3d(0, 0, 0); }
  25% { transform: scale(1.1) rotate(0.5deg) translate3d(1.2%, -0.6%, 0); }
  50% { transform: scale(1.13) rotate(0.7deg) translate3d(1.6%, -1.4%, 0); }
  75% { transform: scale(1.09) rotate(-0.3deg) translate3d(-0.6%, 0.4%, 0); }
  100% { transform: scale(1.07) rotate(-0.7deg) translate3d(-1.5%, 1.2%, 0); }
}
@keyframes aurora-drift-far {
  0% { transform: scale(1.1) rotate(0.4deg) translate3d(-1.2%, 0.8%, 0); }
  50% { transform: scale(1.04) rotate(-0.5deg) translate3d(1.4%, -1%, 0); }
  100% { transform: scale(1.12) rotate(0.3deg) translate3d(-0.8%, 1.2%, 0); }
}

/* The radial rings + the blob field the glass floats on (radial.css
   §.radial-backdrop). Mobile keeps it cheap: the outer rings are display:none
   and the field never appears, because a fixed full-screen layer with six
   infinitely-animating circles is a continuous GPU cost on a phone. */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
  background: transparent;
}
.backdrop__rings {
  position: absolute;
  left: 50%;
  top: 40%;
  width: 0;
  height: 0;
}
.backdrop__ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(38vmin + var(--i) * 22vmin);
  height: calc(38vmin + var(--i) * 22vmin);
  transform: translate(-50%, -50%);
  border: 1px solid var(--site-border);
  border-radius: 50%;
  opacity: calc(0.5 - var(--i) * 0.06);
}
.backdrop__ring:nth-child(n + 4) { display: none; }
.backdrop__field { display: none; position: absolute; inset: -10%; z-index: -1; }
.backdrop__blob {
  position: absolute;
  width: clamp(18rem, 34vw, 32rem);
  height: clamp(18rem, 34vw, 32rem);
  /* Soft-edged fields, not discs: at this opacity the fade IS the fusing. No
     goo filter — see the cost note in components/radial/radial.css. */
  background: radial-gradient(
    closest-side circle at 50% 50%,
    color-mix(in srgb, var(--site-text) 10%, transparent),
    color-mix(in srgb, var(--site-text) 6%, transparent) 55%,
    transparent 100%
  );
}
.backdrop__blob:nth-child(1) { left: 6%; top: 12%; }
.backdrop__blob:nth-child(2) { right: 8%; top: 4%; }
.backdrop__blob:nth-child(3) { left: 22%; bottom: 2%; }
.backdrop__blob:nth-child(4) { right: 16%; bottom: 10%; }
@media (min-width: 768px) {
  .backdrop__ring:nth-child(n + 4) { display: block; }
  .backdrop__field { display: block; }
}
@media (min-width: 768px) and (prefers-reduced-motion: no-preference) {
  .backdrop__ring {
    animation: breathe 14s ease-in-out infinite;
    animation-delay: calc(var(--i) * -1.6s);
  }
  .backdrop__blob {
    animation: blob-drift 26s ease-in-out infinite alternate;
    animation-delay: calc(var(--i) * -6s);
  }
}
@keyframes breathe {
  0%, 100% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.035); }
}
@keyframes blob-drift {
  0% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(6vw, -4vh, 0) scale(1.18); }
  100% { transform: translate3d(-5vw, 5vh, 0) scale(0.9); }
}

/* ═══ Top bar ═════════════════════════════════════════════════════════════
   radial.css §.radial-topbar: opaque on phones (translucency with no blur just
   ghosts what scrolls under it), frosted from 768px up where the blur is
   affordable. Nothing moves above it, so the backdrop-filter is safe here. */
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  height: var(--topbar-h);
  padding: 0 var(--gutter);
  padding-top: env(safe-area-inset-top);
  background: var(--site-bg);
  border-bottom: 1px solid var(--site-border);
}
@media (min-width: 768px) {
  .topbar {
    background: color-mix(in srgb, var(--site-bg) 78%, transparent);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    backdrop-filter: blur(20px) saturate(180%);
  }
}
.topbar__brand {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  color: var(--site-text);
  text-decoration: none;
}
.topbar__mark { font-weight: 800; letter-spacing: 0.14em; font-size: 1.05rem; }
.topbar__brand small {
  display: none;
  color: var(--site-text-muted);
  font-size: 0.6875rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}
@media (min-width: 640px) { .topbar__brand small { display: inline; } }
.topbar__tag {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--site-text-muted);
}
.topbar__tag::before {
  content: '';
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: var(--signal);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--signal) 18%, transparent);
}

/* ═══ Shell ═══════════════════════════════════════════════════════════════ */
.shell {
  width: 100%;
  max-width: var(--col);
  margin: 0 auto;
  padding: clamp(1.75rem, 6vw, 4rem) var(--gutter) 0;
}

/* ═══ Hero — the liquid globe + the verdict ═══════════════════════════════ */
.hero {
  display: grid;
  gap: clamp(1.5rem, 5vw, 2.75rem);
  justify-items: center;
  text-align: center;
  margin-bottom: clamp(2.5rem, 8vw, 4.5rem);
}
@media (max-width: 719px) {
  /* The copy is a centred grid item, but the tallies inside it are their own
     flex row — which starts at the left edge of that item unless told not to. */
  .hero__tallies { justify-content: center; }
}
@media (min-width: 720px) {
  .hero {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    justify-items: start;
    text-align: left;
  }
}
.hero__copy { min-width: 0; }
.kicker {
  margin: 0 0 0.75rem;
  font-size: var(--site-kicker-size);
  font-weight: var(--site-kicker-weight);
  letter-spacing: var(--site-kicker-tracking);
  text-transform: uppercase;
  color: var(--site-text-dim);
}
.hero__headline {
  margin: 0;
  font-family: var(--site-font-display);
  font-weight: var(--site-display-weight);
  font-size: var(--site-display-3);
  line-height: var(--site-display-3-leading);
  letter-spacing: var(--site-display-3-tracking);
  overflow-wrap: anywhere;
}
.hero__lede {
  margin: 0.9rem 0 0;
  color: var(--site-text-muted);
  font-size: clamp(0.9rem, 1.4vw, 1.05rem);
  line-height: 1.55;
}
.hero__tallies {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  list-style: none;
  margin: 1.4rem 0 0;
  padding: 0;
}
.hero__tallies:empty { display: none; }
.tally { display: flex; align-items: baseline; gap: 0.4rem; }
.tally__n {
  font-family: var(--site-font-display);
  font-size: 1.5rem;
  font-weight: 500;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  color: var(--state);
}
.tally__label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--site-text-dim);
}

/* ── The globe ────────────────────────────────────────────────────────────
   The stage is square and the sphere is the circle inscribed in it. The CSS
   perspective and the script's projection read the SAME number (--globe-persp
   / PERSP in the script), because the glass body is a CSS element while the
   cage and the pins are projected in JS — if the two disagreed, the pins would
   slide off the surface they are stuck to. */
.globe {
  position: relative;
  flex: none;
  --globe-size: min(64vw, 32dvh, 15rem);
  --globe-persp: 3.1;
  width: var(--globe-size);
  height: var(--globe-size);
  perspective: calc(var(--globe-size) * var(--globe-persp));
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  cursor: grab;
}
@media (min-width: 720px) { .globe { --globe-size: min(34vw, 40dvh, 17rem); } }
.globe[data-grabbing='true'] { cursor: grabbing; }
/* The canvas hangs OUTSIDE the stage on every side. The sphere's limb already
   reaches the stage edge, so a stroke at the rim would otherwise be clipped
   square by the edge of the backing store. --cage-bleed is the one source of
   truth; the script reads the same fraction to size and centre the buffer. */
.globe__cage {
  position: absolute;
  --cage-bleed: 9%;
  top: calc(var(--cage-bleed) * -1);
  left: calc(var(--cage-bleed) * -1);
  /* Sized EXPLICITLY: a <canvas> is a replaced element, so width:auto would
     resolve to its width/height ATTRIBUTES (device pixels) and render at 2x on
     a retina display, anchored to the top-left. */
  width: calc(100% + 2 * var(--cage-bleed));
  height: calc(100% + 2 * var(--cage-bleed));
  pointer-events: none;
}
/* Liquid Glass, held still: a specular bloom up-left, a thickening toward the
   limb where a sphere's glass is deepest, and a rim in the overall status
   colour — the one place the verdict is carried by the material itself. */
.globe__glass {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  background:
    radial-gradient(68% 68% at 30% 26%, color-mix(in srgb, var(--site-text) 9%, transparent) 0%, transparent 62%),
    radial-gradient(circle closest-side at 50% 50%, transparent 52%,
      color-mix(in srgb, var(--site-text) 8%, transparent) 88%,
      color-mix(in srgb, var(--site-text) 17%, transparent) 100%);
  box-shadow:
    inset 0 0 0 var(--site-border-width) color-mix(in srgb, var(--signal) 42%, transparent),
    inset 0 -14% 26% -18% color-mix(in srgb, var(--site-text) 16%, transparent),
    0 30px 70px -34px color-mix(in srgb, var(--signal) 45%, transparent);
}
/* The travelling highlight — the one part of the material that moves by itself.
   Transform-only on a small element, and nothing below it is blurred. */
.globe__glass::after {
  content: '';
  position: absolute;
  left: 12%;
  top: 8%;
  width: 44%;
  height: 30%;
  border-radius: 50%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--site-text) 12%, transparent), transparent);
}
@media (prefers-reduced-motion: no-preference) {
  .globe__glass::after { animation: globe-sheen 11s ease-in-out infinite alternate; }
}
@keyframes globe-sheen {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(22%, 16%, 0) scale(1.18); }
}
.globe__pins { position: absolute; inset: 0; list-style: none; margin: 0; padding: 0; }
/* A ZERO-SIZE anchor the script moves, with the dot centred on it — so one
   translate3d + scale per frame both positions the pin and foreshortens it. */
.globe__pin {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  will-change: transform;
}
.globe__pin-dot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.6rem;
  height: 0.6rem;
  margin: -0.3rem 0 0 -0.3rem;
  border-radius: 50%;
  background: var(--state);
  box-shadow:
    0 0 0 0.14rem color-mix(in srgb, var(--state) 22%, transparent),
    0 0 0.5rem color-mix(in srgb, var(--state) 60%, transparent);
}

/* ═══ Service tiers ═══════════════════════════════════════════════════════ */
.tier { margin: 0 0 clamp(1.75rem, 5vw, 2.75rem); }
.tier__label {
  margin: 0 0 0.85rem;
  padding-left: 0.15rem;
  font-size: var(--site-kicker-size);
  font-weight: var(--site-kicker-weight);
  letter-spacing: var(--site-kicker-tracking);
  text-transform: uppercase;
  color: var(--site-text-dim);
}
.tier__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(0.6rem, 2vw, 0.85rem);
}
/* The error-budget section's subheading (E14) — states the target, the window
   the remaining budget is measured over, and what would page. Sits between the
   tier label and its list, so it inherits the label's left inset rather than
   starting a second alignment. */
.tier__note {
  margin: -0.45rem 0 0.85rem;
  padding-left: 0.15rem;
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--site-text-dim);
}

/* L1 · the repeated glass tier (globals.css §.glass-fill): tint + hairline +
   soft depth + an AMBIENT glint, so a card reads as a lit sheet rather than
   flat paper. No blur — this is the tier the page is mostly made of, and blur
   cost is a per-component decision. */
.svc {
  position: relative;
  padding: clamp(0.95rem, 3vw, 1.35rem) clamp(1rem, 3vw, 1.5rem);
  border: var(--site-border-width) solid var(--site-border);
  border-radius: var(--site-radius);
  background-color: var(--site-glass-tint);
  background-image: radial-gradient(
    320px circle at 50% -5%,
    color-mix(in srgb, var(--site-glass-rim) 18%, transparent) 0%,
    transparent 65%
  );
  background-clip: padding-box;
  background-origin: padding-box;
  box-shadow: var(--site-shadow-sm);
  transition: border-color 0.2s var(--ease-glass), transform 0.2s var(--ease-glass);
}
@media (hover: hover) {
  .svc:hover {
    border-color: color-mix(in srgb, var(--state) 45%, var(--site-border));
    transform: translateY(-1px);
  }
}
/* A service in trouble is edged in its own state colour, so the eye finds it
   without reading a word. Never the ONLY signal — the pill says it too. */
.svc[data-status='degraded'],
.svc[data-status='down'] {
  border-color: color-mix(in srgb, var(--state) 38%, var(--site-border));
}
.svc__head { display: flex; align-items: center; gap: 0.85rem; }
.svc__dot {
  flex: none;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--state);
  box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--state) 16%, transparent);
}
.svc__id { flex: 1 1 auto; min-width: 0; }
.svc__name {
  margin: 0;
  font-family: var(--site-font-display);
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  overflow-wrap: anywhere;
}
.svc__desc {
  margin: 0.1rem 0 0;
  color: var(--site-text-muted);
  font-size: 0.8125rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.svc__meta { flex: none; display: flex; align-items: center; gap: 0.75rem; }
.svc__latency {
  color: var(--site-text-dim);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.svc__pill {
  white-space: nowrap;
  padding: 0.22rem 0.7rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--state) 40%, transparent);
  background: color-mix(in srgb, var(--state) 10%, transparent);
  color: var(--state);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

/* The rolling uptime strip. One flex row of equal bars, oldest left.
   overflow:hidden is the structural guarantee, not a cosmetic one: the strip
   holds one bar per bucket (90 of them at the default window), and a flex item
   with a min-width cannot shrink past it — so on a phone the row's intrinsic
   minimum exceeded the card and the last day of history hung off the right edge
   of the page. The narrow-screen rule below thins the bars so they FIT; this
   clips anything a future window length could still push past. */
.svc__bars {
  display: flex;
  gap: 2px;
  height: 1.9rem;
  margin-top: 0.95rem;
  align-items: stretch;
  overflow: hidden;
}
.bar { flex: 1 1 0; min-width: 2px; border-radius: 2px; background: var(--bar-empty); }
.bar[data-b='up'] { background: var(--site-success); }
.bar[data-b='degraded'] { background: var(--site-warning); }
.bar[data-b='down'] { background: var(--site-danger); }
.bar[data-b='unknown'] { background: var(--site-bg-subtle); }
/* A blip is a real failure too brief to call an outage (BarSeverity): green,
   with a warning cap so it can still be found by eye and hovered. */
.bar[data-b='blip'] {
  background: linear-gradient(to bottom, var(--site-warning) 0 22%, var(--site-success) 22% 100%);
}
.bar[data-b='maint'] { background: var(--site-info); }
@media (hover: hover) {
  .bar:hover { filter: brightness(1.3); }
}
.svc__legend {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.55rem;
  color: var(--site-text-dim);
  font-size: 0.7rem;
}
.svc__uptime {
  color: var(--site-text-muted);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* ── Phones ───────────────────────────────────────────────────────────────
   The card head is four things competing for one row — dot, name, description,
   and the latency + pill pair — which is comfortable on a laptop and impossible
   at 360px, where it squeezed the description into a three-line ribbon beside a
   pill. Below 560px it becomes two rows: the identity, then its readout on a
   row of its own — the verdict indented to the dot's column so the card still
   reads as one block, the latency out at the far edge. row-reverse rather than
   two rewritten elements: the desktop order (latency, then pill) is the right
   one there, and this is the same two children, turned around. */
@media (max-width: 560px) {
  .svc__head { flex-wrap: wrap; row-gap: 0.6rem; }
  .svc__id { flex-basis: calc(100% - 1.35rem); }
  .svc__meta {
    width: 100%;
    padding-left: 1.35rem;
    flex-direction: row-reverse;
    justify-content: space-between;
  }
}
@media (max-width: 640px) {
  /* Thin enough that the whole window fits the card's inner width. */
  .svc__bars { gap: 1px; height: 2.1rem; }
  .bar { min-width: 1px; border-radius: 1px; }
}

/* ═══ Foot ════════════════════════════════════════════════════════════════ */
.foot {
  max-width: var(--col);
  margin: 0 auto;
  padding: 0 var(--gutter) clamp(2.5rem, 8vw, 4rem);
  color: var(--site-text-dim);
  font-size: 0.75rem;
  text-align: center;
}
.foot p { margin: 0.3rem 0; }
.foot a { color: var(--site-text-muted); text-decoration: none; border-bottom: 1px solid var(--site-border); }
.foot a:hover { color: var(--site-text); border-bottom-color: currentColor; }

/* Focus rings are global on the site; they are global here too. */
:focus-visible {
  outline: 2px solid var(--site-accent);
  outline-offset: 3px;
  border-radius: 4px;
}

/* ═══ Preferences ═════════════════════════════════════════════════════════ */

/* An unrequested, never-ending animation is exactly what this preference is
   asking not to see. The globe still turns under a finger — that motion was
   requested — but it stops drifting on its own. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
/* Reduced transparency: the site swaps glass for its opaque fallback rather
   than shipping a half-legible tint (globals.css §html.reduce-transparency). */
@media (prefers-reduced-transparency: reduce) {
  .svc { background-color: var(--site-surface-opaque); background-image: none; }
  .topbar { background: var(--site-bg); -webkit-backdrop-filter: none; backdrop-filter: none; }
  .site-aurora, .backdrop { display: none; }
}
/* High contrast is a shipped theme on the site (strict black, white ink, hard
   borders). Here it is the same idea, applied to the tokens this page owns. */
@media (prefers-contrast: more) {
  :root {
    --site-border: color-mix(in srgb, var(--site-text) 55%, transparent);
    --site-text-muted: var(--site-text);
    --site-text-dim: var(--site-text);
    --site-glass-tint: var(--site-surface-opaque);
  }
  .svc { background-image: none; }
  .site-aurora { display: none; }
}
` + extraCSS

// ── The globe's frame loop ───────────────────────────────────────────────────
//
// A single rAF loop that projects the wireframe cage onto ONE canvas and moves
// the pins, in the same coordinate system, from the same constants as
// components/radial/LiquidGlobe.tsx. Deliberately small, and deliberately
// NOT a port of that component: there is no navigation here, so there is no
// reticle, no dwell ring, no magnetism, no ripple. What survives is the
// geometry, the physics of a release, and the two performance rules the
// original is built around — one canvas for the cage, and no write to the DOM
// on a frame where the value did not change.
const dashboardJS = `
(function () {
  'use strict';
  var stage = document.querySelector('[data-globe]');
  if (!stage) return;
  var canvas = stage.querySelector('[data-cage]');
  var pins = Array.prototype.slice.call(stage.querySelectorAll('[data-pin]'));
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

  var DEG = Math.PI / 180;
  /* Perspective, as a multiple of the stage width. The CSS reads the same
     number (--globe-persp): the glass body is a CSS element and the cage/pins
     are projected here, so a disagreement would slide the pins off the sphere. */
  var PERSP = 3.1;
  /* Latitude band the pins are spread over, as sin(lat) — capping it at 0.72
     (+/-46 degrees) keeps every pin clear of the poles. */
  var LAT_SPAN = 0.72;
  var GOLDEN = 180 * (3 - Math.sqrt(5));
  var MERIDIANS = [0, 30, 60, 90, 120, 150];
  var PARALLELS = [-60, -40, -20, 0, 20, 40, 60];
  /* A projected circle is a conic section, so each ring is a polyline. At 72
     segments the chord error is a fraction of the 1px stroke. */
  var SAMPLES = 72;
  var BLEED = 0.09;
  var MAX_DPR = 2;
  var ROT_PER_PX = 0.45;
  var IDLE_SPIN = 5.5;
  var PITCH_LIMIT = 62;
  var REST_PITCH = -14;
  var FRICTION = 1.9;
  var MAX_SPIN = 900;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function smoothstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Fibonacci-sphere placement, squeezed into the usable latitude band — the
     same function LiquidGlobe uses, so a pin's home is a pure function of its
     index and the count and nothing has to be emitted with the markup. */
  var n = pins.length;
  var nodes = pins.map(function (el, i) {
    var sinLat = n <= 1 ? 0 : (1 - (2 * (i + 0.5)) / n) * LAT_SPAN;
    var lat = Math.asin(sinLat) / DEG;
    var lon = ((i * GOLDEN) % 360) - 180;
    var cl = Math.cos(lat * DEG);
    return {
      el: el,
      /* Screen-handed: x right, y DOWN, z toward the viewer. */
      bx: cl * Math.sin(lon * DEG),
      by: -Math.sin(lat * DEG),
      bz: cl * Math.cos(lon * DEG),
      transform: '',
      opacity: '',
      z: -1
    };
  });

  /* All thirteen rings are sampled at the same angles, so the pairs are built
     once at load instead of ~1900 trig calls per frame. */
  var COS = new Float64Array(SAMPLES + 1);
  var SIN = new Float64Array(SAMPLES + 1);
  for (var s = 0; s <= SAMPLES; s++) {
    var th = (s / SAMPLES) * Math.PI * 2;
    COS[s] = Math.cos(th);
    SIN[s] = Math.sin(th);
  }

  var size = 240;
  var span = 240;
  var ink = { minor: 'rgba(0,0,0,.2)', parallel: 'rgba(0,0,0,.13)', major: 'rgba(0,0,0,.34)', width: 1 };
  var dirty = true;

  function measure() {
    size = stage.offsetWidth || 240;
    span = size * (1 + 2 * BLEED);
    if (!ctx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    var px = Math.round(span * dpr);
    /* Assigning width REALLOCATES and clears the backing store, so it happens
       here — on mount and on a real resize — and never in the frame loop. */
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    ctx.setTransform(dpr, 0, 0, dpr, (span * dpr) / 2, (span * dpr) / 2);
    ctx.lineJoin = 'round';
    /* Reading a computed style is a style flush, so the theme ink is resolved
       once per size change rather than per frame. */
    var cs = getComputedStyle(canvas);
    var read = function (name, fallback) {
      var v = cs.getPropertyValue(name).trim();
      return v ? v : fallback;
    };
    ink.minor = read('--cage-minor', ink.minor);
    ink.parallel = read('--cage-parallel', ink.parallel);
    ink.major = read('--cage-major', ink.major);
    ink.width = parseFloat(read('--site-border-width', '1')) || 1;
    dirty = true;
  }

  var yaw = 0;
  var pitch = REST_PITCH;
  var vYaw = 0;
  var drag = null;

  /* Seed the spin from the clock, so a reload or a hop between this page and
     the history pages picks the turn up where it was rather than snapping back
     to zero, which reads as a stutter rather than a turn. */
  if (!reduced) yaw = ((Date.now() / 1000) * IDLE_SPIN) % 360;

  function drawRing(stroke, width, ux, uy, uz, vx, vy, vz, oy, cy, sy, cp, sp, R) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (var i = 0; i <= SAMPLES; i++) {
      var ct = COS[i], st = SIN[i];
      var bx = ux * ct + vx * st;
      var by = uy * ct + vy * st + oy;
      var bz = uz * ct + vz * st;
      var x1 = bx * cy + bz * sy;
      var z1 = -bx * sy + bz * cy;
      var y2 = by * cp - z1 * sp;
      var z2 = by * sp + z1 * cp;
      var k = PERSP / (PERSP - z2 * 0.5);
      if (i === 0) ctx.moveTo(x1 * R * k, y2 * R * k);
      else ctx.lineTo(x1 * R * k, y2 * R * k);
    }
    ctx.stroke();
  }

  function render() {
    var R = size / 2;
    var cy = Math.cos(yaw * DEG), sy = Math.sin(yaw * DEG);
    var cp = Math.cos(pitch * DEG), sp = Math.sin(pitch * DEG);

    if (ctx) {
      ctx.clearRect(-span / 2, -span / 2, span, span);
      /* A CSS border is 1px in its ELEMENT's coordinates, so a ring turned away
         from the viewer had its stroke foreshortened with everything else. That
         is a real depth cue: |nz| is 1 face-on and 0 edge-on, and the floor
         keeps an edge-on ring from thinning into nothing. */
      var widthFor = function (nx, ny, nz) {
        var z1 = -nx * sy + nz * cy;
        var face = Math.abs(ny * sp + z1 * cp);
        return ink.width * Math.max(0.42, (1 + face) / 2);
      };
      for (var m = 0; m < MERIDIANS.length; m++) {
        var a = MERIDIANS[m] * DEG, ca = Math.cos(a), sa = Math.sin(a);
        /* A meridian spans (cos a, 0, -sin a) and (0, 1, 0). */
        drawRing(MERIDIANS[m] === 0 ? ink.major : ink.minor, widthFor(sa, 0, ca),
          ca, 0, -sa, 0, 1, 0, 0, cy, sy, cp, sp, R);
      }
      /* Every parallel lies flat, so they share the polar axis and one width. */
      var pw = widthFor(0, 1, 0);
      for (var q = 0; q < PARALLELS.length; q++) {
        var lat = PARALLELS[q] * DEG, cl = Math.cos(lat), yl = -Math.sin(lat);
        drawRing(PARALLELS[q] === 0 ? ink.major : ink.parallel, pw,
          cl, 0, 0, 0, 0, cl, yl, cy, sy, cp, sp, R);
      }
    }

    for (var i = 0; i < nodes.length; i++) {
      var nd = nodes[i];
      var x1 = nd.bx * cy + nd.bz * sy;
      var z1 = -nd.bx * sy + nd.bz * cy;
      var y2 = nd.by * cp - z1 * sp;
      var z2 = nd.by * sp + z1 * cp;
      var k = PERSP / (PERSP - z2 * 0.5);
      /* Compare before writing: an inline assignment invalidates style whether
         or not the value differs, and only the transform changes every frame. */
      var t = 'translate3d(' + (x1 * R * k).toFixed(2) + 'px,' + (y2 * R * k).toFixed(2) + 'px,0) scale(' + k.toFixed(3) + ')';
      if (t !== nd.transform) { nd.transform = t; nd.el.style.transform = t; }
      /* The far hemisphere stays faintly visible — it is what tells you there
         is more globe behind the part you are looking at. */
      var o = (0.14 + 0.86 * smoothstep(-0.5, 0.45, z2)).toFixed(3);
      if (o !== nd.opacity) { nd.opacity = o; nd.el.style.opacity = o; }
      var rank = z2 > 0 ? 2 : 1;
      if (rank !== nd.z) { nd.z = rank; nd.el.style.zIndex = String(rank); }
    }
  }

  /* The loop RETIRES ITSELF. Under reduced motion an idle globe has nothing to
     animate, and a rAF that wakes 60 times a second to decide it has nothing to
     do is exactly the unrequested continuous cost that preference is asking to
     be spared — so the loop stops, and a drag (or a resize) wakes it again. */
  var raf = 0;
  var last = 0;
  function wake() {
    if (!raf) { last = 0; raf = requestAnimationFrame(step); }
  }
  function step(now) {
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    var moving = !!drag;
    if (!drag) {
      if (Math.abs(vYaw) > 1) {
        yaw += vYaw * dt;
        vYaw -= vYaw * Math.min(1, FRICTION * dt);
        moving = true;
        dirty = true;
      } else {
        vYaw = 0;
        if (!reduced) {
          yaw += IDLE_SPIN * dt;
          moving = true;
          dirty = true;
        }
      }
    }
    /* A frame where nothing moved writes nothing at all. */
    if (dirty) {
      dirty = false;
      render();
    }
    raf = moving ? requestAnimationFrame(step) : 0;
  }

  /* ── Drag ───────────────────────────────────────────────────────────────
     Yaw from horizontal travel, pitch from vertical, tilt clamped so the poles
     never come to the front. Velocity is windowed over the last move rather
     than taken from the final frame, because a finger that pauses before
     lifting has a last-frame velocity of zero. */
  var track = { t: 0, x: 0 };
  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    track.t = e.timeStamp;
    track.x = e.clientX;
    vYaw = 0;
    stage.setAttribute('data-grabbing', 'true');
    if (stage.setPointerCapture) { try { stage.setPointerCapture(e.pointerId); } catch (err) {} }
    wake();
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    yaw += (e.clientX - drag.x) * ROT_PER_PX;
    pitch = clamp(pitch - (e.clientY - drag.y) * ROT_PER_PX * 0.6, -PITCH_LIMIT, PITCH_LIMIT);
    drag.x = e.clientX;
    drag.y = e.clientY;
    var dt = (e.timeStamp - track.t) / 1000;
    if (dt > 0.008) {
      vYaw = clamp(((e.clientX - track.x) * ROT_PER_PX) / dt, -MAX_SPIN, MAX_SPIN);
      track.t = e.timeStamp;
      track.x = e.clientX;
    }
    dirty = true;
  }
  function onUp() {
    if (!drag) return;
    drag = null;
    stage.removeAttribute('data-grabbing');
    /* The release throw still has to coast, so the loop keeps running until the
       friction has eaten it — wake() is a no-op while it already is. */
    wake();
  }
  if (window.PointerEvent) {
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    /* A hold also ends when the window does: a pointer released over another
       window never sends its pointerup, and the globe would coast forever on a
       drag nobody is making. */
    window.addEventListener('blur', onUp);
  }

  window.addEventListener('resize', function () { measure(); wake(); });
  measure();
  render();
  wake();

  /* Live updates are the enhancement script's job: it swaps the page's live
     regions in place rather than reloading, so the globe never restarts and
     this loop never needs to know. It recolours the pins (they are its DOM,
     not ours) and fires a resize when the theme changes the cage ink. */
  window.__globeDragging = function () { return !!drag; };
})();
`
