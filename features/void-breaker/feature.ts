import { defineFeature } from '@/lib/core/feature';

/** Void Breaker: a top-down arena shooter (canvas 2D + an optional three.js renderer). */
export default defineFeature(
  {
    id: 'void-breaker',
    kind: 'game',
    basePath:
      '/void-breaker',
    delivery:
      'island',
    routes:
      [
        'app/routes/void-breaker.tsx',
        'lib/game/api/void-breaker.leaderboard.server.ts',
        'lib/game/api/void-breaker.score.server.ts',
      ],
    // The game's strings (`c-void-breaker`) and the Boss Rush menu's (`f-action`). An island's
    // document hands the reader's locale for these to its first render (lib/islands/document.server.ts).
    namespaces:
      [
        'c-void-breaker',
        'f-action',
      ],
    catalog:
      'features/void-breaker/catalog.ts',
    listed: true,
  },
);
