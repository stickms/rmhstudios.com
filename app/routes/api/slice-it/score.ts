import { createFileRoute } from '@tanstack/react-router';
import type { Prisma } from '@prisma/client';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { reportGameResult } from '@/lib/game/results.server';
import { ScoreSubmissionZ } from '@/lib/slice-it/api-schemas';
import { RANKED_MIN_SPEED } from '@/lib/slice-it/constants';
import { applyExclusions } from '@/lib/slice-it/modifiers';
import { maxPlausibleCombo, maxPlausibleScore } from '@/lib/slice-it/scoring';
import {
  checkConsistency,
  checkElapsed,
  checkTiming,
  mergeVerdicts,
  type IntegrityVerdict,
} from '@/lib/slice-it/integrity';
import { verifyRunToken } from '@/lib/slice-it/run-token.server';
import type { Difficulty } from '@/lib/slice-it/constants';

/**
 * Score submission.
 *
 * ## What this had to fix
 *
 * The previous handler accepted `{ username, score, accuracy, maxCombo, songId,
 * speed, modifiers }` as untyped JSON and validated it like this: score must be
 * a number between 0 and one billion, username must be a non-empty string.
 * Everything else — the accuracy, the combo, the modifiers the multiplier is
 * computed from — went to the database as sent. A `fetch` with
 * `{score: 999999999}` was a global first place.
 *
 * The three changes that make the number mean something:
 *
 * 1. **The identity comes from the session, not the body.** `username` is gone.
 *    It was used to `create` a `Player` row keyed by a name the caller chose,
 *    which is also why the old code had a 409 "Username taken" path in a score
 *    endpoint.
 * 2. **The bound comes from the song.** `maxPlausibleScore` derives a ceiling
 *    from the track's real duration (read here, not sent) and the declared
 *    modifiers. It is deliberately loose — it is the line between an
 *    exceptional run and a typed-in number, not a simulation.
 * 3. **The multiplier is recomputed.** The client sends which modifiers were
 *    on; the server decides what they are worth. Sending a `speed` of 1.0 and
 *    a `scoreMultiplier` of 40 is not a thing that can be expressed.
 */
export const Route = createFileRoute('/api/slice-it/score')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          body: ScoreSubmissionZ,
          // Per user *and* per IP: the old bucket was per-IP only, which meant
          // a shared connection (a library, a household, a campus) had five
          // score submissions a minute between everyone on it.
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'slice-score', scope: 'user' },
        },
        async ({ userId, body }) => {
          const modifiers = applyExclusions(body.modifiers);

          if (modifiers.speed < RANKED_MIN_SPEED) {
            return Response.json(
              { error: 'Runs below 1.0x speed are unranked.', ranked: false },
              { status: 400 },
            );
          }

          const song = await prisma.song.findUnique({
            where: { id: body.songId },
            select: {
              id: true,
              duration: true,
              isPublic: true,
              uploadedBy: true,
              analysisData: true,
            },
          });
          if (!song || (!song.isPublic && song.uploadedBy !== userId)) {
            return Response.json({ error: 'Song not found' }, { status: 404 });
          }

          const scoreCeiling = maxPlausibleScore(song.duration, modifiers);
          const comboCeiling = maxPlausibleCombo(song.duration);
          if (body.score > scoreCeiling || body.maxCombo > comboCeiling) {
            // Logged rather than silently dropped: a legitimate submission
            // tripping this means the ceiling is wrong, and the only way to
            // find that out is for it to be visible.
            console.warn('[slice-it] implausible score rejected', {
              userId,
              songId: song.id,
              score: body.score,
              scoreCeiling,
              maxCombo: body.maxCombo,
              comboCeiling,
            });
            return Response.json({ error: 'Score failed validation.' }, { status: 422 });
          }

          // ── Integrity ─────────────────────────────────────────────────────
          //
          // Three further checks, and the honest framing for all of them is in
          // `lib/slice-it/integrity.ts`: this game judges hits on the client
          // because it has to, so none of this stops someone determined. It
          // stops the console one-liner, and it makes a bot visible.
          const verdict = mergeVerdicts(
            // Did enough real time pass? The token's timestamp is the server's
            // own clock reading from when the run started.
            checkRunTiming(body.runToken, userId, song.id, song.duration, modifiers.speed),
            // Do the four numbers describe one run?
            checkConsistency({
              score: body.score,
              accuracy: body.accuracy,
              maxCombo: body.maxCombo,
              notesResolved: body.notesResolved,
              chartNotes: chartNoteCount(song.analysisData, modifiers.difficulty),
              durationSeconds: song.duration,
              modifiers,
            }),
            // Is the hit-timing distribution one a person produces?
            { reject: false, suspicions: checkTiming(body.timing) },
          );

          if (verdict.reject) {
            console.warn('[slice-it] score rejected by integrity checks', {
              userId,
              songId: song.id,
              suspicions: verdict.suspicions,
            });
            return Response.json({ error: 'Score failed validation.' }, { status: 422 });
          }
          if (verdict.suspicions.length > 0) {
            // Recorded, not refused. A false positive here costs a real player
            // their record; the flag is for review, and review is a human.
            console.warn('[slice-it] score flagged', {
              userId,
              songId: song.id,
              suspicions: verdict.suspicions,
              timing: body.timing,
            });
          }

          const score = Math.round(body.score);
          const maxCombo = Math.round(body.maxCombo);
          const accuracy = Math.max(0, Math.min(1, body.accuracy));

          // Career totals. `upsert` on the unique `userId` replaces a
          // findFirst-then-branch that raced itself: two runs finishing at once
          // both saw "no profile" and both tried to create one.
          const profile = await prisma.player.upsert({
            where: { userId },
            create: {
              userId,
              username: await uniquePlayerName(userId),
              totalScore: score,
              gamesPlayed: 1,
            },
            update: {
              totalScore: { increment: score },
              gamesPlayed: { increment: 1 },
            },
            select: { totalScore: true, gamesPlayed: true },
          });

          // Per-song personal best. The unique `(songId, userId)` makes this one
          // statement; the old code did findMany → pick highest → update → then
          // deleteMany the duplicates it had itself created by not using the
          // constraint in the first place.
          const previous = await prisma.songLeaderboard.findUnique({
            where: { songId_userId: { songId: song.id, userId } },
            select: { score: true },
          });
          const isNewBest = !previous || score > previous.score;

          if (isNewBest) {
            await prisma.songLeaderboard.upsert({
              where: { songId_userId: { songId: song.id, userId } },
              create: {
                songId: song.id,
                userId,
                score,
                maxCombo,
                accuracy,
                speedMod: modifiers.speed,
                modifiers: modifiers as unknown as Prisma.InputJsonValue,
              },
              update: {
                score,
                maxCombo,
                accuracy,
                speedMod: modifiers.speed,
                modifiers: modifiers as unknown as Prisma.InputJsonValue,
                createdAt: new Date(),
              },
            });
          }

          // Progression is best-effort: a quest engine hiccup must not turn a
          // successful run into a 500 and lose the score the player just set.
          await Promise.allSettled([
            recordGamePlay(userId),
            reportGameResult(userId, { game: 'slice-it', score }),
          ]);

          return Response.json({
            success: true,
            isNewBest,
            score,
            previousBest: previous?.score ?? null,
            totalScore: profile.totalScore,
            gamesPlayed: profile.gamesPlayed,
          });
        },
      ),
    },
  },
});

/**
 * A display name for a first-time `Player` row.
 *
 * `Player.username` is `@unique` and was previously whatever the client sent,
 * with a 409 when it collided — a score endpoint that could fail because
 * somebody else had picked your name. It is derived from the account here, with
 * a numeric suffix on collision.
 */
async function uniquePlayerName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, name: true },
  });

  const base =
    (user?.username || user?.name || 'Player')
      .trim()
      .replace(/[^a-zA-Z0-9_\-. ]/g, '')
      .slice(0, 20) || 'Player';

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await prisma.player.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  // Five collisions means the base name is genuinely popular; fall back to
  // something that cannot collide rather than failing the submission.
  return `${base}-${userId.slice(-6)}`;
}

/**
 * Verify the run receipt and check that the song had time to play.
 *
 * A missing token is tolerated rather than rejected: a run started before this
 * shipped, or by a client that lost the token across a reconnect, is a real run
 * by a real player, and refusing it would delete their score to catch nobody.
 * A token that is present and *wrong* is a different matter — nothing legitimate
 * forges one — so a bad signature rejects.
 */
function checkRunTiming(
  token: string | undefined,
  userId: string,
  songId: string,
  durationSeconds: number,
  speed: number,
): IntegrityVerdict {
  if (!token) return { reject: false, suspicions: [] };

  const verified = verifyRunToken(token, userId, songId);
  if (!verified.ok) {
    // An expired token means a very long session, not a forgery — the run is
    // old, not fake, and there is nothing to check against.
    if (verified.reason === 'expired') return { reject: false, suspicions: [] };
    console.warn('[slice-it] run token rejected', { userId, songId, reason: verified.reason });
    return { reject: true, suspicions: ['finished_too_fast'] };
  }

  return checkElapsed({ elapsedMs: verified.elapsedMs, durationSeconds, speed });
}

/**
 * How many notes the difficulty the player chose actually contains.
 *
 * Charts are stored either as a flat array (legacy) or keyed by tier. Returns
 * undefined when the shape is unrecognised, and the consistency check then skips
 * the bounds that depend on it rather than inventing a number.
 */
function chartNoteCount(analysis: unknown, difficulty: Difficulty | undefined): number | undefined {
  const slices = (analysis as { slices?: unknown } | null)?.slices;
  if (Array.isArray(slices)) return slices.length;
  if (slices && typeof slices === 'object') {
    const tier = (slices as Record<string, unknown>)[difficulty ?? 'normal'];
    if (Array.isArray(tier)) return tier.length;
  }
  return undefined;
}
