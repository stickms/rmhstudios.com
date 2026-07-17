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
 * Client and server safe. `__CDN_BASE__` is a compile-time constant injected by
 * Vite's `define` (see vite.config.ts) into the browser and SSR bundles as the
 * VITE_CDN_BASE_URL value. The standalone realtime servers are bundled to
 * CommonJS by esbuild, which does NOT define it, so the `typeof` guard yields no
 * CDN (relative paths) there — correct for those workers. We use a define'd
 * global rather than `import.meta.env` so this shared file also type-checks under
 * the CommonJS server tsconfig, where `import.meta` is a syntax error.
 */
declare const __CDN_BASE__: string | undefined;

export const CDN_BASE = (typeof __CDN_BASE__ !== 'undefined' ? __CDN_BASE__ : '').replace(
  /\/+$/,
  '',
);

/**
 * Resolve a `public/`-relative asset path (e.g. "/sprites/altair/foo.png") to
 * its CDN URL. With no CDN configured the path is returned unchanged so it
 * loads from the local origin.
 */
export function asset(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return CDN_BASE ? CDN_BASE + p : p;
}
