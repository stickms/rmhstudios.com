/**
 * Replay Puzzle API
 *
 * GET  — Generate a fresh random puzzle for a given mode (not tied to the daily seed).
 * POST — Submit a replay answer. Awards reduced XP (3 vs 10). Does NOT count
 *        toward streaks or leaderboards.
 */

import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { generatePuzzle, validateAnswer, calculateScore, stripSolution } from '@/lib/doctrine/puzzle-engine';
import { awardXp } from '@/lib/doctrine/reputation';
import type { PuzzleMode } from '@/lib/doctrine/types';

const VALID_MODES: PuzzleMode[] = ['alibi', 'spectrum', 'outcast', 'chainlink', 'impostor'];
const REPLAY_XP = 3;

export const Route = createFileRoute('/api/doctrine/puzzles/replay')({
  server: {
    handlers: {
      /**
       * GET /api/doctrine/puzzles/replay?mode=alibi
       * Returns a freshly generated puzzle with a random seed.
       */
      GET: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'doctrine-replay-gen' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session?.user?.id) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const url = new URL(request.url);
          const mode = (url.searchParams.get('mode') ?? '').toLowerCase() as PuzzleMode;
          if (!VALID_MODES.includes(mode)) {
            return Response.json({ error: 'Invalid mode' }, { status: 400 });
          }

          // Random seed that won't collide with the daily deterministic seed
          const seed = Math.floor(Math.random() * 2_147_483_647);
          const puzzleData = generatePuzzle(mode, seed);

          // Store the replay puzzle so we can validate the answer later
          const replay = await prisma.doctrinePuzzleReplay.create({
            data: {
              userId: session.user.id,
              mode: mode.toUpperCase() as 'ALIBI' | 'SPECTRUM' | 'OUTCAST' | 'CHAINLINK' | 'IMPOSTOR',
              seed,
              data: puzzleData.content as object,
              difficulty: puzzleData.difficulty,
            },
          });

          // Strip solution from data sent to client
          const clientData = stripSolution(mode, puzzleData.content as Record<string, unknown>);

          const tomorrow = new Date();
          tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
          tomorrow.setUTCHours(0, 0, 0, 0);

          return Response.json({
            id: replay.id,
            mode: mode.toUpperCase(),
            difficulty: puzzleData.difficulty,
            resetsAt: tomorrow.toISOString(),
            data: clientData,
          });
        } catch (e) {
          console.error('Replay puzzle generation failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      /**
       * POST /api/doctrine/puzzles/replay
       * Submit a replay answer. Reduced XP, no leaderboard, no streak.
       */
      POST: async ({ request }) => {
        const ip = getClientIp(request);
        const { allowed } = rateLimit(ip, { limit: 15, windowMs: 60_000, prefix: 'doctrine-replay-submit' });
        if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

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

          const replay = await prisma.doctrinePuzzleReplay.findUnique({
            where: { id: puzzleId },
          });

          if (!replay || replay.userId !== session.user.id) {
            return Response.json({ error: 'Replay puzzle not found' }, { status: 404 });
          }

          if (replay.answer !== null) {
            return Response.json({ error: 'Already submitted this replay.' }, { status: 409 });
          }

          // Validate and score
          const mode = replay.mode.toLowerCase() as PuzzleMode;
          const puzzleDataFull = { mode, seed: replay.seed, difficulty: replay.difficulty, content: replay.data };
          const correct = validateAnswer(mode, puzzleDataFull, answer);
          const score = calculateScore(timeMs, attempts, replay.difficulty, correct);

          // Update the replay record
          await prisma.doctrinePuzzleReplay.update({
            where: { id: puzzleId },
            data: { answer, timeMs, attempts, correct, score },
          });

          // Award reduced XP for replays (no streak, no first-solve)
          if (correct) {
            await awardXp(session.user.id, 'PUZZLE_REPLAY_SOLVE', { replayId: puzzleId, score });
          }

          return Response.json({ success: true, submission: { correct, score, xpMultiplier: 1 } });
        } catch (e) {
          console.error('Replay puzzle submit failed:', e);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});

