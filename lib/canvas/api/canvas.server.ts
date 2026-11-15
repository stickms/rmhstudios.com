import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getCurrentCanvas } from '@/lib/canvas/canvas.server';

/** GET /api/canvas — the current pixel-canvas event plus the viewer's cooldown (Z5). */
export const route = apiRoute('/api/canvas', {
  GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) =>
    Response.json(await getCurrentCanvas(userId), {
      headers: { 'Cache-Control': 'private, no-store' },
    }),
  ),
});
