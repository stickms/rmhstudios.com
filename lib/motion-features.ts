/**
 * Lazily-loaded framer-motion feature bundle for `<LazyMotion>`.
 *
 * This module is imported ONLY via dynamic `import()` (from
 * `components/Providers.tsx`), which keeps the heavy animation / gesture /
 * layout / drag drivers out of the initial bundle and in an async chunk that
 * loads after first paint. Every animated component ships the lightweight `m`
 * component (aliased as `motion` across the app) instead of the full `motion`
 * component, and picks these features up from the `LazyMotion` context.
 *
 * `domMax` is framer-motion's complete feature set, so animations behave
 * identically to the previous eager `motion` import once the chunk loads.
 */
export { domMax as default } from "framer-motion";
