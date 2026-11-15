import { defineFeature } from '@/lib/core/feature';

/** Laundry Sort: a cloth-sim sorting arcade game with versus lobbies and a leaderboard. */
export default defineFeature(
  {
    id: 'laundry-sort',
    kind: 'game',
    basePath:
      '/laundry-sort',
    delivery:
      'island',
    routes:
      [
        'features/laundry-sort/api/laundry-sort.leaderboard.server.ts',
        'features/laundry-sort/api/laundry-sort.score.server.ts',
        'app/routes/laundry-sort.tsx',
      ],
    namespaces:
      [
        'c-laundry-sort',
      ],
    catalog:
      'features/laundry-sort/catalog.ts',
  },
);
