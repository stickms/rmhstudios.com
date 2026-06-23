/**
 * CDN asset URLs for heavy static media (sprites, music, 3D models, library
 * PDFs) hosted on Cloudflare R2 and fronted by a public custom domain
 * (cdn.rmhstudios.com). These used to be served straight off disk by Apache
 * `Alias` directives (the "self-hosted CDN"); they now live in R2.
 *
 * `VITE_CDN_BASE_URL` is the public origin, e.g. "https://cdn.rmhstudios.com".
 * Leave it unset in local development so paths resolve relatively to the dev
 * server / `public/` dir and everything keeps working off disk.
 *
 * Client and server safe: Vite inlines `import.meta.env.VITE_*` in both the
 * browser and SSR bundles (same pattern as VITE_SOCKET_URL elsewhere). The
 * standalone realtime servers are bundled to CommonJS by esbuild, where
 * `import.meta` is empty — the guard below keeps that case from throwing and
 * just yields no CDN (relative paths), which is correct for those workers.
 */
export const CDN_BASE = (
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_CDN_BASE_URL) ||
  ""
).replace(/\/+$/, "");

/**
 * Resolve a `public/`-relative asset path (e.g. "/sprites/altair/foo.png") to
 * its CDN URL. With no CDN configured the path is returned unchanged so it
 * loads from the local origin.
 */
export function asset(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return CDN_BASE ? CDN_BASE + p : p;
}
