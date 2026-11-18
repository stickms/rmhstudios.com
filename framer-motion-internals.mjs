// @ts-check
import { createRequire } from 'node:module';
import {
  dirname,
  join,
} from 'node:path';

/**
 * Two framer-motion internals the site's own `<LazyMotion>` needs
 * (components/motion/LazyMotionProvider.tsx), by fixed specifier.
 *
 * framer-motion's `LazyMotion` imports `loadFeatures`, which imports motion-dom's
 * `setFeatureDefinitions` from the same module as the whole `VisualElement` class:
 * 25.8 KB raw (~8 KB brotli) in the entry of every page, for a provider whose
 * features load lazily anyway (low-bandwidth audit, 2026-11-18). The replacement
 * provides `LazyContext` itself and leaves `loadFeatures` to the lazy feature
 * bundle. Neither is a public export and the package's `exports` map refuses deep
 * imports, so they are aliased to the exact files framer-motion's own `m`
 * component imports: same file, same module, same context object.
 * `lib/__tests__/framer-motion-internals.test.ts` fails if an upgrade moves them.
 * Types: lib/framer-motion-internal.d.ts.
 */
/** @type {Record<string, string>} */
export const FRAMER_MOTION_INTERNALS =
  (() => {
    const dir =
      dirname(
        createRequire(
          import.meta
            .url,
        ).resolve(
          'framer-motion/package.json',
        ),
      );
    return {
      'framer-motion-internal/lazy-context':
        join(
          dir,
          'dist/es/context/LazyContext.mjs',
        ),
      'framer-motion-internal/load-features':
        join(
          dir,
          'dist/es/motion/features/load-features.mjs',
        ),
    };
  })();
