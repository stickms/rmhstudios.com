# components/radial — the RMH Radial UI

The from-scratch radial front end: an Apple-style, strict black-&-white,
mobile-first design language built around a central **RMH** mark that elements
animate radially out of. This module is the shell + homepage + motion system;
it propagates to the rest of the site through the shared `--site-*` design
tokens (retuned to high-contrast monochrome in `app/globals.css`).

## Files

| File                 | Role                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RadialWheel.tsx`    | The feed as a gently-curved column on **native momentum scroll** — cards flow at their own natural heights (variable, never overlapping), the browser owns the momentum/rubber-band (authentic Apple feel), and a rAF scroll pass rakes each card onto a shallow cylinder from cached offsets (no layout thrash). Reduced-motion → plain list. Fires `onEndReached` for lazy loading.                   |
| `RadialHub.tsx`      | The persistent navigator. A fixed RMH orb that opens a **pie/wedge dial** — destinations tile the disc as clip-path sectors around the core (no click-through gaps). CSS-only open/bloom; consumes `lib/sidebar-nav`, honours auth/admin gating.                                                                                                                                                        |
| `MetaballCursor.tsx` | Site-wide gooey cursor (SVG goo filter + `mix-blend-mode: difference`) that trails and swells over interactive elements. Desktop / fine-pointer only, off under reduced-motion.                                                                                                                                                                                                                         |
| `RadialShell.tsx`    | The application frame for every standard (`_site`) route: fixed parallax ring backdrop, slim utility top bar, `<main>`, the hub, and the metaball cursor.                                                                                                                                                                                                                                               |
| `RadialFeed.tsx`     | The home feed — drives `RadialWheel` off the shared `feedStore` (streamed first page, live SSE, lazy pagination).                                                                                                                                                                                                                                                                                       |
| `RmharkCard.tsx`     | The compact monochrome feed unit (rmhark or platform announcement).                                                                                                                                                                                                                                                                                                                                     |
| `Parallax.tsx`       | Reusable scroll-linked parallax layer (framer-motion motion values → GPU transforms).                                                                                                                                                                                                                                                                                                                   |
| `radial.css`         | All radial styling. Every colour is a `--site-*` token (theme-safe); accent text auto-contrasts via OKLCH relative colour. Mobile-first and viewport-safe. Its final section radialises **content pages** too: it flattens PageLayout's `.page-heading` card and de-glasses the shared `glass-*` panels (the high-contrast flatten) so every `_site` route reads as flat monochrome, not just the home. |

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
