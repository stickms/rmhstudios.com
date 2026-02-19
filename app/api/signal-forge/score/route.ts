import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function POST(req: Request) {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { score, floorReached } = body;

        if (typeof score !== 'number' || score < 0 || score > 1_000_000) {
            return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
        }
        if (typeof floorReached !== 'number' || floorReached < 1 || floorReached > 100) {
            return NextResponse.json({ error: 'Invalid floor' }, { status: 400 });
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
            return NextResponse.json({ success: true, profile: updated, isRecord: isBetter });
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
            return NextResponse.json({ success: true, profile: newProfile, isRecord: true });
        }

    } catch (error) {
        console.error('Error submitting Signal Forge score:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
