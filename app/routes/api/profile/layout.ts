import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { layoutSchema, parseLayout } from '@/lib/profile/modules';

/**
 * GET /api/profile/layout — the caller's profile showcase modules.
 * PUT /api/profile/layout { modules } — replace them (validated, capped).
 */
export const Route = createFileRoute('/api/profile/layout')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const row = await prisma.profileLayout.findUnique({
            where: { userId: session.user.id },
            select: { modules: true },
          });
          return Response.json({ modules: parseLayout(row?.modules) });
        } catch (error) {
          console.error('Profile layout fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      PUT: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const { allowed } = rateLimit(getClientIp(request), { limit: 20, windowMs: 60_000, prefix: 'profile-layout' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });
          const body = await request.json().catch(() => null);
          const parsed = layoutSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          await prisma.profileLayout.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, modules: parsed.data.modules },
            update: { modules: parsed.data.modules },
          });
          return Response.json({ modules: parsed.data.modules });
        } catch (error) {
          console.error('Profile layout save error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
