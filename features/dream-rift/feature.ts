import { defineFeature } from '@/lib/core/feature';

/** Dream Rift: a danmaku bullet hell with co-op lobbies, a relay handler and a leaderboard. */
export default defineFeature({
  id: 'dream-rift',
  kind: 'game',
  basePath: '/dream-rift',
  delivery: 'island',
  routes: [
    'app/routes/api/dream-rift/coop.ts',
    'app/routes/api/dream-rift/leaderboard.ts',
    'app/routes/api/dream-rift/score.ts',
    'app/routes/dream-rift.tsx',
  ],
  namespaces: ['c-dream-rift'],
  catalog: 'features/dream-rift/catalog.ts',
});
