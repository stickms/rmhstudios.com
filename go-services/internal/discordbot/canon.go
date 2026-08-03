// canon.go is the bot's single source of truth for what "liquid globe" means.
//
// Both model calls in the /liquid pipeline are briefed from the constants here:
// the image model gets liquidGlobeVisual (how the object must LOOK) and DeepSeek
// gets liquidGlobeLaws (the rules the object must be shown to OBEY). Keeping one
// copy is the point — a render brief and a rationale that drift apart would have
// the bot arguing with its own picture.
//
// These are prose summaries of the real design language, which lives in
// design.md (the statement), docs/design-language.md (the build manual, and the
// authority when the two disagree) and components/radial/README.md (the globe
// itself). When the language moves, move this file with it.
package discordbot

// liquidGlobeVisual is the render brief: the material, the palette, the optics
// and the geometry, written for a text-to-image model. Deliberately descriptive
// prose rather than a bullet list — it is a description of one object, and image
// models read it as one.
const liquidGlobeVisual = `The RMH Studios design language is "Radial Avant-Garde Glass", and its signature object is the liquid globe.

MATERIAL. Everything is Apple Liquid Glass used theatrically: layered translucent glass over one shared scene, never an opaque card with a drop shadow. Glass is a material with live optics, not a colour. Surfaces are lit, refractive and slightly noisy; you can see the scene continue through them.

PALETTE. Strict high-contrast monochrome. A near-white ground, ink-black line art, ink-black accents, hairline black borders. No hue anywhere — no blues, no purples, no warm tints, no colour gradients. Restraint in the palette is exactly what lets the optics be loud.

THE GLOBE. The object is a glass sphere. Suspended inside the glass is a wireframe cage — thin ink latitude rings and meridians, drawn as clean weightless line art, the equator marginally heavier than the rest. The cage is the structure held in the glass; small ink pins sit on the surface of the sphere.

LIGHT. One fixed scene light sits above the object and lights it alone. It paints a bright specular rim glint along the upper edge of the sphere and along every glass edge, plus a frosted bevel around the rim. The light never follows a cursor and there is no second light source.

SCENE. Behind the sphere: a faint monochrome aurora and a field of large soft grey blobs, drifting; concentric hairline rings centred behind the object. All of it is visible THROUGH the body of the glass, because the glass is translucent over that shared scene. Fine micro-noise across every glass surface.

MOTION, FROZEN. The globe answers being touched: one ripple crosses the surface as a bright crest, swelling the wireframe where it passes and dying as it converges on the far side. Capture that single instant.

COMPOSITION. One centred object, floating, weightless, no ground plane, no shadow cast on a floor, generous negative space, studio-clean.

FORBIDDEN. No text, no words, no letters, no numbers, no logos, no watermarks, no user-interface chrome, no photographic backdrop, no colour.`

// liquidGlobeLaws is the reviewer brief: the rules a surface has to obey to be
// native to this site. DeepSeek writes the adherence note against these, so they
// are phrased as laws with names an engineer on this repo would recognise.
const liquidGlobeLaws = `THE RULES OF THE RMH STUDIOS DESIGN LANGUAGE ("Radial Avant-Garde Glass")

1. THE TOKEN CONTRACT. Every colour, radius, font and shadow comes from one set of CSS custom properties (--site-*), consumed through utilities (bg-site-surface, rounded-site, shadow-site-sm). Nothing is hardcoded — no hex, no rounded-lg, no bespoke transition. A theme is a block of custom properties and nothing else, so a theme nobody on the team has seen must still render the object correctly.

2. INK TRACKS ITS SURFACE. A filled surface takes that surface's paired foreground (bg-site-accent pairs with text-site-accent-fg), never the page's ambient text colour.

3. GLASS IS AN ELEVATION SYSTEM, PICKED BY ROLE. L1 .glass-fill for repeated content (cards, rows, tiles — no blur, unlimited); L2 .glass-pane for singular panels; L3 .glass-chrome for persistent chrome; L4 .glass-overlay for anything floating (dialogs, popovers, menus — more opaque so text cannot ghost); .glass-inset for recessed fields. The tier class carries the material; an equivalent hand-rolled box carries none of it.

4. BUDGETS ARE REAL. Backdrop blur is per-element GPU work: at most ~8 blurred surfaces per viewport and ZERO on repeated list items. Nothing continuously animating may ever sit above a full-viewport backdrop-filter — Chromium re-blurs that layer in full whenever anything above it moves, measured at ~10fps, and the cost tracks the layer's area, so it is not tunable.

5. EVERY SURFACE ANSWERS THE LIGHT. One fixed scene light, a specular rim glint in every tier's border ring including L1, raised on hover. Glass that does not answer the light is tinted paper.

6. NOTHING TRACKS THE POINTER. Retired 2026-08-01. Gradient position and background position are paint properties; moving them repaints the element at pointer rate. Hover is a state, not a coordinate. Nothing writes an inherited custom property to <html> in a frame loop either — that invalidates the computed style of the whole document.

7. MOTION IS PHYSICS, NOT ANIMATION. Springs described by perceptual duration and bounce, carrying position AND velocity, so a gesture can be grabbed mid-flight and redirected. Response on pointerdown, never on click. Momentum crosses the lift. Intent is read from the projected resting position, not the current one. Limits rubber-band instead of stopping dead. The formulas live in one shared file (lib/fluid.ts) — a local second copy is a defect. Transform and opacity only.

8. DEGRADATION IS CENTRAL. High contrast (which is the ABSENCE of the material: opaque surfaces, no blur, 2px borders, no optics), reduced transparency, reduced motion, forced colors and a perf-lite device tier are all handled once, in the token layer and the glass classes. Legibility must never depend on an optic — text has to hold on the opaque surface token.

9. RADIAL, NOT HIERARCHICAL. Content radiates from a centre rather than sitting in a tree of pages. The shell owns the frame; navigating is a physical act.

10. ACCESSIBILITY IS PART OF THE MATERIAL. One global focus-visible treatment, native or Radix primitives, every string through i18n, and colour is never the only carrier of meaning — a state that reads as colour also reads as a glyph.`
