import { defineFeature } from '@/lib/core/feature';

/** Signal Forge: a hidden deck-building roguelike with cloud saves and a leaderboard. */
export default defineFeature({
  id: 'signal-forge',
  kind: 'game',
  basePath: '/secret/signal-forge',
  delivery: 'island',
  routes: [
    'app/routes/api/signal-forge/abandon.ts',
    'app/routes/api/signal-forge/leaderboard.ts',
    'app/routes/api/signal-forge/load.ts',
    'app/routes/api/signal-forge/save.ts',
    'app/routes/api/signal-forge/score.ts',
    'app/routes/secret/signal-forge.tsx',
  ],
  // The game's strings, and the Vault's (`r-secret`: the way back to /secret) the page frame renders.
  namespaces: ['c-signal-forge', 'r-secret'],
  listed: false,
});
