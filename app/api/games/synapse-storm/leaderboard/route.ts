import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limitParam = searchParams.get('limit');
        const limit = Math.min(50, Math.max(1, parseInt(limitParam || '20', 10)));

        const entries = await prisma.synapseStormPlayer.findMany({
            orderBy: { highScore: 'desc' },
            take: limit,
            where: { highScore: { gt: 0 } },
            select: {
                userId: true,
                highScore: true,
                maxCombo: true,
                puzzlesSolved: true,
                peakDifficulty: true,
                totalTime: true,
                updatedAt: true,
                user: {
                    select: {
                        name: true,
                        username: true,
                        image: true,
                    },
                },
            },
        });

        const leaderboard = entries.map((e: (typeof entries)[number], i: number) => ({
            rank: i + 1,
            userId: e.userId,
            displayName: e.user?.username || e.user?.name || 'Anonymous',
            avatar: e.user?.image || null,
            highScore: e.highScore,
            maxCombo: e.maxCombo,
            puzzlesSolved: e.puzzlesSolved,
            peakDifficulty: e.peakDifficulty,
            totalTime: e.totalTime,
            updatedAt: e.updatedAt.toISOString(),
        }));

        return NextResponse.json({ leaderboard });
    } catch (error) {
        console.error('Error fetching Synapse Storm leaderboard:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
