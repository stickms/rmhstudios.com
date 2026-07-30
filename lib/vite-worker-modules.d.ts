/**
 * Typing for Vite's `?worker&url` import query, which resolves to the emitted
 * worker asset's URL. Declared narrowly for the one specifier we use rather than
 * pulling in `vite/client` globally, which would also redefine `ImportMeta` for
 * every file in the project.
 */
declare module 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}
