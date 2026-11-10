import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { isAppRoute } from './route';

/**
 * Routes where the site-wide theme must NOT be applied (apps/games own their
 * styling). Serialized into the pre-paint config block (lib/prepaint/config.ts) so the
 * generated pre-paint script applies the same gate before hydration — necessary because the default
 * style (Midnight, `style-graphite`) is a non-":root" theme applied as a class.
 */
export const THEME_EXCLUDED_ROUTES = [
  ...games.map((g) => g.href),
  ...apps.filter((a) => !a.usesSiteTheme).map((a) => a.href),
  // Unlisted full-screen pages that own their palette but are deliberately in
  // no catalog, so nothing above can derive them. `/pf2ecal` is the PF2e
  // board: monochrome, its own light/dark, registered in
  // FULLSCREEN_ROUTE_SEGMENTS for the design gate — and, until it was listed
  // here, painted a Daylight-white <html> underneath itself.
  '/pf2ecal',
  // The live activity dossier: Discord's palette, its own dark/light, and
  // registered in FULLSCREEN_ROUTE_SEGMENTS for the design gate. Listed here
  // for the same reason `/pf2ecal` is — without it the document paints a
  // Daylight-white <html> under a page that has gone dark, which a desktop
  // hides and every phone overscroll reveals.
  '/sohumtracker',
  // The games library: a literal Steam palette (flat, `--stm-*` in
  // `components/steam/steam.css`), full page with its own top bar. Every path under
  // it — `/games`, `/games/$gameId`, the community and profile pages — is the
  // library, so one prefix covers the tree; a page left under `_site` with a
  // `/games…` URL would need an entry in THEME_EXCLUDED_EXCEPTIONS.
  '/games',
  // Discord Activities — the gateway picker, RMHbox and Lights Out, each in
  // Discord's own palette. Full-screen games like every other entry here, but in
  // no catalog because they only make sense inside Discord's iframe. Unlisted,
  // they were the one game tier that received the SITE theme: a Graphite or
  // accent pick restyled the root after hydration, and `html:not(.app-route)`
  // reserved a scrollbar gutter beside a page that never scrolls.
  '/discord',
].filter((href) => href.startsWith('/'));

/**
 * `_site` pages whose URL happens to sit under an app's prefix, and which must
 * therefore keep the site theme.
 *
 * `/studio` is the DAW and owns its `--app-*` chrome; `/studio/themes` is an
 * ordinary `PageLayout` page that merely lives under that path. A bare
 * `startsWith` claimed it for the app tier, so the document painted the app's
 * near-black background while the suppressed style class left `--site-text` at
 * Daylight's `#000000` — a 1.07:1 `<h1>`, measured. The page was unreadable.
 */
export const THEME_EXCLUDED_EXCEPTIONS = ['/studio/themes'];

/**
 * Whether a pathname belongs to the app/game tier (no site theme, app chrome
 * background). Matched on **segment boundaries** so `/rmhcodex` could never be
 * claimed by `/rmhcode`, with the exceptions above winning outright.

 * The predicate itself is `isAppRoute` in `./route`, which the generated
 * pre-paint script bundles — one implementation, not a hand-kept ES5 twin.
 */
export function isAppThemeRoute(pathname: string | undefined | null): boolean {
  return isAppRoute(pathname, THEME_EXCLUDED_ROUTES, THEME_EXCLUDED_EXCEPTIONS);
}
