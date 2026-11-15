import { defineFeature } from '@/lib/core/feature';

/** Nightrail: an on-rails trick racer (canvas 2D HUD over a three.js scene) with a weekly trick board. */
export default defineFeature(
  {
    id: 'nightrail',
    kind: 'game',
    basePath:
      '/nightrail',
    delivery:
      'island',
    routes:
      [
        'app/routes/nightrail.tsx',
        'lib/trick-week/api/nightrail.tricks.server.ts',
        'lib/trick-week/api/nightrail.tricks.vote.server.ts',
      ],
    namespaces:
      [
        'c-nightrail',
      ],
    catalog:
      'features/nightrail/catalog.ts',
    listed: true,
  },
);
