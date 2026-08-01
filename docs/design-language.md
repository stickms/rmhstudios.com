# Design Language — Radial Avant-Garde Glass

> Audience: humans **and** coding agents. This is the reference for how the site
> looks and feels, and how to build UI that is visually native to it. For the
> step-by-step "build a page that fits" checklist, see
> [`docs/page-consistency.md`](./page-consistency.md).
>
> For the *statement* of the language — what the design is, why it is that way,
> and the laws behind these rules, without the values that move — see
> [`design.md`](../design.md) at the repo root. **This file is the authority**
> whenever the two disagree.

The design language is **Radial Avant-Garde Glass** — a bold, experimental take
on **Apple's Liquid Glass** material, draped over a **radial** information
architecture. Two ideas, one language:

- **Radial.** The site orbits a central **RMH** mark; content radiates from the
  centre. The home feed is a vertically-scrolling **wheel** of cards (on the
  document's own scroll) that rake onto a shallow cylinder as they cross the
  focus line, led by an inline compose box; navigation lives in a fixed **RMH
  hub** that, when tapped, sends the orb to the middle of the screen and swells
  it into a **liquid globe** — the destinations pinned to a glass sphere you
  turn, hold and let go of to travel — and that **ripples when you poke it**. A
  fixed **ring backdrop**, a drifting blob field and a slowly breathing aurora
  keep the whole surface feeling liquid and continuous. Mobile-first, with a
  strict **high-contrast monochrome** palette.
- **Avant-garde glass.** The material is Apple's Liquid Glass used
  _theatrically_, not literally: physically-plausible layered translucent glass
  with **live optics** — an always-on specular rim glint lit by a static scene
  sun, lens-model edge refraction (with an optional chromatic **prism** on one
  flagship surface), a two-layer drifting aurora canvas, micro-noise, and
  travelling liquid sheens that ride the compositor — deployed for signature
  radial moments (the menu is an **expanding circular veil** growing from the
  centre, not a drawn disc, with a glass sphere suspended in it). It is
  expressed as an **elevation system of explicit CSS classes** (`.glass-fill` /
  `.glass-pane` / `.glass-chrome` / `.glass-overlay` / `.glass-inset`, plus the
  modifiers in §5.1) placed _on_ components.

**Everything rests on one contract:** a single set of CSS custom properties
(`--site-*`) that every theme re-defines. Components never hardcode colors,
radii, fonts, or shadows — they consume the contract through Tailwind utilities,
so any theme (and any accent preset layered on top) restyles the entire site
without a single component change.

> **What ships today — read this first.** Both layers are live. The **radial**
> layer (shell, hub, liquid globe, wheel feed) ships in
> [`components/radial/`](../components/radial/README.md), and the **Liquid Glass
> material is rendered on top of it**: the radial shell no longer demotes the
> glass classes to flat cards, the aurora canvas paints and drifts behind
> everything, and surfaces are translucent by token (`--site-surface` is a tint,
> not paper) so both the `.glass-*` tiers and the many pages that simply paint
> `bg-site-surface` sample the same scene. The elevation tiers, rim glint (on L1
> as well as L2+), frosted edge bevel and travelling sheen are all on. The
> navigation globe **ripples when you poke it**.
>
> Two things are **not** live, and both are deliberate:
>
> - **Nothing tracks the cursor** (§5.1.1, 2026-08-01). The hovered-glass
>   hotspot, the aurora's pointer parallax, the ring backdrop's, the per-card
>   sheens and pointer tilts, and the scene-light hook that fed them are all
>   deleted. The glass answers a **static sun**; hover is a state change, not a
>   coordinate. If a doc, a comment or a code path still implies otherwise, it
>   is stale.
> - **The SVG displacement lens is parked** (`url(#glass-lens)`, §5.1
>   `.glass-refract`) — current Chromium composites the displacement map into
>   the bevel instead of bending the backdrop through it, so refract surfaces
>   keep the frosted edge band (and the prism keeps its static chromatic rim)
>   without the bend. The filters and `lib/glass-lens.ts` still ship; re-enabling
>   means restoring the `@supports` upgrades in `app/globals.css` and giving
>   `initGlassLens()` a caller (its old one, `useGlassLight`, is gone).
>
> Also deleted, and worth knowing so you don't go looking for it: the **GL/WebGPU
> shader tier** (`lib/liquid-gl/`, ~2,240 lines) whose `initLiquidGL()` never had
> a caller. `liquid-morph` and `liquid-pop` are the SVG-metaball path they always
> actually ran; comments there that mention a "shader body" are historical.

**Current companions:** [radial UI + the globe](../components/radial/README.md) ·
[the per-page checklist](./page-consistency.md) ·
[UI audit 2026-08-01](./ui-audit-2026-08-01.md) (the most recent site-tier pass) ·
[performance audit 2026-08-01](./performance-audit-2026-08-01.md) (why the
cursor effects went).

**Historical specs** — intent at the time of writing, superseded where this file
disagrees: [v1 glass material](./plans/2026-07-14-liquid-glass-ui-redesign.md)
(2026-07-14) · [v2 optics & floating shell](./plans/2026-07-21-liquid-glass-v2-optics.md)
(2026-07-21; its `useGlassLight` v2 and shader-tier sections describe code that
has since been deleted).

---

## 0. Definition of done for a UI commit

Read this before touching pixels; it is the short version of everything below,
and the thing to re-read at the end of the change. A UI commit is done when all
nine hold. (`docs/page-consistency.md` §3 is the same contract expanded into a
per-page checklist with code.)

1. **Nothing is hardcoded.** Every color, radius, shadow, font and duration
   comes from a token utility (`--site-*` on the site; `--app-*` inside a
   full-screen app, §12) — no hex, no `rounded-lg`, no bespoke
   `transition: 200ms ease`. A theme the author never opened must still look
   deliberate. (§1, §12)
2. **Ink tracks its surface.** Filled surfaces take their paired foreground
   (`bg-site-accent` → `text-site-accent-fg`). Never `text-white`/`text-black`
   on a themed surface. (§1)
3. **It reuses a primitive.** If `components/ui/` has it — button, badge,
   dialog, tabs, empty state, skeleton, spinner, tooltip, copy button, confirm
   — the commit uses it rather than a local copy. A second copy of something
   shared is the single most common defect in this repo's UI history, and the
   reason §5.2 and §12 exist at all. (§5)
4. **One tab-strip grammar.** Tab strips are `<LiquidTabs>`. No hand-rolled
   `role="tablist"`, no `layoutId` capsule of your own, no active-state
   underline. This one is **CI-enforced** — see §13. (§7)
5. **Motion comes from the token set.** `lib/motion.ts` (`DURATION`, `EASE`,
   `SPRING`, `APPLE_SPRING`, `transition`, and the named variants) rather than
   ad-hoc numbers, so a global re-tune stays a one-line change. (§7)
6. **It degrades centrally, not per component.** High-contrast, reduced
   transparency, reduced motion, `perf-lite` and `forced-colors` are handled by
   the token layer and the glass classes. A component that branches on them by
   hand is a bug. Legibility must never depend on an optic: text has to hold on
   `--site-surface-opaque`. (§5.1, §7, §9)
7. **Every string is translated** through `t("key", { defaultValue })`, with
   `pnpm i18n:extract` run and the namespace registered in
   `lib/i18n/config.ts`. (§10)
8. **The keyboard and screen-reader path works.** Icon-only controls are named,
   decorative icons are `aria-hidden`, focus stays visible and undoubled. (§8,
   §9)
9. **It was actually looked at** in the three shipped themes — `default`
   (Daylight), `.style-graphite` (Midnight) and `.style-high-contrast` — at a
   phone width and a desktop width, and once with reduced motion on. Three
   themes × two widths is the floor; the audit matrix in
   `docs/ui-audit-2026-07-28.md` §1 is the extended version, and
   `docs/ui-audit-2026-08-01.md` is the most recent pass over the site tier.

**When the system does not have what you need**, extend the system — add the
token, add the variant, add the primitive — and say so in the commit message.
Do not solve it locally with a magic number; that is how five apps ended up
with five focus rings.

---

## 0.5 Fluid interfaces (the gesture layer)

The site's motion answers to Apple's _Designing Fluid Interfaces_ (WWDC 2018
§803). That talk's claim is that the "magical" feel of native gestures is not
decoration but a handful of mechanics, each with a formula — and those formulas
live in **[`lib/fluid.ts`](../lib/fluid.ts)**, unit-tested in
`lib/__tests__/fluid.test.ts`, shared by every gesture surface. Do not re-derive
them locally.

| Principle                              | What it means here                                                                                                                                                                          | API                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Instantaneous response**             | A surface reacts on `pointerdown`, never on `click` and never after a recognition delay. Site-wide via one delegated listener: add `data-fluid-press` to any element.                       | `hooks/useFluidPress`                               |
| **Interruptible & redirectable**       | Motion is a spring carrying position _and velocity_, so grabbing something mid-flight retargets it from where it is and how fast it is going. A duration tween structurally cannot do this. | `springStep`                                        |
| **Momentum crosses the lift**          | The velocity the finger left with is handed to the animation, not discarded.                                                                                                                | `VelocityTracker` → `springStep`                    |
| **Intent is read from the projection** | "Where would this throw come to rest?", not "is it past the line right now?" — which is why a fast flick dismisses a sheet that has barely moved.                                           | `projectDistance`, `resolveDetent`, `shouldDismiss` |
| **Limits push back**                   | Past an edge, travel is damped asymptotically instead of stopping dead.                                                                                                                     | `rubberBand`, `rubberBandClamp`                     |

**Springs are described by perceptual duration + bounce**, never by hand-tuned
stiffness, so the same spring settles in the same _perceived_ time whether it
moves 4px or 400px. The two animation tiers share one vocabulary — `SPRINGS` in
`lib/fluid.ts` (imperative/rAF) and `APPLE_SPRING` in `lib/motion.ts`
(framer-motion) — and a test asserts they cannot drift apart.

Where it ships today: every `Button` and interactive `Card`, the radial chrome
and the globe's pins (press layer); phone-width sheet dialogs (drag-to-dismiss
with rubber-banding and flick projection); and the navigation globe (throw,
magnetism and keyboard glide all on one interruptible spring). Touch-friendly by
construction: `touch-action: manipulation` removes the ~300ms tap delay on
everything pressable, and hit targets are grown to 44px with insets rather than
by inflating the drawn control.

**A gesture is not a text selection.** The two gestures a tap is not — a press
that lingers and a press that moves — both collide with what the platform
assumes a pointer is for, at opposite ends of the same gesture.

_Holding._ On touch there is exactly one way to begin a selection: hold still
for about half a second. That is also the length of a gesture here — the globe's
dwell is 260–620ms, the reaction menu's long-press is 500ms, a hold-to-repeat
control starts repeating inside the same window — so the platform's timer and
the site's fire on the same finger at the same instant, and the visitor gets the
thing they meant wearing a highlight and a callout bubble.

_Dragging._ A mouse needs no timer: press-and-move **is** "select", from the
first pixel. Every drag the site owns (a sheet thrown down, the globe spun, a
fader pushed, a panel resized, a card carried across a track, a world panned)
otherwise sweeps a highlight across whatever it passes over and leaves it there
for the rest of the gesture — and on touch the same is true of any drag that
starts gently, because a slow start has already spent its first moments looking
exactly like a hold. An element marked `draggable` fails a third way: if its own
label is selectable the browser drags the _text_ instead of the object, so the
reorder never begins.

The `§Selection` block in `globals.css` is the central answer, and it turns on a
distinction worth knowing: **`user-select: none` and `-webkit-touch-callout:
none` are not the same property.** The first stops the highlight; the second
stops iOS's long-press menu, which is a separate mechanism that fires over links
and images whether or not the text under them can be selected. A link with
`user-select: none` still offers "Open in New Tab" after ~500ms — which is why
the globe, whose pins are real anchors, needs both.

Covered site-wide already: controls (including `[role=slider]`, the pure drag
case), chrome links, icons and avatars, every `<canvas>` (a press that lands on
one still anchors a selection that the next few pixels sweep across the HUD),
and every `[draggable="true"]`. Content is deliberately untouched, because
copying a post, a code block or an article link is the point.

A surface that owns the pointer outright — a drag handle, a thumbstick, a
resize separator, a hold-to-confirm control, a card you throw, a board you drag
pieces around — opts in with **`data-gesture`**: nothing inside it selects, pops
a callout, flashes a tap highlight or peels off as a drag ghost. Its one
variant, `data-gesture="hold"`, is for an element that is both at once (a post
card, a chat bubble: holding it opens the reaction menu, but its words are still
worth copying) — that takes the noise and leaves the selection. `useFluidDrag`'s
`handleProps` carries the same guarantees inline, so every sheet and drawer gets
them without asking.

**In the full-screen tier**, where controls do not come from `ui/button.tsx`, a
container claims its subtree instead: `data-fluid-press-scope` makes every
`button` / `[role=button]` / `summary` inside press, so an app opts in once
rather than tagging thirty bespoke buttons and forgetting the thirty-first.
`AppShell` carries it, which reaches RMHbox, RMHType, RMHStudy and RMHTube in
one line; game shells add it themselves. Opt individual elements back out with
`data-fluid-press="none"` — and **do** opt out gestures: a joystick, a drag
handle or a fire button held for thirty seconds is not a tap, and springing it
reads as lag while promoting a compositor layer during exactly the frames a game
can least afford one.

Reduced motion stands the whole layer down — the press spring does not run, the
sheet gesture is not offered, and settles snap. Direct manipulation that remains
useful (turning the globe) keeps working.

---

## 1. The token contract (`app/globals.css`)

Tailwind v4 is imported at the top of `app/globals.css`; an `@theme inline`
block binds the `--site-*` variables to utility classes. The `:root` block is
the **default theme** — the strict-monochrome Radial Avant-Garde Glass baseline (a
light palette: white canvas, ink text and accent). At runtime the default is the
**absence** of any `.style-*` class on `<html>`; a `.style-default` block also
exists in `globals.css`, restating the same tokens purely so the settings theme
gallery can preview the default palette inside a card while another theme is
active. Keep the two in sync.

Tokens every theme defines (set in `:root`, overridden by each `.style-*`
class):

| Group             | Tokens                                                                                                                                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backgrounds       | `--site-bg`, `--site-bg-subtle`, `--site-canvas` (the aurora painted on `<body>`)                                                                                                                                                                           |
| Surfaces          | `--site-surface`, `--site-surface-hover`, `--site-surface-active`, `--site-surface-opaque` (autofill / reduced-transparency fallback)                                                                                                                       |
| Glass material    | `--site-glass-tint`, `--site-glass-tint-strong`, `--site-glass-ink`, `--site-glass-rim`, `--site-glass-rim-soft`, `--site-glass-light`, `--site-glass-blur-{pane,chrome,overlay}`, `--site-glass-saturate`, `--site-glass-depth(-sm)`, `--site-glass-noise` |
| Borders           | `--site-border`, `--site-border-bright`, `--site-border-width` (1px default; 2px in high-contrast)                                                                                                                                                          |
| Text              | `--site-text`, `--site-text-muted`, `--site-text-dim`                                                                                                                                                                                                       |
| Accent            | `--site-accent`, `--site-accent-fg`, `--site-accent-hover`, `--site-accent-dim`                                                                                                                                                                             |
| Status            | `--site-success`, `--site-danger`, `--site-warning`                                                                                                                                                                                                         |
| Elevation / shape | `--site-shadow` (prominent: modals/popovers/floating chrome), `--site-shadow-sm` (resting: cards/surfaces), `--site-radius`, `--site-radius-sm`, `--site-control-radius` (shared button geometry)                                                           |
| Layout rhythm     | `--site-page-gutter`, `--site-section-gap`, `--site-panel-padding`, `--site-shell-gap`, `--site-sticky-edge`, `--site-sticky-primary-height`, `--site-sticky-secondary-top`, `--site-touch-target`, `--site-page-bottom-space`                              |
| Typography        | `--site-font-display`, `--site-font-body`, `--site-font-mono`                                                                                                                                                                                               |
| Motion / flourish | `--site-transition-speed` (200ms default), `--site-press-duration`, `--site-card-transform`, `--site-glow`, `--site-text-shadow`, `--site-letter-spacing`, `--site-heading-transform`                                                                       |
| Media overlays    | `--site-media-scrim`, `--site-media-scrim-strong`, `--site-media-scrim-hover`, `--site-media-veil`, `--site-media-ink` — for anything that sits **on a photograph**, where theme-tracking ink would be wrong. Two shapes read them: the chip/control backings (`bg-site-media-*`), and the layer utilities `.media-scrim` / `.media-scrim-full` / `.text-on-media` |
| Podium            | `--site-podium-gold`, `--site-podium-silver`, `--site-podium-bronze`                                                                                                                                                                                        |

### Tailwind utilities — use these, never raw hex/oklch

| Purpose            | Utilities                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backgrounds        | `bg-site-bg`, `bg-site-bg-subtle`, `bg-site-surface`, `bg-site-surface-hover`, `bg-site-surface-active`                                                   |
| Borders            | `border-site-border`, `border-site-border-bright`                                                                                                         |
| Text               | `text-site-text`, `text-site-text-muted`, `text-site-text-dim`                                                                                            |
| Accent             | `bg-site-accent`, `text-site-accent`, `text-site-accent-fg`, `bg-site-accent-hover`, `bg-site-accent-dim`                                                 |
| Status             | `text-site-success`, `text-site-danger`, `text-site-warning` (and `bg-` and `-fg` variants)                                                               |
| Media overlays     | `bg-site-media-scrim`, `bg-site-media-scrim-strong`, `bg-site-media-scrim-hover`, `bg-site-media-veil`, `text-site-media-ink`                            |
| Podium             | `text-site-podium-gold`, `-silver`, `-bronze`                                                                                                             |
| Duration           | `duration-site` (the theme's `--site-transition-speed`), `duration-site-fast` (0.75×), `duration-site-slow` (1.5×) — Tailwind has no duration theme namespace, so these are `@utility` classes |
| Radius             | `rounded-site`, `rounded-site-sm` (theme-aware — do not use `rounded-lg`/`rounded-xl` for site chrome)                                                    |
| Shadow             | `shadow-site` (prominent), `shadow-site-sm` (resting)                                                                                                     |
| Fonts              | `font-body` / `font-sans` (`--site-font-body`), `font-mono` (`--site-font-mono`), `font-display` (`--site-font-display`), `font-serif` (Playfair), `font-comic` (Bangers) — the first three resolve through the theme contract, so a theme that sets its own faces is obeyed everywhere |

Extra breakpoint: `xs` = 480px (defined in the `@theme inline` block).

### Foreground pairing — ink must track its surface

A filled surface is only readable if the ink on it comes from **that surface's
paired foreground token**, not from the page's ambient `--site-text`:

| Surface                                     | Ink                    |
| ------------------------------------------- | ---------------------- |
| `bg-site-accent` (and `-hover`)             | `text-site-accent-fg`  |
| `bg-site-danger`                            | `text-site-danger-fg`  |
| `bg-site-success`                           | `text-site-success-fg` |
| `bg-site-warning`                           | `text-site-warning-fg` |
| `[data-contrast='inverse']`/`.site-inverse` | `--site-inverse-text`  |
| a chip/control **on media**                 | `text-site-media-ink`  |

Forgetting the pair is the classic way to ship invisible UI: inheriting
`--site-text` onto a dark accent gives near-black on near-black, and onto a light
accent (bright yellow) gives white on white. `globals.css` now supplies each
pairing **by default** through zero-specificity `:where()` rules, so an element
that only sets a background still gets correct ink — and anything that states its
own colour still wins. Since lucide icons paint with `currentColor`, this covers
icons and text together.

Two things the safety net can't do for you:

- **Don't hardcode `text-white`/`text-black` on a themed surface.** It looks fine
  against today's accent and breaks against a user's. Name the paired token
  instead — that's what makes it track every theme and accent preset.
- **Translucent tints are a different case.** `bg-site-accent/15` with
  `text-site-accent` is correct and deliberate; the safety net only targets the
  solid fills, so tinted chips are untouched.

`--site-accent-fg` is contrast-checked at runtime by `ensureReadableAccent()`
(`lib/appearance/contrast.ts`), so a custom accent can't ship an unreadable pair.

A legacy shadcn token set (`--card`, `--primary`, `--muted`, `--border`,
`--ring`, `--radius`, `--chart-*`, `--sidebar*`) also exists for a few
shadcn-derived pieces. **Prefer `--site-*` for all new site UI.** A separate
`.dark` class exists only for Slice It game variables — it is _not_ the site
theme mechanism.

---

## 2. Themes + accent presets

Theme = a `.style-<id>` class on `<html>`; the catalog lives in
`stores/themeStore.ts` (`SITE_STYLES`, with id/label/icon/group) and the CSS for
each in `app/globals.css`. Visitors with no saved preference get `DEFAULT_STYLE`
(`default`), and persisted-but-unknown prefs self-heal in `Providers.tsx`.

The **default** (`default` = the bare `:root`, no class) is the **Radial Liquid
Glass baseline**: strict **monochrome** — a white aurora canvas, ink text, an ink
accent, hairline black borders — rendered as glass, not paper: its surfaces are
translucent white tints over the drifting canvas. Every other theme is the same
material in its own palette over its own `--site-canvas` aurora. (The old
`liquid-glass` theme id is retired — it _became_ the shell.)

**The picker ships three**, and they are one system in three accessibility
modes rather than a gallery of moods — light, dark, and the no-glass fallback:

| Shipped in `SITE_STYLES` | Label             | What it is                                                                                                                                                        |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `default` (no class)     | **Daylight** ☀    | The site default. Strict black-&-white, ink accent, translucent white frost over a white aurora. `color-scheme: light`, document bg `#ffffff`.                    |
| `graphite`               | **Midnight** ◐    | The dark twin: OLED-black ground, near-white ink, graphite elevated surfaces, hairline light borders, one calm blue signal. `color-scheme: dark`, bg `#000000`.  |
| `high-contrast`          | **High contrast** ◑ | WCAG AAA, and **the absence of the material**: opaque surfaces, no blur, no glint, no aurora, 2px borders, yellow accent. Everything must survive it.           |

Four more palettes stay in `globals.css` as complete, ready token sets — they
are not in the picker, and they exist as the reference every **user theme**
derives from and as a proof that the contract holds outside monochrome:
`light` (Glass Light — daylight canvas, brighter white frost), `sepia` (warm
parchment, amber accent), `nocturne` (deep-navy nightscape, sky-blue aurora),
`ultra` (near-black spectral canvas, ice-cyan signal, restrained violet energy).
Persisted-but-unknown ids (a retired decorative theme, or the old `liquid-glass`
id) self-heal to `default` during hydration.

The glass primitives live in `components/ui/liquid-glass.tsx` (`GlassPane` and
`GlassFilter` — the v2 lens-filter host mounted globally in `__root.tsx`) with a
design-lab reference at `/liquid-glass`. A **Glass clarity** slider (Settings →
Appearance, §5.46) tunes how much scene shows through in five stops
(`0 Opaque · 1 Calm · 2 Default · 3 Airy · 4 Clear`): stop 0 is the opaque
`html.reduce-transparency` mechanism (the manual equivalent of the OS
`prefers-reduced-transparency`), and stops 1/3/4 scale the `--glass-user-blur` /
`--glass-user-tint` factors the glass classes consume (stop 2 = the shipped
default). Persisted as `rmh-glass-level`, applied pre-paint by the no-flash
script; the OS override and high-contrast still win.

On top of any theme a user can pick an **accent preset** — a curated color
(`lib/appearance.ts`, `ACCENT_PRESETS`, 14 options) that overrides just the
`--site-accent*` tokens as inline styles on `<html>`, keeping everything else
from the theme. `null` = the theme's own accent.

**User themes (v2, §14)** extend the same principle to the marketplace: a
`UserTheme`'s tokens are colors + a few scalar knobs (`lib/themes/tokens.ts`,
`THEME_TOKENS_VERSION = 2`), and `themeCssVars()` derives the full `--site-*` /
`--site-glass-*` contract from them — so every purchased theme is a correct
glass tint and inherits future optics upgrades. Members create/publish (Theme
Studio, `components/themes/`); anyone buys with RMH coins. v1 token maps upcast
on read (`upcastTokens`), never rejected.

Themes differ **only through the `--site-*` token contract** — there are no
per-theme `[data-slot]` component overrides or full-page background effects on
site chrome anymore (those belonged to the retired themes). Full-page effects
(scanlines, grain, particle fields) still exist, but only inside individual
games/apps, scoped to their own variable groups. **Shared primitives still set
`data-slot` attributes** so future themes (or games) can hook them.

### Theme runtime (how switching works)

Everything is data-driven from `SITE_STYLES`: the settings gallery, the runtime
class-swap, the anti-FOUC inline script, and the account-sync API validation
all derive from it — so **adding a theme is just a `.style-<id>` CSS block plus
a `SITE_STYLES` entry** (with its `bg`); nothing else needs editing.

- `stores/themeStore.ts` — Zustand `useThemeStore { style, setStyle, preview,
setPreview, accent, setAccent }`. `THEME_BG` is derived from `SITE_STYLES`.
- `components/Providers.tsx` — an effect swaps the `style-*` class on `<html>`
  (Dark/`default` needs none — it uses `:root`), applies the accent override,
  persists to `localStorage`, and updates `<meta name="theme-color">` + body
  background. It also **self-heals** any persisted-but-unknown style back to
  `DEFAULT_STYLE`. Games/app routes are excluded (`THEME_EXCLUDED_ROUTES`) —
  they own their styling; an `app-route` class is toggled on `<html>` for them.
- **No-flash SSR:** an inline `themeScript` in `app/routes/__root.tsx` applies
  the persisted class + accent _before hydration_, deriving the background from
  the `THEME_BG` map (also from `SITE_STYLES`), so there is no hand-copied
  theme→background map to keep in sync.

### 2.1 The appearance & accessibility suite

A theme is what the site is made of; the suite is how a visitor tunes it. All of
it composes on top of whichever theme is active, all of it goes through the same
token contract (so no component knows it happened), and all of it is applied
**pre-paint** by the no-flash script and persisted to `localStorage` +
account-synced. The shared constants, zod schema and storage keys are
`lib/appearance/prefs.ts`; the settings UI is Settings → Appearance.

| Setting              | Mechanism                                                                                       | Key                  |
| -------------------- | ------------------------------------------------------------------------------------------------- | -------------------- |
| **Accent preset**    | 14 curated colors overriding only `--site-accent*` as inline styles on `<html>` (§2)             | `rmh-custom-accent`  |
| **Text size**        | Four scales (87.5 / 100 / 112.5 / 125%) — a root font-size multiplier, so every `rem` follows    | `rmh-font-scale`     |
| **Density**          | `cozy` \| `compact` → `html[data-density]`; compact tightens `[data-slot="card"]` padding and gap. Font sizes and touch targets deliberately unchanged | `rmh-density`        |
| **Readable font**    | `html.readable-font` swaps the **body** face to a high-legibility stack (Atkinson Hyperlegible → Verdana → system) with loosened tracking, word spacing and leading. Headings keep the theme display face | `rmh-readable-font`  |
| **Reduce motion**    | In-account switch that sets `html.reduce-motion`, on equal footing with the OS preference         | `rmh-reduce-motion`  |
| **Glass clarity**    | Five stops (§5.46), below                                                                        | `rmh-glass-level`    |
| **Colour vision**    | `html[data-color-vision=…]` retint of the semantic tokens, below                                  | `rmh-color-vision`   |
| **Tilt effects**     | The one surviving motion input: `deviceorientation` drives the aurora on touch. iOS needs an explicit `requestPermission()` gesture, which this row performs — we never prompt on load | `rmh-motion-ok`      |

**Colour vision is a first-class axis, not a filter.** On this site colour *is*
state — win/loss, up/down, rarity, health, leaderboard deltas, moderation status
— and roughly 8% of men and 0.5% of women have some colour-vision deficiency, so
it was the largest group the suite was missing. Three modes retint the three
**semantic** tokens only (`--site-success`, `--site-danger`, `--site-warning`) to
a palette that stays separable under that deficiency, on the Okabe–Ito basis:

- `deuteranopia` / `protanopia` (red–green): success becomes **blue** and warning
  a high-lightness amber, so the three differ in hue *and* lightness instead of
  leaning on a red/green contrast the viewer cannot see.
- `tritanopia` (blue–yellow): red and green read normally and stay; the yellow
  warning becomes **magenta**.

It is a retint of the tokens that carry meaning, not a repaint of the site — the
blocks sit after every `.style-*` block so they win, and `none` removes the
attribute entirely. **The retint alone is not sufficient:** colour must never be
the only carrier of meaning, which is why `Badge` pairs every status variant with
a distinct glyph. Do the same in new UI. Integrity of the three moving parts (the
mode list, the CSS blocks, the pre-paint script) is CI-enforced — §13.

---

## 3. Typography & fonts

- Body default is `font-body antialiased` (set on `<body>` in `__root.tsx`), which
  resolves to `--site-font-body`. `font-sans` is its alias; `font-nunito` still
  exists but names one literal face and is not the body default.
- Fonts load from **Google Fonts `<link>`s**, not @fontsource, for site chrome:
  Nunito + Inter are critical (loaded in `__root.tsx` head); decorative theme
  fonts (JetBrains Mono, Playfair Display, Bangers, Bebas Neue, Orbitron,
  Cinzel, Pacifico, Space Grotesk, Permanent Marker, Caveat, Dancing Script,
  Patrick Hand) are deferred via `requestIdleCallback` (`deferredFontsScript`).
  `@fontsource/ibm-plex-*` and `@fontsource/newsreader` are used by specific
  games only.
- Recurring text patterns:
  - Page `<h1>`: `font-display font-bold text-lg text-site-text`
  - Body: `text-site-text`; secondary: `text-sm text-site-text-muted`; faint: `text-site-text-dim`
  - Dialog title: `text-lg font-semibold leading-none tracking-tight`
  - Mono accents (counts, section labels): `font-mono text-xs uppercase tracking-widest`
  - Chips/pills: use `<Badge>` (or `inline-flex items-center gap-1 rounded-full text-xs font-medium`)

## 4. Iconography & emoji

- **`lucide-react` is the icon library.** (`react-icons` appears in exactly one
  legacy file — don't add more.) `Button` auto-sizes child SVGs to `size-4`.
- Decorative icons get `aria-hidden`; icon-only buttons get an `sr-only` label
  or `aria-label`. Directional icons that must mirror in RTL take `.rtl-flip`.
- Emoji render through Twemoji (`TwemojiProvider` in `components/ui/`) for
  cross-platform consistency.

---

## 5. Shared primitives (`components/ui/`)

### 5.1 The glass elevation classes (use these for surfaces)

Glass is opt-in per element via these classes (in `app/globals.css`). Pick by
role, not by looks — the tier decides blur cost (see the redesign doc §6 budget:
≤8 backdrop-filters per viewport, **0** on repeated list items).

| Class                               | Tier            | Use for                                                                                             |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `.glass-fill`                       | L1 (no blur)    | Repeated content: cards, list rows, table rows, grid tiles. Cheap, unlimited. Ambient rim glint.    |
| `.glass-pane`                       | L2 (blur+noise) | Singular panels: heroes, composers, settings sections, tier cards. Budgeted.                        |
| `.glass-chrome` (`--aside` variant) | L3              | Persistent chrome: sidebar, sticky headers, mobile dock. Condenses on scroll via `[data-scrolled]`. |
| `.glass-overlay`                    | L4              | Floating UI: dialogs, popovers, menus, command palette, toasts, tooltips.                           |
| `.glass-inset`                      | —               | Recessed wells: inputs, search fields.                                                              |
| `.glass-scrim`                      | —               | Dialog/drawer backdrops.                                                                            |

Modifiers layer **on top of** a tier class. Each carries a per-page budget —
they are signature moments, not defaults:

| Modifier                                     | Budget      | What it adds                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.glass-interactive`                         | unlimited   | Hover tint-raise, springy press flex (`--ease-glass`), and — **paired with `.glass-fill`** — the specular rim glint raised from ambient to full on hover. The glint selector is `.glass-fill.glass-interactive`: on its own, `.glass-interactive` still gives the press, but there is no rim to light. It used to add a **pointer-tracked** diffuse hotspot on `::after`; that is retired (§5.1.1) and `::after` now carries the travelling sheen (§5.1.2).                                                              |
| `.glass-refract` + `data-glass-lens`         | **≤2/page** | Lens-model edge refraction (v2): the backdrop bends through a displacement height field at the pane edge. Hero/chrome only, never in scroll containers. `data-glass-lens` opts into per-element filter sizing (`lib/glass-lens.ts`; Chromium bends the backdrop, Gecko/WebKit displace a mirrored aurora copy — §3.6). Pressing deepens the bend (`:active`, ×1.6, §3.7). Not compatible with `.glass-chrome--aside` (see below). |
| `.glass-refract--prism`                      | **≤1/page** | True chromatic dispersion (R/G/B displaced at different magnitudes) + fringe. Sanctioned users: login card, command palette, `/store` featured tier, design lab.                                                                                                                                                                                                                                                                  |
| `.glass-liquid` (or `<GlassPane liquid>`)    | **≤3/page** | Ambient travelling sheen (light over wet glass), painted as a background layer (v2) so it **composes freely** with `.glass-refract` and `.glass-interactive`. Signature surfaces only, never on list items.                                                                                                                                                                                                                       |
| `.glass-sheen-hover`                         | unlimited   | One-shot sheen sweep on hover — primary CTAs (`Button` `default`/`accent` have it built in).                                                                                                                                                                                                                                                                                                                                      |
| `.glass-bevel-sm`                            | unlimited   | Narrow 6px optics ring for small capsules — the `LiquidTabs` sheet pill (§5.45), plus discs like BackToTop.                                                                                                                                                                                                                                                                                                                       |
| `.glass-opaque`                              | —           | Escape hatch for full-screen fixed takeovers that must hide the page.                                                                                                                                                                                                                                                                                                                                                             |

Sticky glass uses the shared layout contract rather than local `top-*` values:

- `.site-sticky-chrome` is the primary floating header for a column. It owns
  the viewport edge, inline gutter, z-index, radius, and the breathing room
  below the surface.
- `.site-sticky-secondary` is the cascade level for an independent sticky
  below the primary. Its offset clears the compact 56px primary header plus
  `--site-section-gap`.
- `.site-sticky-contained` is for a sticky toolbar inside its own editor or
  scroll region; it does not add page margins.

Related controls should still be merged into a single sticky surface. Use the
secondary level only when the two surfaces mount independently.

### 5.1.1 Cursor reactivity is retired (2026-08-01)

Nothing on the site follows the pointer any more. The glass answers a **static
sun**; hover is a state change, not a position. What was removed, and why:

| Effect                                       | What it cost                                                                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.glass-interactive::after` diffuse hotspot  | A 220px radial gradient whose **centre** moved with the cursor. Gradient position is not compositable — every frame repainted the element's whole box.   |
| `hooks/useGlassLight`                        | A document `pointermove` listener: a `closest()` ancestor walk, a cached `getBoundingClientRect()`, two custom-property writes per frame — feeding a scene light whose only consumer (`lib/liquid-gl`) is never initialised. |
| `useLiquidBackground`'s fine-pointer branch  | Woke a rAF and re-composited two viewport-sized aurora layers on every frame the mouse moved.                                                            |
| `RadialShell`'s ring parallax                | A `pointermove` listener plus a rAF lerp, mounted on **every route**, still scheduling frames a third of a second after the pointer stopped.             |
| `hooks/useCardSheen`, `hooks/usePointerParallax`, `hooks/useParallax` | Per-component cursor tracking. `usePointerParallax` was mounted **per card** in the arcade hub — N listeners, N spring sets and N `preserve-3d` layers on one page. |

Two things survive, because neither is a cursor: the **device-tilt** aurora
(opt-in, touch-only, Settings → Appearance) and `useDeviceAttitude` (§7, an
explicit "inspect this object" control that also has a drag/keyboard path).

If a cursor-tracked specular is ever wanted back, it belongs on a
compositor-friendly carrier — a transform-translated child layer — never on an
animated gradient position, and it must sit behind the same tier switches as the
rest of the optics.

### 5.1.2 The sheen travels on the compositor (v3)

`.glass-liquid` used to animate `background-position`. That is a **paint**
property — no transform slides a gradient — so every frame of the sweep
re-rasterised the host's entire box, on an `infinite` animation, on surfaces
that are by definition among the largest on the page. Measured over 3s inside
the active sweep, three panes, 4× CPU throttle:

| Renderer work         | animated `background-position` | transform on `::after` |
| --------------------- | ------------------------------ | ---------------------- |
| `Paint` events        | 720                            | **0**                  |
| `RasterTask`          | 2,700 (1,300ms)                | 12 (8.9ms, one-time)   |
| Area repainted        | 737 Mpx                        | **0 Mpx**              |
| **Total render time** | **1,453ms**                    | **8.9ms**              |

Three things make it work, and the middle one is the reason it could not have
been done before §5.1.1:

1. **The host clips.** A moving layer has to leave the pane, and a `clip-path`
   or `mask` on the layer itself is applied *before* its transform, so it travels
   with the band. `overflow: clip` (not `hidden`) creates no scroll container
   and no containing block for absolute descendants.
2. **`::after` was free**, because the pointer hotspot that owned it is retired.
3. **The geometry is the old one converted, not redesigned.** At `115deg` a
   gradient's stops run along the tilted axis, so `transparent 0%` is a corner,
   not an edge — a narrower band with rounder stops shows hard vertical seams
   where its box cuts through mid-gradient colour. Keep the 260% width and the
   original stops.

**The rim glint comes free** (v2, §4.35): `.glass-pane`/`.glass-overlay`/`.glass-chrome`
(and the `--aside` variant) paint an always-on specular as a **border-box
background layer** — it lives in the 1px border ring while the structural border
itself goes transparent, so glass reads as one lit sheet, not an outlined frame.
Its bright segment is lit by a **static sun** above the page. It used to track a
JS-published scene light (`--light-x/--light-y`, written by `useGlassLight` on
every pointer frame); that hook is deleted and nothing writes those properties
now, so the `var()` fallbacks in the gradient — which were always the touch and
perf-lite path — are the only path. Scrims carry no glint.

**L1 answers the light too.** `.glass-fill` carries the same glint layer plus the
micro-noise, at an **ambient** resting strength (`--glass-glint-rest`, 0.45× the
theme's `--glass-glint-opacity`); `.glass-interactive` raises it to 1 on hover, so
the hovered fill is still unmistakably the lit one. This is a v2 amendment: the
glint was L2-and-up only, and the multiplier rested at **0**, which meant the tier
the site is mostly *made* of was optically dead — and an interactive fill (whose
border is transparent so the lit edge *is* the border) had no edge and no light at
all until a pointer arrived, i.e. permanently, on touch. Two things had to change
in `globals.css` for it to be possible at all, and both are load-bearing:

- L1's tint is `background-color`, **never the `background` shorthand** — the
  shorthand resets `background-image`, so L1 structurally could not carry a layer.
  The same applies to anything that re-tints a fill (`.social-post:hover`, the
  mobile opacity floor): re-tint with `background-color` or you silently strip the
  material. The degradation blocks (high-contrast, reduced transparency) use the
  shorthand *deliberately*, to drop the layers along with the translucency.
- L1's layers clip to **padding-box**, unlike L2+: a fill keeps its visible
  hairline (it is what separates one repeated row from the next), and a border-box
  layer under an opaque border is painted over anyway.

Wells (`.glass-inset`, half-strength border) carry no glint. Pseudo contract:
`::before` is refraction-only (the masked lens band) or the aside blur; `::after`
is the travelling sheen on `.glass-liquid` (§5.1.2) and otherwise free, now that
the pointer light that used to own it is gone (§5.1.1) — a component may take it
for something static. Never add a third owner.

**L4 has a legibility floor.** A popover is the one surface a visitor must read
the instant it appears, so `.glass-overlay`'s tint is
`clamp(78%, 90% × --glass-user-tint, 100%)` rather than a plain multiply: the
Glass clarity slider still moves it, but "Airy" cannot take a dropdown to 56%
opacity and lose it against a busy page. There is also a
`@supports not (backdrop-filter: …)` rule that turns every blurred tier opaque
where the engine cannot blur — the tint alone was never doing that job.
**Floating UI must be `.glass-overlay`.** L1 `.glass-fill` has no backdrop blur
by design (it is the repeated-card tier); a menu built on it sits transparent
over whatever it opened on top of. This is CI-enforced — see §13.

**Reach for the tier class, not its box-model equivalent.** `bg-site-surface
border border-site-border rounded-site shadow-site-sm` renders the same *box* as
`.glass-fill` and none of its *material* — no noise, no glint, and nothing for the
degradation tiers to switch off. Hand-rolled recipes had spread to roughly 500
call sites (with comments that still named the tier they had been flattened out
of, and a `data-glass-light` or a lone `.glass-interactive` whose effect the
missing paired class had quietly killed). If a surface is a card use `.glass-fill`,
a panel `.glass-pane`, sticky chrome `.glass-chrome` + `.site-sticky-chrome`,
floating UI `.glass-overlay`, a field `.glass-inset`, a backdrop `.glass-scrim`.

Rules: never put a backdrop tier (`.glass-pane/chrome/overlay`) on an ancestor of
a `position:fixed` element (`backdrop-filter` creates a containing block — use
`.glass-chrome--aside`, which blurs on `::before`). `high-contrast`,
`prefers-reduced-transparency`, `html.reduce-transparency`, and `html.perf-lite`
all degrade these classes automatically — no per-component branching.

`html.perf-lite` is applied by **`lib/perf-tier.ts`** (from `Providers.tsx`) off
two conservative device facts: `navigator.deviceMemory < 4`, or
`hardwareConcurrency <= 2`. It is read in about a dozen places (both aurora
layers, the radial blob field, `.lg-goo`, `glass-lens`, `canvas2d-fx`,
`useLiquidBackground`, the sheen keyframe, liquid morph/pop) and
until 2026-07-30 **nothing ever set it**, so every one of those degradations was
dead code and the weakest machine on the site rendered the full effect stack.
Deliberately capability reads and not a measured-fps probe: a tier that can flip
mid-session restyles the document under the user for reasons they can't see.

The `Card` primitive is L1 `.glass-fill` by default; pass `pane` for L2 and
`interactive` for the hover tint-raise, hover-raised glint and press flex.
Inputs/Textarea/Select are `.glass-inset`;
Dialog is `.glass-overlay` + `.glass-scrim`; the shell chrome is `.glass-chrome`.

### 5.2 Primitive catalog

Always reach for these before writing new markup. Helper: `cn()` from
`@/lib/utils` (= `twMerge(clsx(...))`).

| Component                                                                   | File                                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button` / `buttonVariants`                                                 | `components/ui/button.tsx`                               | CVA. Variants: `default`, `destructive`, `danger`, `outline`, `secondary`, `ghost`, `link`, `accent`, `accent-outline`, `accent-ghost`. Sizes: `xs`, `sm`, `default`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. `asChild` supported. **`loading` prop** (+ optional `loadingText`) shows an inline spinner, sets `aria-busy`, and disables the button — reach for this instead of hand-rolling `disabled={x}` + a separate `<Loader2>`.                                                                                           |
| `Badge` / `badgeVariants`                                                   | `components/ui/badge.tsx`                                | CVA pill. Variants: `default`, `accent`, `solid`, `success`, `warning`, `danger`, `outline`.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Card` + Header/Title/Description/Action/Content/Footer                     | `components/ui/card.tsx`                                 | The shared content surface, in the glass material. **L1 `.glass-fill`** by default (cards are the most repeated surface on the site, and L1 is the tier with no backdrop blur); `pane` promotes it to L2 `.glass-pane`; `interactive` adds the hover tint-raise, the hover-raised rim glint and the press flex. It also carries `data-fluid-press="firm"` when interactive — a card is column-wide, and the 4% squash that reads as crisp on a button reads as a wobble at that size.                                                    |
| `Dialog` (Radix wrapper)                                                    | `components/ui/dialog.tsx`                               | Centered, viewport-clamped glass content with safe internal spacing and a translated close control. Pass `mobileFullscreen` for complex/wide editors; they consume the phone visual viewport with safe-area padding, then return to a centered dialog from `sm`.                                                                                                                                                                                                                                                                       |
| `Input`, `Textarea`                                                         | `components/ui/input.tsx`, `textarea.tsx`                | `bg-site-surface`, `rounded-site-sm`, hairline border, accent focus ring.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Select`                                                                    | `components/ui/select.tsx`                               | Radix Select in a native-`<select>` shim: callers still write `<option>` children and read `e.target.value` off `onChange`, but the **option list is ours** — a `glass-overlay` popup in the theme's own tokens, not the OS picker (the old §15.6 exemption, now closed). `tier="app"` repaints it in the `--app-*` contract and portals into the `.app-theme` shell, for the full-screen apps. `<option value="">` placeholders are supported (mapped around Radix's reserved empty value); multi-select is not.                      |
| `Label`                                                                     | `components/ui/label.tsx`                                | Radix Label.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `EmptyState`                                                                | `components/ui/empty-state.tsx`                          | Canonical zero-state: `{icon, title, description, action}`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Skeleton`                                                                  | `components/ui/skeleton.tsx`                             | Canonical loading placeholder. Defaults to a gentle `animate-pulse`; pass **`shimmer`** for a travelling highlight sweep (reduced-motion-safe) — nicer for above-the-fold / hero placeholders.                                                                                                                                                                                                                                                                                                                                         |
| `Spinner` / `RadialLoader`                                                  | `components/ui/spinner.tsx`, `radial-loader.tsx`         | Canonical loading mark (`role="status"`) for **standalone / section loading** (accent-coloured, centred). It renders the **radial loading mark** — blobs orbiting a pulsing core — so a wait speaks the same language as the hub. `RadialLoader` is the bare mark (inherits `currentColor`, `decorative` drops the live region); `Spinner` is it in the accent. A bare inline `<Loader2 className="animate-spin" />` inside a button/label is still fine — it inherits `currentColor`, where `<Spinner>` would paint accent-on-accent. |
| `Tooltip`                                                                   | `components/ui/Tooltip.tsx`                              | Portal + framer-motion. Shows on **hover and keyboard focus**, dismisses on Escape, wires `aria-describedby`.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `IconButton`                                                                | `components/ui/icon-button.tsx`                          | Icon-only `Button` that requires a `label` (becomes `aria-label` **and** a `Tooltip`). Reach for this instead of a bare `<button aria-label>`.                                                                                                                                                                                                                                                                                                                                                                                         |
| `CopyButton` / `useClipboard`                                               | `components/ui/copy-button.tsx`, `hooks/useClipboard.ts` | Canonical copy-to-clipboard: icon → check, sonner toast, `execCommand` fallback. Don't hand-roll `navigator.clipboard.writeText` + `useState`.                                                                                                                                                                                                                                                                                                                                                                                         |
| `ConfirmDialog` / `useConfirm`                                              | `components/ui/confirm-dialog.tsx`                       | Themed promise-based confirm — `await confirm({ title, description, danger })`. Replaces native `window.confirm` (which ignores themes/i18n/a11y). `<ConfirmProvider>` is already mounted in `Providers`.                                                                                                                                                                                                                                                                                                                              |
| `Breadcrumbs`                                                               | `components/ui/breadcrumbs.tsx`                          | "Where am I" trail for nested pages; also a `breadcrumbs?` prop on `PageLayout`. Last item is the current page (`aria-current`).                                                                                                                                                                                                                                                                                                                                                                                                       |
| `BackToTop`                                                                 | `components/ui/back-to-top.tsx`                          | Floating scroll-to-top button, mounted once in the `_site` shell (targets the window **and** the mobile `[data-scroll-root]` scroller).                                                                                                                                                                                                                                                                                                                                                                                                |
| `NotificationBadge`                                                         | `components/ui/notification-badge.tsx`                   | Count pill (`bg-site-danger`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `UserAvatar`                                                                | `components/ui/UserAvatar.tsx`                           | Default fallback `/images/social/default_avatar.png`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `OptimizedImage`, `BlurImage`                                               | `components/ui/`                                         | Image loading.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `AnimatedCount`, `ViewTransitionLink`, `NavigationProgress`, `RoutePending` | `components/ui/`                                         | Motion/navigation helpers. `RoutePending` is the router-wide pending fallback.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Pagination, Slider (Radix), Resizable, `skeletons/PostCardSkeleton`         | `components/ui/`                                         | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Surfaces outside `Card`: `bg-site-surface border border-site-border
rounded-site`; hover affordance `hover:bg-site-surface-hover
hover:border-site-border-bright` (or `hover:border-site-accent`). Dividers:
`divide-y divide-site-border`.

Toasts: **sonner**. A themed global `<Toaster>` is mounted in
`components/Providers.tsx`; pages just `import { toast } from "sonner"`.

`SheetContent` follows the same rule: ordinary pickers are horizontally
centered floating bottom sheets on phones, while `mobileFullscreen` is reserved
for large editors such as Edit Profile. Do not hand-position wide mobile modals
with viewport offsets; use the shared option so safe areas, scrolling, and
close-button clearance stay consistent.

---

## 6. Layout system & page anatomy

The `_site` layout route delegates to `components/feed/SiteShell.tsx`, which now
renders the **radial shell** ([`components/radial/RadialShell.tsx`](../components/radial/RadialShell.tsx)):
a fixed **ring backdrop** (concentric hairlines plus a drifting blob field — it
is static under the pointer now, §5.1.1), a slim sticky **utility top bar**
(brand · search · inbox · avatar), the **frame** and the central **RMH hub**
(`RadialHub`). The shell's backdrop layer paints only the rings and blobs; the
**aurora canvas** is the document's own `.site-aurora` element (rendered in
`__root.tsx`), which is what every `backdrop-filter` on the page samples. The
single
`<main id="main-content">` landmark lives inside the frame; **pages never add
their own sidebars or page-frame** (and `AnimatedMain` renders a `<div>` — the
shell's `<main>` is the one landmark).

**The frame is responsive by track count.** Mobile is one column. From 1120px
the shell adds a persistent **navigation rail**, and from 1440px a **live rail**
(who's online, the daily loop, friends online, trending, who to follow, plus
whatever a page portals in through `PageLayout`'s `rightSidebar`). They are grid
tracks, not overlays, so they cannot ride over the content, and each is
`display: none` below the width that affords it. The frame itself is capped
(`--rad-frame-max`, 96rem → 116rem at 1800px): filling the window means filling
it with content, not stretching one reading column across a 34-inch display. See
[`components/radial/README.md`](../components/radial/README.md) for the width
table and the overlap-bound rules.

The hub is a phase state machine: tapping the fixed orb sends it to the **centre
of the screen**, where it swells and dissolves into the **liquid globe**
([`LiquidGlobe`](../components/radial/LiquidGlobe.tsx)) while an expanding
circular **veil** sinks the page behind it. The globe is the navigation: every
destination is a pin on a glass sphere, and you **turn it** to find where you
want to go — drag to spin, let it coast, and the nearest destination is eased
into the reticle at the front. **Hold** it there and the reticle's ring fills;
**let go once it is full** and you land on that page. Let go early, or turn away,
and the ring drains. **Poke the sphere and it ripples** — a wave spreads from the
exact point you touched, swells the wireframe as it crosses and dies on the far
side; the impact is stored in the globe's _own_ coordinates, so the wave is a
mark on the ball and travels with the surface as you keep dragging (shape:
`rippleWave` in `lib/fluid.ts`; the swell is applied in the paint only, never in
the hit test). Closing reverses the whole motion (the globe collapses, the
veil contracts, the orb re-condenses and glides home). The hub remains the
navigator on mobile and the fast full-screen switcher on desktop, where the nav
rail shows the same map without a gesture.

One hard constraint comes with it: **the globe animates continuously above the
overlay**, so the overlay is a painted veil rather than a `backdrop-filter`.
Chromium re-blurs a viewport-covering backdrop-filter _in full_ whenever anything
above it moves — measured in this exact stack at ~10fps. The frosted material
still ships on the hub's small, stationary foot capsule. See
[`components/radial/README.md`](../components/radial/README.md) for the numbers.

**Every top-bar control previews before it navigates.** Search drops a live
result list, the bell the latest notifications, the inbox recent threads, the
avatar a compact account menu — each with a footer link through to the full
page, so nothing is hidden behind the preview
([`QuickPanel`](../components/radial/QuickPanel.tsx) owns anchoring, the viewport
clamp, dismissal and focus).

The home (`/`) is a **radial feed**
([`RadialFeed`](../components/radial/RadialFeed.tsx) → `RadialWheel`): a wheel of
cards raked onto a shallow cylinder on the **document's own scroll** (no inner
scroll region — that is what lets mobile Safari collapse its toolbars), led by an
inline compose box, with a floating compose button that opens the new-rmhark
modal. A post's **pictures render in the card** ([`RmharkMedia`](../components/radial/RmharkMedia.tsx)):
up to four tiles, the rest summarised as "+N". Two rules there are load-bearing
and easy to undo — a lone image's aspect is **clamped** to 4:5…16:9, because the
wheel is a glance and a 1:4 panorama would own three screens of it; and every
tile reserves a numeric aspect box **before decode**, because the wheel caches
each card's document centre and a late-arriving image without a reserved box
costs a re-measure of every mounted slot on top of the layout shift.
From 1280px it becomes a **deck** — the wheel keeps the primary column and
an independent second feed (Following · News · Games) runs beside it. Every other
`_site` route flows the same way — natural document scroll, **no pinned/sticky
page chrome** — inside the frame's content track on the backdrop. The radial shell
keeps its **layout** opinions on content pages — it strips PageLayout's header
card down to flat big type and unpins sticky headers/tabs/search so every page
flows like the feed — but it no longer touches the **material**: the glass classes
render at full strength inside the shell, over the ring backdrop and the aurora.

Two page archetypes (see `docs/page-consistency.md` for full code):

1. **Standard content page** — wrap in `components/feed/PageLayout.tsx`:
   `PageLayout({ title, children, rightSidebar?, headerRight?, wide?, backTo?, backLabel?, breadcrumbs? })`.
   In the radial shell its `.page-heading` renders as a **flat, transparent
   big-type header** floating directly on the ring backdrop (the radial content
   layer strips the old bordered header capsule), followed by the content column.
   `rightSidebar` is **portalled into the shell's live rail** on wide screens and
   dropped on narrow ones, so it is supplementary content, never load-bearing.
2. **Feed-column / bespoke page** — use `AnimatedMain` directly with a target
   width from `lib/layout-width.ts`, or (home) the radial wheel.

Column widths come from `lib/layout-width.ts`: `DEFAULT_WIDTH = 648`,
`WIDE_WIDTH = 800`, `WIDE_NO_RIGHT_SIDEBAR_WIDTH = 952`. Those are the page's
_preference_, published as `--main-target`; on a wide screen the shell grants the
column a larger floor (`--rad-measure`) so a desktop window is not held to a
2019-era constant, and `min(100%, …)` keeps either from overflowing its track.
`wide` pages take the whole content track. Inner content is
usually `px-4 pt-4 pb-12 max-w-2xl mx-auto`; the column always carries
`pb-dock` and **no `border-r`** — there is no app-frame edge. Repeated content
floats as spaced cards (`space-y-3 px-3`); hairline `divide-y` rhythm lives
_inside_ container cards, not between page-level sections.

Full-screen experiences (games, `/login`, legal pages, Discord activities) live
at the **top level** of `app/routes/` — outside `_site/` — and deliberately get
no shell (no radial chrome — they own their own look; the aurora canvas is
gated off there too, via `html.app-route`).

---

## 7. Motion

- **Radial motion (the shipped layer).** The radial UI is CSS/rAF-driven and
  framer-motion-free for the shell: the feed **wheel** rakes each card onto a
  shallow cylinder on a rAF window-scroll pass with cached offsets (no layout
  thrash — `RadialWheel`), the **hub** glides the orb to centre and blooms the
  **liquid globe** under an expanding `clip-path` **circular veil** (CSS phase
  machine + one mount-bounded rAF loop for the sphere's spin, dwell and ripple),
  and page headers/heroes rise in on mount (`radial-page-rise`). The **ring
  backdrop** and its blob field drift on their own compositor keyframes — they no
  longer parallax to the pointer (§5.1.1). All of it is `transform`/`opacity`
  only and gated off under reduced motion; optional scroll **haptics**
  (`navigator.vibrate`) tick as cards cross the focus line.
- **framer-motion** is the animation library. Reach for the shared motion
  system in **`lib/motion.ts`** rather than hand-typing durations/easings:
  it exports the timing tokens (`DURATION`, `EASE`, `SPRING`, `APPLE_SPRING`,
  `pressable`, `transition`) and ready-made variants (`fade`, `fadeRise`,
  `fadeDown`, `scaleIn`, `popIn`, `overlay`, `modalContent`,
  `staggerContainer`/`staggerItem`). Keeping enters, exits, and lists on these
  tokens is what makes motion feel like one system — smooth and quick (nothing
  here is slower than 0.3s). Inline props are still fine for one-offs, but
  prefer `transition` / a named variant so a global re-tune stays a one-line
  change.
- **Tween or spring — the rule.** Tweens (`DURATION`/`EASE`) are for state
  changes with no gesture behind them: cross-fades, colour shifts, reveals.
  **`APPLE_SPRING`** is for anything the user _acts on_ — presses, drags, sheet
  dismissals, morphing containers — because a spring is interruptible: grab a
  moving element mid-flight and it retargets from its current velocity instead
  of snapping. It is parameterised the way SwiftUI does it, by perceptual
  `duration` + `bounce` rather than stiffness, which is why the same preset
  settles in the same perceived time whether it travels 4px or 400px. Presets:
  `smooth` (no bounce, the default), `snappy` (controls/toggles), `bouncy`
  (reactions, celebratory pops), `sheet` (presentation), `press`. Spread
  **`pressable`** onto a tappable surface for the standard press
  acknowledgement rather than re-deriving a scale.
- **iOS large title:** `components/ui/large-title.tsx` is the collapsing
  title/nav-bar pair. Scroll position maps _continuously_ onto
  scale/opacity/translation and onto the bar's scroll-edge material, so the
  title tracks the finger 1:1 and reverses mid-gesture instead of popping
  between two states at a CSS threshold. Transform/opacity only — the collapse
  costs no layout. Reduced motion collapses it to a static title with a
  permanent bar.
- **Depth from scroll, not from the pointer.** `hooks/usePointerParallax.ts` is
  **gone** (§5.1.1) — it was mounted per card in the arcade hub, which meant N
  listeners, N spring sets and N `preserve-3d` layers on one page. What remains
  is scroll-linked: `components/radial/Parallax.tsx` (a framer-motion
  `useScroll` layer → GPU transforms, static under reduced motion) and
  `hooks/useSpatialParallax.ts`, the marketing shell's restrained background
  parallax. The latter is **gated on a consumer being present on the page**
  (`.rmhp-root, .rmhc-root, .rmht, .spatial-design-hero`), because it writes an
  inherited custom property to `<html>` and used to do so on the feed, every
  profile and every settings page for an effect nothing there could show. The
  principle that survives both: a single sliding layer is just movement — layers
  moving at _different_ rates read as depth — and no React render runs per frame.
- `<MotionConfig reducedMotion="user">` wraps the app (`Providers.tsx`), so
  framer-motion automatically respects OS reduced-motion.
- **Entrances: one reveal, and only genuinely new items.** Two shared hooks
  replace what used to be five hand-rolled copies apiece.
  `hooks/useReveal.ts` is the site's single reveal-on-scroll: attach the ref to
  a container and every descendant carrying `.site-reveal` fades and rises in on
  the `--site-reveal-*` curve. Its hidden state is **opt-in** — the hook stamps
  `data-reveal-armed` on the container only _after_ it has an observer watching,
  and the CSS hides `.site-reveal` only under that attribute, so the resting
  state of the markup is **visible** and content can only be hidden by a
  mechanism already able to show it again. Every implementation this replaced
  defaulted to `opacity: 0` and relied on JS to undo it, which is a blank page
  whenever the JS does not arrive.
  `hooks/useStableListMotion.ts` decides which keyed items get the short
  `.content-item-enter` window: items present on first render are treated as
  established, so hydration, a cached navigation and a loading placeholder
  resolving do not replay every card, and a key is never animated twice even if
  polling returns a new object for it.
- CSS motion: `.page-root > *` runs the `page-enter` animation (0.16s fade +
  4px rise), suppressed on history-back (`html.nav-pop`) and during View
  Transitions (`html.vt-active`). Feed items use `.feed-item-enter`.
  Shared-element View Transitions go through `lib/view-transition.ts`.
- **Living backdrop (two layers, one host):** the aurora is the shared scene
  every `backdrop-filter` on the page samples. Both layers are pseudo-elements
  of **`.site-aurora`**, a leaf element rendered in `app/routes/__root.tsx`:
  `::before` runs an ultra-slow transform-only `aurora-drift` keyframe, and a
  far-field `::after` (per-theme `--site-aurora-far-*` stops) counter-drifts on
  its own slower keyframe, so the two separate into depth on their own. Both are
  gated off under reduced motion, `html.perf-lite` and `html.app-route`, and
  stop in high-contrast (canvas is `none` there).

  Two details are load-bearing. **The host is not `<body>` and not `<html>`.**
  The layers used to be `body::before/::after`, which forced their offset custom
  properties up onto `<html>` to be inherited — and a custom-property write on
  the root dirties the computed style of every element beneath it (~70ms of
  forced style+layout on `/store` at 4× throttle, versus ~0ms on a leaf), because
  custom properties have no invalidation sets and this site declares ~250 tokens
  on `:root`. If a new value has to reach CSS from JS, **give it to the element
  that reads it.** And the aurora is deliberately dormant on iOS/WebKit
  (`html.ios-webkit` takes the static CSS aurora): moving a fixed, oversized
  gradient under several translucent surfaces can wedge WebKit's compositor.
- **The scene light is static, and the only live input is tilt.**
  `hooks/useGlassLight.ts` is deleted — nothing writes `--light-x/--light-y` any
  more, and no rule reads them; each glass rim's glint sits at the `var()`
  fallback, a fixed sun above the element. `hooks/useLiquidBackground.ts` (one
  rAF-throttled listener, mounted in `Providers.tsx`) survives with a **single**
  input mode: `deviceorientation` on coarse-pointer hardware, writing
  `--aurora-mx/--aurora-my` on `.site-aurora` and toggling `html.tilt-live`.
  Android fires it with no prompt; iOS 13+ needs an explicit
  `requestPermission()` user gesture, which Settings → Appearance → "Tilt
  effects" performs — **never prompt on load** — persisting consent as
  `rmh-motion-ok` and firing `rmh:tilt-consent` so the hook starts or stops
  listening live. On a fine pointer this hook attaches **no listener at all**.
- **Looking at an object (device attitude):** the tilt light above is a lean;
  inspecting something is a full rotation, so it works in quaternions instead.
  `hooks/useDeviceAttitude.ts` (maths in `lib/device-attitude.ts`, no three.js —
  it ships on ordinary pages) emits a smoothed **orbit** per animation frame:
  the device's change of heading and elevation since the viewer opened is
  applied to the object about its own axes, so turning to your left brings its
  right-hand face round to meet you and raising the phone looks down over its
  top. Deliberately not the object's raw relative attitude — that is faithful
  but tumbles, because a phone is held pitched back and a turn about the world's
  vertical then arrives as a rotation about a tilted axis. Consent is the same
  site-wide `rmh-motion-ok`; reduced motion removes it (the control does not
  render), and a drag/arrow-key path composes on top so desktops and anyone with
  motion off get the same object. Rendered with CSS 3D — see
  `components/library/Book3DViewer.tsx`, where a library book is a real
  six-faced volume with a printed spine and a block of pages.
- **Overlay/DOM synchronization:** the metaball underlays are portalled, fixed
  and viewport-positioned, so they have to be re-sampled whenever their DOM
  owner moves under them. Bodies unregister in layout-effect cleanup and
  re-sample before paint on route/tab commits; scroll, nested scroll, elastic
  touch movement, `visualViewport` changes, page resume and layout-shift events
  wake the normally-idle sampler; and a liquid pop settles immediately onto its
  real panel when either endpoint moves mid-animation, so a cached bud never
  detaches from the trigger it budded out of. (Comments in `liquid-morph.tsx` /
  `liquid-pop.tsx` still say "shader body" in places — that is the deleted GL
  tier, and the SVG/CSS path they describe is the one that always ran.)
- **Liquid tabs:** tab strips use `components/ui/liquid-tabs.tsx` — each rides
  its own L1 **glass sheet** (`glass-fill glass-bevel-sm rounded-full` pill,
  `sheet` prop default) placed **below** the hero/page-title capsule, never
  inside header chrome (§5.45; see `page-consistency.md`). The active capsule is
  a `layoutId` glass pill that flows between tabs on `SPRING.snappy` and jumps
  under reduced motion; on capable engines it also **morphs** — velocity
  squash/stretch plus a `#glass-goo` metaball trail (`liquid-morph.tsx`, §5.47),
  stripped under reduced-motion / perf-lite / high-contrast. Link-based or
  `aria-controls`-rich tab bars keep their own markup and add the `layoutId`
  capsule directly (creator studio, RMHLadder).
- **Liquid opens:** card→detail navigations morph the clicked glass slab into
  the detail hero via `runViewTransition(el, { liquid: true })` + `liquidVTName()`
  (`lib/view-transition.ts`, §5.48) — the VT name is set at click time and
  cleared after; the detail's secondary content (comments, metadata, related
  lists) then staggers in via `staggerContainer`/`fadeRise`. No-VT browsers get
  instant nav + the stagger.
- **The animation vocabulary has exactly two halves.** `animate-in` /
  `fade-in` / `zoom-in-*` / `slide-in-from-*` are NOT part of it — they belong
  to `tailwindcss-animate`, which is not installed, so writing them produces no
  CSS at all (CI-enforced, §13 rule 9). Reach for:

  **1. framer-motion + `lib/motion.ts`**, for anything React controls the
  mounting of. `fade`, `fadeRise`, `fadeDown`, `scaleIn`, `popIn`, `overlay`,
  `modalContent`, and `staggerContainer`/`staggerItem` for a sequence:

  ```tsx
  <motion.div variants={modalContent} initial="initial" animate="animate" />
  ```

  **2. `data-motion`**, for a **Radix** surface, whose unmount is Radix's to
  schedule — animating one with framer means `forceMount` + `AnimatePresence`
  threaded through every consumer, so the exit rides Radix's own `data-state`
  instead. Three values, matching the variants above:

  | attribute            | for                                | matches      |
  | -------------------- | ---------------------------------- | ------------ |
  | `data-motion="fade"` | a scrim / backdrop                 | `overlay`    |
  | `data-motion="pop"`  | a popover, menu, select, hover card | `scaleIn`    |
  | `data-motion="rise"` | modal / dialog content             | `modalContent` |

  Both halves run on one clock: the `--motion-*` tokens in `globals.css` §7.1
  mirror `DURATION.slow` / `DURATION.fast` / `EASE.emphasized`. `Dialog` and
  `Sheet` keep their own bespoke keyframes (a sheet slides from an edge, which
  none of the three shapes covers) but were retimed onto the same tokens — they
  used to hardcode three different answers between them.
- **Never `transition-all`, and never animate a layout property.** `all` makes
  the engine watch every animatable property on the element, so a class change
  that happens to touch `width`/`padding`/`gap` animates a reflow nobody asked
  for. Name what changes: `transition-colors`, `transition-transform`,
  `transition-opacity`, a `transition-[a,b]` list, or plain `transition` (every
  visual property, no layout ones). CI-enforced for site UI (§13 rule 8).

  When a layout property is genuinely the thing you want to move, it is almost
  always cheaper as a transform, because layout animation relayouts the element
  **and its siblings** every frame. A progress bar is a full-width fill with
  `origin-left` + `transform: scaleX(p)`, not an animated `width`; a column chart
  is `origin-bottom` + `scaleY`. See `components/onboarding/FirstWeekCard.tsx`,
  `components/feed/PollDisplay.tsx` and `components/feed/InsightsModal.tsx`.
- `hooks/useReducedMotion.ts` — SSR-safe boolean for JS animations CSS can't
  reach; `prefersReducedMotion()` for imperative checks.
- `hooks/useCelebration.ts` — confetti/fireworks; lazy-loads canvas-confetti,
  no-ops under reduced motion, and reads `--site-accent`/`--site-success` off
  the DOM so bursts match the active theme.
- Two `@media (prefers-reduced-motion: reduce)` blocks in `globals.css`
  collapse animations/transitions to 0.01ms (keeping spinner/pulse feedback)
  and disable theme background effects.

---

## 8. Interaction & focus states

Global (in `globals.css`):

- Keyboard focus: `:focus-visible { outline: 2px solid var(--site-accent); outline-offset: 2px }`
  covers every interactive element (links, buttons, `[role]`, `[tabindex]`).
  Text inputs opt out (border + caret instead); `Button` opts out too (via its
  `data-slot="button"`) and draws its own softer
  `focus-visible:ring-site-accent/50 ring-2 ring-offset-2`. **Don't add another
  `focus-visible:ring` to an element the global outline already covers — you'll
  get a doubled indicator.** Reach for a self-drawn ring only when the element
  is excluded from (or not matched by) the global rule.
- Selection uses the accent with its `--site-accent-fg` text; native controls
  get `accent-color: var(--site-accent)`; scrollbars are thin and themed.
- **Scrollbars show on scroll, not always.** Every scrollbar on the site — the
  document's, both desktop rails', every panel and every full-screen app tier's —
  is painted transparent while its scroller is idle and fades in only while that
  scroller is actually being scrolled. `lib/scrollbar-reveal.ts` (installed once
  from `Providers.tsx`) stamps `data-scrolling` on the scrolled element and clears
  it ~900ms after it stops; the `§Scrollbars` block in `globals.css` is what
  paints. Two things to know before touching it: the reveal is done with **colour,
  never `scrollbar-width`**, so the gutter stays reserved and revealing a
  scrollbar can never reflow the page; and per the engine note in that block,
  Chromium ignores `::-webkit-scrollbar*` rules on any element that has a standard
  `scrollbar-width` — which `* { scrollbar-width: thin }` gives every element — so
  the standard properties are the live path there and the `::-webkit-*` rules are
  the older-WebKit fallback. An app tier sets its hover colour with
  `--sb-thumb-hover`, not a `:hover` rule of its own.
- **Cross-engine consistency:** the accent outline replaces every browser's
  default focus ring; Firefox's `::-moz-focus-inner` dotted border and
  `:-moz-ui-invalid` red validation glow are neutralized; `::placeholder` is
  themed at `opacity: 1` (Gecko dims it otherwise); autofilled fields are
  repainted to theme colors (WebKit/Blink); scrollbars are themed for both
  `scrollbar-width`/`scrollbar-color` (Gecko) and `::-webkit-scrollbar`
  (WebKit/Blink).
- Tap highlight removed; active press feedback is `opacity: 0.6`.
- **Chrome does not select.** Buttons, `[role]` controls (sliders included),
  navigation/menu/tab links, decorative icons, avatars, every `<canvas>` and
  every `[draggable="true"]` carry `user-select: none` plus
  `-webkit-touch-callout: none` (§Selection in `globals.css`), so a press that
  lingers — or one that moves, which on a mouse is "select" from the first pixel
  — cannot leave a highlight or an iOS long-press menu on top of a gesture.
  Content — prose, post bodies, code blocks, article links — keeps both.
  Surfaces that own the pointer opt in with `data-gesture`; see §0.5. All of it
  lives in `@layer base`, so a `select-text` utility still wins where a surface
  needs to hand a piece of itself back.
- Inputs hold a 16px font floor below 640px (prevents iOS zoom).

---

## 9. Accessibility

- `eslint-plugin-jsx-a11y` runs at "warn" (curated rules in
  `eslint.config.mjs`) — don't introduce new warnings.
- Prefer native elements and the Radix-based primitives in `components/ui/`
  over hand-rolled widgets.
- Patterns to copy: skip link in `_site.tsx` (`sr-only focus:not-sr-only` →
  `#main-content`), `role="status"` + label on loaders, `aria-hidden` on
  decorative icons, `aria-label` on icon-only links/buttons.
- RTL locales are first-class: `<html dir>` is set pre-paint from
  `RTL_LOCALES` in `lib/i18n/config.ts` (today `ar` and `ur` — read the
  constant, don't hardcode a locale test). Use logical spacing where possible
  and `.rtl-flip` on directional icons.
- `high-contrast` is an explicit theme choice (there is no
  `@media (prefers-contrast)` hook) — test new UI against `.style-high-contrast`
  and `.style-graphite` (Midnight), not just the default Daylight theme.
- **Never let colour be the only carrier of meaning.** Colour-vision modes
  (§2.1) retint the semantic tokens, but a retint cannot rescue a UI where the
  only difference between two states is hue. Pair status with a glyph, a label,
  a position or a shape — `Badge` already does, so use it. The three parts of
  that feature (mode list, CSS blocks, pre-paint script) are CI-checked because
  a mode with no CSS block is a setting that appears to work and changes
  nothing.
- **Respect the in-account switches, not just the OS ones.** `html.reduce-motion`
  and `html.reduce-transparency` are set by Settings → Appearance and sit on
  equal footing with `prefers-reduced-motion` / `prefers-reduced-transparency`.
  Code that checks only the media query misses half the people who asked.

---

## 10. Strings (i18n)

Every user-facing string goes through `t()` with a `defaultValue` (English is
the authoritative source):

```tsx
const { t } = useTranslation('site');
t('wallet-title', { defaultValue: 'Wallet' });
```

Namespace conventions (files under `locales/en/`):

| Namespace                                                               | Used for                       |
| ----------------------------------------------------------------------- | ------------------------------ |
| `site`                                                                  | most `_site/` pages            |
| `common`, `nav`, `pages`, `shared`, `feed`                              | core shell + feed              |
| `admin`, `library`, `rideshare`, `groups`, `builds`, `user-builds`, `v` | feature areas                  |
| `c-<area>` (e.g. `c-ui`, `c-rmhbox`)                                    | component strings              |
| `r-<area>` (e.g. `r-strategies`)                                        | route/experience entry strings |

After adding strings run `pnpm i18n:extract` (populates all
`locales/*/<ns>.json`), and `pnpm i18n:coverage` to check locale coverage.
See `lib/CLAUDE.md` §i18n for the full pipeline (resource generation, RTL,
lazy locale chunks).

---

## 11. Do / Don't summary

**Do**

- Use `--site-*` utilities (`bg-site-surface`, `text-site-text-muted`,
  `rounded-site`, …) for every color, radius, shadow, and font.
- Use `components/ui/` primitives, `PageLayout`/`AnimatedMain`, `EmptyState`,
  `Skeleton`, `Spinner`, sonner toasts, lucide icons.
- Give buttons in-flight feedback with `<Button loading>` (not a hand-rolled
  `disabled` + `<Loader2>`), and animate with the tokens/variants in
  `lib/motion.ts` instead of ad-hoc `duration`/`ease` numbers.
- Add `data-slot="..."` to new shared primitives so themes can restyle them.
- Wire every string through `t(..., { defaultValue })`.
- Test in the three shipped themes — `default` (Daylight), `graphite`
  (Midnight) and `high-contrast` — and under reduced motion.

**Don't**

- Hardcode hex/oklch colors, raw palette classes (`bg-red-600`), `rounded-lg`,
  custom shadows, bare `duration-200`, or font families in site UI. The first
  three are CI-enforced (§13).
- Build a dropdown / popover / menu / tooltip on anything but `.glass-overlay`
  — L1 has no blur and the labels ghost (§5.1). Also CI-enforced.
- Track the cursor. Nothing on the site reacts to pointer position any more
  (§5.1.1); hover is a state, not a coordinate.
- Re-add navigation/sidebars inside a page (the `_site` shell owns them).
- Use `react-icons`, an ad-hoc **standalone** `Loader2` where `<Spinner>`
  belongs (inline `Loader2` inheriting a button's colour is fine), or
  hand-rolled dialogs.
- Put a full-screen experience under `_site/`, or a standard page outside it.
- Bypass Twemoji for emoji or `jsonLdScript()` for JSON-LD.
- Re-implement something `components/shared/` already provides for full-screen
  apps (shell, header, toaster, connection status) — see §12.

---

## 12. The full-screen app tier (`--app-*`)

The site's `--site-*` contract stops at the `_site` shell. Full-screen apps
(**RMHbox, RMHType, RMHStudy, RMHTube, RMHMusic**) live at the top level of
`app/routes/`, are excluded from the theme system (`THEME_EXCLUDED_ROUTES`), and
have their own parallel contract — which is deliberately the **same shape**, so
what you know from §1 transfers.

`components/shared/app-theme.css` owns it: an `--app-*` token set
(`--app-bg`/`-subtle`, `--app-surface`/`-hover`/`-active`, `--app-border`(`-bright`),
`--app-text`/`-muted`/`-dim`, `--app-accent`/`-fg`/`-hover`/`-dim`,
`--app-success`/`-danger`/`-warning`/`-info`/`-rare`, `--app-font-*`,
`--app-radius`/`-sm`/`-lg`, `--app-shadow`/`-sm`,
`--app-duration-fast`/`-duration`/`-slow` + `--app-ease`, density and
`--app-safe-*` inset tokens) **plus every behaviour built on it** — scrollbars,
focus rings, `::placeholder`, Gecko's focus/validation quirks, tap-highlight and
double-tap-zoom suppression, the iOS sub-16px input-zoom floor, `dvh` heights,
and deliberate degradation for `backdrop-filter`,
`prefers-reduced-transparency`, `forced-colors` and print.

**An app ships only its palette.** Each app's CSS is a class
(`rmhbox-theme`, …) that redefines the `--app-*` values — RMHbox's is ~30 lines.
Components read `--app-*` directly; there is no per-app alias layer.

The shared pieces, all in `components/shared/`:

| Piece                                      | What it owns                                                                                                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppShell`                                 | Root wrapper: palette class + appearance modifier (`dark`/`light`/`high-contrast`, unknown values falling back to dark rather than stranding the app), `color-scheme` hint, density, toaster, connection chrome. |
| `AppHeader`                                | The app bar as a three-column grid — genuinely centred title that truncates instead of overlapping, steps aside below 640px, back label collapsing to its arrow below 480px with an `sr-only` name.              |
| `AppToaster` + `lib/shared/app-toast`      | One toast store and container for every app; timers are tracked, so a hand-dismissed toast doesn't leave a second one running and a route change cancels rather than leaks.                                      |
| `ConnectionStatus`                         | Reconnect banner + peer-wait overlay, so every socket-backed app reports an outage the same way, in the same place, with `reconnecting` distinguished from `connecting`.                                         |
| `GameLoadingFallback`, `GameErrorBoundary` | Loading/error surfaces for game routes (strings in the `shared` namespace).                                                                                                                                      |

**The rule:** a new full-screen app writes a palette class and mounts
`AppShell`/`AppHeader`. Adding a sixth copy of the shell, the header, the toast
store or the connection banner is the defect this tier was created to end — a
fix to any of it previously had to be made five times, and in practice never
was. Games with a bespoke visual identity (Temple of Joy, Slice It, Neon
Driftway) keep their own scoped variable groups in `globals.css`; they are
exempt from the palette, not from the shared behaviour.

### 12.1 The full-screen viewport contract

The palette is what an app may own. The **viewport** is not: a game that clips
its own pause menu is broken in the same way whatever its colours are. These
four primitives live in `app/globals.css` (§"Full-screen app/game layout
helpers"), deliberately global rather than in `app-theme.css`, so a game with
its own design system does not have to adopt the app palette just to stop its
bottom bar hiding under a phone's browser chrome.

| Primitive                    | Use it for                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `.app-viewport`              | The root of a non-scrolling app shell. `100vh` then `100dvh` — the fallback pair, not Tailwind's single-declaration `h-dvh`.                     |
| `.app-page`                  | The root of a full-screen screen that is a **document** — a landing, a lobby, a results card. Scrolls the page, not a box inside it. See rule 6. |
| `.app-screen`                | A menu / results / lobby screen: full height, centred **while it fits**, scrolled when it does not.                                              |
| `.app-stage-fit` + `.app-stage` | A fixed-aspect playfield. Put the HUD **inside** `.app-stage` when it must track the world, outside when it should use the letterbox.        |
| `.app-hud` / `.app-hud-fixed`   | A full-bleed chrome layer, inset by the device's safe area. Geometry only — it does not touch `pointer-events`.                              |
| `.app-safe-top/-bottom/-x/-pad` | Insets on a surface that is itself full-bleed but whose contents are not (a translucent bar, a letterbox gradient).                          |
| `useKeyboardInset` + `--kb-inset` | The software keyboard's measured height, so a fixed-height shell can end where the keyboard begins. `AppShell` mounts it for the app tier. |

Six rules, each of which was a shipped defect before it was a rule:

1. **The world runs to the edge; the controls do not.** Artwork *should* pass
   under the notch. A pause button must not. Anything pinned to a viewport edge
   adds `var(--safe-top|right|bottom|left)` to its offset, or sits in an
   `.app-hud` layer that already has. Picture **landscape** when you check —
   that is where the notch takes a long edge, and it is the orientation most of
   these games are played in. Bottom-only insets are the common half-fix.
2. **`aspect-ratio` derives only the axis you left `auto`.** So
   `width: 100%; max-height: 100%; aspect-ratio: W/H` is not a fit — the clamp
   shortens the box without narrowing it and the playfield skews. Setting both
   axes definite is worse: the ratio is ignored outright. Use `.app-stage`,
   which states the fit in container-query units where there is nothing left to
   clamp.
3. **Centring an overflowing flex container hides the top of it.** Content
   taller than the container overflows past *both* edges, and scroll offsets
   cannot go negative, so the top is unreachable — with or without
   `overflow-y: auto`. Use `items-center-safe` / `justify-center-safe` (CSS:
   `align-items: safe center`) on anything that both centres and can scroll.
4. **A full-screen canvas clamps its device-pixel ratio.** Fill rate scales with
   the *square* of the ratio: a 3× phone at native asks for nine times the
   pixels of a 1× screen, sixty times a second. 2D surfaces go through
   `gameSurfaceDpr()` (`lib/display-scale.ts`, capped at 2); 3D surfaces through
   the tier system (`lib/render/tier.ts`). Whatever sizes the drawing **buffer**
   must also be what the render transform uses — clamping one and not the other
   scales the whole scene. And never reassign `canvas.width` inside a rAF loop:
   it reallocates the backing store every frame, and if it was also what cleared
   your surface, add the explicit `clearRect` when you stop.

5. **A shell with text entry subtracts `--kb-inset`.** The same shell that
   cannot scroll also cannot reveal a focused field when the keyboard covers the
   bottom 40% of the screen — and `dvh` does not help, because it tracks the
   browser's toolbars, not the keyboard. So the engine moves the only thing it
   can, the visual viewport: it pans, and where the field still will not fit, it
   scales. Players report that as *the app zooming when they try to type*. Size
   such a surface `calc(100dvh - var(--kb-inset, 0px))` and mount
   `useKeyboardInset`; the shell then ends where the keyboard begins and there is
   nothing left to reveal. Two companions on the field itself: don't `autoFocus`
   on a coarse pointer (it raises the keyboard for something the player didn't
   ask for), and set `inputMode` so a digits-only field gets the numeric pad
   rather than a QWERTY that covers a third more of the screen.

6. **A screen that is a document scrolls the DOCUMENT.** `.app-viewport` is for
   a surface that never scrolls; reaching for it on a landing, a lobby or a
   results card and then putting a `flex-1 overflow-y-auto` box inside costs a
   phone about 110px of screen, permanently. Mobile Safari collapses its
   address/tab bars **only** for document scroll — an inner scroller leaves them
   at full height for the whole visit, which is why the feed, which flows in the
   document, feels taller than an app screen on the same phone. Use `.app-page`:
   `min-height: 100svh`, a flex column, no inner scroller, and the safe-area
   gutter at the end. The rule of thumb is what the screen *is*, not where it
   lives: if the content is a column you read top to bottom, it is a document,
   even inside a game. RMHType's room is both in turn — `.app-page` as a lobby,
   `.app-viewport` once the race starts — and resets `window.scrollY` across the
   switch, because a fixed viewport cannot undo a scroll offset it inherits.

Rules 2–4's checkable parts, plus the `dvh` fallback pair, are enforced by
`lib/__tests__/game-viewport-consistency.test.ts` (§13). Rules 1 and 5 are
manual — `absolute top-3 right-3` is correct inside a card and wrong on the
window, and whether a shell ever hosts a text field is a question about its
subtree, not about the rule that sizes it.

---

## 13. What is enforced automatically

Most of this document is convention. A slice of it is executable, and runs in
the normal suite (`pnpm exec vitest run`, gated by `web-ci.yml`):

- **`lib/__tests__/design-consistency.test.ts` — one tab-strip grammar.** A
  static source scan over `components/` + `app/routes/` that fails on:
  (1) `role="tablist"` outside `components/ui/liquid-tabs.tsx` and its
  documented allowlist; (2) an `aria-selected` element that also carries a
  `border-b`/`underline` marker; (3) an inline tab-capsule `layoutId` outside
  the sanctioned renderer; (4) the conditional accent-underline bar shape
  (`absolute` + `bottom-0` + hairline height + `bg-site-accent`). The
  allowlists are short and each entry is justified in the file — **new tab
  strips get no entry**. The test also asserts it scanned >200 files, so a
  broken walker can't make the rules vacuously pass.
  Its own docstring records the one rule it _can't_ automate: a role-less
  switcher that marks its active slot some other way (an accent pill, a
  segmented control, a `flex-1` button row with an active tint) still belongs
  on `LiquidTabs`. Reviewers catch those by eye.

  The same file carries four **site-tier** rules added 2026-08-01 (games and
  the `--app-*` apps are exempt, by design — Temple of Joy is supposed to be
  candlelit): **(5)** no raw Tailwind palette colour (`bg-red-600`,
  `text-zinc-500`, …) in site UI — a domain-fixed colour gets a scoped variable
  group like `--casino-*` instead; **(6)** no hardcoded radius
  (`rounded-lg`/`-xl`/`-2xl`) — `rounded-full` and `rounded-none` are shapes,
  not radii, and stay allowed; **(7)** no floating surface below L4 — an element
  that is positioned + stacked + edge-anchored and carries `.glass-fill` /
  `.glass-pane` / `bg-site-surface` is a dropdown with no backdrop blur;
  Plus two that run over the **whole tree**, because neither is a palette
  question — a game has no more claim to an exemption than a settings page:
  **(8)** no `transition-all` anywhere — name the properties;
  **(9)** no `tailwindcss-animate` class (`animate-in`, `fade-in-0`,
  `zoom-in-95`, `slide-in-from-*`, `fill-mode-*`): that plugin is a Tailwind v3
  thing this project does not have, so they compile to **zero rules** and the
  element never animates. 103 of them were in the source, on the command
  palette, the composer and every Radix open/close pair.
  The only allowlist entry across rules 5–9 is `/login`, for the third-party
  provider brand marks.
- **`lib/__tests__/game-viewport-consistency.test.ts` — the full-screen
  viewport contract (§12.1).** A static scan over the thirty game/app
  directories that fails on: (1) a scrolling flex/grid container that centres on
  the block axis without the `-safe` variant (the overflow-is-unreachable trap);
  (2) an `aspectRatio` beside a `maxWidth`/`maxHeight` clamp, or with both axes
  definite, either of which defeats the ratio; (3) a `height`/`min-height` of
  `100vh` with no `dvh`/`svh` line after it. Class strings are read from
  `className=` specifically, not from string literals generally — an apostrophe
  in prose opens a literal to a naive scanner and produces confident nonsense.
  Like the tab gate it asserts it scanned >200 files, so a broken walker can't
  make the rules pass vacuously. Its docstring records the three manual rules:
  safe-area insets on edge-pinned chrome, DPR clamping on full-screen canvases,
  and no per-frame canvas reallocation.
- **`lib/__tests__/filter-cost-budget.test.ts` — the SVG-filter cost budget.**
  Three rules, each a shipped ~15fps regression before it was a rule: no
  `filter: url(…)` on a full-viewport layer; no CSS filter function **chained
  after** a `url()` reference (measured: the `url()` alone ~0.4ms/frame, with the
  chain a 1s `setInterval` did not fire once in 10s); and no painted cursor /
  document-wide `cursor: none`. The rationale is in
  [`components/radial/README.md`](../components/radial/README.md).
- **`lib/__tests__/appearance-contrast.test.ts`** — `ensureReadableAccent()`
  keeps a custom accent from shipping an unreadable `--site-accent-fg` pair.
- **`lib/__tests__/color-vision-a11y.test.ts`** — the three moving parts of the
  colour-vision feature (§2.1) must agree: the mode list, a CSS palette block
  per mode, and the pre-paint script. Each fails silently on its own.
- **`lib/__tests__/theme-tokens.test.ts`** — the user-theme contract (§2): v1
  token maps still parse and upcast, `themeCssVars()` derives a complete
  `--site-*` set, and the publish gate's contrast lint holds.
- **`lib/__tests__/responsive-layout-contract.test.ts`** — the shared page
  masthead stays inside narrow viewports (the `min-w-0` on both title paths,
  and `wrapTitle` for headlines that must wrap rather than overflow).
- **`lib/__tests__/i18n-catalogs.test.ts` / `i18n-config.test.ts`** — catalog
  and namespace-registry integrity for §10.
- **`lib/__tests__/raf-loop-allowlist.test.ts`** — keeps rAF loops (the §7
  radial motion layer) to the sanctioned owners instead of one per feature.
  `useGlassLight.ts`, `useCardSheen.ts` and `useParallax.ts` were removed from
  the allowlist with the hooks themselves (§5.1.1).
- **`lib/__tests__/fluid.test.ts`** — the shared gesture maths of §0.5: the
  spring, the rubber band, projection/detents, and `rippleWave` (the globe's
  wave shape). Retune the feel there rather than locally, and it stays tested.
- **`pnpm lint`** — `eslint-plugin-jsx-a11y` at "warn"; the bar is no _new_
  warnings versus the base branch.

A green suite means you did not regress the enforced rules. It does not mean
the change looks right — §0.9 is still a human looking at three themes.
