import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/slice-it/leaderboard')({
  server: {
    handlers: {
  GET: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'slice-leaderboard' });

    if (!allowed) {
        return Response.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    const { searchParams } = new URL(request.url);
    const songId = searchParams.get('songId');

    try {
        let leaderboard;
        if (songId) {
            // Song-specific leaderboard
            const scores = await prisma.songLeaderboard.findMany({
                where: { songId },
                take: 10,
                orderBy: { score: 'desc' },
                include: {
                    user: {
                        select: {
                            name: true,
                            username: true,
                            // Avoid nested include for sliceItProfile if it's potentially non-unique on prod
                        }
                    }
                }
            });
            
            // Map scores and handle potential missing usernames or profile issues
            leaderboard = scores.map((s: any) => {
                const username = s.user?.username || s.user?.name || "Unknown";
                return {
                    username,
                    score: s.score,
                    accuracy: s.accuracy,
                    maxCombo: s.maxCombo,
                    modifiers: s.modifiers,
                    speedMod: s.speedMod,
                };
            });
            console.log('[LEADERBOARD] Song leaderboard for', songId, leaderboard.length, 'entries');
        } else {
            // Global leaderboard
            const players = await prisma.player.findMany({
                take: 10,
                orderBy: { totalScore: 'desc' },
                select: {
                    username: true,
                    totalScore: true
                }
            });
            leaderboard = players.map((p: any) => ({
                username: p.username,
                score: p.totalScore
            }));
            console.log('[LEADERBOARD] Global leaderboard', leaderboard.length, 'entries');
        }
        return Response.json(leaderboard);
    } catch (e: any) {
        console.error('[LEADERBOARD] Fetch failed:', {
            error: e.message,
            stack: e.stack,
            songId
        });
        return Response.json({ 
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'development' ? e.message : undefined 
        }, { status: 500 });
    }
},
    },
  },
});
