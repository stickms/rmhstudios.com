# Liquid glass v2 — shader glass, live clear interior, dough globe

Supersedes the first version of this plan (a Chromium-only SVG displacement tier on
top of frosted blur). Owner feedback on that build, 2026-10-22: it "doesn't look
photorealistic", the globe "morphs like a stretchy ball", frosted blur is not wanted
("I want Liquid Glass"), and Firefox is "shaky". All four are correct, and the first
two share a cause worth recording.

## What was wrong, and why

1. **No glass was visible.** Daylight is near-white panels on a near-white ground with
   a hairline border: nothing behind the glass for it to bend. A better material on
   an empty backdrop still reads as a white card.
2. **Frost is not liquid glass.** `backdrop-filter: blur()` is the opposite look: it
   destroys the detail that refraction needs. The references (liquidGL, ybouane/
   liquidglass) draw a _clear_ slab: curvature, edge refraction, Fresnel, specular.
3. **A Chromium-only tier cannot be "consistent".** `rdev/liquid-glass-react` states
   it itself: Safari/Firefox do not render `url()` in `backdrop-filter`. Any look that
   depends on it differs by engine. The two WebGL references avoid that by drawing
   the glass pixels in a shader from a captured page texture.
4. **The globe model has no space in it.** `lib/soft-body.ts` is three global springs
   (one tug vector, one pinch scalar, one stretch matrix) plus a single Gaussian at the
   grab point. It cannot remember _where_ material went, so it can only ever read as a
   stretchy ball.

## Decisions

### Glass: a shader slab with a live, clear interior

One shared WebGL context draws each glass surface into that surface's own canvas
(first child, behind the content). The shader models a real slab: an SDF bevel height
field → normals → Snell refraction of the page behind, chromatic dispersion, Fresnel,
key + cursor-light specular, a lit inner stroke, caustic edge falloff, and tap
ripples that perturb the normal.

**Live interior, refracted rim.** The shader only paints the bevel band (opaque at the
rim, fading to transparent inside the flat region). The interior is the real DOM
showing through, untouched. That is the correct answer to the reference libraries'
main weakness: a snapshot goes stale (video, feeds, typing), but refraction is only
visible where the surface curves, and there the staleness is a few pixels wide. It is
also physically honest: a flat sheet of glass does not bend what is behind it.

Tiers, same shader, same look:

| Tier         | Condition                                     | Result                                                   |
| ------------ | --------------------------------------------- | -------------------------------------------------------- |
| T2 refracted | WebGL + a fresh page snapshot                 | lit slab + real rim refraction                           |
| T1 lit       | WebGL, snapshot unavailable/stale/unsupported | lit slab (specular, Fresnel, rim) with no refraction     |
| T0 CSS       | no WebGL / context lost / reduced effects     | static CSS rim + tint (what ships today as the baseline) |

No tier depends on `backdrop-filter`, so engines cannot diverge on the primary look.
A frost-free adaptive tint (not a blur) carries legibility.

### Page snapshot

`modern-screenshot` (already a dependency, already battle-tested for the eversion in
Firefox/Safari/Chromium). Viewport-sized, glass surfaces excluded, DPR-capped,
idle/scroll-settle/mutation-debounced, never while hidden, one in flight, 700 ms
floor. Fixed glass over scrolling content samples the snapshot with the scroll delta
applied, so a scroll does not break the picture before the next capture lands.

### Tap field

Keep the native, additive, finite transform push (it composes with component
transforms) but **remove rotation**: rotating text is the most likely source of
Firefox's "shaky" text (sub-pixel re-raster/snap on every frame and a snap at the
end). Add the in-glass response: each tap becomes a ripple in the shader, so the
_surface_ of every nearby slab moves like water while the text stays put.

### Globe: a dough field

Replace the three-mode body with a simulated displacement field on the disc:

- a height field `h` split into an **elastic** layer (fast, damped, rebounds) and a
  **plastic** layer (slow creep, holds a dent for a while, relaxes gradually);
- a press pushes material out of the contact and **conserves volume** (the dent's
  mass reappears as a shoulder, enforced by projecting the field to zero mean);
- a drag **kneads**: semi-Lagrangian advection of the plastic layer along the
  finger, so material piles ahead and leaves a trough behind;
- in-plane displacement `u = -k ∇h` moves the cage, pins and silhouette; the field is
  a texture the coat shader reads for normals, so the lighting follows every dent.

It stays idle at rest (no frame work), and degrades by lowering the grid size.

### Make glass visible

An ambient, tokenised scene gradient behind the shell in Daylight so there is
something for the rim to bend, plus a lit inner stroke so a slab reads on any ground.

## Verification

Chromium (SwiftShader WebGL) and **real WebKit (WebKitGTK 2.52, WebGL 2)** over
WebDriver, with screenshots read and compared per state. **Gecko could not be tested
in this environment** (every host that serves Firefox binaries is blocked); the code
avoids the known Gecko hazards by construction (no `backdrop-filter` dependency, no
rotation, no `will-change` toggling, no float-texture requirements) and the PR says
so plainly.

## Non-goals

- Pixel-exact refraction of arbitrary live content. Interior stays real DOM.
- Refracting canvases/video interiors. Games and media are excluded surfaces.
- A WebGPU path (liquidGL has one; not needed, and WebGL is what Safari/Firefox ship).

## Outcome, and where the build departed from this plan

Everything above shipped, with these changes made after seeing real output:

1. **Panes do not refract by default.** Seen over a realistic page, a pane's own text sat
   inside its bevel and was drawn twice (live, and bent from the snapshot). Floating glass
   (`chrome`, `overlay`) has its subtree hidden from the snapshot, so it refracts cleanly;
   panes are lit slabs unless they opt in with `data-liquid-glass="refract"`.
2. **Hide, never exclude, in the snapshot.** The first capture excluded floating glass. That
   removed a sticky header from layout, the whole page reflowed up by its height, and every
   rim refracted a picture of a different page. The capture gained an additive `hide`
   option (keep the box, drop the paint and subtree); `exclude` is used only for the engine's
   own canvases.
3. **Shading, not only light.** Glass on the default (monochrome, white) theme is invisible
   if the shader only adds white. The slab now draws a dark refraction line at the rim and a
   denser far side in the theme's ink. (Two sign errors in "facing the light" were caught by
   looking at the render: the first version looked pressed in rather than raised.)
4. **The globe also refracts the page**, not only the dough. This was in the owner's
   request ("the same effect") but not in the first version of this plan. The lens is driven
   by the surface normal: the two-surface refraction it began with has a total-internal-
   reflection cutoff that drew a hard ring on the ball.
5. **The tap push lost its rotation** and the cursor-light DOM carrier is no longer created
   on shader surfaces (the two most likely sources of Firefox shimmer that I could remove
   without running Firefox).
6. **Pixel-level WebKit parity**, not just "it compiles", was established by reading back GL
   pixels in both engines. A WebKit screenshot that looked different turned out to be a
   WebGL canvas not yet presented (see the contract's note).

### Not verified

Firefox/Gecko (no download possible in the build sandbox), real GPUs, iOS and Android.
The Firefox "shaky" report could not be reproduced here; the changes above are the
hypotheses, chosen because each is a documented Gecko hazard, not because the shake was seen.
