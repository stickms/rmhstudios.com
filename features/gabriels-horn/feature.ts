import { defineFeature } from '@/lib/core/feature';

/** Gabriel's Horn: a multiplayer bluffing card game with house rules, table reads and a leaderboard. */
export default defineFeature({
  id: 'gabriels-horn',
  kind: 'game',
  basePath: '/gabriels-horn',
  delivery: 'island',
  routes: [
    'app/routes/api/gabriels-horn/house-rule.ts',
    'app/routes/api/gabriels-horn/leaderboard.ts',
    'app/routes/api/gabriels-horn/table-read.ts',
    'app/routes/gabriels-horn.tsx',
  ],
  namespaces: ['c-gabriels-horn'],
  catalog: 'features/gabriels-horn/catalog.ts',
});
