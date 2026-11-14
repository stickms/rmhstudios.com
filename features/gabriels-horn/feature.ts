import { defineFeature } from '@/lib/core/feature';

/** Gabriel's Horn: a multiplayer bluffing card game with house rules, table reads and a leaderboard. */
export default defineFeature(
  {
    id: 'gabriels-horn',
    kind: 'game',
    basePath:
      '/gabriels-horn',
    delivery:
      'island',
    routes:
      [
        'features/gabriels-horn/api/gabriels-horn.house-rule.server.ts',
        'features/gabriels-horn/api/gabriels-horn.leaderboard.server.ts',
        'features/gabriels-horn/api/gabriels-horn.table-read.server.ts',
        'app/routes/gabriels-horn.tsx',
      ],
    namespaces:
      [
        'c-gabriels-horn',
      ],
    catalog:
      'features/gabriels-horn/catalog.ts',
  },
);
