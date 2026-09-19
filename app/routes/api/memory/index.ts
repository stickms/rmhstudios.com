import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { forget, forgetAll, recall, remember } from '@/lib/ai/memory/memory.server';
import { isValidKey } from '@/lib/ai/memory/keys';
import { AppError } from '@/lib/errors/codes';

/**
 * `/api/memory` — what the site remembers about you (M3).
 *
 * This route is the reason the memory store is defensible at all. A model that
 * accumulates facts about somebody is a liability when they cannot see it; the
 * same store with a page that lists every row, lets them correct one and lets
 * them delete the lot is a feature. The store was built with this route in
 * mind, not the other way round — which is why `source: 'member'` outranks
 * every surface and never expires.
 *
 * DELETE with no key clears everything. That is deliberate and is not hidden
 * behind a different verb: "forget all of this" should be one action.
 */

const writeSchema = z.object({
  key: z.string().min(1).max(64),
  value: z.string().trim().min(1).max(400),
});

const deleteSchema = z.object({ key: z.string().max(64).optional() });

export const Route = createFileRoute('/api/memory/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ session }) =>
        Response.json({ memories: await recall(session.user.id) }),
      ),

      POST: defineHandler(
        { rateLimit: 'write', body: writeSchema },
        async ({ session, body }) => {
          if (!isValidKey(body.key)) throw new AppError('INVALID_INPUT', { field: 'key' });
          // Always `member`: this route is the member speaking. A surface
          // writes through `remember()` directly, never over HTTP.
          const ok = await remember(session.user.id, body.key, body.value, 'member');
          if (!ok) throw new AppError('INVALID_INPUT', { field: 'key' });
          return Response.json({ ok: true });
        },
      ),

      DELETE: defineHandler(
        { rateLimit: 'write', body: deleteSchema, allowEmptyBody: true },
        async ({ session, body }) =>
          Response.json(
            body?.key
              ? { forgotten: (await forget(session.user.id, body.key)) ? 1 : 0 }
              : { forgotten: await forgetAll(session.user.id) },
          ),
      ),
    },
  },
});
