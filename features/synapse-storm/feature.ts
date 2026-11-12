import { defineFeature } from '@/lib/core/feature';

/** Synapse Storm: a micro-challenge puzzle game with multiplayer lobbies, cloud saves and a leaderboard. */
export default defineFeature({
  id: 'synapse-storm',
  kind: 'game',
  basePath: '/synapse-storm',
  delivery: 'island',
  routes: [
    'features/synapse-storm/api/games.synapse-storm.leaderboard.server.ts',
    'features/synapse-storm/api/games.synapse-storm.save.server.ts',
    'lib/game/api/games.synapse-storm.score.server.ts',
    'app/routes/synapse-storm.tsx',
  ],
  namespaces: ['c-synapse-storm'],
  catalog: 'features/synapse-storm/catalog.ts',
});
