/**
 * Routes that opt out of the site's Plasmatic Jelly material and the globe cursor
 * entirely and use the plain system cursor — apps with a look of their own that is
 * not the site's (the TF2 Hub, which is 100% Team Fortress 2; the games library,
 * which is a literal Steam palette).
 * Kept dependency-free: the globe cursor's gate imports it and must stay tiny.
 */
export function isNativeMaterialRoute(pathname: string | undefined | null): boolean {
  return (
    !!pathname &&
    (pathname === '/tf2' ||
      pathname.startsWith('/tf2/') ||
      pathname === '/games' ||
      pathname.startsWith('/games/'))
  );
}
