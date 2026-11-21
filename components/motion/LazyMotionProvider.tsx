import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LazyContext } from 'framer-motion-internal/lazy-context';

type Renderer = NonNullable<React.ContextType<typeof LazyContext>['renderer']>;

/**
 * framer-motion's `<LazyMotion>` for an asynchronously loaded feature bundle,
 * without the part of it that cost every page ~8 KB.
 *
 * The library's own component imports `loadFeatures` statically, and that pulls
 * motion-dom's `setFeatureDefinitions`, which lives in one module with the whole
 * `VisualElement` class (25.8 KB raw) — into the entry of every page, although
 * the features themselves load later (low-bandwidth audit, 2026-11-18). This is
 * the same provider for the lazy case: `load` resolves once the bundle has
 * registered its own features (lib/motion-features.ts), and hands back the
 * renderer the `m` components read from `LazyContext`. The context object is
 * framer-motion's own (framer-motion-internals.mjs), so `m`
 * behaves exactly as under the library's provider: static on the server and in
 * the first client render, animated once the bundle lands.
 */
export function LazyMotionProvider({
  children,
  load,
  strict = false,
}: {
  children: ReactNode;
  load: () => Promise<Renderer>;
  strict?: boolean;
}) {
  const [, setLoaded] = useState(false);
  const renderer = useRef<Renderer | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void load().then((r) => {
      renderer.current = r;
      if (live) setLoaded(true);
    });
    return () => {
      live = false;
    };
    // Loaded once per mount, as framer-motion's provider does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <LazyContext
      value={{
        renderer: renderer.current,
        strict,
      }}
    >
      {children}
    </LazyContext>
  );
}
