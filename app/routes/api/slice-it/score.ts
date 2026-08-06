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
            select: { id: true, duration: true, isPublic: true, uploadedBy: true },
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
