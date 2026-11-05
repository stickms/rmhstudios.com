import { apps } from '@/lib/apps';
import { games } from '@/lib/games';
import { isNativeMaterialRoute } from '@/lib/native-material-routes';

/**
 * Routes where the globe cursor is not drawn and the visitor keeps the system
 * pointer: every game and app in the catalog, the unlisted full-screen pages that
 * behave like one, and the routes that already opt out of the site material
 * (`isNativeMaterialRoute`).
 *
 * A game or app that draws, locks or hides its own cursor keeps doing so — with
 * the globe not mounted there is no site-wide `cursor: none` to fight it. The
 * globe remains the pointer on the ordinary `_site` pages.
 *
 * The catalog is already in the main bundle (Providers imports it for every page),
 * so this adds no weight to the cursor gate.
 */

/** Full-screen pages that are in no catalog (see THEME_EXCLUDED_ROUTES in Providers). */
const UNLISTED = ['/pf2ecal', '/sohumtracker', '/discord'];

/** `_site` pages whose URL sits under an app's prefix and which stay ordinary pages. */
const EXCEPTIONS = ['/studio/themes'];

const BASES = [...games.map((g) => g.href), ...apps.map((a) => a.href), ...UNLISTED].filter((href) =>
  href.startsWith('/'),
);

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

export function isNativeCursorRoute(pathname: string | undefined | null): boolean {
  if (!pathname) return false;
  if (isNativeMaterialRoute(pathname)) return true;
  if (EXCEPTIONS.some((base) => under(pathname, base))) return false;
  return BASES.some((base) => under(pathname, base));
}
