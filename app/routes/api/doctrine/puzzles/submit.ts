import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { validateAnswer, calculateScore } from '@/lib/doctrine/puzzle-engine';
import { awardXp, updateStreak } from '@/lib/doctrine/reputation';
import { isSahurActive, SAHUR_WINDOW } from '@/lib/doctrine';
import { apiCache } from '@/lib/cache';

export const Route = createFileRoute('/api/doctrine/puzzles/submit')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(ip, {
          limit: 10,
          windowMs: 60_000,
          prefix: 'doctrine-puzzle-submit',
        });

        if (!allowed) {
          return Response.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
          );
        }

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const body = await request.json();
          const { puzzleId, answer, timeMs, attempts } = body;

          if (!puzzleId || typeof timeMs !== 'number' || typeof attempts !== 'number') {
            return Response.json({ error: 'Invalid submission data' }, { status: 400 });
          }

          // Fetch puzzle
          const puzzle = await prisma.doctrinePuzzle.findUnique({
            where: { id: puzzleId },
          });

          if (!puzzle) {
            return Response.json({ error: 'Puzzle not found' }, { status: 404 });
          }

          // Check expiry
          if (new Date() > puzzle.resetsAt) {
            return Response.json({ error: 'Puzzle has expired. Time waits for no one.' }, { status: 410 });
          }

          // Check Sahur exclusivity
          if (puzzle.isSahur) {
            const user = await prisma.user.findUnique({
              where: { id: session.user.id },
              select: { doctrineTimezone: true },
            });
            if (!isSahurActive(user?.doctrineTimezone ?? 'America/New_York')) {
              return Response.json({ error: 'This puzzle is only available during Sahur Mode (3-4 AM).' }, { status: 403 });
            }
          }

          // Check duplicate
          const existing = await prisma.doctrinePuzzleSubmission.findUnique({
            where: { puzzleId_userId: { puzzleId, userId: session.user.id } },
          });
          if (existing) {
            return Response.json({ error: 'Already submitted. No second chances. TUNG TUNG TUNG.' }, { status: 409 });
          }

          // Validate and score
          const puzzleData = { mode: puzzle.mode.toLowerCase() as 'alibi' | 'spectrum' | 'outcast' | 'chainlink' | 'impostor', seed: puzzle.seed, difficulty: puzzle.difficulty, content: puzzle.data };
          const correct = validateAnswer(puzzleData.mode, puzzleData, answer);
          const score = calculateScore(timeMs, attempts, puzzle.difficulty, correct);

          // Create submission
          const submission = await prisma.doctrinePuzzleSubmission.create({
            data: {
              puzzleId,
              userId: session.user.id,
              answer: answer,
              timeMs,
              attempts,
              correct,
              score,
            },
          });

          // Award XP
          let xpMultiplier = 1;
          if (puzzle.isSahur) xpMultiplier = SAHUR_WINDOW.xpMultiplier;

          if (correct) {
            await awardXp(session.user.id, 'PUZZLE_SOLVE', { puzzleId, score });

            // Update streak
            const streak = await updateStreak(session.user.id);
            if (streak > 1) {
              await awardXp(session.user.id, 'PUZZLE_SOLVE_STREAK_BONUS', { streak });
            }

            if (puzzle.isSahur) {
              await awardXp(session.user.id, 'SAHUR_CHALLENGE_COMPLETE', { puzzleId });
            }

            // Check if first solve
            const solveCount = await prisma.doctrinePuzzleSubmission.count({
              where: { puzzleId, correct: true },
            });
            if (solveCount === 1) {
              await awardXp(session.user.id, 'PUZZLE_FIRST_SOLVE', { puzzleId });
            }
          }

          // Invalidate leaderboard cache
          const dateStr = puzzle.date.toISOString().slice(0, 10);
          apiCache.invalidate(`doctrine:leaderboard:${puzzle.mode}:${dateStr}`);

          return Response.json({ success: true, submission: { correct, score }, xpMultiplier });
        } catch (e) {
          console.error('Doctrine puzzle submit failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
