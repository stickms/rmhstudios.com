import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';

const VALID_MODES = [
  'lights-out',
  'alibi',
  'spectrum',
  'outcast',
  'chainlink',
  'impostor',
  'globeset',
];

// Three ranking axes share this table: score-desc (most modes), moves-asc
// (lights-out) and time-asc (globeset). Picking the ordering by mode here keeps
// the query itself declarative instead of a chain of ternaries inline below.
function orderByForMode(gameMode: string) {
  if (gameMode === 'lights-out') {
    return [{ dnf: 'asc' as const }, { moves: 'asc' as const }, { createdAt: 'asc' as const }];
  }
  if (gameMode === 'globeset') {
    // Postgres sorts NULL last on ASC, which is already right for a row with
    // no timeSeconds — but a DNF row (the auto-solver was used) still carries
    // whatever elapsed time it gave up at, which could be *fast*, so `dnf`
    // must lead the sort or a giveaway could outrank a real finish.
    return [
      { dnf: 'asc' as const },
      { timeSeconds: 'asc' as const },
      { createdAt: 'asc' as const },
    ];
  }
  return [{ score: 'desc' as const }, { createdAt: 'asc' as const }];
}

export const Route = createFileRoute('/api/daily-puzzles/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'daily-puzzle-leaderboard' },
          // Anonymous-invariant global top-N — the same bytes for every caller,
          // which is what `public` claims. Matches `void-breaker/leaderboard`.
          cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 300 },
        },
        async ({ request }) => {
          try {
            const { searchParams } = new URL(request.url);
            const gameMode = searchParams.get('gameMode');
            const dateKey = searchParams.get('date');

            if (!gameMode || !VALID_MODES.includes(gameMode)) {
              return Response.json({ error: 'Invalid game mode' }, { status: 400 });
            }

            if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
              return Response.json({ error: 'Invalid date' }, { status: 400 });
            }

            const limit = Math.min(
              50,
              Math.max(1, parseInt(searchParams.get('limit') || '20', 10)),
            );

            const entries = await prisma.dailyPuzzleScore.findMany({
              where: { gameMode, dateKey },
              orderBy: orderByForMode(gameMode),
              take: limit,
              select: {
                score: true,
                moves: true,
                hintUsed: true,
                dnf: true,
                timeSeconds: true,
                createdAt: true,
                // The shared select, not a hand-written one: a bespoke list
                // drops the cosmetics joins, so this board would render a
                // different version of the same person than every other
                // surface does.
                user: { select: userDisplaySelect },
              },
            });

            const leaderboard = entries.map((e, i) => {
              const resolved = e.user ? resolveUserDisplay(e.user) : { name: null, image: null };
              return {
                rank: i + 1,
                score: e.score,
                moves: e.moves,
                dnf: e.dnf ?? false,
                hintUsed: e.hintUsed ?? false,
                timeSeconds: e.timeSeconds,
                displayName: e.user?.username || resolved.name || 'Anonymous',
                avatar: resolved.image || null,
                solvedAt: e.createdAt.toISOString(),
              };
            });

            return Response.json({ leaderboard, dateKey, gameMode });
          } catch (e) {
            console.error('Daily puzzle leaderboard fetch failed:', e);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
