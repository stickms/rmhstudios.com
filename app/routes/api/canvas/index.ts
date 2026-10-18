import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getCurrentCanvas } from '@/lib/canvas/canvas.server';

/** GET /api/canvas — the current pixel-canvas event plus the viewer's cooldown (Z5). */
export const Route = createFileRoute('/api/canvas/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await getCurrentCanvas(userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        }),
      ),
    },
  },
});
