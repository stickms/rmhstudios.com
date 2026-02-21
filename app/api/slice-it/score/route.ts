import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(req: Request) {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'slice-score' });
    if (!allowed) {
        return NextResponse.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    try {
        const { username, score, accuracy, maxCombo, songId, speed } = await req.json();
        console.log('[SCORE SUBMIT] Incoming:', { username, score, accuracy, maxCombo, songId, speed });

        if (!username || typeof username !== 'string') {
            console.log('[DEBUG][API] Invalid username:', username);
            return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
        }
        const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, 24);
        if (cleanUsername.length < 2) {
            console.log('[DEBUG][API] Username too short:', cleanUsername);
            return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
        }
        if (typeof score !== 'number' || score < 0 || score > 1_000_000_000) {
            console.log('[SCORE SUBMIT] Invalid score:', score);
            return NextResponse.json({ error: 'Invalid score' }, { status: 400 });
        }

        // Reject scores played at sub-1.0 speed (unranked)
        const playSpeed = typeof speed === 'number' ? speed : 1.0;
        if (playSpeed < 1.0) {
            return NextResponse.json({ error: 'Scores at speeds below 1.0x are unranked' }, { status: 400 });
        }

        // Auth Check
        const session = await auth.api.getSession({
            headers: await headers()
        });
        const userId = session?.user?.id;
        if (!userId) {
            console.log('[SCORE SUBMIT] Unauthorized');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const existingProfile = await prisma.player.findUnique({ where: { userId } });
        if (existingProfile) {
            await prisma.player.update({
                where: { id: existingProfile.id },
                data: {
                    totalScore: { increment: score },
                    gamesPlayed: { increment: 1 },
                    updatedAt: new Date(),
                    username: cleanUsername
                }
            });
            console.log('[SCORE SUBMIT] Updated Player:', userId, cleanUsername, score);
        } else {
            const usernameConfig = await prisma.player.findUnique({ where: { username: cleanUsername } });
            if (usernameConfig) {
                console.log('[SCORE SUBMIT] Username taken:', cleanUsername);
                return NextResponse.json({ error: 'Username taken.' }, { status: 409 });
            }
            await prisma.player.create({
                data: { userId, username: cleanUsername, totalScore: score, gamesPlayed: 1 }
            });
            console.log('[SCORE SUBMIT] Created Player:', userId, cleanUsername, score);
        }

        // Save per-song leaderboard entry if songId is provided
        if (songId && typeof songId === 'string') {
            const songExists = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
            if (songExists) {
                // Check for existing personal best
                const personalBest = await prisma.songLeaderboard.findUnique({
                    where: {
                        songId_userId: {
                            songId,
                            userId
                        }
                    }
                });
                if (!personalBest || score > personalBest.score) {
                    await prisma.songLeaderboard.upsert({
                        where: {
                            songId_userId: {
                                songId,
                                userId
                            }
                        },
                        create: {
                            songId,
                            userId,
                            score: Math.round(score),
                            maxCombo: typeof maxCombo === 'number' ? Math.round(maxCombo) : 0,
                            accuracy: typeof accuracy === 'number' ? Math.max(0, Math.min(1, accuracy)) : null,
                            speedMod: playSpeed,
                        },
                        update: {
                            score: Math.round(score),
                            maxCombo: typeof maxCombo === 'number' ? Math.round(maxCombo) : undefined,
                            accuracy: typeof accuracy === 'number' ? Math.max(0, Math.min(1, accuracy)) : undefined,
                            speedMod: playSpeed,
                            createdAt: new Date() // Store date of this specific high score
                        }
                    });
                    console.log('[DEBUG][API] Updated Personal Best (High Score wins):', { songId, userId, score, maxCombo, accuracy, playSpeed });
                } else {
                    console.log('[DEBUG][API] Score did not beat personal best:', { songId, userId, score, pb: personalBest.score });
                }
            } else {
                console.log('[DEBUG][API] Song not found:', songId);
            }
        }

        console.log('[SCORE SUBMIT] Success');
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('[SCORE SUBMIT] Failed to submit score:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
