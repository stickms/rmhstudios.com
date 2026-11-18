/**
 * Lazily-loaded framer-motion feature bundle for `<LazyMotionProvider>`.
 *
 * This module is imported ONLY via dynamic `import()` (from
 * `components/Providers.tsx`), which keeps the heavy animation / gesture /
 * layout / drag drivers out of the initial bundle and in an async chunk that
 * loads after first paint. Every animated component ships the lightweight `m`
 * component (aliased as `motion` across the app) instead of the full `motion`
 * component, and picks these features up from the `LazyContext`.
 *
 * `domMax` is framer-motion's complete feature set, so animations behave
 * identically to an eager `motion` import once the chunk loads.
 *
 * It registers the features itself (framer-motion's `LazyMotion` does this in the
 * provider, which put motion-dom's `VisualElement` into the entry; see
 * components/motion/LazyMotionProvider.tsx) and returns the renderer.
 */
import { domMax } from 'framer-motion';
import { loadFeatures } from 'framer-motion-internal/load-features';

export function registerMotionFeatures() {
  const { renderer, ...features } = domMax;
  loadFeatures(features);
  return renderer;
}
