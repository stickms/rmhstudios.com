import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
    try {
        const { username, score } = await req.json();

        if (!username || typeof score !== 'number') {
            return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
        }

        const player = await prisma.player.upsert({
            where: { username },
            update: {
                totalScore: { increment: score },
                gamesPlayed: { increment: 1 },
            },
            create: {
                username,
                totalScore: score,
                gamesPlayed: 1,
            },
        });

        return NextResponse.json(player);
    } catch (e) {
        console.error('Failed to submit score:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
