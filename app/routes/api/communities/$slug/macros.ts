import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { requireMod } from '@/lib/communities/guard.server';
import { macroInputSchema } from '@/lib/safety/macros';
import { createMacro, deleteMacro, listMacros } from '@/lib/safety/macros.server';

/** S4 — a community's moderator macros. Mods only. GET list · POST create · DELETE ?id=. */
export const Route = createFileRoute('/api/communities/$slug/macros')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ params, userId }) => {
        const guard = await requireMod(params.slug, userId);
        if (!guard.ok) return guard.response;
        return Response.json({ items: await listMacros(guard.value.id) });
      }),
      POST: defineHandler(
        { rateLimit: 'write', body: macroInputSchema },
        async ({ params, userId, body }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          const macro = await createMacro(guard.value.id, userId, body);
          if (!macro) return Response.json({ error: 'Macro limit reached' }, { status: 409 });
          return Response.json(macro, { status: 201 });
        },
      ),
      DELETE: defineHandler(
        { rateLimit: 'write', query: z.object({ id: z.string().min(1).max(40) }) },
        async ({ params, userId, query }) => {
          const guard = await requireMod(params.slug, userId);
          if (!guard.ok) return guard.response;
          const ok = await deleteMacro(guard.value.id, query.id);
          return Response.json({ success: ok }, { status: ok ? 200 : 404 });
        },
      ),
    },
  },
});
