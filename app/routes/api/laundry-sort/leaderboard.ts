import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { dateKeyUTC, weekKeyUTC } from '@/lib/laundry-sort/period';

const VALID_MODES = ['time-attack', 'endless', 'daily', 'ranked'];

/**
 * Leaderboard with period + mode filters:
 *   /api/laundry-sort/leaderboard?period=all|daily|weekly&mode=time-attack
 *
 * - all     → lifetime high scores from LaundryPlayer (mode-agnostic).
 * - daily   → today's best per user for the given mode.
 * - weekly  → this week's best per user for the given mode.
 */
export const Route = createFileRoute('/api/laundry-sort/leaderboard')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, { limit: 40, windowMs: 60_000, prefix: 'laundry-leaderboard' });
        if (!allowed) {
          return Response.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
        }

        try {
          const url = new URL(request.url);
          const period = url.searchParams.get('period') || 'all';
          const modeParam = url.searchParams.get('mode') || 'time-attack';
          const mode = VALID_MODES.includes(modeParam) ? modeParam : 'time-attack';

          if (period === 'all') {
            const rows = await prisma.laundryPlayer.findMany({
              take: 20,
              orderBy: { highScore: 'desc' },
              select: { username: true, highScore: true, bestStreak: true },
            });
            return Response.json(rows.map((r) => ({ username: r.username, score: r.highScore, bestStreak: r.bestStreak })));
          }

          const where =
            period === 'weekly'
              ? { mode, weekKey: weekKeyUTC() }
              : { mode, dateKey: dateKeyUTC() };

          // Weekly aggregates across the week's daily rows; daily is a direct read.
          if (period === 'weekly') {
            const grouped = await prisma.laundryScore.groupBy({
              by: ['userId', 'username'],
              where,
              _max: { score: true, bestStreak: true },
              orderBy: { _max: { score: 'desc' } },
              take: 20,
            });
            return Response.json(
              grouped.map((g) => ({ username: g.username, score: g._max.score ?? 0, bestStreak: g._max.bestStreak ?? 0 })),
            );
          }

          const rows = await prisma.laundryScore.findMany({
            where,
            take: 20,
            orderBy: { score: 'desc' },
            select: { username: true, score: true, bestStreak: true },
          });
          return Response.json(rows);
        } catch (e) {
          console.error('Laundry leaderboard fetch failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
