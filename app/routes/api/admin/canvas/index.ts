import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createCanvasEvent, listCanvasEvents } from '@/lib/canvas/canvas.server';
import { createCanvasEventSchema } from '@/lib/canvas/schema';

/** GET/POST /api/admin/canvas — list and start pixel-canvas events (Z5). */
export const Route = createFileRoute('/api/admin/canvas/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json({ events: await listCanvasEvents() }),
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: createCanvasEventSchema },
        async ({ userId, body }) => {
          const r = await createCanvasEvent(userId, body);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ id: r.id }, { status: 201 });
        },
      ),
    },
  },
});
