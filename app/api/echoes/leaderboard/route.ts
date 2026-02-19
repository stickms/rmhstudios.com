import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'echoes-leaderboard' });

    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') || 'time'; // time, kills, xp

        let orderBy = {};
        switch (type) {
            case 'kills': orderBy = { totalKills: 'desc' }; break;
            case 'xp': orderBy = { totalXP: 'desc' }; break;
            case 'time': default: orderBy = { bestTime: 'desc' }; break;
        }

        const leaderboard = await prisma.echoesPlayer.findMany({
            take: 10,
            orderBy: orderBy,
            select: {
                username: true,
                bestTime: true,
                totalKills: true,
                totalXP: true
            }
        });

        return NextResponse.json(leaderboard);
    } catch (e) {
        console.error('Echoes leaderboard fetch failed:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
