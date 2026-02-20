import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'vega-leaderboard' });
    if (!allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    try {
        const leaderboard = await prisma.vegaPlayer.findMany({
            take: 10,
            orderBy: [
                { highestLoop: 'desc' },
                { highestLevel: 'desc' }
            ],
            select: {
                username: true,
                highestLoop: true,
                highestLevel: true,
                updatedAt: true
            }
        });
        
        return NextResponse.json(leaderboard);
        
    } catch (error) {
        console.error('Error fetching Vega leaderboard:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
