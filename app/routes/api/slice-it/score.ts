import { createAPIFileRoute } from "@tanstack/react-start/api";
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const APIRoute = createAPIFileRoute("/api/slice-it/score")({
  POST: async ({ request }) => {
    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, { limit: 5, windowMs: 60_000, prefix: 'slice-score' });
    if (!allowed) {
        return Response.json({ error: 'Too many requests' }, {
            status: 429,
            headers: { 'Retry-After': String(retryAfter) }
        });
    }

    try {
        const body = await request.json();
        const { username, score, accuracy, maxCombo, songId, speed, modifiers } = body;
        console.log('[SCORE SUBMIT] Payload received:', { username, score, accuracy, maxCombo, songId, speed, modifiers });

        if (!username || typeof username !== 'string' || typeof score !== 'number') {
            console.log('[SCORE SUBMIT] Invalid data:', { username, score });
            return Response.json({ error: 'Invalid score data.' }, { status: 400 });
        }

        const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, 24);
        if (cleanUsername.length < 2) {
            console.log('[SCORE SUBMIT] Username too short:', cleanUsername);
            return Response.json({ error: 'Invalid username' }, { status: 400 });
        }

        if (score < 0 || score > 1_000_000_000) {
            console.log('[SCORE SUBMIT] Score out of bounds:', score);
            return Response.json({ error: 'Invalid score' }, { status: 400 });
        }

        const playSpeed = typeof speed === 'number' ? speed : 1.0;

        // Reject scores played at sub-1.0 speed (unranked)
        if (playSpeed < 1.0) {
            console.log('[SCORE SUBMIT] Speed too low:', playSpeed);
            return Response.json({ error: 'Scores at speeds below 1.0x are unranked' }, { status: 400 });
        }

        // Auth Check
        const session = await auth.api.getSession({
            headers: request.headers
        });

        if (!session?.user) {
            console.log('[SCORE SUBMIT] Unauthorized attempt');
            return Response.json({ error: 'Unauthorized.' }, { status: 401 });
        }

        const userId = session.user.id;
        console.log('[SCORE SUBMIT] Session valid for userId:', userId);

        // Use findFirst for profile to be resilient to duplicates on older data
        const existingProfile = await prisma.player.findFirst({ where: { userId } });
        if (existingProfile) {
            console.log('[SCORE SUBMIT] Found existing profile:', existingProfile.id);
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
            console.log('[SCORE SUBMIT] No existing profile, checking username exclusivity');
            // Also check username with findFirst
            const usernameConfig = await prisma.player.findFirst({ where: { username: cleanUsername } });
            if (usernameConfig) {
                console.log('[SCORE SUBMIT] Username taken:', cleanUsername);
                return Response.json({ error: 'Username taken.' }, { status: 409 });
            }
            await prisma.player.create({
                data: { userId, username: cleanUsername, totalScore: score, gamesPlayed: 1 }
            });
            console.log('[SCORE SUBMIT] Created Player Profile:', userId, cleanUsername, score);
        }

        let isNewBest = false;
        
        // Save per-song leaderboard entry if songId is provided
        if (songId && typeof songId === 'string') {
            console.log('[SCORE SUBMIT] Processing song leaderboard for songId:', songId);
            const songExists = await prisma.song.findFirst({ where: { id: songId }, select: { id: true } });
            if (songExists) {
                // Use findMany to detect and handle duplicates for this user/song pair
                const existingScores = await prisma.songLeaderboard.findMany({
                    where: { songId, userId },
                    orderBy: { score: 'desc' }
                });

                const personalBest = existingScores[0]; // Highest score is the PB
                console.log('[SCORE SUBMIT] Existing scores found:', existingScores.length, 'Best score:', personalBest?.score);

                if (!personalBest || score > personalBest.score) {
                    isNewBest = true;
                    if (personalBest) {
                        console.log('[SCORE SUBMIT] Updating personal best from', personalBest.score, 'to', score);
                        // Update the existing best
                        await prisma.songLeaderboard.update({
                            where: { id: personalBest.id },
                            data: {
                                score: Math.round(score),
                                maxCombo: typeof maxCombo === 'number' ? Math.round(maxCombo) : undefined,
                                accuracy: typeof accuracy === 'number' ? Math.max(0, Math.min(1, accuracy)) : undefined,
                                speedMod: playSpeed,
                                modifiers: modifiers || undefined,
                                createdAt: new Date()
                            }
                        });
                        
                        // Clean up any remaining duplicates (redundant records)
                        if (existingScores.length > 1) {
                            const idsToDelete = existingScores.slice(1).map(s => s.id);
                            await prisma.songLeaderboard.deleteMany({
                                where: { id: { in: idsToDelete } }
                            });
                            console.log('[SCORE SUBMIT] Cleaned up duplicates during PB update:', { userId, songId, removed: idsToDelete.length });
                        }
                    } else {
                        console.log('[SCORE SUBMIT] Creating new leaderboard entry with score:', score);
                        // Create new entry
                        await prisma.songLeaderboard.create({
                            data: {
                                songId,
                                userId,
                                score: Math.round(score),
                                maxCombo: typeof maxCombo === 'number' ? Math.round(maxCombo) : 0,
                                accuracy: typeof accuracy === 'number' ? Math.max(0, Math.min(1, accuracy)) : null,
                                speedMod: playSpeed,
                                modifiers: modifiers || undefined,
                            }
                        });
                    }
                } else {
                    console.log('[SCORE SUBMIT] Score did not beat PB:', { score, pb: personalBest.score });
                    
                    // Even if not beating PB, we can take the opportunity to clean up duplicates if they exist
                    if (existingScores.length > 1) {
                        const idsToDelete = existingScores.slice(1).map(s => s.id);
                        await prisma.songLeaderboard.deleteMany({
                            where: { id: { in: idsToDelete } }
                        });
                        console.log('[SCORE SUBMIT] Cleaned up duplicates during non-ranking sub:', { userId, songId, removed: idsToDelete.length });
                    }
                }
            } else {
                console.log('[SCORE SUBMIT] Song not found in DB:', songId);
            }
        }
        
        return Response.json({ success: true, isNewBest });
    } catch (e) {
        console.error('[SCORE SUBMIT] CRITICAL FAILURE:', e);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
},
});
