import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/profile/profile-extras.contract';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { layoutSchema, parseLayout } from '@/lib/profile/modules-schema';

/**
 * GET /api/profile/layout — the caller's profile showcase modules.
 * PUT /api/profile/layout { modules } — replace them (validated, capped).
 */
export const route = apiRoute('/api/profile/layout', {
  GET: defineHandler({}, async ({ session }) => {
    const row = await prisma.profileLayout.findUnique({
      where: { userId: session.user.id },
      select: { modules: true },
    });
    return Response.json({ modules: parseLayout(row?.modules) });
  }),
  PUT: implement(
    C.setProfileLayoutApi,
    {
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'profile-layout' },
      body: layoutSchema,
    },
    async ({ session, body }) => {
      await prisma.profileLayout.upsert({
        where: { userId: session.user.id },
        create: { userId: session.user.id, modules: body.modules },
        update: { modules: body.modules },
      });
      return Response.json({ modules: body.modules });
    },
  ),
});
