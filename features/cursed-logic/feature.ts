import { defineFeature } from '@/lib/core/feature';

/** Cursed Logic: a turn-based duel against an unstable Protocol. */
export default defineFeature({
  id: 'cursed-logic',
  kind: 'game',
  basePath: '/cursed-logic',
  delivery: 'island',
  routes: [
    'app/routes/cursed-logic.tsx',
    'features/cursed-logic/api/cursed-logic.score.server.ts',
    'features/cursed-logic/api/cursed-logic.leaderboard.server.ts',
  ],
  // The game's strings, the way back to the games library included.
  namespaces: ['c-cursed-logic'],
  catalog: 'features/cursed-logic/catalog.ts',
  listed: true,
});
