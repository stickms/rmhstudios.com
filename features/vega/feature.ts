import { defineFeature } from '@/lib/core/feature';

/** Vega: a hidden strategy game with a server-side score board. */
export default defineFeature({
  id: 'vega',
  kind: 'game',
  basePath: '/secret/vega',
  delivery: 'island',
  routes: [
    'app/routes/api/vega/leaderboard.ts',
    'app/routes/api/vega/score.ts',
    'app/routes/secret/vega.tsx',
  ],
  namespaces: ['c-vega'],
  listed: false,
});
