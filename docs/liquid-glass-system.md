# Liquid glass: implementation contract

Current as of 2026-10-22. This contract supersedes the earlier blur, accent-tinted coat,
control eversion and tap-wave implementations.

Glass is clear. Its appearance comes from the scene behind it, wavelength-dependent
refraction at its bevel, Fresnel reflections and restrained neutral highlights. The
material does not take the accent color as pigment. Accents remain on explicit actions,
selected states and status indicators. No glass role uses `backdrop-filter`.

## Roles and rendering budget

| Surface                                         | Material                                    | Snapshot refraction                 |
| ----------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| `glass-fill`, `glass-inset`, buttons and fields | CSS clear coat and hairline                 | No                                  |
| `glass-pane`, `app-glass`                       | Bounded shader bevel with live DOM interior | Explicit opt-in only                |
| `glass-chrome`, `glass-overlay`                 | Bounded shader bevel with live DOM interior | Yes, when a settled snapshot exists |
| `[data-liquid-glass]`                           | Explicit shader opt-in                      | With `="refract"`                   |

A single `GlassRenderer` owns one WebGL2 context, program and scene texture. It copies
finished draws to per-surface 2D canvases behind the live content. Only eight visible
surfaces are admitted, ordered overlay → chrome → pane → other explicit opt-ins.
Repeated cards and small controls never compete for that budget by default. Canvases
are excluded from discovery so an engine-owned canvas cannot adopt itself recursively.
`data-liquid-material="off"` and `data-liquid-glass="off"` opt out.

Surfaces smaller than 16px or larger than 640,000 CSS px² keep the CSS material.
Backing scale is capped at 2, or 1.5 above 250,000 CSS px². The shared framebuffer grows
only when necessary. Bevels are 3–12 CSS px; optical thickness is 0.6 times the bevel.
The interior remains transparent so live text, video and input never acquire a stale
second image. Content panes do not sample their own captured text.

## Interaction and layout

Clicks and taps never emit ripples, propagate waves to nearby UI, or change surrounding
layout. A fine pointer can move a restrained reflected light and optically tilt the
bevel; text and hit areas remain fixed. Reduced motion and coarse pointers disable
that movement. The fallback runtime moves a decorative leaf below the content.
No component installs its own cursor loop, animates root properties or reads geometry
for every individual pointer event.

The renderer requests frames only while light/tilt or snapshot opacity settles, or when
a surface's size/theme/position changes. It has no continuous resting loop. Scroll
immediately clears stale snapshot refraction and cursor lighting; settled capture
restores the rim. Geometry reads are batched before canvas writes.

Controls use `--site-control-radius`, which follows `--site-radius-sm`. Cards, panes
and dialogs use `--site-radius`. Avatars, circular icons, badges, the hub and the globe
retain their explicit circular shapes. Full-width mobile navigation strips keep square
outer edges. Loading buttons reserve both label states. Route placeholders use the
shell's actual column measure without adding another sidebar gutter.

## Snapshot lifecycle

`scene.ts` uses the existing time-sliced `captureViewport` implementation. Requests
coalesce for 260ms, are separated by at least 1.5 seconds, and run one at a time during
idle time. Mutations settle for 1.6 seconds. No capture runs while scrolling, hidden,
under the open globe or on a low-end/preference fallback. Three consecutive failures
stop attempts until the next route. Captures exclude floating chrome and overlay UI.
`scene-store.ts` shares the resulting scene with the globe instead of duplicating work.

Floating glass only refracts the covered region of that snapshot. Stale video or motion
can appear at the narrow rim until the next settled capture; the interior is always live.
Without a usable snapshot the surface retains CSS transmission and lit edges.

## Globe and navigation

`jelly-glass.ts` and the eversion shader share studio reflections and specular response
through `lib/liquid/globe-material.ts`. The neutral liquid globe transmits the captured
page and deforms during direct manipulation. Taps do not launch waves. During eversion,
the liquid surface flattens and turns inside out; pages do not become a matte texture
mapped onto a diffuse sphere. Ordinary navigation has no eversion or ripple delay.
Legacy `all` preferences resolve to `globe`; only destinations chosen in the open globe
use the transition. Interruptions preserve the running animation's pose and derivatives.

`lib/liquid/optics.ts` uses the SCHOTT N-BK7 Sellmeier coefficients at three spectral
lines and independent Snell rays for RGB dispersion. This models refraction and
reflection; it does not claim wave-optics diffraction or ray-traced live page content.

## Fallbacks and ownership

| Condition                                                                | Result                                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| No WebGL2 / context loss / outside budget                                | Complete CSS clear coat and border                                               |
| Reduced motion                                                           | Static material, no cursor movement or globe transition                          |
| Touch                                                                    | Static pane material; direct globe manipulation remains available                |
| Reduced transparency / high contrast / forced colors / perf-lite / print | No shader canvases; readable fallback surfaces                                   |
| Hidden tab                                                               | Frames stop; teardown releases observers, timers, canvases and context resources |

Site CSS is `app/liquid-glass.css`; app-token adaptation is `components/shared/app-theme.css`.
`hooks/useLiquidInteractions.ts` mounts the document services. `glass/engine.ts` owns
admission, observation and the shared frame; `shader.ts` owns slab optics; `renderer.ts`
owns GL and canvas copies; `policy.ts` owns tested budget, geometry and light decisions.
`lib/liquid/runtime.ts` supplies bounded fallback cursor light. Hover normalization in
`hover-css.ts` permits quiet color feedback while preventing host movement and expensive
hover shadows/filters. Focus, selected and disabled states remain explicit.

Validation: the design consistency suites, `lib/liquid/glass/__tests__`, and
`testing/e2e/glass-slab.mjs` exercise the contract. Browser review must include narrow
mobile, all three site themes, reduced motion, keyboard focus and interrupted navigation.
