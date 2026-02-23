import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const job = await prisma.job.findUnique({
        where: { id, isVisible: true },
        select: {
            id: true,
            title: true,
            company: true,
            description: true,
            type: true,
            location: true,
            salaryRange: true,
            publishAt: true,
            createdAt: true,
        },
    });

    if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(job);
}
