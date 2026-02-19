import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'slice-leaderboard' });

    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    const { searchParams } = new URL(req.url);
    const songId = searchParams.get('songId');

    try {
        let leaderboard;

        if (songId) {
            // Song-specific leaderboard
            const scores = await prisma.songLeaderboard.findMany({
                where: { songId },
                take: 10,
                orderBy: { score: 'desc' },
                include: {
                    user: {
                        select: {
                            name: true,
                            username: true
                        }
                    }
                }
            });

            leaderboard = scores.map((s: any) => ({
                username: s.user.name || s.user.username || "Unknown",
                score: s.score,
                accuracy: s.accuracy,
                maxCombo: s.maxCombo,
            }));
        } else {
            // Global leaderboard
            const players = await prisma.player.findMany({
                take: 10,
                orderBy: { totalScore: 'desc' },
                select: {
                    username: true,
                    totalScore: true
                }
            });

            leaderboard = players.map((p: any) => ({
                username: p.username,
                score: p.totalScore
            }));
        }

        return NextResponse.json(leaderboard);
    } catch (e) {
        console.error('Slice leaderboard fetch failed:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
