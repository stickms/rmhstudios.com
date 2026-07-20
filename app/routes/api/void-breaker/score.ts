import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { reportGameResult } from '@/lib/game/results.server';

export const Route = createFileRoute('/api/void-breaker/score')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
          limit: 5,
          windowMs: 60_000,
          prefix: 'void-breaker-score',
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
          const { username, score, wave, enemiesKilled, timeMs } = await request.json();

          if (!username || typeof username !== 'string') {
            return Response.json({ error: 'Invalid username' }, { status: 400 });
          }
          const cleanUsername = username
            .trim()
            .replace(/[^a-zA-Z0-9_\-. ]/g, '')
            .slice(0, 24);
          if (cleanUsername.length < 2) {
            return Response.json({ error: 'Invalid username' }, { status: 400 });
          }
          if (typeof score !== 'number' || score < 0 || score > 100_000_000) {
            return Response.json({ error: 'Invalid score' }, { status: 400 });
          }

          const session = await auth.api.getSession({ headers: request.headers });
          const userId = session?.user?.id;
          if (!userId) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const safeWave = typeof wave === 'number' ? Math.round(wave) : 0;
          const safeKills = typeof enemiesKilled === 'number' ? Math.round(enemiesKilled) : 0;
          const safeTimeMs = typeof timeMs === 'number' ? Math.round(timeMs) : 0;

          const existing = await prisma.voidBreakerPlayer.findUnique({ where: { userId } });

          if (existing) {
            await prisma.voidBreakerPlayer.update({
              where: { id: existing.id },
              data: {
                highScore: Math.max(existing.highScore, Math.round(score)),
                bestWave: Math.max(existing.bestWave, safeWave),
                totalKills: existing.totalKills + safeKills,
                bestTimeMs: Math.max(existing.bestTimeMs, safeTimeMs),
                gamesPlayed: { increment: 1 },
                updatedAt: new Date(),
                username: cleanUsername,
              },
            });
            await recordGamePlay(userId);
            await reportGameResult(userId, {
              game: 'void-breaker',
              score: Math.round(score),
              cleared: safeWave,
            });
            return Response.json({ success: true, linked: true });
          }

          const conflict = await prisma.voidBreakerPlayer.findUnique({
            where: { username: cleanUsername },
          });
          if (conflict) {
            return Response.json({ error: 'Username already taken.' }, { status: 409 });
          }

          await prisma.voidBreakerPlayer.create({
            data: {
              userId,
              username: cleanUsername,
              highScore: Math.round(score),
              bestWave: safeWave,
              totalKills: safeKills,
              bestTimeMs: safeTimeMs,
              gamesPlayed: 1,
            },
          });
          await recordGamePlay(userId);
          await reportGameResult(userId, {
            game: 'void-breaker',
            score: Math.round(score),
            cleared: safeWave,
          });
          return Response.json({ success: true, created: true });
        } catch (e) {
          console.error('Failed to submit void-breaker score:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
