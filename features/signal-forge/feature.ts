import { defineFeature } from '@/lib/core/feature';

/** Signal Forge: a hidden deck-building roguelike with cloud saves and a leaderboard. */
export default defineFeature(
  {
    id: 'signal-forge',
    kind: 'game',
    basePath:
      '/secret/signal-forge',
    delivery:
      'island',
    routes:
      [
        'features/signal-forge/api/signal-forge.abandon.server.ts',
        'features/signal-forge/api/signal-forge.leaderboard.server.ts',
        'features/signal-forge/api/signal-forge.load.server.ts',
        'features/signal-forge/api/signal-forge.save.server.ts',
        'features/signal-forge/api/signal-forge.score.server.ts',
        'app/routes/secret/signal-forge.tsx',
      ],
    // The game's strings, and the Vault's (`r-secret`: the way back to /secret) the page frame renders.
    namespaces:
      [
        'c-signal-forge',
        'r-secret',
      ],
    listed: false,
  },
);
