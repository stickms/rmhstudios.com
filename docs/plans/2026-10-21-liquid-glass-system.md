# Liquid glass system implementation plan

## Goal and scope

Replace the site's material language coherently through shared foundations,
including the site shell, feed, forms, dialogs, menus, navigation, full-screen
app chrome and the Liquid/Eversion Globe. Preserve semantic HTML, all product
functions, theme palettes, focus behaviour, localisation and game rendering.
This is a system change, not a new coat applied separately to each route.

The owner's October 21 request supersedes the earlier prohibition on cursor
lighting and nearby interaction. The earlier performance findings still apply:
no document-level animated custom properties, viewport backdrop filters, DOM
capture loops, or permanent animation of every card.

## Findings and implementation choice

The repository already centralises surfaces in `glass-fill/pane/chrome/overlay/
inset`, `components/ui`, and `components/shared/app-theme.css`. It also has a
delegated press layer, analytic damped springs, a modal soft-body navigator,
and an existing WebGL2 eversion renderer with dielectric lighting. Retain navigation and spring utilities, but replace the existing glass
implementation independently. The owner explicitly clarified that the old glass
implementations never worked. Remove the inactive SVG lenses and former material
CSS rather than treating them as a verified baseline. The new globe coat uses
a separate, small dielectric shader; eversion reuses its existing page textures.

References reviewed:

- naughtyduk/liquidGL: real GPU refraction from page snapshots, with capture,
  positioning and shared-canvas stacking constraints.
- rdev/liquid-glass-react: displacement support differs in Safari/Firefox.
- ybouane/liquidglass: DOM rasterisation, CORS requirements and WebGL contexts
  per root make blanket adoption unsuitable for a live feed and canvas games.

Use native backdrop blur/saturation with translucent tint, directional rim,
clear coat and consistent elevation for ordinary HTML. This samples live
content and preserves text and accessibility. Do not label CSS frost as
physically exact refraction: browsers cannot universally expose a live DOM
backdrop texture to a shader. Reserve true dielectric reflection/refraction for
the existing globe renderer, where the source textures already exist. No
third-party code is copied; links document the evaluated approaches.

## Ordered implementation

1. **Baseline and coverage.** Record clean Git state, restore the frozen
   dependency install, inspect shared primitives and app surface classes.
   Record existing failures before assigning regressions. Keep the current
   checkout; do not create a worktree.
2. **One material contract.** Introduce a dedicated shared CSS material sheet
   consumed by both style tiers. Retain palette tokens and role classes. Give
   repeated fills a crisp clear-coat rim and tint without backdrop blur; use
   frost on singular panes/chrome/overlays within the existing eight-surface
   budget. Give app panels, cards, fields, buttons and dialogs the same material
   vocabulary through their shared classes. Do not force glass onto media,
   canvas gameplay, code editors or semantic data visualisations.
3. **Bounded interaction field.** One delegated pointer listener emits an
   expanding, attenuated impulse. Discover material candidates on input, read
   their bounds together, select the nearest visible non-nested surfaces, and
   animate at most eight. Use finite additive native transform animations so existing component
   transforms and the press layer's `scale` keep working. Preserve
   pre-existing inline styles. Avoid inputs, disabled controls, scroll/drag
   gestures, capture overlays and interactive game stages. Provide explicit
   subtree opt-out. No perpetual frame loop; clean up on settle, navigation,
   visibility loss, preference change and unmount.
4. **Cursor light.** Illuminate only the nearest eligible material using a
   bounded decorative child with a static gradient moved by transform. Never
   animate a gradient centre, CSS blur or inherited root variable. Fine
   pointers only; no cursor replacement. It must not intercept hit testing,
   affect layout, or expose decorative nodes to assistive technology.
5. **Globe.** Improve the existing analytic soft body with local indentation,
   a compensating shoulder and stable volume response; use the same field for
   the projected cage and pins. Add a small shaded contact cue on the globe's
   decorative body. Keep navigation geometry independent so effects never
   change the selected destination. Extend existing eversion lighting with
   restrained normal-driven page refraction, preserving exact flat endpoints,
   tier caps, context loss behaviour and the renderer's single context.
6. **Compatibility/accessibility.** Solid readable fallback without backdrop
   support. Disable decorative motion/light under reduced motion, reduced
   transparency, forced colours, high contrast, low-performance tier, print
   and hidden documents. Retain Safari's existing compositor safeguards.
   Respond live to OS and account preference changes. Touch receives bounded
   tap impulses; scrolling cancels pending responses. Keyboard interaction
   keeps existing focus and press behaviour.
7. **Evidence.** Unit-test wave timing/falloff, numerical stability, settling,
   repeated impulses and globe deformation. Add browser tests for dynamically
   mounted surfaces, motion opt-outs, style restoration, input behaviour,
   off-target reactions and light lifecycle. Exercise Chromium, Firefox and
   WebKit when available, phone/desktop, light/dark/high contrast and reduced
   motion. Run shader compilation/parity checks, typecheck, consistency gate,
   main tests and production build. Inspect screenshots, not only open ports.
8. **Documentation and delivery.** Update design/agent guidance with ownership,
   opt-outs, budgets, fallback matrix and reproduction commands. Record actual
   results and remaining limitations. Commit on a feature branch, push it,
   and open a PR against `main` with concrete before/after behaviour and test
   evidence. Do not merge or deploy.

## Acceptance criteria

- Shared materials cover site and full-screen app UI without route-specific
  opt-in or a second design system. Existing accents and layouts remain legible.
- Taps on nearby empty space displace bounded nearby surfaces, which spring
  back; direct controls retain their normal activation and focus behaviour.
- Pointer light follows smoothly with no React updates per frame and no
  document-wide style writes; at rest the interaction runtime schedules no RAF.
- The globe visibly indents at contact, carries deformation through drag and
  springs back, while navigation and eversion endpoints remain correct.
- Preferences remove decorative effects live; unsupported optics fall back to
  readable native HTML. No promise of native-device performance is inferred
  from headless software rendering.
- Tracked generated files, unrelated content and lockfiles remain unchanged
  unless an independently required dependency change is documented.

## Validation record

Implementation results and actual executed checks will be recorded in
`docs/liquid-glass-system.md` as work proceeds. Optional suites and unavailable
device/browser checks must be distinguished from passes.

## Integration adjustment

A concurrent main update landed a lazy jelly renderer and shared CSS spring
easings during implementation. Preserve that work and its navigation/prefetch
changes. Extend its single renderer with the shared contact normal, Snell
transmission and live preference handling; remove the redundant prototype coat.
Re-run the affected browser contracts, full tests, typecheck, gate and build
after merging main.
