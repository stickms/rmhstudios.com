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
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'layout' }, body: layoutPrefsSchema },
        async ({ session, body }) => {
          const data = {
            ...(body.sidebar !== undefined ? { sidebar: body.sidebar } : {}),
            ...(body.homeStack !== undefined ? { homeStack: body.homeStack } : {}),
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
