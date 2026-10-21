import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getCanvasLog } from '@/lib/canvas/canvas.server';
import { canvasLogQuery } from '@/lib/canvas/shared';

/** GET /api/canvas/log?id=&after= — placement history of a finished canvas, for the timelapse. */
export const Route = createFileRoute('/api/canvas/log')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', query: canvasLogQuery },
        async ({ query }) => {
          const log = await getCanvasLog(query.id, query.after);
          if (!log) return Response.json({ error: 'No replay available' }, { status: 404 });
          return Response.json(log, { headers: { 'Cache-Control': 'public, max-age=3600' } });
        },
      ),
    },
  },
});
