import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const leaderboard = await prisma.player.findMany({
            take: 10,
            orderBy: { totalScore: 'desc' },
            select: {
                username: true,
                totalScore: true,
                gamesPlayed: true,
            },
        });

        return NextResponse.json(leaderboard);
    } catch (e) {
        console.error('Failed to fetch leaderboard:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
