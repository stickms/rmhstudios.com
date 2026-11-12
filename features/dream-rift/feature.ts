import { defineFeature } from '@/lib/core/feature';

/** Dream Rift: a danmaku bullet hell with co-op lobbies, a relay handler and a leaderboard. */
export default defineFeature({
  id: 'dream-rift',
  kind: 'game',
  basePath: '/dream-rift',
  delivery: 'island',
  routes: [
    'features/dream-rift/api/dream-rift.coop.server.ts',
    'features/dream-rift/api/dream-rift.leaderboard.server.ts',
    'features/dream-rift/api/dream-rift.score.server.ts',
    'app/routes/dream-rift.tsx',
  ],
  namespaces: ['c-dream-rift'],
  catalog: 'features/dream-rift/catalog.ts',
});
