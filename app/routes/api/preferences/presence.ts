import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { presencePrivacySchema, DEFAULT_PRESENCE_VISIBILITY } from '@/lib/presence-types';

/**
 * GET /api/preferences/presence — the caller's presence visibility + detail.
 * PUT /api/preferences/presence — save them (partial upsert of UserProfile).
 *
 * Controls who sees the user in the Friends rail / activity line (§9). The
 * profile row is created on demand so a new user can set this before they have
 * one.
 */
export const Route = createFileRoute('/api/preferences/presence')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const row = await prisma.userProfile.findUnique({
          where: { userId: session.user.id },
          select: { presenceVisibility: true, presenceDetail: true },
        });
        return Response.json({
          presenceVisibility: row?.presenceVisibility ?? DEFAULT_PRESENCE_VISIBILITY,
          presenceDetail: row?.presenceDetail ?? true,
        });
      }),
      PUT: defineHandler(
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'presence-prefs' } },
        async ({ request, session }) => {
          const body = await request.json().catch(() => null);
          const parsed = presencePrivacySchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const data = {
            ...(parsed.data.presenceVisibility !== undefined
              ? { presenceVisibility: parsed.data.presenceVisibility }
              : {}),
            ...(parsed.data.presenceDetail !== undefined
              ? { presenceDetail: parsed.data.presenceDetail }
              : {}),
          };
          const row = await prisma.userProfile.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, ...data },
            update: data,
            select: { presenceVisibility: true, presenceDetail: true },
          });
          return Response.json({
            presenceVisibility: row.presenceVisibility,
            presenceDetail: row.presenceDetail,
          });
        },
      ),
    },
  },
});
