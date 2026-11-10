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
    'app/routes/api/doctrine/admin/disclosures.ts',
    'app/routes/api/doctrine/admin/incidents.ts',
    'app/routes/api/doctrine/admin/tiers.ts',
    'app/routes/api/doctrine/incidents/$id.ts',
    'app/routes/api/doctrine/incidents/index.ts',
    'app/routes/api/doctrine/puzzles/leaderboard.ts',
    'app/routes/api/doctrine/puzzles/replay.ts',
    'app/routes/api/doctrine/puzzles/submit.ts',
    'app/routes/api/doctrine/puzzles/today.ts',
    'app/routes/api/doctrine/reactions.ts',
    'app/routes/api/doctrine/recruitment/create.ts',
    'app/routes/api/doctrine/recruitment/redeem.ts',
    'app/routes/api/doctrine/reputation/index.ts',
    'app/routes/api/doctrine/reputation/leaderboard.ts',
    'app/routes/api/doctrine/safehouse/content.ts',
    'app/routes/api/doctrine/safehouse/disclosures.ts',
    'app/routes/api/doctrine/sahur/status.ts',
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
  catalog: 'lib/catalog/apps/rmh-strategies.ts',
  listed: true,
});
