/**
 * POST /api/slice-it/ai/coach — coach a finished run. (Features 1 and 2.)
 *
 * Returns `{ advice }`, where `advice` is null whenever AI is unavailable. A
 * null is a 200, not an error: the results card renders without a coaching
 * panel, which is the screen that shipped before this route existed, and a 503
 * would put a red toast over a run the player just finished.
 *
 * The run's numbers come from the body because the engine is the only thing
 * that measured them. They are not re-verified here and do not need to be —
 * this route writes nothing and awards nothing. A player who edits their own
 * accuracy upward gets worse coaching, which is its own punishment.
 *
 * The *song* is read from the database. See `api-schemas.ts` for why that line
 * is where it is.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { prisma } from '@/lib/prisma.server';
import { CoachRequestZ } from '@/lib/slice-it/ai/api-schemas';
import { coachSliceRun } from '@/lib/slice-it/ai/coach.server';
import { isAiConfigured } from '@/lib/slice-it/ai/run.server';
import { loadSongFacts } from '@/lib/slice-it/ai/song-facts.server';
import { activeModifierNames, type SliceRunFacts } from '@/lib/slice-it/ai/facts';
import { gradeFor } from '@/lib/slice-it/scoring';

export const Route = createFileRoute('/api/slice-it/ai/coach')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          body: CoachRequestZ,
          rateLimit: {
            policy: 'ai',
            limit: 12,
            windowMs: 60_000,
            prefix: 'slice-coach',
            scope: 'user',
          },
        },
        async ({ userId, body }) => {
          if (!isAiConfigured()) return Response.json({ advice: null });
          await assertAiBudget(userId);

          const song = await loadSongFacts(body.songId, userId, { modifiers: body.modifiers });
          if (!song) return Response.json({ error: 'Song not found' }, { status: 404 });

          // The player's previous best on this chart, so the coach can say
          // whether this run was progress. Read here rather than sent, because
          // "am I improving" is the one claim a client could make about itself
          // that would change the advice's tone entirely.
          const best = await prisma.songLeaderboard.findUnique({
            where: { songId_userId: { songId: song.id, userId } },
            select: { score: true },
          });

          const facts: SliceRunFacts = {
            songTitle: song.title,
            songArtist: song.artist,
            durationSec: song.durationSec,
            difficulty: body.modifiers.difficulty,
            speed: body.modifiers.speed,
            activeModifiers: activeModifierNames(body.modifiers),
            score: body.score,
            maxCombo: body.maxCombo,
            accuracy: body.accuracy,
            grade: gradeFor(body.accuracy),
            notesResolved: body.notesResolved,
            judgements: body.judgements ?? null,
            timing: body.timing ?? null,
            sections: body.sections ?? null,
            chart: song.facts,
            personalBest: best?.score ?? null,
            rank: null,
          };

          return Response.json({ advice: await coachSliceRun(facts, { userId }) });
        },
      ),
    },
  },
});
