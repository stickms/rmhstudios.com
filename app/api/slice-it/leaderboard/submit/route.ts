import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export async function POST(req: Request) {
    try {
        const session = await auth.api.getSession({
             headers: await headers()
        });

        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { songId, score, maxCombo, accuracy } = await req.json();

        if (!songId || typeof score !== 'number' || typeof maxCombo !== 'number' || typeof accuracy !== 'number') {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const userId = session.user.id;
        
        let player = await prisma.player.findUnique({ where: { userId } });
        
        if (!player) {
            // Create user's Slice It profile if they don't have one
            player = await prisma.player.create({
                data: {
                    userId: userId,
                    username: session.user.name || (session.user as any).username || 'Unknown',
                    totalScore: score,
                    gamesPlayed: 1
                }
            });
        } else {
            // Add to total score and increment games played
            player = await prisma.player.update({
                where: { userId },
                data: {
                    totalScore: { increment: score },
                    gamesPlayed: { increment: 1 }
                }
            });
        }

        // Handle Song Leaderboard entry
        const existingScore = await prisma.songLeaderboard.findFirst({
            where: { songId, userId }
        });

        if (!existingScore) {
            await prisma.songLeaderboard.create({
                data: {
                    songId,
                    userId,
                    score,
                    maxCombo,
                    accuracy
                }
            });
        } else if (score > existingScore.score) {
            await prisma.songLeaderboard.update({
                where: { id: existingScore.id },
                data: {
                    score,
                    maxCombo,
                    accuracy
                }
            });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Failed to submit slice score:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
