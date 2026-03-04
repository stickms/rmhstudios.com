import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { score, puzzlesSolved, maxCombo, peakDifficulty, totalTime } = await req.json();

        // Fetch existing record to compare values (preserve best stats)
        const existing = await prisma.synapseStormPlayer.findUnique({
            where: { userId: session.user.id },
        });

        const newHighScore = Math.max(existing?.highScore ?? 0, Math.max(0, score ?? 0));
        const newMaxCombo = Math.max(existing?.maxCombo ?? 0, Math.max(0, maxCombo ?? 0));
        const newPeakDifficulty = Math.max(existing?.peakDifficulty ?? 1, peakDifficulty ?? 1);

        const player = await prisma.synapseStormPlayer.upsert({
            where: { userId: session.user.id },
            update: {
                highScore: { set: newHighScore },
                puzzlesSolved: { increment: puzzlesSolved || 0 },
                maxCombo: { set: newMaxCombo },
                peakDifficulty: { set: newPeakDifficulty },
                totalTime: { increment: totalTime || 0 },
            },
            create: {
                userId: session.user.id,
                highScore: Math.max(0, score ?? 0),
                puzzlesSolved: puzzlesSolved || 0,
                maxCombo: maxCombo || 0,
                peakDifficulty: peakDifficulty || 1,
                totalTime: totalTime || 0,
            },
        });

        return NextResponse.json(player);
    } catch (error) {
        console.error('Error saving Synapse Storm score:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
