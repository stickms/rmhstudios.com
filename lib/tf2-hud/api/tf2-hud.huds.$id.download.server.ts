/**
 * POST /api/tf2-hud/huds/:id/download — count a download of a public/unlisted HUD.
 * Answers `{ success: true }` (it was a bodyless 204 before the typed client).
 */

import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { countTf2HudDownloadApi } from '@/lib/tf2-hud/hud.contract';
import { guard } from '@/lib/tf2-hud/guard.server';
import { countDownload } from '@/lib/tf2-hud/hud.server';

export const route = apiRoute('/api/tf2-hud/huds/$id/download', {
  POST: implement(
    countTf2HudDownloadApi,
    { auth: 'optional', rateLimit: { limit: 20, windowMs: 60_000, prefix: 'tf2hud-dl' } },
    ({ userId, params }) =>
      guard(async () => {
        await countDownload(params.id, userId);
        return Response.json({ success: true });
      }),
  ),
});
