import { defineFeature } from '@/lib/core/feature';

/** Altair: Outpost 13, a top-down survivor with solo runs, co-op lobbies and server-verified run logs. */
export default defineFeature({
  id: 'altair',
  kind: 'game',
  basePath: '/altair',
  delivery: 'island',
  routes: [
    'app/routes/altair.tsx',
    'app/routes/altair/index.tsx',
    'app/routes/altair/multiplayer.tsx',
    'app/routes/altair/multiplayer/$lobbyId.tsx',
    'app/routes/altair/multiplayer/index.tsx',
    'features/altair/api/altair.heat.server.ts',
    'features/altair/api/altair.leaderboard.server.ts',
    'features/altair/api/altair.match.server.ts',
    'features/altair/api/altair.meta.server.ts',
    'features/altair/api/altair.run.finish.server.ts',
    'features/altair/api/altair.run.start.server.ts',
    'features/altair/api/altair.run.status.server.ts',
    'features/altair/api/altair.score.server.ts',
  ],
  namespaces: ['c-altair', 'r-altair'],
  catalog: 'features/altair/catalog.ts',
  listed: true,
});
