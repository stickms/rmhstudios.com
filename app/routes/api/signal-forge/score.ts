import { createAPIFileRoute } from "@tanstack/react-start/api";
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const APIRoute = createAPIFileRoute("/api/signal-forge/score")({
  POST: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'signal-forge-score' });
    if (!allowed) {
        return Response.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    try {
        const session = await auth.api.getSession({
            headers: request.headers
        });

        if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { score, floorReached } = body;

        if (typeof score !== 'number' || score < 0 || score > 1_000_000) {
            return Response.json({ error: 'Invalid score' }, { status: 400 });
        }
        if (typeof floorReached !== 'number' || floorReached < 1 || floorReached > 100) {
            return Response.json({ error: 'Invalid floor' }, { status: 400 });
        }

        const username = session.user.name || session.user.email || 'Anonymous';

        // Find existing profile
        const existingProfile = await prisma.signalForgePlayer.findUnique({
            where: { userId: session.user.id }
        });

        if (existingProfile) {
            const isBetter = score > existingProfile.highScore ||
                (score === existingProfile.highScore && floorReached > existingProfile.floorReached);

            const updated = await prisma.signalForgePlayer.update({
                where: { userId: session.user.id },
                data: {
                    highScore: Math.max(existingProfile.highScore, score),
                    floorReached: Math.max(existingProfile.floorReached, floorReached),
                    gamesPlayed: { increment: 1 },
                    username,
                }
            });
            return Response.json({ success: true, profile: updated, isRecord: isBetter });
        } else {
            const newProfile = await prisma.signalForgePlayer.create({
                data: {
                    userId: session.user.id,
                    username,
                    highScore: score,
                    floorReached,
                    gamesPlayed: 1,
                }
            });
            return Response.json({ success: true, profile: newProfile, isRecord: true });
        }

    } catch (error) {
        console.error('Error submitting Signal Forge score:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
},
});
