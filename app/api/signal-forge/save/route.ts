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
        await prisma.signalForgePlayer.upsert({
            where: { userId: session.user.id },
            update: {
                savedRunState: runState,
                username,
            },
            create: {
                userId: session.user.id,
                username,
                savedRunState: runState,
            }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error saving Signal Forge run:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
