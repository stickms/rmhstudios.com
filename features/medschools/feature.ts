import { defineFeature } from '@/lib/core/feature';

/**
 * RMH Med Schools: anonymized US med school admissions-cycle data. Listed under RMH Services (the hub row and site
 * search), not the games/apps catalog: no `catalog`, `listed: false`.
 */
export default defineFeature({
  id: 'medschools',
  kind: 'app',
  basePath: '/rmh-medschool',
  delivery: 'shell',
  routes: [
    'app/routes/_site/rmh-medschool/index.tsx',
    'app/routes/_site/rmh-medschool/live.tsx',
    'app/routes/_site/rmh-medschool/$slug.tsx',
    'features/medschools/api/medschools.schools.server.ts',
    'features/medschools/api/medschools.schools.$slug.server.ts',
    'features/medschools/api/medschools.schools.$slug.activity.server.ts',
    'features/medschools/api/medschools.schools.$slug.history.server.ts',
    'features/medschools/api/medschools.live.server.ts',
    'features/medschools/api/medschools.today.server.ts',
  ],
  namespaces: ['medschools'],
  listed: false,
});
