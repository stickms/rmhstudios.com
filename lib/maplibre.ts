/**
 * MapLibre GL v6 worker wiring.
 *
 * v6 ships ESM-only and resolves its web worker at RUNTIME from
 * `import.meta.url`, choosing the filename with a ternary:
 *
 * ```js
 * const f = import.meta.url.endsWith('-dev.mjs')
 *   ? 'maplibre-gl-worker-dev.mjs'
 *   : 'maplibre-gl-worker.mjs';
 * return new URL(`./${f}`, import.meta.url).href;
 * ```
 *
 * Neither Rolldown nor Vite's dep optimizer can see through that, so the worker
 * is never emitted and the URL 404s relative to the bundled chunk. The failure
 * is quiet and nasty: the canvas, markers and attribution all render, but the
 * map never fires `load`, so no tiles ever appear — a blank map.
 *
 * Fix: import the worker through Vite's `?worker&url`, which bundles it
 * (resolving its `./maplibre-gl-shared.mjs` sibling) and yields an emitted asset
 * URL, then hand that to MapLibre's own `setWorkerUrl()` before any map mounts.
 * Dev mode additionally needs `optimizeDeps.exclude: ['maplibre-gl']` — see
 * `vite.config.ts` — so the optimizer doesn't rewrite the worker path.
 *
 * Drop this module (and the vite.config entry) once upstream emits a statically
 * analyzable worker URL.
 */
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

let ready: Promise<void> | null = null;

/**
 * Point MapLibre at the bundled worker, once per page. Safe to call from every
 * map component. The dynamic `import('maplibre-gl')` keeps the ~1 MB library out
 * of the entry graph, matching how react-map-gl already loads it lazily.
 */
export function ensureMaplibreWorker(): Promise<void> {
  ready ??= import('maplibre-gl').then(({ setWorkerUrl }) => {
    setWorkerUrl(workerUrl);
  });
  return ready;
}
