/**
 * Vendor externalization (build-time, opt-in via VITE_EXTERNALIZE_VENDOR=1).
 *
 * EXPERIMENTAL build-speed optimization. When enabled, the heavy `three` core is
 * NOT bundled/minified by the per-deploy client `vite build`. Instead it is
 * pre-bundled ONCE into `public/vendor-externals/three.js` (see
 * scripts/build-vendor-externals.ts), marked `external` in the client build
 * (vite.config.ts), and resolved in the browser via an import map injected into
 * the document head (app/routes/__root.tsx).
 *
 * SCOPE — deliberately `three` ONLY (not @react-three/*):
 *   - `three` has no React dependency and is already client-only + SSR-external,
 *     so externalizing it can't touch hydration or the React singleton.
 *   - @react-three/fiber/drei import `react`; externalizing them would force
 *     externalizing React too (a whole-app, hydration-breaking change). Instead
 *     R3F stays BUNDLED — its internal `import 'three'` resolves to the single
 *     shared external copy via the import map, so there is still exactly one
 *     three instance. The small `three/addons/*` files likewise stay bundled and
 *     reference the external core.
 *
 * This module is import-light (no heavy deps) so both vite.config.ts (Node) and
 * the SSR/client bundle (__root.tsx) can import it cheaply. The on/off flag is
 * read at each call site (process.env in Node, import.meta.env in the bundle).
 */

/** Bump to bust the browser/CDN cache when a rebuilt bundle's contents change. */
export const VENDOR_EXTERNALS_REVISION = "1";

/** Output directory (under public/, served as static assets) for the bundles. */
export const VENDOR_EXTERNALS_DIR = "vendor-externals";

/**
 * Bare specifiers externalized from the client build and resolved via the import
 * map. Exact-match only: `three` is external, but `three/addons/...` is NOT — the
 * addon files stay bundled and import the external `three` core.
 */
export const VENDOR_EXTERNAL_PACKAGES = ["three"] as const;

export type VendorExternalPackage = (typeof VENDOR_EXTERNAL_PACKAGES)[number];

/** Public URL the import map points at for a given externalized package. */
export function vendorExternalUrl(pkg: VendorExternalPackage): string {
  return `/${VENDOR_EXTERNALS_DIR}/${pkg}.js?r=${VENDOR_EXTERNALS_REVISION}`;
}

/** The import map object injected into <head> when externalization is enabled. */
export function vendorImportMap(): { imports: Record<string, string> } {
  const imports: Record<string, string> = {};
  for (const pkg of VENDOR_EXTERNAL_PACKAGES) {
    imports[pkg] = vendorExternalUrl(pkg);
  }
  return { imports };
}
