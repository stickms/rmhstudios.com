/**
 * Recover a tab whose JS/CSS chunks were deleted by a deploy.
 *
 * Every build emits ~950 content-hashed chunks under `/assets/`, and the
 * blue/green hotswap (`deploy/hotswap-web.sh`) removes the old web container —
 * and with it the old build's chunks — once Apache has flipped. A tab that
 * loaded the previous HTML still references those URLs, so its next lazily
 * loaded route, component or stylesheet 404s and the error boundary shows
 * "Something went wrong" until the user reloads by hand. The site deploys
 * several times a day, so this is most of the navigation errors people see.
 *
 * TanStack Router already reloads once for a missing route *component*, but
 * only for three exact messages. It does not cover Vite's own
 * `Unable to preload CSS for …` (a lazy chunk's stylesheet 404'd), the 175
 * `React.lazy` imports in app code, or a split route loader (`lazyFn` has no
 * handling). This module covers those: a matcher for every browser's spelling
 * of "that chunk is gone", and a bounded reload — the fresh document comes from
 * the network (`public/sw.js` keeps navigations network-first), so one reload
 * picks up the new build.
 *
 * The bound matters as much as the reload. A chunk that is missing on the
 * CURRENT build too (a bad deploy, an edge cache serving a stale 404) would
 * otherwise reload the tab forever; inside the guard window the error is let
 * through to the boundary instead, where it is reported and shown.
 */

const RELOAD_KEY = 'rmh:stale-build-reload-at';

/** A second stale-chunk failure this soon after a reload is a real breakage. */
export const STALE_BUILD_RELOAD_GUARD_MS = 60_000;

const STALE_CHUNK_MESSAGES = [
  'Failed to fetch dynamically imported module', // Chromium
  'error loading dynamically imported module', // Firefox
  'Importing a module script failed', // Safari
  'Unable to preload CSS for', // Vite's preload helper
  'Expected a JavaScript module script', // a 404 answered with the HTML page
];

/** Is this the error a browser raises when a build chunk no longer exists? */
export function isStaleBuildError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'ChunkLoadError') return true;
  const message = typeof error.message === 'string' ? error.message : '';
  return STALE_CHUNK_MESSAGES.some((m) => message.includes(m));
}

/**
 * Reload the page to pick up the current build, at most once per guard window.
 * Returns whether a reload was started. Without sessionStorage there is no way
 * to bound the reload, so it declines rather than risk a loop.
 */
export function reloadForStaleBuild(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    const now = Date.now();
    if (now - last < STALE_BUILD_RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

let installed = false;

/**
 * Listen for Vite's `vite:preloadError` — fired when a lazily imported chunk or
 * its CSS fails to load — and reload instead of letting it throw. When the
 * guard refuses, the event is left alone so the error reaches the boundary.
 */
export function installStaleBuildRecovery(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForStaleBuild()) event.preventDefault();
  });
}
