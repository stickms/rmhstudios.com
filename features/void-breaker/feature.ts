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
  // The game's strings (`c-void-breaker`) and the Boss Rush menu's (`f-action`). An island's
  // document hands the reader's locale for these to its first render (lib/islands/document.server.ts).
  namespaces: ['c-void-breaker', 'f-action'],
  catalog: 'lib/catalog/games/void-breaker.ts',
  listed: true,
});
