import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma';
import { apiCache } from '@/lib/cache';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generatePuzzle, getSeedForDate } from '@/lib/doctrine/puzzle-engine';
import type { PuzzleMode } from '@/lib/doctrine/types';

const MODES: PuzzleMode[] = ['alibi', 'spectrum', 'outcast', 'chainlink', 'impostor'];

export const Route = createFileRoute('/api/doctrine/puzzles/today')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'doctrine-today' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const today = new Date().toISOString().slice(0, 10);
          const cacheKey = `doctrine:puzzles:today:${today}`;
          const cached = apiCache.get(cacheKey);
          if (cached) return Response.json(cached);

          // Ensure today's puzzles exist (create if missing)
          const puzzles = await ensureTodaysPuzzles(today);

          const result = puzzles.map(p => ({
            id: p.id,
            mode: p.mode,
            date: today,
            difficulty: p.difficulty,
            resetsAt: p.resetsAt,
            isSahur: p.isSahur,
            data: p.data,
          }));

          apiCache.set(cacheKey, result, 60_000); // 1 min cache
          return Response.json(result);
        } catch (e) {
          console.error('Doctrine today puzzles failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
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
  const existingModes = new Set(existing.map(p => p.mode));
  const missing = MODES.filter(m => !existingModes.has(m.toUpperCase() as 'ALIBI' | 'SPECTRUM' | 'OUTCAST' | 'CHAINLINK' | 'IMPOSTOR'));

  const created = await Promise.all(
    missing.map(mode => {
      const seed = getSeedForDate(dateStr, mode);
      const puzzleData = generatePuzzle(mode, seed, dateStr);
      const modeEnum = mode.toUpperCase() as 'ALIBI' | 'SPECTRUM' | 'OUTCAST' | 'CHAINLINK' | 'IMPOSTOR';
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
