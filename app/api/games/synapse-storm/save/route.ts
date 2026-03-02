import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const player = await prisma.synapseStormPlayer.findUnique({
            where: { userId: session.user.id },
        });

        if (!player) {
            return NextResponse.json(null, { status: 404 });
        }

        return NextResponse.json(player);
    } catch (error) {
        console.error('Error loading Synapse Storm save:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
