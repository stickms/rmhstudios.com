import { defineFeature } from '@/lib/core/feature';

/** RMH Med Schools: anonymized US med school admissions-cycle data. Phase 3 adds routes, the `medschools` namespace and the catalog entry. */
export default defineFeature(
  {
    id: 'medschools',
    kind: 'app',
    basePath:
      '/rmh-medschool',
    delivery:
      'shell',
    routes:
      [],
    namespaces:
      ['medschools'],
    listed: false,
  },
);
