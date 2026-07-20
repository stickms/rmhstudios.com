import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
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
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const row = await prisma.layoutPreference.findUnique({
            where: { userId: session.user.id },
            select: { sidebar: true, homeStack: true },
          });
          return Response.json(parseLayoutPref(row));
        } catch (error) {
          console.error('Layout prefs fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 30, windowMs: 60_000, prefix: 'layout' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

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
        } catch (error) {
          console.error('Layout prefs save error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
