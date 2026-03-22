import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/altair/leaderboard')({
  server: {
    handlers: {
  GET: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'altair-leaderboard' });

    if (!allowed) {
        return Response.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    try {
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type') || 'time';

        let orderBy = {};
        switch (type) {
            case 'kills': orderBy = { totalKills: 'desc' }; break;
            case 'xp': orderBy = { totalXP: 'desc' }; break;
            case 'gold': orderBy = { totalGold: 'desc' }; break;
            case 'survival': orderBy = { totalTimeSurvived: 'desc' }; break;
            case 'time': default: orderBy = { bestTime: 'desc' }; break;
        }

        const leaderboard = await prisma.altairPlayer.findMany({
            take: 10,
            orderBy: orderBy,
            select: {
                username: true,
                bestTime: true,
                totalKills: true,
                totalXP: true,
                totalGold: true,
                totalTimeSurvived: true,
                gamesPlayed: true,
            }
        });

        return Response.json(leaderboard);
    } catch (e: any) {
        console.error('Altair leaderboard fetch failed:', {
            error: e.message,
            stack: e.stack
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
