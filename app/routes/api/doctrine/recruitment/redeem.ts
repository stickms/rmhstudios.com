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

          // Apply recruitment atomically. The guards above are fast-fail UX checks;
          // the real once-only enforcement lives in the WHERE clauses so concurrent
          // redemptions can't recruit the same user twice (double XP) or push a
          // code past maxUses.
          const outcome = await prisma.$transaction(async (tx) => {
            const claimUser = await tx.user.updateMany({
              where: { id: session.user.id, doctrineRecruitedById: null },
              data: { doctrineRecruitedById: recruitment.recruiterId },
            });
            if (claimUser.count === 0) return 'ALREADY_RECRUITED' as const;

            const claimCode = await tx.doctrineRecruitmentCode.updateMany({
              where: { id: recruitment.id, uses: { lt: recruitment.maxUses } },
              data: { uses: { increment: 1 }, convertedIds: { push: session.user.id } },
            });
            // Rolls back the user claim above.
            if (claimCode.count === 0) throw new Error('CODE_EXHAUSTED');
            return 'OK' as const;
          }).catch((err) => {
            if (err instanceof Error && err.message === 'CODE_EXHAUSTED') return 'CODE_EXHAUSTED' as const;
            throw err;
          });

          if (outcome === 'ALREADY_RECRUITED') {
            return Response.json({ error: 'Already recruited by another operator' }, { status: 409 });
          }
          if (outcome === 'CODE_EXHAUSTED') {
            return Response.json({ error: 'Recruitment code has reached maximum uses' }, { status: 410 });
          }

          // Award XP to recruiter (only after a successful, first-time recruitment).
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
