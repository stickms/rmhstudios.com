/**
 * Routes that opt out of the site's Plasmatic Jelly material entirely and use the plain system cursor — apps with a look of their own that is
 * not the site's (the TF2 Hub, which is 100% Team Fortress 2; the games library,
 * which is a literal Steam palette; RMH Music, which is a notebook of manuscript paper with
 * no glass, jelly or lightning).
 * Kept dependency-free: `Providers` imports it on every page and it must stay tiny.
 */
/** The route bases that are native material: each base and every path under it. */
export const NATIVE_MATERIAL_BASES = ['/tf2', '/games', '/rmhmusic'] as const;

export function isNativeMaterialRoute(pathname: string | undefined | null): boolean {
  return (
    !!pathname &&
    NATIVE_MATERIAL_BASES.some((base) => pathname === base || pathname.startsWith(`${base}/`))
  );
}

/**
 * The class `<html>` carries on a native-material route. The JS services are simply not installed there
 * (`useLiquidInteractions(false)`), but the CSS-only material (the woken haze in app/jelly-material.css §3b) would
 * still match, so its rules are scoped with `html:not(.native-material)`. Stamped pre-paint by the theme script in
 * app/routes/__root.tsx on a hard load and kept in step on client navigation by {@link syncNativeMaterialClass}.
 */
export const NATIVE_MATERIAL_CLASS = 'native-material';

/**
 * Make `root` carry {@link NATIVE_MATERIAL_CLASS} exactly while `pathname` is a native-material route. Returns the
 * cleanup for an effect keyed on the pathname: it removes the class this call set, so leaving the route clears it.
 */
export function syncNativeMaterialClass(
  root: { classList: Pick<DOMTokenList, 'toggle' | 'remove'> },
  pathname: string | undefined | null,
): () => void {
  const native = isNativeMaterialRoute(pathname);
  root.classList.toggle(NATIVE_MATERIAL_CLASS, native);
  return native ? () => root.classList.remove(NATIVE_MATERIAL_CLASS) : () => {};
}
