import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { pushPublicKeyApi } from '@/lib/push/public-key.contract';
import { pushConfigured } from '@/lib/push/send.server';

/**
 * GET /api/push/public-key — the VAPID public key browsers need to create a
 * push subscription. 404 when push isn't configured so the client UI can
 * hide the toggle entirely.
 */
export const route = apiRoute('/api/push/public-key', {
  GET: implement(pushPublicKeyApi, { auth: 'none' }, async () => {
    if (!pushConfigured() || !process.env.VAPID_PUBLIC_KEY) {
      return Response.json({ error: 'Push not configured' }, { status: 404 });
    }
    return Response.json(
      { key: process.env.VAPID_PUBLIC_KEY },
      { headers: { 'Cache-Control': 'public, max-age=3600' } },
    );
  }),
});
