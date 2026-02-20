import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const MAX_SAVE_BODY_BYTES = 512000; // 500 KB

export async function POST(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'signal-forge-save' });
    if (!allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
    }

    const contentLength = req.headers.get('content-length');
    if (contentLength !== null) {
        const size = parseInt(contentLength, 10);
        if (!Number.isNaN(size) && size > MAX_SAVE_BODY_BYTES) {
            return NextResponse.json(
                { error: 'Request body too large. Maximum size is 500 KB.' },
                { status: 413 }
            );
        }
    }

    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { runState } = body;

        if (!runState || typeof runState !== 'object') {
            return NextResponse.json({ error: 'Invalid run state' }, { status: 400 });
        }

        // Validate that the run state has essential fields
        if (typeof runState.floor !== 'number' || typeof runState.playerHp !== 'number') {
            return NextResponse.json({ error: 'Malformed run state' }, { status: 400 });
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

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error saving Signal Forge run:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
