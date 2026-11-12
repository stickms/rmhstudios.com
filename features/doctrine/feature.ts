import { defineFeature } from '@/lib/core/feature';

/**
 * Doctrine (RMH Strategies): daily puzzles, incidents, reputation, coalition, the safehouse and Sahur mode.
 * Ships as the `/strategies` app; `doctrine` is the data/API/socket name. The six `useDoctrine*` hooks and the
 * Zustand store that used to sit in the shared `hooks/` and `stores/` roots now live in `ui/`.
 * Cross-feature edges: none.
 */
export default defineFeature({
  id: 'doctrine',
  kind: 'app',
  basePath: '/strategies',
  delivery: 'island',
  routes: [
    'app/routes/strategies.tsx',
    'features/doctrine/api/doctrine.admin.disclosures.server.ts',
    'features/doctrine/api/doctrine.admin.incidents.server.ts',
    'features/doctrine/api/doctrine.admin.tiers.server.ts',
    'features/doctrine/api/doctrine.incidents.$id.server.ts',
    'features/doctrine/api/doctrine.incidents.server.ts',
    'features/doctrine/api/doctrine.puzzles.leaderboard.server.ts',
    'features/doctrine/api/doctrine.puzzles.replay.server.ts',
    'features/doctrine/api/doctrine.puzzles.submit.server.ts',
    'features/doctrine/api/doctrine.puzzles.today.server.ts',
    'features/doctrine/api/doctrine.reactions.server.ts',
    'features/doctrine/api/doctrine.recruitment.create.server.ts',
    'features/doctrine/api/doctrine.recruitment.redeem.server.ts',
    'features/doctrine/api/doctrine.reputation.server.ts',
    'features/doctrine/api/doctrine.reputation.leaderboard.server.ts',
    'features/doctrine/api/doctrine.safehouse.content.server.ts',
    'features/doctrine/api/doctrine.safehouse.disclosures.server.ts',
    'features/doctrine/api/doctrine.sahur.status.server.ts',
    'app/routes/strategies/incidents.tsx',
    'app/routes/strategies/index.tsx',
    'app/routes/strategies/profile/index.tsx',
    'app/routes/strategies/profile/reputation.tsx',
    'app/routes/strategies/profile/settings.tsx',
    'app/routes/strategies/puzzles/$mode.tsx',
    'app/routes/strategies/puzzles/archive.tsx',
    'app/routes/strategies/puzzles/index.tsx',
    'app/routes/strategies/puzzles/leaderboard.tsx',
    'app/routes/strategies/safehouse/drops.tsx',
    'app/routes/strategies/safehouse/index.tsx',
    'app/routes/strategies/safehouse/recruit.tsx',
    'app/routes/strategies/sahur.tsx',
  ],
  namespaces: ['c-doctrine'],
  catalog: 'features/doctrine/catalog.ts',
  listed: true,
});
