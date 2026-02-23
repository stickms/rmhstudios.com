import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));

    if (!q) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
    }

    // Full-text search using Prisma's contains (case-insensitive)
    // pgvector semantic search can be layered on top later
    const jobs = await prisma.job.findMany({
        where: {
            publishAt: { lte: new Date() },
            OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { company: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
            ],
        },
        orderBy: { publishAt: 'desc' },
        take: limit,
        select: {
            id: true,
            title: true,
            company: true,
            description: true,
            type: true,
            location: true,
            salaryRange: true,
            publishAt: true,
        },
    });

    return NextResponse.json({ jobs, total: jobs.length });
}
