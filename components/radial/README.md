# components/radial — the RMH Radial UI

The from-scratch radial front end: an Apple-style, strict black-&-white,
mobile-first design language built around a central **RMH** mark that elements
animate radially out of. This module is the shell + homepage + motion system;
it propagates to the rest of the site through the shared `--site-*` design
tokens (retuned to high-contrast monochrome in `app/globals.css`).

## Files

| File               | Role                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `useRadialSpin.ts` | The motion core. One `requestAnimationFrame` loop integrates a fractional position from wheel/drag/keyboard input with inertia + snap, and paints via an imperative `onRender(pos)` — React never re-renders mid-spin, so it holds the display's full refresh rate (60/120/144Hz). Full reduced-motion path. |
| `RadialWheel.tsx`  | A 3D spin-to-scroll rolodex. Items ride a vertical cylinder pivoting off the RMH core; the focused slot faces front and upright, neighbours roll back into depth. Transforms are written straight to the DOM each frame.                                    |
| `RadialHub.tsx`    | The persistent navigator. A fixed RMH orb that blooms every destination outward along a ring on open (CSS-keyframe travel from the core, staggered). Replaces the old flat sidebar; consumes `lib/sidebar-nav`, honours auth/admin gating.                  |
| `RadialShell.tsx`  | The application frame for every standard (`_site`) route: fixed parallax ring backdrop, slim utility top bar, `<main>`, and the hub. Reduced-motion- and touch-aware pointer parallax.                                                                      |
| `RadialFeed.tsx`   | The home feed — RMHarks orbit the RMH core and spin into focus. Streams the first timeline page from the route loader.                                                                                                                                     |
| `RmharkCard.tsx`   | The compact monochrome feed unit (rmhark or platform announcement).                                                                                                                                                                                        |
| `Parallax.tsx`     | Reusable scroll-linked parallax layer (framer-motion motion values → GPU transforms).                                                                                                                                                                      |
| `radial.css`       | All radial styling. Every colour is a `--site-*` token (theme-safe); every animation is `transform`/`opacity` only. Mobile-first, with viewport-safe geometry (the core sits in a left gutter, the nav ring is radius-clamped, spokes go icon-only < 480px).  |

## How it wires in

- `components/feed/SiteShell.tsx` (stable `children`/`overlays` API, still
  rendered by `app/routes/_site.tsx`) now delegates to `RadialShell`, so **all**
  `_site` pages inherit the radial chrome and the monochrome tokens.
- `app/routes/_site/index.tsx` (`/`) renders `RadialFeed`.
- The old shell nav (`SiteNavigation`/`MobileDock`) and `FeedLayout` were
  removed — the radial hub and feed replace them.

## Design rules (same as the rest of the app)

- Colour/radius/shadow only via `--site-*` tokens — never hardcode. The default
  theme is now strict high-contrast B&W (ink accent, no hue).
- Motion is `transform`/`opacity` only, GPU-composited, and always has a
  `prefers-reduced-motion` fallback.
- Mobile-first: base CSS targets phones; `@media (min-width: …)` layers on
  space. Nothing may leave the viewport — verify the hub bloom and wheel on a
  320px-wide screen when changing geometry.
