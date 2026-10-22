# Liquid glass: implementation contract

This document supersedes the former lens, sheen and cursor-retirement notes in
the design guide. The previous material implementation and inactive SVG optical
filters were removed, not enabled again. The October 21 implementation plan is
[here](plans/2026-10-21-liquid-glass-system.md).

## Ownership

| Concern                                    | Implementation                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| Site material and fallbacks                | `app/liquid-glass.css`, imported by `globals.css` in both style tiers               |
| App controls, panels and fields            | `components/shared/app-theme.css`                                                   |
| One document interaction service           | `lib/liquid/runtime.ts`, mounted by `hooks/useLiquidInteractions.ts` in `Providers` |
| Wave timing and attenuation                | `lib/liquid/interaction.ts`                                                         |
| Contact indentation and shoulder           | `lib/soft-body.ts`                                                                  |
| Lazy dielectric globe coat                 | `components/radial/jelly-glass.ts`                                                  |
| Globe projection, cage, pins and picking   | `components/radial/LiquidGlobe.tsx`                                                 |
| Captured-page transmission during eversion | `lib/eversion/gl/shaders.ts`                                                        |

`GlassFilter` now supplies only the SVG goo filter for existing tab capsules;
it does not implement any glass optics. `GlassPane` and the historical
`refract`/`liquid` flags remain compatible component APIs. All panes use the new
material, without the former displacement-map compositing or sheen loop.

## Material coverage

Use the public role classes; they are compatibility names, not old renderers:

| Role                                | Class           | Work per surface                                                         |
| ----------------------------------- | --------------- | ------------------------------------------------------------------------ |
| Repeated cards, feed entries, tiles | `glass-fill`    | Translucent tint, clear coat, lit edge; **no blur**                      |
| Singular panel                      | `glass-pane`    | Native backdrop blur/saturation, tint and rim                            |
| Persistent chrome                   | `glass-chrome`  | Native backdrop sampler; fixed asides keep the viewport containing block |
| Floating UI                         | `glass-overlay` | More opaque tint, bounded width and readable foreground                  |
| Fields                              | `glass-inset`   | Flush fill and fine highlight                                            |

Shared buttons receive a clear coat without adding backdrop samplers. App
surfaces using the existing `bg-(--app-surface)` utility receive the same
material through the app adapter. `AppHeader` explicitly declares a material
surface. New custom app panels may use `data-liquid-surface`; give them an
app surface token and an appropriate radius. This reaches existing cards and
menus through their shared material intent without changing game canvases,
media, text editors or charts into decorative panels.

Keep layout in components: CSS material does not prescribe grids, spacing or
content order. Keep palettes in `--site-*` / `--app-*` tokens. Do not add native
backdrop blur to repeated rows. The established budget remains at most eight
blurred surfaces per viewport. Never put an animated subtree over a
viewport-sized backdrop filter.

## Input and lifecycle

The service installs one set of delegated pointer listeners, one shared
IntersectionObserver and one shared MutationObserver. New routes, virtualised
feed items and portal content join automatically. Invisible surfaces do not
need per-input layout reads. Discovery reads at most 128 visible candidates;
at most eight non-nested surfaces animate, with at most three impulses each.
A fourth tap folds the displaced wave into a finite recovery preserving its
position, velocity and acceleration. Replanning uses the native animation's
actual phase, including interruptions before its first displayed frame.

An impulse starts on primary pointer-down and propagates at 900 CSS px/s to
420px, with quadratic distance attenuation, a damped oscillation and an exact
finite lifetime. On each input the runtime samples 97 bounded keyframes and
hands the motion to the browser's native animation engine. There is no
JavaScript frame loop for the neighbouring surfaces. Displacement sums are clamped to 6px and rotation to 0.45°.
Additive native `transform` keyframes compose with component transforms and
the press layer's independent `scale`. A single transform effect provides consistent composition across engines.
Existing independent transforms are not claimed. Inline
transforms and layer hints are left intact; finite animations are cancelled on
settling and teardown. Repeated inputs replan the combined field from its current phase.

Pointer travel beyond 10px retargets pending decorative impulses into a smooth
360ms recovery. The wave attack and tail have zero velocity/acceleration at
their endpoints; cancellation recovers from the current pose rather than snapping. Scroll, resize,
pointer cancellation, lost visibility and unmount clear them too. Text fields,
editable content, disabled controls, fixed/sticky containers and the globe's
own gesture stage are excluded. A tap on surrounding empty space still excites
nearby eligible surfaces. Keyboard activation and button actions remain native.

The light uses one active `aria-hidden`, noninteractive, clipped child carrier
and at most one retiring carrier for a bounded 100ms crossfade.
Its static 180px radial texture moves by transform. There is no replacement
cursor, animated gradient centre, per-card hook, React render per frame,
document-level animated variable, or persistent frame loop at rest.

```tsx
// Whole gesture subtree: game controls, drag handles, continuously moving HUD.
<section data-liquid-motion="off">…</section>

// An intentional alternate material. Layout and interaction remain the caller's.
<div className="glass-pane" data-liquid-material="off">…</div>

// A custom app panel, using the app token contract.
<section data-liquid-surface className="rounded-(--app-radius) bg-(--app-surface)">…</section>
```

Avoid per-frame geometry reads or mutation of inherited root properties. New
input effects must extend the shared runtime, rather than install another
pointer listener in every card. Changing the bounds requires updating tests
and measuring dense feed interaction, not simply raising the cap.

## Globe and optical limits

The navigator retains semantic links and independent navigation coordinates.
Its modal soft body now includes a local normal indentation and a compensating
Gaussian shoulder. The normal field integrates to zero on the tangent plane;
the global stretch separately preserves modal volume. This is a reduced-order
approximation, not a finite-element simulation. Cage and pin paint sample the
same field, while picking and dwell continue to use undeformed coordinates.

The lazy globe coat uses Snell transmission (IOR 1.45),
Schlick Fresnel reflection, studio highlights and a contact-dependent normal.
One page-cached context is reused across hub mounts. DPR is capped at 1.5;
the canvas detaches on unmount, issues no draws at rest and yields during
eversion. Context loss leaves the CSS rim and functional navigation intact. The procedural environment models reflected
light, not a screenshot of the surrounding page. During eversion, the existing
captured-page textures provide real source imagery for a restrained
normal-driven transmission offset. It vanishes at flat endpoints and avoids
projection cuts; there is no extra capture or draw pass.

Native CSS cannot universally supply a live DOM backdrop texture to arbitrary
WebGL shaders. Ordinary panels therefore use real native backdrop frost and a
clear-coat approximation. Do not describe their specular edge as pixel-exact
page refraction. Blanket DOM snapshot renderers were rejected because they
duplicate content, lag dynamic media, interact with CORS, and impose stacking
constraints on a live feed and game platform. No external library code is copied.

## Compatibility and access

| Capability/preference                               | Behaviour                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| Modern Chromium, Firefox, Safari/WebKit             | Native live backdrop material; fine-pointer light and tap field             |
| No native backdrop support                          | Opaque readable ground with static rim                                      |
| No WebGL / shader failure / context loss            | CSS globe rim; navigation remains functional                                |
| Reduced motion, OS or account                       | No field or cursor light; globe deformation uses the shared preference hook |
| Reduced transparency, forced colours, high contrast | Solid material; decorative light and globe coat disabled                    |
| `perf-lite`                                         | No cursor light/field or globe coat; existing blur caps still apply         |
| Touch                                               | No cursor light; bounded taps, cancelled on scroll/drag                     |
| Print / hidden document                             | Decorative layers omitted / work cancelled                                  |

Keep Safari's existing compositor safeguards and safe-area handling. Do not
infer native GPU, energy or assistive-technology results from headless tests.

## Validation commands

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm check:consistency
pnpm build
CHROMIUM_PATH=/usr/bin/chromium node testing/e2e/liquid-glass.mjs
LIQUID_BROWSER=firefox node testing/e2e/liquid-glass.mjs
LIQUID_BROWSER=webkit node testing/e2e/liquid-glass.mjs
CHROMIUM_PATH=/usr/bin/chromium node testing/e2e/eversion-gl.mjs
```

The browser contract uses real DOM input and compiled shaders, including
off-target displacement, finite settling, light cleanup, live preferences,
text entry, native actions, dynamic surfaces, opt-outs and contact highlight
changes. It writes screenshots to the OS temporary directory. The eversion
suite checks shader compilation, geometry parity and flat-page endpoints.
Actual execution results are recorded in the pull request; a listed command is
not itself a passing result. Native iOS/Android/macOS hardware testing remains
separate from browser-engine testing.

## Integration with the concurrent globe update

Main's October 21 globe/motion update was integrated before delivery. The lazy
`jelly-glass` renderer is the single coat owner; a second prototype renderer was
removed. Contact normals use the same footprint constant as `SoftBody.depth`,
and the coat now follows OS/account preferences and theme changes live. The
back-face lens projection, ripple lighting, page-cached context, CSS spring
easings and navigation/prefetch changes from main are retained.
