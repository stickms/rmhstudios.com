import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getWager } from '@/lib/wager/wager.server';

export const Route = createFileRoute('/api/wager/$id')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, session }) => {
        const wager = await getWager(params.id, session?.user?.id ?? null);
        if (!wager) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json({ wager });
      }),
    },
  },
});
