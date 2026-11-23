import { defineFeature } from '@/lib/core/feature';

/** Project Vega: a clinical-horror tower defense with a server-side score board. */
export default defineFeature({
  id: 'vega',
  kind: 'game',
  basePath: '/vega',
  delivery: 'island',
  routes: ['lib/game/api/vega.leaderboard.server.ts', 'features/vega/api/vega.score.server.ts', 'app/routes/vega.tsx'],
  // The game's strings, the way back to the games library included.
  namespaces: ['c-vega'],
  catalog: 'features/vega/catalog.ts',
  listed: true,
});
