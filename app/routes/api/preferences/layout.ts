import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { layoutPrefsSchema, parseLayoutPref } from '@/lib/home-widgets';

/**
 * GET  /api/preferences/layout — the caller's sidebar pin/hide + home widget
 *      stack, normalized (unknown ids dropped) so the client can apply directly.
 * PUT  /api/preferences/layout — save them (partial upsert, §2.3).
 *
 * Cross-device source of truth for layout; the client also keeps a localStorage
 * mirror for a flash-free first paint (appearance pattern). A field left out is
 * unchanged.
 */
export const Route = createFileRoute('/api/preferences/layout')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const row = await prisma.layoutPreference.findUnique({
          where: { userId: session.user.id },
          select: { sidebar: true, homeStack: true },
        });
        return Response.json(parseLayoutPref(row));
      }),
      PUT: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'layout' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = layoutPrefsSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const data = {
            ...(parsed.data.sidebar !== undefined ? { sidebar: parsed.data.sidebar } : {}),
            ...(parsed.data.homeStack !== undefined ? { homeStack: parsed.data.homeStack } : {}),
          };
          const row = await prisma.layoutPreference.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, ...data },
            update: data,
          });
          return Response.json(parseLayoutPref(row));
        },
      ),
    },
  },
});
