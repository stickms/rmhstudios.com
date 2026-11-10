import { defineFeature } from '@/lib/core/feature';

/** Laundry Sort: a cloth-sim sorting arcade game with versus lobbies and a leaderboard. */
export default defineFeature({
  id: 'laundry-sort',
  kind: 'game',
  basePath: '/laundry-sort',
  delivery: 'island',
  routes: [
    'app/routes/api/laundry-sort/leaderboard.ts',
    'app/routes/api/laundry-sort/score.ts',
    'app/routes/laundry-sort.tsx',
  ],
  namespaces: ['c-laundry-sort'],
  catalog: 'features/laundry-sort/catalog.ts',
});
