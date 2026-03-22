import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';

export const Route = createFileRoute('/api/games/synapse-storm/score')({
  server: {
    handlers: {
  POST: async ({ request }) => {
    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { score, puzzlesSolved, maxCombo, peakDifficulty, totalTime } = await request.json();

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

        return Response.json(player);
    } catch (error) {
        console.error('Error saving Synapse Storm score:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
},
    },
  },
});
