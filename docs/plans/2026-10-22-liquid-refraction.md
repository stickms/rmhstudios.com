# Liquid glass: optical refraction tier — implementation plan

## Where we start

PR #946 (Oct 21) already delivered the system the owner described on Oct 22:
the `glass-*` material roles across both style tiers and the `--app-*` tier, a
delegated tap field (`lib/liquid/runtime.ts`, nearby surfaces pushed back by an
expanding damped wave), a compositor-carried cursor light, and the jelly
Liquid/Eversion Globe with a Snell/Fresnel coat and contact indentation. See
[`../liquid-glass-system.md`](../liquid-glass-system.md). Re-skinning the ~350
files that already use the roles would add churn and no fidelity.

**The remaining gap is optics.** Ordinary panels get live frost plus a static
clear-coat; none of them _bend_ the page behind them, which is the defining
trait of the three reference libraries (liquidGL, liquid-glass-react,
ybouane/liquidglass) and of Apple's material. #946 rejected SVG displacement
because it was unreliable across engines and unbounded in cost. This plan
reverses that **narrowly**: as a feature-detected, budgeted progressive
enhancement, not a baseline.

## Goals

- Singular chrome, panes and overlays refract the live page behind their
  bezel: edge displacement derived from a convex-squircle surface profile and
  Snell's law (IOR 1.45), matching the globe's coat constants.
- Optional chromatic dispersion on hero surfaces (`data-liquid-refract="dispersive"`).
- Zero change to engines that cannot render `backdrop-filter: url()` (Safari,
  Firefox, iOS Chrome): they keep today's frost + clear-coat exactly.
- Bounded cost: at most 6 refracting surfaces at a time, each capped in area,
  none while hidden/offscreen, none under `perf-lite`, reduced transparency,
  forced colours, high contrast, data-saver or very low-end hardware.
- No JS frame loop, no animated custom properties, no DOM capture. Maps are
  computed once per quantised size and cached.

## Non-goals / anti-goals

- No blanket DOM-snapshot renderer (liquidGL/ybouane): duplicates content,
  CORS, one WebGL context per root. Rejected again.
- No refraction on repeated `glass-fill` rows, canvases, game HUDs or any
  surface carrying `data-liquid-material="off"`.
- Not claiming pixel-exact lensing of arbitrary content: the displacement is a
  bezel-only approximation of the same profile.

## Approaches considered

| Approach                                                                   | Verdict                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A. Per-surface SVG `feDisplacementMap` in `backdrop-filter`, Chromium only | **Chosen.** Live backdrop, text stays real DOM, GPU-composited, graceful elsewhere.  |
| B. Snapshot the page into WebGL and lens it (liquidGL / ybouane)           | Rejected: stale for video/feeds/games, CORS, stacking and context-count constraints. |
| C. Keep frost only                                                         | Rejected: fails the "most realistic" requirement; surfaces never bend the page.      |

## Ordered implementation

1. `lib/liquid/refraction.ts` — pure math: surface height profile, Snell
   displacement LUT, rounded-rect SDF, `buildDisplacementMap()` →
   RGBA bytes (R/G = inward displacement, neutral 128 inside the bezel-free
   interior), `quantizeSurface()` cache key, filter markup builder. Unit-tested
   without a DOM.
2. `lib/liquid/refraction-runtime.ts` — one service: engine detection,
   preference/hardware gate, shared hidden `<svg>` defs, one
   IntersectionObserver + ResizeObserver + MutationObserver, budget
   reconciliation, canvas→data-URL map cache. Mounted beside the interaction
   service in `hooks/useLiquidInteractions.ts`.
3. `app/liquid-glass.css` — `[data-liquid-refracted]` rules consuming
   `--liquid-refract-filter`; blur-then-displace-then-saturate ordering; no
   effect unless the runtime sets the attribute, so every fallback tier is the
   existing CSS untouched.
4. Lab route `/liquid-glass`: a refraction section over a busy backdrop,
   including the dispersive variant.
5. Browser contract `testing/e2e/liquid-refraction.mjs`: Chromium applies the
   filter and respects the budget; preferences remove it live; WebKit/Firefox
   never receive it.
6. Docs: `docs/liquid-glass-system.md` (ownership, compat matrix, opt-outs),
   `components/CLAUDE.md`, `lib/CLAUDE.md`, this plan.
7. Gate: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`,
   `pnpm check:consistency --base main`, `pnpm build`, then the e2e.

## Risks

- Backdrop-filter SVG references are Chromium-implementation behaviour: guarded
  by engine detection and covered by the browser contract, not assumed.
- Filter cost scales with area: capped area and count, off-screen release.
- Quantised maps may differ ≤4px from the element: feImage stretches them; the
  bezel profile is smooth so this is imperceptible.
