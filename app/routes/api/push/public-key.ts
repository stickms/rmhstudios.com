import { createFileRoute } from '@tanstack/react-router';
import { pushConfigured } from '@/lib/push/send.server';

/**
 * GET /api/push/public-key — the VAPID public key browsers need to create a
 * push subscription. 404 when push isn't configured so the client UI can
 * hide the toggle entirely.
 */
export const Route = createFileRoute('/api/push/public-key')({
  server: {
    handlers: {
      GET: async () => {
        if (!pushConfigured() || !process.env.VAPID_PUBLIC_KEY) {
          return Response.json({ error: 'Push not configured' }, { status: 404 });
        }
        return Response.json(
          { key: process.env.VAPID_PUBLIC_KEY },
          { headers: { 'Cache-Control': 'public, max-age=3600' } }
        );
      },
    },
  },
});
