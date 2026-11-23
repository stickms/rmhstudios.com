import { defineFeature } from '@/lib/core/feature';

/** Cursed Logic: a turn-based duel against an unstable Protocol (a hidden game for now). */
export default defineFeature({
  id: 'cursed-logic',
  kind: 'game',
  basePath: '/secret/cursed-logic',
  delivery: 'shell',
  routes: ['app/routes/secret/cursed-logic/index.tsx'],
  // The game's strings, and the Vault's (`r-secret`: the way back to /secret) the page frame renders.
  namespaces: ['c-cursed-logic', 'r-secret'],
  listed: false,
});
