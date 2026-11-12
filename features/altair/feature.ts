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
    'app/routes/api/altair/match.ts',
    'app/routes/api/altair/meta.ts',
    'app/routes/api/altair/run/finish.ts',
    'features/altair/api/altair.run.start.server.ts',
    'features/altair/api/altair.run.status.server.ts',
    'app/routes/api/altair/score.ts',
  ],
  namespaces: ['c-altair', 'r-altair'],
  catalog: 'features/altair/catalog.ts',
  listed: true,
});
