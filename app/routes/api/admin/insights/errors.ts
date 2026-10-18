import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { flushClientErrors, listErrorGroups, setErrorResolved } from '@/lib/ops/error-inbox.server';

/**
 * GET   /api/admin/insights/errors — client-error groups, newest activity first.
 * PATCH /api/admin/insights/errors — mark a group resolved / reopened.
 */
export const Route = createFileRoute('/api/admin/insights/errors')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () => {
        await flushClientErrors();
        return Response.json({ groups: await listErrorGroups() });
      }),
      PATCH: defineHandler(
        {
          auth: 'admin',
          rateLimit: 'write',
          body: z.object({ id: z.string().min(1).max(40), resolved: z.boolean() }),
        },
        async ({ body }) => {
          const ok = await setErrorResolved(body.id, body.resolved);
          return ok
            ? Response.json({ ok: true })
            : Response.json({ error: 'Not found' }, { status: 404 });
        },
      ),
    },
  },
});
