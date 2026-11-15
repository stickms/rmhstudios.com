/**
 * GET /api/tf2-loadout/models — the defindexes that have a 3D model.
 */

import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listTf2LoadoutModelsApi } from '@/lib/tf2-loadout/models.contract';
import { listModelIds } from '@/lib/tf2-loadout/models.server';

export const route = apiRoute('/api/tf2-loadout/models', {
  GET: implement(
    listTf2LoadoutModelsApi,
    {
      auth: 'none',
      rateLimit: 'read',
      cache: { visibility: 'public', maxAge: 300, sMaxAge: 300, staleWhileRevalidate: 3600 },
    },
    async () => Response.json({ ids: await listModelIds() }),
  ),
});
