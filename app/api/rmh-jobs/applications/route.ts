import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getRandomRejectionMessage } from '@/lib/rmh-jobs/rejections';
import { getRandomProblem } from '@/lib/rmh-jobs/problems';

async function processReadyApplications(userId: string) {
    const ready = await prisma.jobApplication.findMany({
        where: {
            userId,
            status: 'pending',
            processAt: { lte: new Date() },
        },
        include: {
            job: { select: { title: true, company: true } },
        },
    });

    for (const app of ready) {
        if (app.outcome === 'instant_reject' || app.outcome === 'delayed_reject') {
            await prisma.jobApplication.update({
                where: { id: app.id },
                data: {
                    status: 'rejected',
                    rejectionMessage: getRandomRejectionMessage(app.job.title, app.job.company),
                },
            });
        } else if (app.outcome === 'oa_invite') {
            const problem = getRandomProblem();
            const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

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
        }
    }
}

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Lazy-evaluate: process any pending applications whose processAt has passed
    await processReadyApplications(session.user.id);

    const applications = await prisma.jobApplication.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'desc' },
        include: {
            job: {
                select: {
                    id: true,
                    title: true,
                    company: true,
                    type: true,
                    location: true,
                },
            },
            assessment: {
                select: {
                    id: true,
                    status: true,
                    problemId: true,
                    expiresAt: true,
                    startedAt: true,
                    submittedAt: true,
                    evaluationResult: true,
                },
            },
        },
    });

    return NextResponse.json({ applications });
}
