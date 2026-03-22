import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { awardXp } from '@/lib/doctrine/reputation';

export const Route = createFileRoute('/api/doctrine/recruitment/redeem')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 5, windowMs: 300_000, prefix: 'doctrine-redeem' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const body = await request.json();
          const { code } = body;

          if (!code || typeof code !== 'string') {
            return Response.json({ error: 'Recruitment code is required' }, { status: 400 });
          }

          const recruitment = await prisma.doctrineRecruitmentCode.findUnique({
            where: { code },
          });

          if (!recruitment) {
            return Response.json({ error: 'Invalid recruitment code' }, { status: 404 });
          }

          if (new Date() > recruitment.expiresAt) {
            return Response.json({ error: 'Recruitment code has expired' }, { status: 410 });
          }

          if (recruitment.uses >= recruitment.maxUses) {
            return Response.json({ error: 'Recruitment code has reached maximum uses' }, { status: 410 });
          }

          if (recruitment.recruiterId === session.user.id) {
            return Response.json({ error: 'Cannot redeem your own recruitment code' }, { status: 400 });
          }

          // Check if user already recruited
          const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { doctrineRecruitedById: true },
          });

          if (user?.doctrineRecruitedById) {
            return Response.json({ error: 'Already recruited by another operator' }, { status: 409 });
          }

          // Apply recruitment
          await prisma.$transaction([
            prisma.user.update({
              where: { id: session.user.id },
              data: { doctrineRecruitedById: recruitment.recruiterId },
            }),
            prisma.doctrineRecruitmentCode.update({
              where: { id: recruitment.id },
              data: {
                uses: { increment: 1 },
                convertedIds: { push: session.user.id },
              },
            }),
          ]);

          // Award XP to recruiter
          await awardXp(recruitment.recruiterId, 'RECRUIT_SIGNUP', {
            recruitedUserId: session.user.id,
          });

          return Response.json({
            success: true,
            recruitedBy: recruitment.recruiterId,
            message: recruitment.personalMessage,
          });
        } catch (e) {
          console.error('Doctrine recruitment redeem failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
