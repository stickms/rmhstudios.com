import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { resolveUserDisplay } from '@/lib/user-display';

export const Route = createFileRoute('/api/games/synapse-storm/leaderboard')({
  server: {
    handlers: {
  GET: async ({ request }) => {
    try {
        const { searchParams } = new URL(request.url);
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
                        profile: { select: { displayName: true, customImage: true } },
                    },
                },
            },
        });

        const leaderboard = entries.map((e: (typeof entries)[number], i: number) => {
            const resolved = e.user ? resolveUserDisplay(e.user) : { name: null, image: null };
            return {
            rank: i + 1,
            userId: e.userId,
            displayName: e.user?.username || resolved.name || 'Anonymous',
            avatar: resolved.image || null,
            highScore: e.highScore,
            maxCombo: e.maxCombo,
            puzzlesSolved: e.puzzlesSolved,
            peakDifficulty: e.peakDifficulty,
            totalTime: e.totalTime,
            updatedAt: e.updatedAt.toISOString(),
        }});

        return Response.json({ leaderboard });
    } catch (error) {
        console.error('Error fetching Synapse Storm leaderboard:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
},
    },
  },
});
