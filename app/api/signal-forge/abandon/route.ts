import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function POST() {
    try {
        const session = await auth.api.getSession({
            headers: await headers()
        });

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const profile = await prisma.signalForgePlayer.findUnique({
            where: { userId: session.user.id }
        });

        if (profile) {
            await prisma.signalForgePlayer.update({
                where: { userId: session.user.id },
                data: { savedRunState: Prisma.DbNull }
            });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error abandoning Signal Forge run:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
