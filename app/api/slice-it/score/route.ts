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

        // Use findFirst for profile to be resilient to duplicates on older data
        const existingProfile = await prisma.player.findFirst({ where: { userId } });
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
            console.log('[SCORE SUBMIT] Updated Player Profile:', userId, cleanUsername, score);
        } else {
            // Also check username with findFirst
            const usernameConfig = await prisma.player.findFirst({ where: { username: cleanUsername } });
            if (usernameConfig) {
                console.log('[SCORE SUBMIT] Username taken:', cleanUsername);
                return NextResponse.json({ error: 'Username taken.' }, { status: 409 });
            }
            await prisma.player.create({
                data: { userId, username: cleanUsername, totalScore: score, gamesPlayed: 1 }
            });
            console.log('[SCORE SUBMIT] Created Player Profile:', userId, cleanUsername, score);
        }

        // Save per-song leaderboard entry if songId is provided
        if (songId && typeof songId === 'string') {
            const songExists = await prisma.song.findFirst({ where: { id: songId }, select: { id: true } });
            if (songExists) {
                // Use findMany to detect and handle duplicates for this user/song pair
                const existingScores = await prisma.songLeaderboard.findMany({
                    where: { songId, userId },
                    orderBy: { score: 'desc' }
                });

                const personalBest = existingScores[0]; // Highest score is the PB

                if (!personalBest || score > personalBest.score) {
                    if (personalBest) {
                        // Update the existing best
                        await prisma.songLeaderboard.update({
                            where: { id: personalBest.id },
                            data: {
                                score: Math.round(score),
                                maxCombo: typeof maxCombo === 'number' ? Math.round(maxCombo) : undefined,
                                accuracy: typeof accuracy === 'number' ? Math.max(0, Math.min(1, accuracy)) : undefined,
                                speedMod: playSpeed,
                                createdAt: new Date()
                            }
                        });
                        
                        // Clean up any remaining duplicates (redundant records)
                        if (existingScores.length > 1) {
                            const idsToDelete = existingScores.slice(1).map(s => s.id);
                            await prisma.songLeaderboard.deleteMany({
                                where: { id: { in: idsToDelete } }
                            });
                            console.log('[SCORE SUBMIT] Cleaned up duplicates for user/song:', { userId, songId, removed: idsToDelete.length });
                        }
                    } else {
                        // Create new entry
                        await prisma.songLeaderboard.create({
                            data: {
                                songId,
                                userId,
                                score: Math.round(score),
                                maxCombo: typeof maxCombo === 'number' ? Math.round(maxCombo) : 0,
                                accuracy: typeof accuracy === 'number' ? Math.max(0, Math.min(1, accuracy)) : null,
                                speedMod: playSpeed,
                            }
                        });
                    }
                    console.log('[DEBUG][API] Updated Personal Best (Resilient):', { songId, userId, score });
                } else {
                    console.log('[DEBUG][API] Score did not beat personal best:', { songId, userId, score, pb: personalBest.score });
                    
                    // Even if not beating PB, we can take the opportunity to clean up duplicates if they exist
                    if (existingScores.length > 1) {
                        const idsToDelete = existingScores.slice(1).map(s => s.id);
                        await prisma.songLeaderboard.deleteMany({
                            where: { id: { in: idsToDelete } }
                        });
                        console.log('[SCORE SUBMIT] Cleaned up duplicates for user/song (during unranked/low score):', { userId, songId, removed: idsToDelete.length });
                    }
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
