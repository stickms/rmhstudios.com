import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRandomRejectionMessage } from '@/lib/rmh-jobs/rejections';
import { getRandomProblem } from '@/lib/rmh-jobs/problems';

export async function POST(req: Request) {
    const authHeader = req.headers.get('authorization');
    const secret = process.env.CRON_SECRET;

    if (!secret || authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pending = await prisma.jobApplication.findMany({
        where: {
            status: 'pending',
            processAt: { lte: new Date() },
        },
        take: 50,
        include: {
            job: { select: { title: true, company: true } },
        },
    });

    let rejected = 0;
    let oaInvited = 0;

    for (const app of pending) {
        if (app.outcome === 'delayed_reject') {
            await prisma.jobApplication.update({
                where: { id: app.id },
                data: {
                    status: 'rejected',
                    rejectionMessage: getRandomRejectionMessage(app.job.title, app.job.company),
                },
            });
            rejected++;
        } else if (app.outcome === 'oa_invite') {
            const problem = getRandomProblem();
            const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours to start

            await prisma.$transaction([
                prisma.jobApplication.update({
                    where: { id: app.id },
                    data: { status: 'oa_invited' },
                }),
                prisma.assessment.create({
                    data: {
                        applicationId: app.id,
                        problemId: problem.id,
                        expiresAt,
                    },
                }),
            ]);
            oaInvited++;
        }
    }

    return NextResponse.json({
        processed: pending.length,
        rejected,
        oaInvited,
        timestamp: new Date().toISOString(),
    });
}
