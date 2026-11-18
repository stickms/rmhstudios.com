/**
 * Types for the two framer-motion internals aliased in framer-motion-internals.mjs
 * (`FRAMER_MOTION_INTERNALS`). They mirror framer-motion 14's own declarations
 * of `LazyContext` and `loadFeatures`; lib/__tests__/framer-motion-internals.test.ts
 * holds the files and their exports in place across upgrades.
 */
declare module 'framer-motion-internal/lazy-context' {
  import type { Context } from 'react';
  import type { FeatureBundle } from 'framer-motion';

  export const LazyContext: Context<{
    renderer?: FeatureBundle['renderer'];
    strict: boolean;
  }>;
}

declare module 'framer-motion-internal/load-features' {
  import type { FeatureBundle } from 'framer-motion';

  export function loadFeatures(
    features: Omit<
      FeatureBundle,
      'renderer'
    >,
  ): void;
}
