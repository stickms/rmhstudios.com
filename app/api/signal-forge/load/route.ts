import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await prisma.signalForgePlayer.findUnique({
            where: { userId: session.user.id },
            select: { savedRunState: true }
        });

        if (!profile || !profile.savedRunState) {
            return NextResponse.json({ hasSavedRun: false });
        }

        return NextResponse.json({
            hasSavedRun: true,
            runState: profile.savedRunState
        });

    } catch (error) {
        console.error('Error loading Signal Forge run:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
