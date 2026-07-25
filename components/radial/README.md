# components/radial — the RMH Radial UI

The from-scratch radial front end and home of the **Radial Avant-Garde Glass**
design language (see [`docs/design-language.md`](../../docs/design-language.md)):
an Apple-Liquid-Glass-inspired, strict black-&-white, mobile-first system built
around a central **RMH** mark that elements animate radially out of. This module
is the shell + homepage + motion system; it propagates to the rest of the site
through the shared `--site-*` design tokens (retuned to high-contrast monochrome
in `app/globals.css`).

## Files

| File                 | Role                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RadialWheel.tsx`    | The feed as a gently-curved column on the **document's own scroll** (no inner scroll region — so mobile Safari collapses its toolbars). Cards flow at natural heights (variable, never overlapping) and a rAF window-scroll pass rakes each onto a shallow cylinder from cached offsets (no layout thrash). Optional non-raked `lead` slot (the compose box). Reduced-motion → plain list. Fires `onEndReached` for lazy loading. |
| `RadialHub.tsx`      | The persistent navigator, a **phase state machine** (closed → centering → open → closing). Tapping the fixed RMH orb **glides it to the centre of the screen**, then opens the menu as an **expanding circular blur** with translucent clip-path pie/wedge sectors blooming around the orb (no drawn colour disc, no click-through gaps). CSS-only; consumes `lib/sidebar-nav`, honours auth/admin gating.                        |
| `MetaballCursor.tsx` | Site-wide gooey cursor (SVG goo filter + `mix-blend-mode: difference`) that trails and swells over interactive elements. Desktop / fine-pointer only, off under reduced-motion.                                                                                                                                                                                                                                                   |
| `RadialShell.tsx`    | The application frame for every standard (`_site`) route: fixed parallax ring backdrop, slim utility top bar, `<main>`, the hub, and the metaball cursor.                                                                                                                                                                                                                                                                         |
| `RadialFeed.tsx`     | The home feed — drives `RadialWheel` off the shared `feedStore` (streamed first page, live SSE, lazy pagination). Leads with an inline `ComposeBoxLazy` (the first rmhark follows it); a floating compose button opens the full `ComposeModal`.                                                                                                                                                                                   |
| `RmharkCard.tsx`     | The compact monochrome feed unit (rmhark or platform announcement).                                                                                                                                                                                                                                                                                                                                                               |
| `Parallax.tsx`       | Reusable scroll-linked parallax layer (framer-motion motion values → GPU transforms).                                                                                                                                                                                                                                                                                                                                             |
| `radial.css`         | All radial styling. Every colour is a `--site-*` token (theme-safe); accent text auto-contrasts via OKLCH relative colour. Mobile-first and viewport-safe. Its final section radialises **content pages** too: it flattens PageLayout's `.page-heading` card, de-glasses the shared `glass-*` panels (the high-contrast flatten), and **unpins sticky** headers/tabs/search so every `_site` route flows like the feed.           |

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

## Mobile contracts (easy to break — check these when changing the chrome)

- **Safe area.** Every bottom-anchored fixed element here (the orb, the hub's
  foot pill, the feed's compose FAB) adds `env(safe-area-inset-bottom)` itself.
  The site sets `viewport-fit=cover`, and the body's safe-area padding does
  **not** apply to `position: fixed` — so anything that skips the inset lands in
  the iOS home-indicator gesture strip and gets hard to tap.
- **The floating-bottom stack.** The orb carries `data-floating="hub"` and is the
  BOTTOM member of the mobile stack defined in `app/globals.css` §5.5x A.1; the
  cookie bar, mini-player and back-to-top all lift above it. Its footprint comes
  from `--site-hub-orb-size` / `--site-hub-orb-inset` (declared in `globals.css`
  precisely so the stack's reserve and the orb geometry can't drift apart) —
  change the orb's size or inset **there**, not here. Any new fixed
  bottom-anchored control must join the stack rather than pick its own `bottom`.
- **No document scroll-lock.** The hub blocks background scroll with
  `touch-action: none` on its overlay plus a `wheel` guard — never
  `body { overflow: hidden }` or the `position: fixed` body technique. Both clip
  the document to the visual viewport, which on iOS clips away the content that
  normally scrolls under Safari's floating bottom bar and leaves a stray band of
  bare page background there. This was an on-device finding from the mobile
  push-drawer the hub replaced, which blocked background scroll from its scrim
  for the same reason; the drawer is gone, so the note lives here now.
- **Translucency needs a blur behind it.** The top bar drops `backdrop-filter` on
  phones for paint cost, so it is fully opaque there — a partly-transparent bar
  with no blur just ghosts the feed scrolling underneath it. Frosted glass
  returns with the blur at ≥768px.
