import { defineFeature } from '@/lib/core/feature';

/** RMHCharacters: a D&D 5e (2024) and Pathfinder 2e (Remaster) character builder with a rules advisor. */
export default defineFeature({
  id: 'rmhcharacters',
  kind: 'app',
  basePath: '/rmhcharacters',
  delivery: 'shell',
  routes: ['app/routes/rmhcharacters.tsx', 'features/rmhcharacters/api/rmhcharacters.advisor.server.ts'],
  namespaces: ['c-rmhcharacters'],
  catalog: 'features/rmhcharacters/catalog.ts',
  listed: true,
});
