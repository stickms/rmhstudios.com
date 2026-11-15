import { defineFeature } from '@/lib/core/feature';

/** rmhOS: a Linux desktop in the browser tab (v86), signed in as the account's own user. */
export default defineFeature({
  id: 'rmhos',
  kind: 'app',
  basePath: '/rmhos',
  delivery: 'shell',
  routes: ['app/routes/rmhos.tsx', 'features/rmhos/api/rmhos.session.server.ts'],
  namespaces: ['c-rmhos'],
  catalog: 'features/rmhos/catalog.ts',
  listed: true,
});
