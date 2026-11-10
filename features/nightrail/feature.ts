import { defineFeature } from '@/lib/core/feature';

/** Nightrail: an on-rails trick racer (canvas 2D HUD over a three.js scene) with a weekly trick board. */
export default defineFeature({
  id: 'nightrail',
  kind: 'game',
  basePath: '/nightrail',
  delivery: 'island',
  routes: [
    'app/routes/nightrail.tsx',
    'app/routes/api/nightrail/tricks/index.ts',
    'app/routes/api/nightrail/tricks/vote.ts',
  ],
  namespaces: ['c-nightrail'],
  catalog: 'lib/catalog/games/nightrail.ts',
  listed: true,
});
