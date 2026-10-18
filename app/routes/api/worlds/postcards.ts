import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { setPostcardHidden } from '@/lib/worlds/snapshots.server';

const schema = z.object({ id: z.string().min(1).max(40), hidden: z.boolean() });

/** POST /api/worlds/postcards — owner hides or restores a postcard on their world. */
export const Route = createFileRoute('/api/worlds/postcards')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'write', body: schema }, async ({ userId, body }) => {
        const ok = await setPostcardHidden(userId, body.id, body.hidden);
        return ok
          ? Response.json({ ok: true })
          : Response.json({ error: 'Not found' }, { status: 404 });
      }),
    },
  },
});
