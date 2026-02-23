import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
    const authHeader = req.headers.get('authorization');
    const secret = process.env.CRON_SECRET;

    if (!secret || authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await prisma.job.updateMany({
        where: {
            isVisible: false,
            publishAt: { lte: new Date() },
        },
        data: { isVisible: true },
    });

    return NextResponse.json({
        published: result.count,
        timestamp: new Date().toISOString(),
    });
}
