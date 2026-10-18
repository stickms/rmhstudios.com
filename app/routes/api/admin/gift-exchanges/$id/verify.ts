import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { verifyExchangeDraw } from '@/lib/gifting/exchange.server';

/** GET — re-run a disputed draw from its stored seed and compare with the stored pairings. */
export const Route = createFileRoute('/api/admin/gift-exchanges/$id/verify')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async ({ params }) => {
        const result = await verifyExchangeDraw(params.id);
        if (!result) return Response.json({ error: 'Not drawn' }, { status: 404 });
        return Response.json(result);
      }),
    },
  },
});
