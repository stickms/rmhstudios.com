import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { getStreak, todayKey } from '@/lib/streak.server';
import { QUESTS, dailyKey } from '@/lib/quests/catalog';

/**
 * GET /api/today — the signed-in user's daily loop at a glance: check-in
 * streak (+ freezes), wheel spin, the six daily puzzles, and daily quests.
 * Powers the "Today" widget so the scattered daily surfaces read as one loop.
 */

const PUZZLE_MODES = ['lights-out', 'alibi', 'spectrum', 'outcast', 'chainlink', 'impostor'];

export const Route = createFileRoute('/api/today')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'today' } },
        async ({ session }) => {
          const userId = session.user.id;
          const dateKey = todayKey();
          const questKey = dailyKey();
          const dailyQuests = QUESTS.filter((q) => q.period === 'daily');

          const [streak, wheelSpin, puzzleScores, questRows] = await Promise.all([
            getStreak(userId),
            prisma.dailyWheelSpin.findUnique({
              where: { userId_dateKey: { userId, dateKey } },
              select: { id: true },
            }),
            prisma.dailyPuzzleScore.findMany({
              where: { userId, dateKey, gameMode: { in: PUZZLE_MODES } },
              select: { gameMode: true },
            }),
            prisma.userQuest.findMany({
              where: { userId, periodKey: questKey, questId: { in: dailyQuests.map((q) => q.id) } },
              select: { questId: true, completed: true, claimed: true },
            }),
          ]);

          const doneModes = new Set(puzzleScores.map((s) => s.gameMode));
          const completedQuests = questRows.filter((q) => q.completed).length;
          const claimableQuests = questRows.filter((q) => q.completed && !q.claimed).length;

          return Response.json({
            dateKey,
            streak: {
              current: streak.current,
              checkedInToday: streak.checkedInToday,
              freezeTokens: streak.freezeTokens,
            },
            wheel: { spunToday: !!wheelSpin },
            puzzles: PUZZLE_MODES.map((mode) => ({ mode, done: doneModes.has(mode) })),
            quests: {
              total: dailyQuests.length,
              completed: completedQuests,
              claimable: claimableQuests,
            },
          });
        },
      ),
    },
  },
});
