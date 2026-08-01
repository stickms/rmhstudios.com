# The RMH Studios Design Language

**Radial Avant-Garde Glass.**

This document is the _statement of the language_ — what the design is, why it is
that way, and the laws that hold it together. It is written to be read start to
finish by anyone deciding how something should look or behave.

It is not the build manual. Two companions carry that load, and they are the
authority whenever an exact value, class name or API is in question:

| Document                                               | Answers                                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [`docs/design-language.md`](docs/design-language.md)   | "What exactly do I type?" — the token tables, the primitive catalog, the per-component rules, the definition of done. |
| [`docs/page-consistency.md`](docs/page-consistency.md) | "Does this page fit?" — the per-page checklist, with code.                                                            |

Where this file and those disagree, **they win** — and the disagreement is a bug
in this file. Everything here is deliberately kept to the durable layer:
principles, structure and rationale, not values that move.

---

## 1. The two ideas

The language is one bet made twice: that an interface can be a **place** rather
than a document, and that it can be made of a **material** rather than of paint.

### Radial — the site is a place you move around in

Content does not sit in a hierarchy of pages; it **radiates from a centre**. The
RMH mark is that centre, and it is always on screen.

- The home feed is a **wheel** — cards on the document's own scroll, raked onto
  a shallow cylinder as they cross the focus line.
- Navigation is a **globe**. Tap the fixed orb and it flies to the middle of the
  screen, swells, and dissolves into a glass sphere with every destination
  pinned to it. You _turn_ it to find where you want to go, hold on a
  destination, and let go to travel.
- Behind everything, a fixed **ring backdrop**, a drifting field of soft blobs
  and a slowly-breathing **aurora canvas** keep the surface feeling continuous —
  one scene, not a stack of screens. It moves on its own, ambiently; it does not
  follow you (§3).

The consequence worth internalising: **navigating is a physical act here.** That
raises the bar on the physics (§4) and it means chrome is never allowed to be
inert.

### Avant-garde glass — surfaces are a material, not a colour

The material is Apple's Liquid Glass, used _theatrically_ rather than literally:
layered translucent glass with **live optics** — a specular rim glint on every
tier, frosted edge bevels, micro-noise, a slowly drifting aurora canvas, and
travelling sheens that ride the compositor.

The distinction that matters: a surface here is **translucent over a shared
scene**, not an opaque card with a shadow. Every pane samples the same drifting
aurora, so panes at different depths relate to each other automatically, and a
theme change is a change of _light_, not a repaint of a thousand components.

The default palette is strict **high-contrast monochrome** — white canvas, ink
text, ink accent, hairline black borders — rendered as glass. Restraint in the
palette is what lets the optics be loud.

---

## 2. The one contract everything rests on

**A single set of CSS custom properties (`--site-*`), redefined by every theme.**

Components never write a colour, radius, font or shadow. They consume the
contract through Tailwind utilities (`bg-site-surface`, `text-site-text-muted`,
`rounded-site`, `shadow-site-sm`, …). A theme is therefore a block of custom
properties and nothing else — no per-theme component overrides, no `[data-slot]`
special cases.

Three laws follow, and almost every visual defect in this codebase's history is a
violation of one of them:

1. **Nothing is hardcoded.** No hex, no `rounded-lg`, no bespoke
   `transition: 200ms ease`. A theme the author never opened must still look
   deliberate.
2. **Ink tracks its surface.** A filled surface takes _that surface's_ paired
   foreground (`bg-site-accent` → `text-site-accent-fg`), never the page's
   ambient text colour. `globals.css` supplies the pairings by default through
   zero-specificity rules, and a custom accent is contrast-checked at runtime —
   but hardcoding `text-white` on a themed surface defeats both.
3. **Degradation is central, not per-component.** High contrast, reduced
   transparency, reduced motion, `perf-lite` and forced colors are handled once,
   in the token layer and the glass classes. A component that branches on them by
   hand is a bug. **Legibility must never depend on an optic** — text has to hold
   on `--site-surface-opaque`.

**When the system does not have what you need, extend the system.** Add the
token, the variant, the primitive — and say so in the commit. Solving it locally
with a magic number is how five apps ended up with five focus rings.

---

## 3. The material: an elevation system

Glass is **opt-in per element, by role**, through explicit classes. Pick by what
the surface _is_, not by how you want it to look — the tier decides the cost.

| Tier   | Class            | For                                                   | Cost                                   |
| ------ | ---------------- | ----------------------------------------------------- | -------------------------------------- |
| **L1** | `.glass-fill`    | Repeated content: cards, rows, tiles                  | No blur. Unlimited.                    |
| **L2** | `.glass-pane`    | Singular panels: heroes, composers, settings sections | Blur. Budgeted.                        |
| **L3** | `.glass-chrome`  | Persistent chrome: sticky headers, rails, docks       | Blur; condenses on scroll.             |
| **L4** | `.glass-overlay` | Floating UI: dialogs, popovers, menus, toasts         | Blur; more opaque so text can't ghost. |
| —      | `.glass-inset`   | Recessed wells: inputs, search fields                 | A hole in the sheet.                   |
| —      | `.glass-scrim`   | Dialog and drawer backdrops                           | —                                      |

Modifiers (`.glass-interactive`, `.glass-refract`, `.glass-liquid`,
`.glass-sheen-hover`, …) layer on top and each carries a per-page budget. They
are **signature moments, not defaults**.

Three properties of this system are load-bearing:

**Every surface answers the light.** One scene light — a fixed "sun" above the
page — lights every glass surface at once, and each paints a specular rim glint
in its own border ring. This includes L1: the tier the site is mostly _made_ of
rests at an ambient glint strength that hover raises to full. Glass that does not
answer the light is just tinted paper.

**The light does not follow the cursor, and neither does anything else.** Every
pointer-tracked effect the site once had — the diffuse hotspot on hovered glass,
the aurora's pointer parallax, the ring backdrop's, the per-card sheens and
tilts — was retired in one pass, because gradient position and background
position are _paint_ properties: moving them repaints the whole element, at
pointer rate, during exactly the gestures with a frame budget to defend. Hover is
now a **state**, not a coordinate. If a cursor-tracked specular is ever wanted
back it belongs on a compositor-friendly carrier (a transform-translated child
layer), behind the same tier switches as the rest of the optics. Two things
survive, because neither is a cursor: the opt-in device-tilt aurora on touch, and
the device-attitude "inspect this object" control, which also has a drag and
keyboard path.

**A tier class is not decoration you can inline.** `bg-site-surface border
border-site-border rounded-site shadow-site-sm` renders the same _box_ as
`.glass-fill` and none of its _material_ — no noise, no glint, and nothing for
the degradation tiers to switch off. Reach for the tier.

**Budgets are real.** Backdrop blur is per-element GPU work: at most ~8 blurred
surfaces per viewport, and **zero on repeated list items**. This is why L1 exists
and why the feed is built from it.

### The one rule with teeth

**Nothing may sit above a full-viewport `backdrop-filter`.** Chromium re-blurs
such a layer _in full_ whenever anything above it moves — measured in this exact
stack at ~10fps, with the cost tracking the blurred layer's _area_, not the blur
radius or the damage rect. It is not tunable. The navigation globe animates
continuously, so the overlay it sits on is a **painted veil**, not frost. Related
rules (never `filter: url(…)` on a full-viewport layer; never chain a CSS filter
after a `url()` reference; never paint your own cursor) are CI-gated.

---

## 4. Motion is physics, not animation

The site's motion answers to Apple's _Designing Fluid Interfaces_ (WWDC 2018
§803): the "magical" feel of native gestures is not decoration but a handful of
mechanics, each with a formula. Those formulas live in **[`lib/fluid.ts`](lib/fluid.ts)**,
unit-tested, and are shared by every gesture surface. **Do not re-derive them
locally** — a second copy is how two surfaces start disagreeing about what this
site feels like.

| Principle                              | What it means here                                                                                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Instantaneous response**             | A surface reacts on `pointerdown` — never on `click`, never after a recognition delay.                                                                                                                                                        |
| **Interruptible and redirectable**     | Motion is a spring carrying position _and velocity_, so grabbing something mid-flight retargets it from where it is and how fast it is going. A duration tween structurally cannot do this, and that is most of what makes web UI feel stiff. |
| **Momentum crosses the lift**          | The velocity the finger left with is handed to the animation, not discarded.                                                                                                                                                                  |
| **Intent is read from the projection** | "Where would this throw come to rest?" — not "is it past the line right now?". This is why a fast flick dismisses a sheet that has barely moved.                                                                                              |
| **Limits push back**                   | Past an edge, travel is damped asymptotically instead of stopping dead, so the surface stays alive under the finger.                                                                                                                          |
| **Speed is evidence**                  | A gesture's speed says how sure the user was. Use it to _shorten_ a confirmation, never to skip one — the floor still has to be long enough to abandon.                                                                                       |

**Springs are described by perceptual duration + bounce**, never by hand-tuned
stiffness, so one preset settles in the same _perceived_ time whether it travels
4px or 400px. The imperative tier (`SPRINGS` in `lib/fluid.ts`) and the
declarative tier (`APPLE_SPRING` in `lib/motion.ts`) share one vocabulary, and a
test asserts they cannot drift apart.

**Tween or spring:** tweens for state changes with no gesture behind them
(cross-fades, reveals, colour shifts); springs for anything the user _acts on_.

**Surfaces answer being touched.** The clearest statement of this is the
navigation globe: poke it and a wave spreads out from the exact point you
touched, swelling the wireframe as it crosses, dying as it converges on the far
side. The impact is recorded in the _globe's own_ coordinates, so the wave is a
mark on the ball — keep dragging and it travels with the surface it is crossing.
The wave's shape lives in `lib/fluid.ts` beside the spring and the rubber band,
for the same reason they do.

### The costs that constrain all of it

Motion here is `transform`/`opacity` only, and four measured findings shape how
it is written — none of which looked like a performance bug in the source:

1. **A rotated 3D transform is the slow path for an antialiased curve.** Nothing
   rasterised can be reused between frames. The globe's wireframe is one canvas
   for this reason; as thirteen elements it halved the frame rate of the whole
   gesture.
2. **Reading scroll offsets in a `requestAnimationFrame` forces a synchronous
   layout** of the whole document, every frame. Read them in the scroll _event_,
   where the layout is still clean — or don't read them at all.
3. **Writing an inherited custom property to `<html>` invalidates the computed
   style of the entire document.** Custom properties have no invalidation sets,
   and this site declares ~250 tokens on `:root`, so one such write per frame is
   a whole-document restyle per frame. It was the single largest cost the site
   ever had — globe drag measured 4.4fps and 624ms of input latency against
   2.8ms of work inside the globe's own loop. Write to the element that _reads_
   the value, never to the root.
4. **Writing a style that is not changing still invalidates it.** Compare before
   you write.
5. **A gradient's position is paint, not composite.** Nothing slides a gradient;
   moving one re-rasterises the whole box. Travelling light is a fixed layer
   moved by `transform`.

**Reduced motion stands the whole layer down** — presses don't spring, settles
snap, ambient drift stops, the globe doesn't ripple. Direct manipulation that
remains _useful_ (turning the globe) keeps working. This is the rule, not a
courtesy: an unrequested full-surface animation is exactly what the preference is
asking not to be shown.

---

## 5. Layout: the shell owns the frame

Every standard page renders inside one shell. **Pages never add their own
sidebars, navigation, or page frame** — and there is exactly one `<main>`
landmark, which the shell owns.

The frame is **responsive by track count**: one column on mobile, plus a
navigation rail from 1120px, plus a live rail from 1440px. They are **grid
tracks, not overlays**, so a rail structurally cannot ride over the content; each
is removed from the grid entirely below the width that affords it; and the whole
frame is capped, because filling a 34-inch window means filling it with _content_,
not stretching one reading column across it.

Three habits follow:

- **Content flows on the document's own scroll.** No inner scroll region for a
  column you read top to bottom — that is the only way mobile Safari collapses
  its toolbars. Page-level sticky chrome is unpinned so every route flows like
  the feed.
- **Overlap is made structurally impossible where it can be**, not checked by
  eye: grid tracks, `minmax(0, …)` on every track, `min-width: 0` on every flex
  child, line clamps and `overflow-wrap` on every slot that takes user text.
  What is left — the fixed chrome — is governed by explicit arithmetic (a shared
  floating-control lane, a corner reserve, safe-area insets added by each
  bottom-anchored element).
- **Rhythm comes from tokens.** Gutters, section gaps, panel padding and sticky
  offsets are named; repeated content floats as spaced cards, and hairline
  dividers live _inside_ container cards, never between page-level sections.

Full-screen experiences — games, login, legal pages — live outside the shell
deliberately and own their own look.

---

## 6. Themes are tints of one material

A theme is a `.style-<id>` class on `<html>` and a block of `--site-*` values.
That is the entire mechanism. Adding one is a CSS block plus a catalog entry;
nothing else changes.

- The **default** is strict monochrome glass. Others are the same material in
  their own palette over their own aurora.
- **High contrast is not a theme variant — it is the absence of the material**:
  opaque surfaces, no blur, 2px borders, no optics. Everything must survive it.
- On top of any theme, an **accent preset** overrides only the accent tokens.
- A **glass clarity** setting scales how much scene shows through, from opaque
  (the manual equivalent of the OS reduced-transparency preference) to clear.
- **User themes** are the same idea taken to a marketplace: a theme is colours
  plus a few scalar knobs, from which the full contract is _derived_ — so every
  user theme is a correct glass tint and inherits future optics upgrades for
  free.

The test of the contract: a purchased theme nobody on the team has seen must
render every one of ~860 components correctly, because none of them knows it
exists.

---

## 7. Accessibility is part of the material

Not a pass at the end — the same central layer that makes theming work is what
makes the accessible variants work.

- **Focus is global and undoubled.** One `:focus-visible` treatment covers every
  interactive element; controls that draw their own opt out explicitly. Don't add
  a second ring on top of the one you already have.
- **Reach for the native element or the Radix-based primitive** before
  hand-rolling a widget. Icon-only controls are named; decorative icons are
  hidden.
- **Every string goes through i18n** with an English default. 16 locales ship,
  and RTL (`ar`, `ur`) is first-class — logical spacing, mirrored directional
  icons, `dir` set before paint.
- **Three preference switches and a device tier degrade the material centrally**:
  reduced motion, reduced transparency, high contrast, forced colors, plus a
  `perf-lite` tier derived from conservative device facts (not a measured-fps
  probe, which would restyle the page under the user for reasons they can't see).
- **Comfort is a settings suite, not a theme.** On top of whichever theme is
  active, a visitor sets text size, density, a dyslexia-friendly face, an
  in-account reduced-motion switch, glass clarity, tilt effects, and a
  **colour-vision mode**. Each is one more layer of the same token contract, so
  no component knows it happened.
- **Colour is never the only carrier of meaning.** Roughly 8% of men have some
  colour-vision deficiency, and on this site colour _is_ state — win/loss,
  up/down, rarity, health, moderation status. The colour-vision modes retint the
  three semantic tokens to a palette that stays separable under each deficiency,
  and status badges pair every variant with a distinct glyph. The retint alone
  would not be enough.
- **Test in at least three themes at two widths, once with reduced motion on.**
  That is the floor.

---

## 8. There is a second tier, and it is separate on purpose

Full-screen apps and games do not use `--site-*`. They use a parallel `--app-*`
contract with its own shell, header, toaster and connection status.

This is deliberate: an app owns the whole viewport, paints its own backdrop, and
has no shared aurora to sample — so a translucent site surface there just greys
out over whatever the game is drawing. The two contracts are structurally
separate so neither can quietly leak into the other.

That tier has its own hard-won viewport rules — edge-pinned controls add safe-area
insets, `aspect-ratio` never sits beside a `max-*` clamp, anything that centres
_and_ scrolls uses the safe alignment variants, a full-screen canvas clamps its
DPR and never reallocates itself per frame, and a screen you read top to bottom
scrolls the document. Each was a shipped bug before it was a rule; the first four
are CI-gated.

---

## 9. What is enforced, and what isn't

Most of this language is convention. A slice of it executes in CI:

- **One tab-strip grammar.** Tab strips are the shared renderer — no hand-rolled
  `role="tablist"`, no private `layoutId` capsule, no active-state underline. A
  source scan fails the build on each of those shapes.
- **The token contract, on the site tier.** No raw Tailwind palette colour
  (`bg-red-600`), no hardcoded radius (`rounded-lg`/`-xl`/`-2xl`). A
  domain-fixed palette — a playing card, a roulette pocket — gets its own scoped
  variable group instead. Games and the `--app-*` apps are exempt by design.
- **Floating UI is L4.** A positioned, stacked, edge-anchored element carrying a
  tier below `.glass-overlay` is a dropdown with no backdrop blur, and fails.
- **Motion that exists.** No `transition-all` anywhere (it animates layout
  properties nobody asked for), and no `tailwindcss-animate` class — that plugin
  is not installed, so `animate-in`/`fade-in-0`/`zoom-in-95` compile to zero
  rules and the element simply never animates. Both run over the whole tree,
  games included: neither is a palette question.
- **The full-screen viewport contract** (the four static rules above).
- **Filter-cost rules** (no full-viewport `url()` filters, no filter chained
  after a `url()` reference, no painted cursor).
- **rAF-loop ownership** — frame loops belong to a sanctioned set of owners, not
  one per feature.
- **Accent contrast**, **user-theme token integrity**, **colour-vision mode
  integrity** (a mode with no CSS block is a setting that appears to work and
  changes nothing), **i18n catalog integrity**, and **no new lint warnings
  against the base branch**.

A green suite means you did not regress the enforced rules. **It does not mean
the change looks right.** The last check is still a human looking at it in three
themes.

---

## 10. The short version

If you remember six things:

1. **Consume the token contract; never hardcode.** Extend the system when it
   falls short, and say so.
2. **Reach for the primitive and the tier class.** A second copy of something
   shared is the most common defect in this repo's history.
3. **Glass is a material with a budget.** Pick the tier by role. Nothing
   continuously animating may sit above a full-viewport blur.
4. **Motion is shared physics, and it composites.** Springs with velocity,
   intent read from projection, response on pointer-down; the formulas live in
   one file. `transform`/`opacity` only — nothing tracks the pointer, and
   nothing writes a custom property to `<html>` per frame.
5. **Degrade centrally.** High contrast, reduced motion, reduced transparency and
   `perf-lite` are the token layer's job — and legibility may never depend on an
   optic.
6. **Look at it.** Three themes, two widths, reduced motion once.
