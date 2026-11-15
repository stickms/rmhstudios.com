/**
 * POST /api/tf2-hud/huds/:id/versions/:n — owner: restore version n as a new version.
 */

import { apiRoute } from '@/lib/api/route.server';
import { defineHandler, apiError } from '@/lib/api/handler.server';
import { guard } from '@/lib/tf2-hud/guard.server';
import { restoreVersion } from '@/lib/tf2-hud/hud.server';

export const route = apiRoute('/api/tf2-hud/huds/$id/versions/$n', {
  POST: defineHandler(
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'tf2hud-restore' } },
    ({ userId, params }) =>
      guard(async () => {
        const n = Number.parseInt(params.n, 10);
        if (!Number.isInteger(n) || n < 1) return apiError('Invalid version', 400);
        return Response.json(await restoreVersion(params.id, userId, n));
      }),
  ),
});
