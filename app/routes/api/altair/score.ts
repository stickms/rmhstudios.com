import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/altair/score')({
  server: {
    handlers: {
  POST: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'altair-score' });
    if (!allowed) {
        return Response.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    try {
        // Auth Check
        const session = await auth.api.getSession({
            headers: request.headers
        });
        const userId = session?.user?.id;

        if (!userId) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { timeSurvived, kills, totalXP, gold } = body;

        if (typeof timeSurvived !== 'number' || timeSurvived < 0 || timeSurvived > 86400) {
            return Response.json({ error: 'Invalid time' }, { status: 400 });
        }
        if (typeof kills !== 'number' || kills < 0 || kills > 1_000_000) {
            return Response.json({ error: 'Invalid kills' }, { status: 400 });
        }
        if (typeof totalXP !== 'number' || totalXP < 0 || totalXP > 100_000_000) {
            return Response.json({ error: 'Invalid XP' }, { status: 400 });
        }
        const goldValue = typeof gold === 'number' && gold >= 0 && gold <= 10_000_000 ? gold : 0;

        // Get username from auth session
        const username = (session.user.name || (session.user as any).username || 'Player').slice(0, 32);

        const existingProfile = await prisma.altairPlayer.findUnique({ where: { userId } });

        if (existingProfile) {
            await prisma.altairPlayer.update({
                where: { id: existingProfile.id },
                data: {
                    bestTime: Math.max(existingProfile.bestTime, timeSurvived),
                    totalKills: { increment: kills },
                    totalXP: { increment: totalXP },
                    totalGold: { increment: goldValue },
                    totalTimeSurvived: { increment: timeSurvived },
                    gamesPlayed: { increment: 1 },
                    updatedAt: new Date(),
                    username, // Keep username in sync with auth
                }
            });
            return Response.json({ success: true, linked: true });
        }

        // Create new
        await prisma.altairPlayer.create({
            data: {
                userId,
                username,
                bestTime: timeSurvived,
                totalKills: kills,
                totalXP: totalXP,
                totalGold: goldValue,
                totalTimeSurvived: timeSurvived,
                gamesPlayed: 1
            }
        });
        return Response.json({ success: true, created: true });
    } catch (e) {
        console.error('Altair score submit failed:', e);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
},
    },
  },
});
