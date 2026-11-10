import { defineFeature } from '@/lib/core/feature';

/**
 * Hearthworks: a cozy city builder (three.js town, farming, cooking, co-op over WebRTC with a hub that only signals).
 *
 * Cross-feature edges left on purpose (tf2 is not a feature yet, so they stay `@/lib` imports):
 * `@/lib/tf2-game/assets/{urls,versions}` and `@/lib/tf2-loadout/gltf-loader` (shared model asset URLs and loader).
 */
export default defineFeature({
  id: 'hearthworks',
  kind: 'game',
  basePath: '/hearthworks',
  delivery: 'island',
  routes: ['app/routes/hearthworks.tsx'],
  namespaces: ['c-hearthworks'],
  catalog: 'features/hearthworks/catalog.ts',
  listed: true,
});
