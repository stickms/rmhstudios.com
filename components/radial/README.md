# components/radial — the RMH Radial UI

The from-scratch radial front end and home of the **Radial Avant-Garde Glass**
design language (see [`docs/design-language.md`](../../docs/design-language.md)):
an Apple-Liquid-Glass-inspired, strict black-&-white, mobile-first system built
around a central **RMH** mark that elements animate radially out of. This module
is the shell + homepage + motion system; it propagates to the rest of the site
through the shared `--site-*` design tokens (retuned to high-contrast monochrome
in `app/globals.css`).

## Files

| File                 | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RadialWheel.tsx`    | The feed as a gently-curved column on the **document's own scroll** (no inner scroll region — so mobile Safari collapses its toolbars). Cards flow at natural heights (variable, never overlapping) and a rAF window-scroll pass rakes each onto a shallow cylinder from cached offsets (no layout thrash). Optional non-raked `lead` slot (the compose box). Reduced-motion → plain list. Fires `onEndReached` for lazy loading.                                                                                             |
| `RadialHub.tsx`      | The persistent navigator, a **phase state machine** (closed → centering → open → closing). Tapping the fixed RMH orb **glides it to the centre of the screen**, then opens the menu as an **expanding circular blur** with translucent clip-path pie/wedge sectors blooming around the orb (no drawn colour disc, no click-through gaps). CSS-only; consumes `lib/sidebar-nav`, honours auth/admin gating.                                                                                                                    |
| `LiquidGoo.tsx`      | The **metaball filter bank** — one hidden `<svg><defs>` mounted in the shell holding three goo filters (`#rmh-liquid-sm` / `#rmh-liquid` / `#rmh-liquid-lg`) that CSS references to fuse clusters of shapes. Blur → steep alpha ramp, so near shapes merge with a smooth neck and a lone shape just rounds off. Used by the hub dial, the orb aura and the backdrop blob field.                                                                                                                                               |
| `MetaballCursor.tsx` | Site-wide gooey cursor (its own `#rmh-goo` filter + `mix-blend-mode: difference`) that trails and swells over interactive elements. Desktop / fine-pointer only, off under reduced-motion.                                                                                                                                                                                                                                                                                                                                    |
| `RadialShell.tsx`    | The application frame for every standard (`_site`) route: fixed parallax ring backdrop, slim utility top bar, `<main>`, the hub, and the metaball cursor. The backdrop layer paints **only** the rings — the aurora canvas comes from the document's own fixed layers (`body::before/::after`), so it drifts and parallaxes and is the one scene every `backdrop-filter` on the page samples.                                                                                                                                 |
| `RadialFeed.tsx`     | The home feed — drives `RadialWheel` off the shared `feedStore` (streamed first page, live SSE, lazy pagination). Leads with an inline `ComposeBoxLazy` (the first rmhark follows it); a floating compose button opens the full `ComposeModal`.                                                                                                                                                                                                                                                                               |
| `RmharkCard.tsx`     | The compact monochrome feed unit (rmhark or platform announcement).                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Parallax.tsx`       | Reusable scroll-linked parallax layer (framer-motion motion values → GPU transforms).                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `radial.css`         | All radial styling. Every colour is a `--site-*` token (theme-safe); accent text comes from `--site-accent-fg`, which each theme/preset authors and `ensureReadableAccent()` contrast-checks. Mobile-first and viewport-safe. Its final section radialises **content pages** too: it flattens PageLayout's `.page-heading` card and **unpins sticky** headers/tabs/search so every `_site` route flows like the feed. It does **not** touch the material — the Liquid Glass classes render at full strength inside the shell. |

## How it wires in

- `components/feed/SiteShell.tsx` (stable `children`/`overlays` API, still
  rendered by `app/routes/_site.tsx`) now delegates to `RadialShell`, so **all**
  `_site` pages inherit the radial chrome and the monochrome tokens.
- `app/routes/_site/index.tsx` (`/`) renders `RadialFeed`.
- The old shell nav (`SiteNavigation`/`MobileDock`) and `FeedLayout` were
  removed — the radial hub and feed replace them.

## Metaballs (the liquid layer)

The Liquid Glass material itself is central (`app/globals.css` — the elevation
classes render at full strength inside this shell). What lives here is the
**metaball** layer that makes the radial chrome behave like a body of liquid:

| Where               | What fuses                                                                    |
| ------------------- | ----------------------------------------------------------------------------- |
| Hub dial            | The clip-path sectors melt into one liquid disc; dividers become gooey necks. |
| Orb aura            | Orbiting blobs stretch and neck in and out of the orb's disc.                 |
| Backdrop blob field | Huge faint blobs drift, swell together and pull apart behind everything.      |
| Cursor              | The pointer's blobs fuse into one trailing drop (`MetaballCursor`).           |

Three rules keep it safe — break them and you get chewed text or broken layout:

1. **A goo group contains shapes only.** The alpha ramp destroys glyph
   antialiasing, so icons/labels ride in a sibling layer _above_ the filter.
   That is why the hub's sectors and `radial-hub__glyphs` are separate elements,
   and why those glyphs auto-contrast with `mix-blend-mode: difference` (white
   over the filtered dial = the exact inverse of whatever sector is beneath)
   instead of reacting to each sector's own hover/active state.
2. **Never filter an ancestor of fixed chrome.** `filter` creates a containing
   block for `position: fixed` descendants and a new stacking context — hence the
   orb's aura is its own fixed layer rather than a pseudo-element on the orb, and
   nothing filters `.radial-shell`.
3. **Gate the cost.** An always-on SVG filter is continuous GPU work, so every
   goo layer is `@media (min-width: 768px) and (prefers-reduced-motion: no-preference)`
   — the same budget the ring backdrop already respects on phones.

## Design rules (same as the rest of the app)

- Colour/radius/shadow only via `--site-*` tokens — never hardcode. The default
  theme is strict B&W (ink accent, no hue) rendered in the Liquid Glass material:
  surfaces are translucent tints over the aurora canvas, not flat paper.
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
