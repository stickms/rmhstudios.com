import { defineFeature } from '@/lib/core/feature';

/** Signal Forge: a deck-building roguelike with cloud saves and a leaderboard. */
export default defineFeature({
  id: 'signal-forge',
  kind: 'game',
  basePath: '/signal-forge',
  delivery: 'island',
  routes: [
    'features/signal-forge/api/signal-forge.abandon.server.ts',
    'features/signal-forge/api/signal-forge.leaderboard.server.ts',
    'features/signal-forge/api/signal-forge.load.server.ts',
    'features/signal-forge/api/signal-forge.save.server.ts',
    'features/signal-forge/api/signal-forge.score.server.ts',
    'app/routes/signal-forge.tsx',
  ],
  // The game's strings, the way back to the games library included.
  namespaces: ['c-signal-forge'],
  catalog: 'features/signal-forge/catalog.ts',
  listed: true,
});
