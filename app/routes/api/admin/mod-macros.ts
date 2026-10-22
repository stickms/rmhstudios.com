import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { macroInputSchema } from '@/lib/safety/macros';
import { createMacro, deleteMacro, listMacros } from '@/lib/safety/macros.server';

/** S4 — site-wide moderator macros. GET list · POST create · DELETE ?id=. */
export const Route = createFileRoute('/api/admin/mod-macros')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin', rateLimit: 'read' }, async () =>
        Response.json({ items: await listMacros(null) }),
      ),
      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: macroInputSchema },
        async ({ userId, body }) => {
          const macro = await createMacro(null, userId, body);
          if (!macro) return Response.json({ error: 'Macro limit reached' }, { status: 409 });
          await logAdminAction(userId, 'macro.create', { targetType: 'macro', targetId: macro.id });
          return Response.json(macro, { status: 201 });
        },
      ),
      DELETE: defineHandler(
        { auth: 'admin', rateLimit: 'write', query: z.object({ id: z.string().min(1).max(40) }) },
        async ({ userId, query }) => {
          const ok = await deleteMacro(null, query.id);
          if (ok)
            await logAdminAction(userId, 'macro.delete', {
              targetType: 'macro',
              targetId: query.id,
            });
          return Response.json({ success: ok }, { status: ok ? 200 : 404 });
        },
      ),
    },
  },
});
