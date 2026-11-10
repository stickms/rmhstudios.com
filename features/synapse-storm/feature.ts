import { defineFeature } from '@/lib/core/feature';

/** Synapse Storm: a micro-challenge puzzle game with multiplayer lobbies, cloud saves and a leaderboard. */
export default defineFeature({
  id: 'synapse-storm',
  kind: 'game',
  basePath: '/synapse-storm',
  delivery: 'island',
  routes: [
    'app/routes/api/games/synapse-storm/leaderboard.ts',
    'app/routes/api/games/synapse-storm/save.ts',
    'app/routes/api/games/synapse-storm/score.ts',
    'app/routes/synapse-storm.tsx',
  ],
  namespaces: ['c-synapse-storm'],
  catalog: 'features/synapse-storm/catalog.ts',
});
