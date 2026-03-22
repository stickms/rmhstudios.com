import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { getUserTier, checkTierAccess } from '@/lib/doctrine/tiers';
import { nanoid } from 'nanoid';

export const Route = createFileRoute('/api/doctrine/recruitment/create')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 5, windowMs: 300_000, prefix: 'doctrine-recruit' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const userTier = await getUserTier(session.user.id);
          if (!checkTierAccess(userTier, 'OPERATOR')) {
            return Response.json({ error: 'Operator tier required for recruitment' }, { status: 403 });
          }

          const body = await request.json();
          const { personalMessage, targetSkills, maxUses } = body;

          if (!personalMessage || typeof personalMessage !== 'string') {
            return Response.json({ error: 'Personal message is required' }, { status: 400 });
          }

          const code = nanoid(12);
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30); // 30 day expiry

          const recruitment = await prisma.doctrineRecruitmentCode.create({
            data: {
              code,
              recruiterId: session.user.id,
              personalMessage: personalMessage.slice(0, 500),
              targetSkills: Array.isArray(targetSkills) ? targetSkills.slice(0, 10) : [],
              maxUses: typeof maxUses === 'number' ? Math.min(maxUses, 20) : 5,
              expiresAt,
            },
          });

          return Response.json({
            success: true,
            code: recruitment.code,
            expiresAt: recruitment.expiresAt,
            maxUses: recruitment.maxUses,
          });
        } catch (e) {
          console.error('Doctrine recruitment create failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
