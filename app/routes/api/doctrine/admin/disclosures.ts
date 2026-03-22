import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getUserTier, checkTierAccess } from '@/lib/doctrine/tiers';
import { createDisclosure, transitionDisclosure } from '@/lib/doctrine/narrative';
import type { DisclosureStatus, TierId } from '@/lib/doctrine/types';

const VALID_STATUSES: DisclosureStatus[] = ['CLASSIFIED', 'TEASED', 'DISCLOSED', 'ARCHIVED'];

export const Route = createFileRoute('/api/doctrine/admin/disclosures')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'doctrine-admin-disclosure' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          // Require admin or OPERATOR tier
          const [admin, userTier] = await Promise.all([
            prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } }),
            getUserTier(session.user.id),
          ]);

          if (!admin?.isAdmin && !checkTierAccess(userTier, 'OPERATOR')) {
            return Response.json({ error: 'Admin or Operator access required' }, { status: 403 });
          }

          const body = await request.json();
          const { codename, publicTitle, content, narrative, minTierTeaser, scheduledAt, mediaUrls } = body;

          if (!codename || !publicTitle || !content || !narrative) {
            return Response.json({ error: 'codename, publicTitle, content, and narrative are required' }, { status: 400 });
          }

          const disclosure = await createDisclosure({
            codename,
            publicTitle,
            content,
            narrative,
            minTierTeaser: minTierTeaser as TierId | undefined,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
            mediaUrls,
          });

          return Response.json({ success: true, disclosure });
        } catch (e) {
          console.error('Doctrine admin disclosure create failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      // PATCH: Transition disclosure status
      PATCH: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'doctrine-admin-disclosure' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const admin = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { isAdmin: true },
          });

          if (!admin?.isAdmin) {
            return Response.json({ error: 'Admin access required' }, { status: 403 });
          }

          const body = await request.json();
          const { id, status } = body;

          if (!id || !VALID_STATUSES.includes(status)) {
            return Response.json({ error: 'id and valid status are required' }, { status: 400 });
          }

          const disclosure = await transitionDisclosure(id, status);
          return Response.json({ success: true, disclosure });
        } catch (e) {
          console.error('Doctrine admin disclosure transition failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
