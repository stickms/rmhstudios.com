import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { reportGameResult } from '@/lib/game/results.server';

export const Route = createFileRoute('/api/slice-it/score')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
          limit: 5,
          windowMs: 60_000,
          prefix: 'slice-score',
        });
        if (!allowed) {
          return Response.json(
            { error: 'Too many requests' },
            {
              status: 429,
              headers: { 'Retry-After': String(retryAfter) },
            },
          );
        }

        try {
          const body = await request.json();
          const { username, score, accuracy, maxCombo, songId, speed, modifiers } = body;

          if (!username || typeof username !== 'string' || typeof score !== 'number') {
            return Response.json({ error: 'Invalid score data.' }, { status: 400 });
          }

          const cleanUsername = username
            .trim()
            .replace(/[^a-zA-Z0-9_\-. ]/g, '')
            .slice(0, 24);
          if (cleanUsername.length < 2) {
            return Response.json({ error: 'Invalid username' }, { status: 400 });
          }

          if (score < 0 || score > 1_000_000_000) {
            return Response.json({ error: 'Invalid score' }, { status: 400 });
          }

          const playSpeed = typeof speed === 'number' ? speed : 1.0;

          // Reject scores played at sub-1.0 speed (unranked)
          if (playSpeed < 1.0) {
            return Response.json(
              { error: 'Scores at speeds below 1.0x are unranked' },
              { status: 400 },
            );
          }

          // Auth Check
          const session = await auth.api.getSession({
            headers: request.headers,
          });

          if (!session?.user) {
            return Response.json({ error: 'Unauthorized.' }, { status: 401 });
          }

          const userId = session.user.id;

          // Use findFirst for profile to be resilient to duplicates on older data
          const existingProfile = await prisma.player.findFirst({ where: { userId } });
          if (existingProfile) {
            await prisma.player.update({
              where: { id: existingProfile.id },
              data: {
                totalScore: { increment: score },
                gamesPlayed: { increment: 1 },
                updatedAt: new Date(),
                username: cleanUsername,
              },
            });
          } else {
            // Also check username with findFirst
            const usernameConfig = await prisma.player.findFirst({
              where: { username: cleanUsername },
            });
            if (usernameConfig) {
              return Response.json({ error: 'Username taken.' }, { status: 409 });
            }
            await prisma.player.create({
              data: { userId, username: cleanUsername, totalScore: score, gamesPlayed: 1 },
            });
          }

          let isNewBest = false;

          // Save per-song leaderboard entry if songId is provided
          if (songId && typeof songId === 'string') {
            const songExists = await prisma.song.findFirst({
              where: { id: songId },
              select: { id: true },
            });
            if (songExists) {
              // Use findMany to detect and handle duplicates for this user/song pair
              const existingScores = await prisma.songLeaderboard.findMany({
                where: { songId, userId },
                orderBy: { score: 'desc' },
              });

              const personalBest = existingScores[0]; // Highest score is the PB

              if (!personalBest || score > personalBest.score) {
                isNewBest = true;
                if (personalBest) {
                  // Update the existing best
                  await prisma.songLeaderboard.update({
                    where: { id: personalBest.id },
                    data: {
                      score: Math.round(score),
                      maxCombo: typeof maxCombo === 'number' ? Math.round(maxCombo) : undefined,
                      accuracy:
                        typeof accuracy === 'number'
                          ? Math.max(0, Math.min(1, accuracy))
                          : undefined,
                      speedMod: playSpeed,
                      modifiers: modifiers || undefined,
                      createdAt: new Date(),
                    },
                  });

                  // Clean up any remaining duplicates (redundant records)
                  if (existingScores.length > 1) {
                    const idsToDelete = existingScores.slice(1).map((s) => s.id);
                    await prisma.songLeaderboard.deleteMany({
                      where: { id: { in: idsToDelete } },
                    });
                  }
                } else {
                  // Create new entry
                  await prisma.songLeaderboard.create({
                    data: {
                      songId,
                      userId,
                      score: Math.round(score),
                      maxCombo: typeof maxCombo === 'number' ? Math.round(maxCombo) : 0,
                      accuracy:
                        typeof accuracy === 'number' ? Math.max(0, Math.min(1, accuracy)) : null,
                      speedMod: playSpeed,
                      modifiers: modifiers || undefined,
                    },
                  });
                }
              } else {
                // Even if not beating PB, we can take the opportunity to clean up duplicates if they exist
                if (existingScores.length > 1) {
                  const idsToDelete = existingScores.slice(1).map((s) => s.id);
                  await prisma.songLeaderboard.deleteMany({
                    where: { id: { in: idsToDelete } },
                  });
                }
              }
            }
          }

          await recordGamePlay(userId);
          await reportGameResult(userId, { game: 'slice-it', score });
          return Response.json({ success: true, isNewBest });
        } catch (e) {
          console.error('[SCORE SUBMIT] CRITICAL FAILURE:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
