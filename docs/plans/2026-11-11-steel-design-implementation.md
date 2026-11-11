# Steel: design scheme and implementation plan (2026-11-11)

Status: **approved direction, not yet implemented.** This document is the single
source for the redesign's look and layout. It is written to be executed by a
coding agent one phase at a time.

It replaces **Part N ("the new identity, Broadsheet")** and Appendices A to C of
[`2026-11-11-broadsheet-redesign-audit.md`](2026-11-11-broadsheet-redesign-audit.md).
Parts P (performance), S (structure), B (backend, deploy, CI) and Q (quality) of
that audit still stand and are not repeated here. Where the two disagree about
how something looks, this document wins.

## 0. How to read this

- Every rule has an ID (`R1`, `T3`, `G5`). Cite the ID in commits and reviews.
- "Must" is a requirement. "Default" is what to do unless a page has a stated reason.
- Values are exact. Do not round, substitute or "improve" them.
- Code blocks are reference implementations taken from the approved mockups.
  Class names in them are the mockup's; section 15 says what they become in the repo.
- Section 16 is the order of work. Each phase ends with checks that must pass.
- Section 18 lists decisions that are still open. Do not guess them; ask.

## 1. The scheme in one paragraph

Steel is a flat, neutral page set in one typeface and divided by hairline rules.
There are no cards, gradients, blurs or shadows on content. Polished chrome is
the only material, and it appears in exactly three places: the navigation globe,
the toggle thumb and the slider thumb. The two thumbs are flat grey until the
pointer comes near, then become chrome. Whenever an element is chrome, its
surface is a ray-traced reflection of the page around it, pointer included.
Content hangs on a thin vertical line
called the spine. On a phone the globe is the only navigator. The result should
read as a professional tool that happens to have one remarkable object in it.

### The five rules

| ID | Rule |
| --- | --- |
| R1 | **Flat first.** Page, surfaces and content use solid colours from the tokens in section 2. No gradient, blur, glow or translucency outside the chrome elements in R2. |
| R2 | **Chrome in three places.** The globe, the toggle thumb, the slider thumb. Nothing else is chrome: not buttons, bars, cards, avatars or icons. |
| R3 | **Rules before boxes.** Separate things with a 1px rule or with space. A bordered box is for a control (button, field) or a picture, not for a group of content. |
| R4 | **One ink primary per view.** One solid-ink button marks the main action. Everything else is a bordered or borderless button. |
| R5 | **Nothing moves at rest.** No idle animation, frame loop, canvas, worker or observer runs for decoration. Motion is a response to input and ends within 360 ms. The chrome renderer (4.3) obeys this: it draws a frame only when input changed something. |

## 2. Tokens

The repo's `--site-*` token names stay, so existing Tailwind utilities
(`bg-site-bg`, `text-site-text-muted`, `border-site-border`, `rounded-site`)
keep working. Only the values change. The two editions keep their class names:
Day is `.style-default`, Night is `.style-graphite`.

| Token | Day | Night | Use |
| --- | --- | --- | --- |
| `--site-bg` | `#fafafa` | `#0b0d10` | The page |
| `--site-surface` | `#ffffff` | `#111418` | Controls and overlays only |
| `--site-bg-subtle` | `#f0f2f4` | `#161a1f` | Hover fill, picture placeholder |
| `--site-surface-hover` | `#f0f2f4` | `#161a1f` | Same value as above; kept for existing utilities |
| `--site-border` | `#e3e6e9` | `#22272d` | Every rule and control border |
| `--site-text` | `#0b0d10` | `#eef1f4` | Ink |
| `--site-text-muted` | `#606873` | `#8b949e` | Secondary text, inactive tabs |
| `--site-accent` | `#0b0d10` | `#eef1f4` | Same as ink. There is no accent colour. |
| `--site-accent-fg` | `#fafafa` | `#0b0d10` | Text on an ink fill |
| `--site-danger` | `#c40016` | `#f2555a` | Errors, unread counts, destructive actions |
| `--site-success` | `#167d3a` | `#3fb26b` | Confirmation only |
| `--site-radius` | `8px` | `8px` | Controls, pictures |
| `--site-radius-sm` | `4px` | `4px` | Tags, small chips |
| `--chrome-flat` | `#737c87` | `#6b7480` | A chrome thumb at rest |
| `--chrome-1` … `--chrome-6` | `#fff` `#dfe5ea` `#8e99a6` `#1a2029` `#59636f` `#bcc5ce` | `#aab4bf` `#55606c` `#1c222a` `#030405` `#20262e` `#5b6672` | The six stops of the chrome gradient, top to bottom |

Notes:

- T1. `--site-text-muted` on `--site-bg` is at least 5.5:1 in both editions. Do not introduce a lighter grey for text.
- T2. Night's danger and success values and `--chrome-flat` were chosen for contrast and have not been seen in a mockup. Check them on a real screen in phase 1.
- T3. Delete every `--site-glass-*`, `--site-jelly-*`, `--site-arc-*` and `--site-shadow*` token. Nothing in Steel reads them.
- T4. There are no shadow tokens. The only shadows in the system are on the globe (section 8) and on overlays (`0 8px 24px rgba(0,0,0,.12)`, Night `.5`).

## 3. Type

One family: **Geist** (already self-hosted, `--site-font-body`). **Geist Mono**
(`--site-font-mono`) for timestamps, counts and small data. `--site-font-display`
is set to the same stack as body; there is no display face.

| Class | Size / line | Weight | Tracking | Use |
| --- | --- | --- | --- | --- |
| `t-title` | 28 / 1.1 | 600 | -0.025em | The page's name. One per page. |
| `t-heading` | 17 / 1.3 | 600 | -0.01em | A section inside a page |
| `t-body` | 14 / 1.45 | 400 | 0 | Default text and controls |
| `t-post` | 15 / 1.5 | 400 | 0 | Post text |
| `t-prose` | 16 / 1.6 | 400 | 0 | Long reading: articles, patch notes |
| `t-label` | 13 / 1.3 | 600, muted | 0 | Spine station, sidebar group heading |
| `t-meta` | 12 / 1.3, mono | 400, muted | 0 | Time, kind, handle metadata |

- Y1. Weights used: 400, 500 (controls), 600. Never 700 or above.
- Y2. No letterspaced capitals anywhere. Labels are sentence case.
- Y3. Links inside running text are underlined. Navigation words are not.

## 4. The chrome material

Chrome is a vertical six-stop gradient with a hard horizon just below the
middle: bright sky, dark ground, a light bounce at the bottom.

```css
/* C1: the chrome gradient */
background: linear-gradient(180deg,
  var(--chrome-1) 0, var(--chrome-2) 30%, var(--chrome-3) 49%,
  var(--chrome-4) 50.5%, var(--chrome-5) 76%, var(--chrome-6) 100%);
```

### 4.1 Flat until approached (toggle and slider thumbs)

- C2. At rest a thumb is a flat `--chrome-flat` pill with no shadow.
- C3. It becomes chrome when any of these is true: the pointer is within 20px of the control, the pointer is over the control's row, the control has keyboard focus, or it is being pressed.
- C4. The change takes 280 ms, ease, in both directions.
- C5. On touch devices there is no hover, so the thumb is chrome only while pressed or focused.

One registered number, `--c`, runs from 0 to 1. Every gradient stop is mixed
from the flat colour by it, so the browser animates a single value and paints
nothing as chrome until it is needed.

```css
@property --c { syntax: '<number>'; inherits: true; initial-value: 0; }

.tog, .sl { transition: --c .28s ease; }
.tog:hover, .tog:active, .tog:has(:focus-visible), .row:hover .tog,
.sl:hover, .sl:active, .sl:focus-visible, .row:hover .sl { --c: 1; }

/* each stop: color-mix(in srgb, <chrome stop> calc(var(--c) * 100%), var(--chrome-flat)) */
/* thumb outline, also driven by --c: */
box-shadow: 0 0 0 1px rgba(0,0,0,calc(.45 * var(--c))), 0 1px 2px rgba(0,0,0,calc(.3 * var(--c)));
```

- C6. The 20px proximity zone is a transparent `::before` on the control with `inset: -20px`. Do not use a pointer-move listener for this.
- C7. Browsers without `@property` get the same change as an instant switch. That is acceptable; do not add a script fallback.

### 4.2 The globe's chrome

The globe is always chrome; it never starts flat (decided, see section 18).
Its first paint is one static CSS background, shown before the renderer in 4.3
has drawn and wherever WebGL is unavailable. It adds one specular highlight on
top of C1:

```css
/* Day */
background:
  radial-gradient(ellipse 22% 14% at 33% 22%, #fff 0 40%, transparent 78%),
  linear-gradient(180deg, #fff 0, #dfe5ea 30%, #8e99a6 49%, #1a2029 50.5%, #59636f 76%, #bcc5ce 100%);
/* Night: highlight ellipse 20% 12%, #fff 0 30%; gradient uses the Night chrome stops */
box-shadow: inset 0 0 calc(var(--d) * .12) calc(var(--d) * .02) rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.4);
```

`--d` is the diameter. The inner shadow darkens the rim so the disc reads as a sphere.

### 4.3 Ray-traced reflection (required for every chrome element)

Every chrome element shows a real reflection of the page: the globes always,
the toggle and slider thumbs whenever they are chrome (`--c > 0`). This is not
an optional tier and there is no user setting for it. The CSS gradients in 4.1
and 4.2 remain underneath as the first paint and the fallback.

**Architecture**

- V1. One module, `lib/chrome/`, owns one WebGL context for the whole site tier. No chrome element creates its own context.
- V2. Each chrome element holds a small 2D `<canvas>` laid exactly over it. The renderer draws that element's reflection into the shared WebGL canvas and copies it across with `drawImage`. Backing size is the element's CSS size × `min(devicePixelRatio, 2)`; the phone globe's canvas is sized for its open state (288px) so it stays sharp when expanded.
- V3. A thumb's canvas has `opacity: var(--c)`, so the flat-to-chrome change in 4.1 is still one animated number. A thumb whose `--c` is 0 is skipped entirely by the renderer.
- V4. The module loads at idle after hydration, never in the critical path, and registers elements through a `data-chrome` attribute (`"ball"` or `"pill"`). Components do not import it.

**The picture of the page (the environment)**

- V5. The environment is a half-resolution 2D canvas painted from layout, not a screenshot: each visible element's background and borders from its rectangle and computed colours, each text node with `fillText` line by line using the line boxes from `Range.getClientRects()`, the spine line and dots, field values and placeholders. No `html2canvas`, no SVG `foreignObject`.
- V6. Chrome elements, their overlays and anything with `opacity: 0` are left out. The open globe's veil and pins are included, so the open globe reflects its own menu.
- V7. Paint the scrolling content once into a tall canvas (cap 8192 device pixels; beyond that, paint the window around the viewport and repaint when the viewport leaves it). Scrolling then only changes an offset uniform. Do **not** repaint the environment on every scroll frame; the mockups do, for brevity, and that is not acceptable in production.
- V8. Repaint when content changes: after a feed page is appended, on route change, on edition change, on resize, after fonts load. Drive this from those events. Do not use a `MutationObserver`.

**The shader**

One fragment shader handles balls and pills. For a pixel at offset `p` from the
element's centre, with half-size `hs` and corner radius `r = min(hs.x, hs.y)`:

```glsl
vec2 q = clamp(p, -(hs - r), hs - r);          // nearest point on the shape's axis (the centre, for a ball)
vec2 d = (p - q) / r;  float r2 = dot(d, d);   // r2 > 1.0 is outside the shape: discard
vec3 n = vec3(d, sqrt(1.0 - r2));              // surface normal, z toward the viewer
vec3 R = vec3(2.0*n.z*n.x, 2.0*n.z*n.y, 2.0*n.z*n.z - 1.0);   // view ray (0,0,-1) reflected about n
float dz = R.z - 0.55;                         // the element floats a little above the page
// dz >= 0: the ray misses the page and shows the room: an even ceiling, lo -> hi by smoothstep(.3, 1., R.z),
//          plus one soft window at dot(R, normalize(vec3(-.42,-.52,.74))) > .9
// dz <  0: the ray lands on the page at
float t = r * (1.4 + n.z) / (-dz);
vec2 pos = centre + p + t * R.xy;              // sample the environment at pos / pageSize
```

Then, in order: draw the pointer as a small arrow at its page position; darken
the hit by a contact shadow `mix(.55, 1., smoothstep(1., 2.2, length(pos - centre - q) / r))`;
fade distant hits into the room with `smoothstep(32.*r, 7.*r, t)`; blend page
and room across `smoothstep(0., -.25, dz)`; brighten the rim by
`pow(1. - n.z, 4.) * .4`; add one glint at `dot(n, normalize(vec3(-.5,-.6,.62))) > .975`;
multiply by `.9 + .1 * n.z`; antialias the edge with `smoothstep(1., .94, sqrt(r2))`.

Room colours: Day `lo (.83,.88,.92)` `hi (.95,.97,.99)`; Night `lo (.07,.08,.10)` `hi (.20,.23,.27)`.
Pointer arrow: dark with a light outline in Day, light with a dark outline in Night.
There is no dark horizon band and no reflection of a viewer; both were tried and rejected.

**When it draws**

- V9. One `requestAnimationFrame` is requested per change and coalesced: scroll, pointer move, a control changing, focus moving, the globe opening or closing (redraw each frame for the 360 ms of M4, then stop). With no input, no frame is scheduled.
- V10. One passive `pointermove` listener on the document feeds the pointer position. It is used for the reflected pointer only; proximity stays in CSS (C6).
- V11. On `webglcontextlost`, hide the canvases (the CSS gradient shows) and rebuild on restore. If WebGL is unavailable, do nothing; the page is complete without it.
- V12. `prefers-reduced-motion` does not disable reflections; a reflection that follows your own scrolling is not animation.
- V13. Budget, to be measured in phase 2 on a mid-range phone and recorded in the ledger: a redraw of the docked globe under 2 ms; an environment repaint under 8 ms and never during a scroll frame (V7); the module under 6 kB gzip.

## 5. Surfaces

- S1. Content sits directly on `--site-bg`. There is no card surface.
- S2. A list is rows separated by `border-bottom: 1px solid var(--site-border)`.
- S3. Columns are separated by a 1px vertical rule in the same colour.
- S4. Pictures and placeholders: `--site-bg-subtle` fill, 1px border, 8px radius.
- S5. Overlays (menus, dialogs, popovers) are the only raised surface: `--site-surface`, 1px border, 8px radius, the overlay shadow from T4. No backdrop blur. The scrim behind a dialog is `--site-bg` at 80% opacity.
- S6. The existing role classes are remapped, not kept as materials: `surface-card` and `surface-panel` become "no background, no border"; `surface-field` and `surface-press` become the flat control surface; `surface-overlay` becomes S5; `surface-chrome` (bars) becomes `--site-bg` with a 1px rule on its inner edge.

## 6. Controls

All controls are 8px radius, 1px border, 500 weight, 14px text. Heights: 36px
with a fine pointer, 44px on touch (`@media (pointer: coarse)`).

| ID | Control | Spec |
| --- | --- | --- |
| K1 | Button, default | `--site-surface` fill, `--site-border` border, ink text. Hover: `--site-bg-subtle` fill. |
| K2 | Button, primary | Ink fill, `--site-accent-fg` text. Hover: 88% opacity. One per view (R4). |
| K3 | Button, ghost | No border, no fill. Hover: `--site-bg-subtle`. |
| K4 | Field | 40px high, `--site-surface` fill, 1px border, 12px side padding, muted placeholder. A composer field inside a row has no border and no fill. |
| K5 | Tabs | Words on a rule. 22px gap, 10px vertical padding. Inactive: muted, 500. Active: ink with a 2px ink underline sitting on the rule. No pills, no segment backgrounds. |
| K6 | Toggle | Track 44 × 16px, 8px radius, `--site-border`; ink when on. Thumb 22 × 12px pill, 6px radius, 2px inset, slides 18px in 140 ms. Chrome per section 4.1. Hit area 44 × 44px. |
| K7 | Slider | Track 2px, `--site-border`. Thumb 22 × 10px pill, 5px radius. Chrome per section 4.1. Hit area 44px high. |
| K8 | Post actions | Plain muted 13px words ("Like", "Repost", "Reply"), 18px apart. On: ink, 600. No icons-only buttons in the feed, no colour change, no counter animation. |
| K9 | Tag | 11px, 500, muted, 1px border, 4px radius, `1px 6px` padding. |
| K10 | Focus | `outline: 2px solid var(--site-text); outline-offset: 2px` on every focusable element. |
| K11 | Avatar | A circle. No ring, no status glow. Online state is a text label, not a dot alone. |

Reference CSS for K6 and K7:

```css
.tog { position: relative; display: inline-block; width: 44px; height: 16px; flex: none; }
.tog::before { content: ''; position: absolute; inset: -20px; }            /* proximity zone, C6 */
.tog input { position: absolute; opacity: 0; inset: -14px 0; width: 100%; height: 44px; margin: 0; cursor: pointer; z-index: 1; }
.tog i { position: absolute; inset: 0; border-radius: 8px; background: var(--site-border); transition: background .12s; }
.tog i::after { content: ''; position: absolute; left: 2px; top: 2px; width: 22px; height: 12px; border-radius: 6px;
  background: /* C1 mixed by --c */; transition: translate .14s ease; }
.tog input:checked + i { background: var(--site-text); }
.tog input:checked + i::after { translate: 18px 0; }

.sl { appearance: none; width: 100%; height: 44px; margin: -10px 0; background: none; cursor: pointer; }
.sl::-webkit-slider-runnable-track, .sl::-moz-range-track { height: 2px; background: var(--site-border); }
.sl::-webkit-slider-thumb { appearance: none; width: 22px; height: 10px; margin-top: -4px; border-radius: 5px; border: 0;
  background: /* C1 mixed by --c */; }
/* repeat the thumb rule for ::-moz-range-thumb in a SEPARATE rule; grouped vendor selectors invalidate each other */
```

## 7. The spine

The spine is a 1px vertical line down the left of a content column. Items hang
on it with a dot; section headings ("stations") hang on it with a hollow dot.
It is the system's one structural signature and appears on every content page.

```css
.sp { position: relative; padding-left: 20px; }
.sp::before { content: ''; position: absolute; left: 4px; top: 6px; bottom: 0; width: 1px; background: var(--site-border); }

.it { position: relative; padding: 14px 0; border-bottom: 1px solid var(--site-border); }
.it::before { content: ''; position: absolute; left: -18.5px; top: 21px; width: 6px; height: 6px; border-radius: 50%;
  background: var(--site-text); box-shadow: 0 0 0 3px var(--site-bg); }      /* the dot, with a gap cut in the line */
.it.nb::before { display: none; }                                            /* an item with no dot (prose, a form) */

.st { position: relative; padding: 22px 0 8px; font-weight: 600; font-size: 13px; color: var(--site-text-muted); }
.st::before { content: ''; position: absolute; left: -20.5px; top: 25px; width: 8px; height: 8px; border-radius: 50%;
  background: var(--site-bg); border: 1px solid var(--site-text-muted); }    /* the station: a hollow dot */
```

- P1. The spine is pure CSS. It measures nothing and runs no script.
- P2. One spine per column. A nested spine is allowed only for replies to a reply, indented 8px, at most one level deep.
- P3. A dot marks a discrete item (a post, a row, a message from someone else). Running prose and forms hang without a dot (`.nb`).
- P4. What the spine means on each page is fixed by the recipes in section 10. Do not invent a new meaning per feature.
- P5. In RTL locales (`ar`, `ur`) the spine moves to the right: use logical properties (`padding-inline-start`, `inset-inline-start`).

React surface (new, `components/ui/spine.tsx`):

```tsx
export function Spine({ children, className }: { children: ReactNode; className?: string });      // <div class="spine">
export function SpineItem({ dot = true, as = 'div', ...props }: SpineItemProps);                   // <article|div class="spine-item">
export function SpineStation({ children }: { children: ReactNode });                               // <h2 class="spine-station t-label">
```

`SpineStation` renders a real heading so the page outline is correct for screen readers.

## 8. The globe

### 8.1 Phone (below 1024px): the only navigator

There is no tab bar, no hamburger and no bottom nav. Behaviour matches the
current globe, re-skinned in chrome.

| State | Spec |
| --- | --- |
| G1 Docked | 64px chrome globe, centred, 18px above the bottom edge plus `env(safe-area-inset-bottom)`, following Safari's toolbar with `var(--vv-follow, 0px)` as today. It shows a grid of small dots (13px pitch) to signal "sections". The page fades into `--site-bg` over the last 130px so content never collides with it. |
| G2 Opening | On tap the same element translates to the vertical middle and scales to 288px (4.5×) in 360 ms, `cubic-bezier(.2,0,0,1)`. The dots fade out in 200 ms. The page behind is covered by `--site-bg` at 96% opacity (a flat veil, no blur). |
| G3 Open | The five sections sit on the globe as pins: Front, Explore, Games, Inbox, You. The current section is in the centre, larger (44px high, `--site-bg` fill, ink text, 600); the other four sit around it (36px high, ink fill, `--site-accent-fg` text). "Write a post" is an underlined text link below the globe. Pins fade in 180 ms after a 160 ms delay. |
| G4 Closing | Tapping the globe, the veil, or pressing Escape reverses G2. Choosing a pin navigates immediately and the globe returns to the dock while the next page renders. |

Pin positions in a 390 × 844 viewport, as centre points (scale proportionally
from the globe's centre for other sizes): current `195,422` · upper left
`118,338` · upper right `272,338` · lower left `118,506` · lower right
`272,506` · write link `195,606`.

Reference CSS (mockup uses a hidden checkbox as the state; production uses a
button and a `data-open` attribute, see G7):

```css
.globe { position: absolute; left: 50%; bottom: 18px; z-index: 5; transform: translate(-50%, 0);
  transition: transform .36s cubic-bezier(.2,0,0,1); }
.globe .orb { --d: 64px; box-shadow: inset 0 0 8px 1px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.4), 0 14px 14px -8px rgba(0,0,0,.35); }
.globe .orb::after { content: ''; position: absolute; inset: 13px; border-radius: 50%; transition: opacity .2s;
  background: radial-gradient(circle, #fff 0 1.6px, rgba(0,0,0,.55) 2px 3px, transparent 3.5px) 0 0 / 13px 13px; }
[data-open] .globe { transform: translate(-50%, -372px) scale(4.5); }
[data-open] .globe .orb::after { opacity: 0; }
.veil { position: absolute; inset: 0; z-index: 3; background: var(--site-bg); opacity: 0; pointer-events: none; transition: opacity .2s; }
[data-open] .veil { opacity: .96; pointer-events: auto; }
```

- G5. The globe is markup and CSS at first paint and with scripting off. Its reflection comes from the shared chrome renderer (4.3); it has no context, worker, simulation or frame loop of its own. This replaces the current always-mounted `LiquidGlobe`.
- G6. Animate `transform` and `opacity` only. The globe is scaled, never resized, so nothing lays out during the move.
- G7. Accessibility: the globe is a `<button aria-expanded aria-controls>` labelled "Open navigation". The pins are a `<nav>` of real links. Open traps focus inside the nav and restores it to the button on close. With scripting off, the button is a link to a plain `/sections` page listing the same destinations.
- G8. Unread counts (Inbox) show as a small `--site-danger` number on the pin when open and a 8px danger dot at the globe's upper right when docked, with a visually hidden text equivalent.

### 8.2 Desktop (1024px and up)

- G9. Navigation is the word list in the left sidebar (section 9). The globe is not needed to navigate.
- G10. A 72px chrome globe sits at the bottom of the left sidebar, with a soft contact shadow (`0 16px 16px -9px rgba(0,0,0,.35)`). It links to the front page. It is the brand mark; no other logo graphic appears in the sidebar, only the words "RMH Studios" at the top.

### 8.3 Reflection

Both globes are ray-traced at all times, per section 4.3. The phone globe keeps
reflecting through the open animation and, once open, reflects the veil and its
own pins.

## 9. Layout

| ID | Rule |
| --- | --- |
| L1 | **Phone (< 1024px):** one column, 18px side padding, 16px top padding plus `env(safe-area-inset-top)`. No fixed header. The page title scrolls with the page. The globe is the only fixed element. |
| L2 | **Desktop (≥ 1024px):** a three-column frame capped at 1240px and centred: sidebar 220px · content `1fr` · margin 320px. Columns are divided by 1px rules that run the full height. |
| L3 | **Desktop, no margin (1024–1279px, or pages that do not need one):** sidebar 220px · content `1fr`. Catalogue and settings use this at every width. |
| L4 | **Sidebar,** top to bottom, 22px top and 24px side padding: the words "RMH Studios" (15px, 600) · the five sections as words (15px; current is ink 600, others muted; 7px vertical padding) · the primary "Write a post" button · the signed-in handle with a 28px avatar · the globe, pushed to the bottom (G10). No icons beside the words. |
| L5 | **Content column:** 40px side padding in the three-column frame, 48px in the two-column one. Reading content (feed, thread, article, settings) is capped at 640px wide. Grids may use the full column. |
| L6 | **Margin column:** 22px top and 24px side padding. A search field, then at most two short lists, each under a `t-label` heading, rows on rules. Nothing in the margin is a card or carries a picture. Its content loads after the main column. |
| L7 | Vertical rhythm: 14px inside a row, 22px above a station, 26px above a page title on desktop. |
| L8 | Full-screen games and apps are outside this shell and keep their own look, as today. |

The shell is markup and CSS grid. It must render complete with scripting off (R5).

## 10. Page recipes

Each recipe says what the spine means on that page and what the one primary is.

| Page | Spine | Primary | Structure |
| --- | --- | --- | --- |
| **Home** (the feed; this is `/`) | One dot per post, newest first | Post | Title "Today" (phone only) · tabs "For you / Following" · on desktop a one-line composer row (avatar, borderless field, Post) · the feed |
| **Post and replies** | The reply thread; replies to a reply on one nested spine | Reply | The post at 19px with its picture and time · a reply field as the first, dotless item · replies |
| **Profile** | The person's history | Follow | Avatar 64px, name as title, handle, one-line bio, Message and Follow · stations by period ("This week", "Last week") · posts and one-line activity rows mixed |
| **Games and apps** | None on desktop (a 4-column grid of picture tiles); on a phone, an index with stations per group | none | Title "Play" · search field · tabs "All / Games / Apps" · tiles: 16:10 picture, name, kind in `t-meta` |
| **Game page** | The page's outline | Play | Picture · name as title with kind beside the Play button · stations "Playing now", "Leaderboard", "What changed", "Talk" |
| **Article** | The table of contents | none | Title · byline · each section heading is a station; paragraphs are dotless items in `t-prose` |
| **Conversation** | One dot per message from the other person; days are stations | Send | Their messages hang on the spine, left aligned; yours are right aligned with an ink fill and no dot · a message field fixed above the globe (the one exception to "only the globe is fixed" on a phone) |
| **Inbox** | One dot per unread thread | none | Rows: name, last line, time. Unread rows have the dot and 600 weight; read rows have no dot. |
| **Explore** | Stations per kind | none | Search field · "Open lobbies" · "People" (rows with a Follow button) · "Talked about" (posts) · "From the studio" |
| **Settings** | Stations per group | Save (only in a group with a form) | Stations "Look", "Alerts", "Account" · each setting is a row: name, optional one-line explanation, control on the right |

- X1. The home route renders the feed directly. There is no landing page, hero, masthead or "stories" block above it for signed-in or signed-out visitors.
- X2. A page not listed here picks the closest recipe. If none fits, it is a titled page of rows on rules with no spine, and the gap is recorded in section 18.

## 11. Motion

| ID | What | Duration, curve |
| --- | --- | --- |
| M1 | Hover and press fills | 90 ms, ease |
| M2 | Tab underline, toggle slide | 140 ms, ease |
| M3 | Chrome activation (`--c`) | 280 ms, ease |
| M4 | Globe open and close | 360 ms, `cubic-bezier(.2,0,0,1)` |
| M5 | Overlay in and out | 160 ms opacity, no scale, no slide |

- M6. Nothing else animates. No page entrances, no list staggers, no hover lifts, no springs, no parallax, no skeleton shimmer (a skeleton is a still `--site-bg-subtle` block).
- M7. `prefers-reduced-motion: reduce` turns M3 and M4 into instant changes. The globe still opens.
- M8. Route changes swap content with no transition. Speed comes from preloading (audit Part P), not from animation.

## 12. Accessibility

- A1. Every text pair meets 4.5:1 and every control boundary 3:1, in both editions.
- A2. State is never colour alone: active tabs have the underline, "on" actions change weight, unread rows have the dot and the weight.
- A3. Touch targets are 44 × 44px even where the visible control is smaller (K6, K7).
- A4. The globe follows G7. Tabs, toggles and sliders use the existing Radix or native primitives; only their styles change.
- A5. A skip link to the content column remains the first focusable element.
- A6. Test Day and Night at 390px and 1280px wide, and once in `ar` for the mirrored spine.

## 13. Performance budget

- B1. The shell (sidebar, margin frame, spine, docked globe) renders complete with scripting off. The only script attached to it is the chrome renderer, loaded at idle (V4).
- B2. No `backdrop-filter`, `filter`, `mix-blend-mode` or `mask` on any site-tier element.
- B3. The site tier creates exactly one WebGL context (the chrome renderer) and no worker, `MutationObserver` or decorative `ResizeObserver`. No `requestAnimationFrame` callback is pending while the page is at rest.
- B4. Fonts: Geist and Geist Mono only, self-hosted as today. Remove any other face from the site tier.
- B5. The site-tier CSS should get smaller in every phase. Record the built `globals` stylesheet size before phase 1 and after each phase in the ledger (section 17).
- B6. Deleting the glass, jelly, arc and liquid-globe code is part of the work, not a follow-up (section 15.3).

## 14. Words

Say the specific thing in short sentences. No exclamation marks, no "seamless /
powerful / unleash", no emoji in site chrome, no invented numbers. Buttons are a
verb or a verb and a noun ("Post", "Write a post", "Join"). An error says what
happened and what to do next. Every string goes through `t()` with a new key
when the wording changes.

## 15. Implementation map

Base branch is `main`. An uncommitted "Broadsheet" working tree may exist in
some sessions; it is superseded. Take nothing from it without checking it
against this document.

### 15.1 Add

| File | Contents |
| --- | --- |
| `app/styles/steel-chrome.css` | `@property --c`, the chrome stop tokens, the mixed gradient as a utility (`chrome-thumb`), the globe background (`chrome-globe`) |
| `lib/chrome/renderer.ts`, `environment.ts`, `shader.ts`, `index.ts` | Section 4.3: the one WebGL context, the page painter, the shader, and registration by `data-chrome` |
| `lib/chrome/__tests__/` | The painter skips chrome elements and `opacity: 0` subtrees; a thumb with `--c: 0` is not drawn; no frame is pending after input stops |
| `components/ui/spine.tsx` + styles | Section 7 |
| `components/shell/SiteShell.tsx` | The frame from section 9: sidebar, content slot, optional margin slot |
| `components/shell/Sidebar.tsx` | L4, with the desktop globe (G10) |
| `components/shell/GlobeNav.tsx` + `globe-nav.css` | Section 8.1. A button, a nav, CSS state. No canvas. |
| `components/shell/__tests__/` | The shell renders with no client hooks; the globe exposes `aria-expanded`; the sidebar lists exactly the five sections |
| `app/routes/_site/sections.tsx` | The no-script destination list (G7) |

### 15.2 Change

| File | Change |
| --- | --- |
| `app/globals/tokens-themes.css` | Replace token values per section 2 in `:root`, `.style-default`, `.style-graphite`. Remove the tokens listed in T3. Set `--site-font-display` to the body stack. |
| `app/globals.css` | Drop the imports of `glass-roles.css`, `jelly-material.css`, `jelly-arcs.css`, `jelly-coverage.css`, `jelly-group.css`. Import the new styles. |
| `components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `search-field.tsx` | K1 to K4. Variants reduce to `default`, `primary`, `ghost`, `danger`. |
| `components/ui/tabs.tsx` | K5. One appearance only. |
| `components/ui/switch.tsx`, `slider.tsx` | K6, K7 with `chrome-thumb`. |
| `components/ui/card.tsx`, `widget-frame.tsx` | Render no background and no border (S1); keep the component API so call sites compile, then remove call sites page by page. |
| `components/ui/dialog.tsx`, `sheet.tsx`, `menu.tsx`, `overlay-panel.tsx`, `anchored-menu.tsx` | S5. |
| `components/ui/skeleton.tsx`, `spinner.tsx`, `radial-loader.tsx` | Still blocks (M6); one plain spinner. |
| `components/feed/*` | Posts become `SpineItem`s per section 10. Actions per K8. |
| `app/routes/_site.tsx` (or the current layout route) | Mount `SiteShell` in place of `RadialShell`. |
| `app/routes/_site/index.tsx` | Render the feed directly (X1). |
| `lib/motion.ts` | Reduce to the durations in section 11. |
| `design.md`, `docs/design-language.md`, root `CLAUDE.md` design sections | Rewrite to describe Steel. Same commit as phase 1. |

### 15.3 Delete (after the phase that removes the last use; confirm with a search first)

- `components/radial/` in full, including `LiquidGlobe`, the eversion code, the globe worker and its protocol, `jelly-glass.ts`.
- `lib/liquid/`, `lib/jelly/`, `lib/dough*` and the WebAssembly kernels they load, with their build steps and tests.
- `app/glass-roles.css`, `app/jelly-material.css`, `app/jelly-material/`, `app/jelly-arcs.css`, `app/jelly-coverage.css`, `components/ui/jelly-group.*`, `components/ui/glass-filter.tsx`.
- `app/globals/page-motion.css`, `components-reveal.css` and `lib/page-transition*` where they only serve entrances and reveals.
- `app/routes/jelly.tsx` and any other material demo routes.
- Docs that describe the deleted systems move under a "historical" note in `docs/README.md`; do not leave them reading as current.

## 16. Order of work

Each phase is one pull request. Run `pnpm check:consistency --base main`,
`pnpm exec tsc --noEmit`, `pnpm test` and `pnpm build` before opening it.

| Phase | Work | Done when |
| --- | --- | --- |
| 1. Tokens and type | Section 2 and 3 values; remove dead tokens; rewrite `design.md` and the design sections of `CLAUDE.md`; update the lint rules and gates in section 17 | Both editions render every existing page legibly (it will look unfinished); no reference to a removed token remains; gates pass |
| 2. Controls and chrome | Section 6 on `components/ui/`; `steel-chrome.css`; overlays (S5); the chrome renderer (4.3) | Settings page shows flat thumbs that turn into ray-traced chrome on approach and reflect the row and the pointer; the V13 budgets are measured and recorded; one primary per view on the ten recipe pages; keyboard focus visible everywhere |
| 3. Shell | `SiteShell`, `Sidebar`, `GlobeNav`, `/sections`; swap out `RadialShell` | Shell renders with scripting off; phone has only the globe fixed; globe opens, traps focus, closes on Escape, and reflects the page in every state; exactly one WebGL context and no worker exist on any `_site` page, and no frame is pending at rest (assert in a test) |
| 4. Spine and home | `Spine` primitives; home becomes the feed (X1); post, thread | Home, thread match section 10 at 390px and 1280px in both editions |
| 5. Remaining recipes | Profile, catalogue, game, article, conversation, inbox, explore, settings | Each matches its row in section 10; `card` call sites on these pages are gone |
| 6. Deletion | Section 15.3 | Build output no longer contains the deleted modules; site-tier CSS and JS sizes recorded in the ledger are lower than before phase 1 |
| 7. Long tail | Every other `_site` route against X2; i18n extract; docs | `pnpm audit:pages` reports no drift; all 16 locales build |

Phases 2 and 3 can run in parallel. Phase 6 must not start before 5 is merged.

## 17. Gates and ledger

Update these in phase 1 so the rules above are enforced rather than remembered:

- `eslint-local-rules/no-raw-palette-color.js`, `no-hardcoded-radius.js`: allow only the tokens in section 2.
- Add a rule or a test in `lib/__tests__/design-consistency.test.ts` that fails on `backdrop-filter`, `filter:` and gradient backgrounds in site-tier CSS, with `steel-chrome.css` and `globe-nav.css` as the only allowed files (R1, R2, B2).
- Add a test that the site tier creates at most one WebGL context and no worker, and that no animation frame is pending once input stops (B3, V9).
- Keep the existing tab-strip, `transition-all` and dead-animate rules.

Ledger (fill in as phases merge):

| Phase | PR | Site CSS (gzip) | Site JS on `/` (gzip) | Notes |
| --- | --- | --- | --- | --- |
| before | — | | | measure on `main` before phase 1 |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |
| 7 | | | | |

## 18. Open decisions

Do not resolve these by assumption.

| ID | Question | Default until answered |
| --- | --- | --- |
| D1 | Should the open phone globe be the CSS globe in this document, or the existing WebGL globe re-skinned in chrome and loaded only on open? | CSS globe (G5). The WebGL one is deleted in phase 6. |
| D3 | Should the desktop sidebar globe open a menu or a command palette? | No. It links to the front page (G10). |
| D5 | Does any state need a colour beyond danger and success (for example a "live" marker)? | No. "Live" is a text label. |
| D6 | Signed-out home: the public feed, or a sign-in prompt above it? | The public feed with a one-line sign-in row where the composer would be. |

Decided (2026-11-11), recorded so they are not reopened:

- The globe is always chrome. Only the toggle and slider thumbs start flat (4.1, 4.2).
- Every chrome element is ray-traced whenever it is chrome. It is required, not a later tier, and has no setting (4.3).

## Appendix A. Token map, current to Steel

| Current on `main` | Steel |
| --- | --- |
| `--site-surface` (translucent white) | Opaque `--site-surface`; used for controls and overlays only |
| `--site-surface-opaque` | Removed; use `--site-surface` |
| `--site-border-bright` | Removed; use `--site-text` for an ink rule |
| `--site-text-dim` | Removed; use `--site-text-muted` |
| `--site-accent-dim` | Removed; use `--site-bg-subtle` |
| `--site-glass-*`, `--site-jelly-*`, `--site-arc-*` | Removed |
| `--site-shadow`, `--site-shadow-sm` | Removed |
| `--site-radius: 32px`, `--site-radius-sm: 24px` | `8px`, `4px` |
| `--site-control-radius` | `8px` |
| `--site-font-display` | Same stack as `--site-font-body` |

## Appendix B. Do and do not

| Do | Do not |
| --- | --- |
| Separate rows with a 1px rule | Wrap a group of content in a bordered or filled box |
| Use ink for the one primary button | Make a button, bar or badge chrome |
| Mark "on" with weight and an underline | Mark "on" with colour alone |
| Hang content on the spine per section 10 | Add a second decorative line, timeline or connector |
| Let the globe be the only fixed thing on a phone | Add a top bar, tab bar or floating action button |
| Keep the thumb flat until approached | Run a pointer-move listener to detect proximity |
| Reflect the page with the one shared renderer | Give a chrome element its own WebGL context, or fake the reflection with a moving gradient |
| Delete the old material code in phase 6 | Leave it behind a flag |
