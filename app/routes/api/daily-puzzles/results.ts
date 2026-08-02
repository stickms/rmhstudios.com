import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';

const VALID_MODES = ['lights-out', 'alibi', 'spectrum', 'outcast', 'chainlink', 'impostor'];

export const Route = createFileRoute('/api/daily-puzzles/results')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 30, windowMs: 60_000, prefix: 'daily-puzzle-results' },
        },
        async ({ request }) => {
          try {
            const session = await auth.api.getSession({
              headers: request.headers,
            });

            if (!session?.user?.id) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const { searchParams } = new URL(request.url);
            const gameMode = searchParams.get('gameMode');
            const dateKey = searchParams.get('date');

            if (!gameMode || !VALID_MODES.includes(gameMode)) {
              return Response.json({ error: 'Invalid game mode' }, { status: 400 });
            }

            // Single date lookup
            if (dateKey) {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
                return Response.json({ error: 'Invalid date' }, { status: 400 });
              }

              const entry = await prisma.dailyPuzzleScore.findUnique({
                where: {
                  userId_gameMode_dateKey: {
                    userId: session.user.id,
                    gameMode,
                    dateKey,
                  },
                },
                select: {
                  score: true,
                  moves: true,
                  hintUsed: true,
                  dnf: true,
                  resultJson: true,
                  timeSeconds: true,
                  createdAt: true,
                },
              });

              if (!entry) {
                return Response.json({ result: null });
              }

              return Response.json({
                result: {
                  puzzleDate: dateKey,
                  score: entry.score,
                  moves: entry.moves,
                  hintUsed: entry.hintUsed,
                  dnf: entry.dnf,
                  timeSeconds: entry.timeSeconds ?? null,
                  resultJson: entry.resultJson ?? null,
                  completedAt: entry.createdAt.toISOString(),
                },
              });
            }

            // All results for a game mode (last 30 days max)
            const entries = await prisma.dailyPuzzleScore.findMany({
              where: {
                userId: session.user.id,
                gameMode,
              },
              orderBy: { dateKey: 'desc' },
              take: 30,
              select: {
                dateKey: true,
                score: true,
                moves: true,
                hintUsed: true,
                dnf: true,
                resultJson: true,
                timeSeconds: true,
                createdAt: true,
              },
            });

            const results: Record<string, any> = {};
            for (const e of entries) {
              results[e.dateKey] = {
                puzzleDate: e.dateKey,
                score: e.score,
                moves: e.moves,
                hintUsed: e.hintUsed,
                dnf: e.dnf,
                timeSeconds: e.timeSeconds ?? null,
                resultJson: e.resultJson ?? null,
                completedAt: e.createdAt.toISOString(),
              };
            }

            return Response.json({ results, gameMode });
          } catch (e) {
            console.error('Daily puzzle results fetch failed:', e);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
