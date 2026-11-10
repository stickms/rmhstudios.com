import { defineFeature } from '@/lib/core/feature';

/** Balatro: the LOVE game compiled to WebAssembly, plus multiplayer (P2P lobbies, queue, replays). */
export default defineFeature({
  id: 'balatro',
  kind: 'game',
  basePath: '/balatro',
  delivery: 'island',
  routes: ['app/routes/balatro.tsx', 'app/routes/api/balatro/pack.$file.ts'],
  namespaces: ['c-balatro'],
  // Routed but absent from lib/catalog (redesign audit A2: owner decision pending).
  listed: false,
});
