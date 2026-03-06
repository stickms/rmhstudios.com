import { createAPIFileRoute } from "@tanstack/react-start/api";
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const MAX_SAVE_BODY_BYTES = 512000; // 500 KB

export const APIRoute = createAPIFileRoute("/api/signal-forge/save")({
  POST: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'signal-forge-save' });
    if (!allowed) {
        return Response.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    const contentLength = request.headers.get('content-length');
    if (contentLength !== null) {
        const size = parseInt(contentLength, 10);
        if (!Number.isNaN(size) && size > MAX_SAVE_BODY_BYTES) {
            return Response.json(
                { error: 'Request body too large. Maximum size is 500 KB.' },
                { status: 413 }
            );
        }
    }

    try {
        const session = await auth.api.getSession({
            headers: request.headers
        });

        if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { runState } = body;

        if (!runState || typeof runState !== 'object') {
            return Response.json({ error: 'Invalid run state' }, { status: 400 });
        }

        // Validate that the run state has essential fields
        if (typeof runState.floor !== 'number' || typeof runState.playerHp !== 'number') {
            return Response.json({ error: 'Malformed run state' }, { status: 400 });
        }

        const username = session.user.name || session.user.email || 'Anonymous';

        // Upsert the player profile with saved run state
        // Also update leaderboard high score if this run's score is higher
        const existing = await prisma.signalForgePlayer.findUnique({
            where: { userId: session.user.id },
            select: { highScore: true, floorReached: true },
        });

        const currentScore = typeof runState.score === 'number' ? runState.score : 0;
        const currentFloor = typeof runState.floor === 'number' ? runState.floor : 1;
        const newHighScore = existing ? Math.max(existing.highScore, currentScore) : currentScore;
        const newFloorReached = existing ? Math.max(existing.floorReached, currentFloor) : currentFloor;

        await prisma.signalForgePlayer.upsert({
            where: { userId: session.user.id },
            update: {
                savedRunState: runState,
                username,
                highScore: newHighScore,
                floorReached: newFloorReached,
            },
            create: {
                userId: session.user.id,
                username,
                savedRunState: runState,
                highScore: currentScore,
                floorReached: currentFloor,
            }
        });

        return Response.json({ success: true });

    } catch (error) {
        console.error('Error saving Signal Forge run:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
},
});
