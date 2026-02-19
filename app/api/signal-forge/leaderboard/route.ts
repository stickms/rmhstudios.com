import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
        const leaderboard = await prisma.signalForgePlayer.findMany({
            take: 100,
            orderBy: [
                { highScore: 'desc' },
                { floorReached: 'desc' },
            ],
            select: {
                username: true,
                highScore: true,
                floorReached: true,
                gamesPlayed: true,
                updatedAt: true,
            }
        });

        return NextResponse.json(leaderboard);

    } catch (error) {
        console.error('Error fetching Signal Forge leaderboard:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
