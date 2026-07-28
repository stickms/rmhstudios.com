/**
 * Shared icon re-exports.
 *
 * This file used to deep-import each icon from `lucide-react/dist/esm/icons/*`
 * with no file extension, "to avoid Turbopack module resolution bugs" — a
 * Next.js-era workaround that outlived the Next.js build (this repo is Vite;
 * see the trust order in CLAUDE.md). The installed lucide-react ships **no
 * `exports` map** and the real files are `.mjs`, so those specifiers resolved
 * only by each bundler's own guessing and intermittently failed under the Vite
 * SSR module runner:
 *
 *   Cannot find module 'lucide-react/dist/esm/icons/pause' imported from
 *   lib/icons.ts
 *
 * which took the SSR render down and fell the route back to client-only
 * rendering — user-visible as a blank/slow first paint on any page importing
 * one of these (profile routes).
 *
 * Vite tree-shakes the lucide-react barrel, so import from the package root.
 * New code should import from 'lucide-react' directly; this module stays for
 * its existing callers.
 */
export { Check, Music, Pause, Play, Search, X } from 'lucide-react';
