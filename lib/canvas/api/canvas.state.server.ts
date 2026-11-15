import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { getCanvasState } from '@/lib/canvas/canvas.server';
import { canvasEventQuery } from '@/lib/canvas/schema';

/** GET /api/canvas/state?id= — the raw board, one byte (palette index) per pixel. */
export const route = apiRoute('/api/canvas/state', {
  GET: defineHandler(
    { auth: 'none', rateLimit: 'read', query: canvasEventQuery },
    async ({ query }) => {
      const state = await getCanvasState(query.id);
      if (!state) return Response.json({ error: 'Canvas not found' }, { status: 404 });
      return new Response(state as BodyInit, {
        headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' },
      });
    },
  ),
});
