import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@features/doctrine/engine/doctrine.contract';
import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import {
  generatePuzzle,
  getSeedForDate,
  stripSolution,
} from '@features/doctrine/engine/puzzle-engine';
import type { PuzzleMode } from '@features/doctrine/engine/types';

const MODES: PuzzleMode[] = ['alibi', 'spectrum', 'outcast', 'chainlink', 'impostor'];

export const route = apiRoute('/api/doctrine/puzzles/today', {
  GET: implement(
    C.getDoctrineTodayPuzzlesApi,
    {
      auth: 'none',
      rateLimit: { limit: 30, windowMs: 60_000, prefix: 'doctrine-today' },
      // Today's puzzle changes once per day and the handler already memoizes
      // per date in-process; the edge can hold it far longer than a leaderboard.
      cache: { visibility: 'public', maxAge: 300, sMaxAge: 3600, staleWhileRevalidate: 86400 },
    },
    async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const cacheKey = `doctrine:puzzles:today:${today}`;
        const result = await cached(cacheKey, 60_000, async () => {
          // 1 min cache
          // Ensure today's puzzles exist (create if missing)
          const puzzles = await ensureTodaysPuzzles(today);

          return puzzles.map((p) => ({
            id: p.id,
            mode: p.mode,
            date: today,
            difficulty: p.difficulty,
            resetsAt: p.resetsAt,
            isSahur: p.isSahur,
            data: stripSolution(
              p.mode.toLowerCase() as 'alibi' | 'spectrum' | 'outcast' | 'chainlink' | 'impostor',
              p.data as Record<string, unknown>,
            ),
          }));
        });
        return Response.json(result);
      } catch (e) {
        console.error('Doctrine today puzzles failed:', e);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
      }
    },
  ),
});

async function ensureTodaysPuzzles(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00Z');
  const tomorrow = new Date(date);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const existing = await prisma.doctrinePuzzle.findMany({
    where: { date, isSahur: false },
  });

  if (existing.length >= MODES.length) return existing;

  // Generate missing puzzles
  const existingModes = new Set(existing.map((p) => p.mode));
  const missing = MODES.filter(
    (m) =>
      !existingModes.has(
        m.toUpperCase() as 'ALIBI' | 'SPECTRUM' | 'OUTCAST' | 'CHAINLINK' | 'IMPOSTOR',
      ),
  );

  const created = await Promise.all(
    missing.map((mode) => {
      const seed = getSeedForDate(dateStr, mode);
      const puzzleData = generatePuzzle(mode, seed, dateStr);
      const modeEnum = mode.toUpperCase() as
        'ALIBI' | 'SPECTRUM' | 'OUTCAST' | 'CHAINLINK' | 'IMPOSTOR';
      return prisma.doctrinePuzzle.create({
        data: {
          mode: modeEnum,
          date,
          seed,
          data: puzzleData.content as object,
          difficulty: puzzleData.difficulty,
          resetsAt: tomorrow,
          isSahur: false,
        },
      });
    }),
  );

  return [...existing, ...created];
}
