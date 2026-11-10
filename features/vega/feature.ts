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
  // The game's strings, and the Vault's (`r-secret`: the way back to /secret) the page frame renders.
  namespaces: ['c-vega', 'r-secret'],
  listed: false,
});
