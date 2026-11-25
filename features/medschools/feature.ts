import { defineFeature } from '@/lib/core/feature';

/**
 * RMH Med Schools: anonymized US med school admissions-cycle data. Listed under RMH Services (the hub row and site
 * search), not the games/apps catalog: no `catalog`, `listed: false`.
 */
export default defineFeature({
  id: 'medschools',
  kind: 'app',
  basePath: '/med',
  delivery: 'shell',
  routes: [
    'app/routes/med.tsx',
    'app/routes/med/index.tsx',
    'app/routes/med/live.tsx',
    'app/routes/med/$slug.tsx',
    'app/routes/med/tracker.tsx',
    'app/routes/med/lists.tsx',
    'app/routes/med/ask.tsx',
    'app/routes/med/practice.tsx',
    'features/medschools/api/medschools.schools.server.ts',
    'features/medschools/api/medschools.schools.$slug.server.ts',
    'features/medschools/api/medschools.schools.$slug.activity.server.ts',
    'features/medschools/api/medschools.schools.$slug.history.server.ts',
    'features/medschools/api/medschools.schools.$slug.arrivals.server.ts',
    'features/medschools/api/medschools.live.server.ts',
    'features/medschools/api/medschools.today.server.ts',
    'features/medschools/api/medschools.me.tracker.server.ts',
    'features/medschools/api/medschools.me.tracker.cycle.server.ts',
    'features/medschools/api/medschools.me.tracker.applications.server.ts',
    'features/medschools/api/medschools.me.tracker.applications.$id.server.ts',
    'features/medschools/api/medschools.me.tracker.applications.$id.milestones.$type.server.ts',
    'features/medschools/api/medschools.me.lists.server.ts',
    'features/medschools/api/medschools.me.lists.$id.server.ts',
    'features/medschools/api/medschools.me.list-order.server.ts',
    'features/medschools/api/medschools.me.list-items.server.ts',
    'features/medschools/api/medschools.me.lists.$id.items.$itemId.server.ts',
    'features/medschools/api/medschools.me.lists.$id.item-order.server.ts',
    'features/medschools/api/medschools.me.lists.$id.add-to-tracker.server.ts',
    'features/medschools/api/medschools.me.prefs.server.ts',
    'features/medschools/api/medschools.me.ask.server.ts',
    'features/medschools/api/medschools.me.stats.server.ts',
    'features/medschools/api/medschools.me.stats.onboarding.server.ts',
  ],
  namespaces: ['medschools'],
  listed: false,
});
