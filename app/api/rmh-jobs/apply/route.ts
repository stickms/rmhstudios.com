import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { rollOutcome } from '@/lib/rmh-jobs/outcomes';
import { getRandomRejectionMessage } from '@/lib/rmh-jobs/rejections';

export async function POST(req: Request) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { jobId } = body;

    if (!jobId || typeof jobId !== 'string') {
        return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
    }

    const job = await prisma.job.findUnique({
        where: { id: jobId, publishAt: { lte: new Date() } },
    });

    if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const existing = await prisma.jobApplication.findUnique({
        where: { userId_jobId: { userId: session.user.id, jobId } },
    });

    if (existing) {
        return NextResponse.json({ error: 'Already applied to this job' }, { status: 409 });
    }

    const { outcome, processAt } = rollOutcome();

    // For instant rejections, set the status and message immediately
    const isInstant = outcome === 'instant_reject';

    const application = await prisma.jobApplication.create({
        data: {
            userId: session.user.id,
            jobId,
            status: isInstant ? 'rejected' : 'pending',
            outcome,
            processAt,
            rejectionMessage: isInstant
                ? getRandomRejectionMessage(job.title, job.company)
                : null,
        },
    });

    return NextResponse.json({
        id: application.id,
        status: application.status,
        message:
            application.status === 'rejected'
                ? 'Your application has been reviewed.'
                : 'Application submitted successfully. You will hear back soon.',
    });
}
