import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { formatDateKey } from '@/lib/daily-puzzle/seed';

export async function GET(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
        limit: 20,
        windowMs: 60_000,
        prefix: 'lights-out-leaderboard',
    });

    if (!allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    try {
        const { searchParams } = new URL(req.url);
        const dateParam = searchParams.get('date');
        const date = dateParam ? new Date(dateParam) : new Date();
        const dateKey = formatDateKey(date);

        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

        const entries = await prisma.lightsOutScore.findMany({
            where: { dateKey },
            orderBy: [{ dnf: 'asc' }, { moves: 'asc' }, { createdAt: 'asc' }],
            take: limit,
            select: {
                moves: true,
                hintUsed: true,
                dnf: true,
                createdAt: true,
                user: {
                    select: {
                        name: true,
                        username: true,
                        image: true,
                    },
                },
            },
        });

        const leaderboard = entries.map((e, i) => ({
            rank: i + 1,
            moves: e.moves,
            dnf: e.dnf ?? false,
            hintUsed: e.hintUsed ?? false,
            displayName: e.user?.username || e.user?.name || 'Anonymous',
            avatar: e.user?.image || null,
            solvedAt: e.createdAt.toISOString(),
        }));

        return NextResponse.json({ leaderboard, dateKey });
    } catch (e) {
        console.error('Lights Out leaderboard fetch failed:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
