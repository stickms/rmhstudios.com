import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { dateKeyUTC, weekKeyUTC } from '@/lib/laundry-sort/period';

const VALID_MODES = ['time-attack', 'endless', 'daily', 'ranked'];

export const Route = createFileRoute('/api/laundry-sort/score')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'laundry-score' });
        if (!allowed) {
          return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
        }

        try {
          const body = await request.json();
          const { username, score } = body;
          const mode = typeof body.mode === 'string' && VALID_MODES.includes(body.mode) ? body.mode : 'time-attack';
          const bestStreak = clampInt(body.bestStreak, 0, 100_000);
          const sorted = clampInt(body.sorted, 0, 1_000_000);
          const missed = clampInt(body.missed, 0, 1_000_000);
          const accuracy = clampFloat(body.accuracy, 0, 1);

          if (!username || typeof username !== 'string') {
            return Response.json({ error: 'Invalid username' }, { status: 400 });
          }
          const cleanUsername = username.trim().replace(/[^a-zA-Z0-9_\-. ]/g, '').slice(0, 24);
          if (cleanUsername.length < 2) {
            return Response.json({ error: 'Invalid username' }, { status: 400 });
          }
          if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 5_000_000) {
            return Response.json({ error: 'Invalid score' }, { status: 400 });
          }

          const session = await auth.api.getSession({ headers: request.headers });
          const userId = session?.user?.id;
          if (!userId) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          // ── Career profile (all-time high + lifetime stats) ──
          const existing = await prisma.laundryPlayer.findUnique({ where: { userId } });
          if (existing) {
            await prisma.laundryPlayer.update({
              where: { id: existing.id },
              data: {
                highScore: Math.max(existing.highScore, score),
                bestStreak: Math.max(existing.bestStreak, bestStreak),
                totalSorted: { increment: sorted },
                totalMissed: { increment: missed },
                gamesPlayed: { increment: 1 },
                username: cleanUsername,
                updatedAt: new Date(),
              },
            });
          } else {
            const taken = await prisma.laundryPlayer.findUnique({ where: { username: cleanUsername } });
            if (taken) {
              return Response.json({ error: 'Username already taken.' }, { status: 409 });
            }
            await prisma.laundryPlayer.create({
              data: { userId, username: cleanUsername, highScore: score, bestStreak, totalSorted: sorted, totalMissed: missed, gamesPlayed: 1 },
            });
          }

          // ── Time-boxed board row (best score per user per mode per day) ──
          const dateKey = dateKeyUTC();
          const weekKey = weekKeyUTC();
          const row = await prisma.laundryScore.findUnique({
            where: { userId_mode_dateKey: { userId, mode, dateKey } },
          });
          if (!row || score > row.score) {
            await prisma.laundryScore.upsert({
              where: { userId_mode_dateKey: { userId, mode, dateKey } },
              update: { score, bestStreak, sorted, accuracy, username: cleanUsername, weekKey, updatedAt: new Date() },
              create: { userId, username: cleanUsername, mode, dateKey, weekKey, score, bestStreak, sorted, accuracy },
            });
          }

          await recordGamePlay(userId);
          return Response.json({ success: true });
        } catch (e) {
          console.error('Failed to submit laundry score:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});

function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
  return Math.max(min, Math.min(max, n));
}
function clampFloat(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.max(min, Math.min(max, n));
}
