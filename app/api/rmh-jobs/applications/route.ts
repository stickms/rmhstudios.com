import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
