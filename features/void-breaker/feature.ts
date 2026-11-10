import { defineFeature } from '@/lib/core/feature';

/** Void Breaker: a top-down arena shooter (canvas 2D + an optional three.js renderer). */
export default defineFeature({
  id: 'void-breaker',
  kind: 'game',
  basePath: '/void-breaker',
  delivery: 'island',
  routes: [
    'app/routes/void-breaker.tsx',
    'app/routes/api/void-breaker/leaderboard.ts',
    'app/routes/api/void-breaker/score.ts',
  ],
  // The catalog card's strings; the game itself has no namespace of its own.
  namespaces: ['c-void-breaker'],
  catalog: 'features/void-breaker/catalog.ts',
  listed: true,
});
