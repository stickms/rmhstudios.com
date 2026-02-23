import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureJobsSeeded } from '@/lib/rmh-jobs/auto-seed';

export async function GET(req: Request) {
    await ensureJobsSeeded();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')));
    const type = searchParams.get('type'); // 'real' | 'silly' | null (all)
    const sort = searchParams.get('sort') ?? 'newest'; // 'newest' | 'oldest' | 'company'
    const q = searchParams.get('q')?.trim();

    const where: Record<string, unknown> = { publishAt: { lte: new Date() } };

    if (type === 'real' || type === 'silly') {
        where.type = type;
    }

    if (q) {
        where.OR = [
            { title: { contains: q, mode: 'insensitive' } },
            { company: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
        ];
    }

    const orderBy =
        sort === 'oldest'
            ? { publishAt: 'asc' as const }
            : sort === 'company'
              ? { company: 'asc' as const }
              : { publishAt: 'desc' as const };

    const [jobs, total] = await Promise.all([
        prisma.job.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
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
        }),
        prisma.job.count({ where }),
    ]);

    return NextResponse.json({
        jobs,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
}
