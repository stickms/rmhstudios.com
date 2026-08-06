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
import { poolOf } from '@/lib/slice-it/pools';
import { gradeFor } from '@/lib/slice-it/scoring';
import type { Difficulty } from '@/lib/slice-it/constants';
import type { SuspicionCode } from '@/lib/slice-it/integrity';

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
          // `optional`, for the guest half of X10. A Discord Activity player
          // with no linked account has no Better Auth session; the old default
          // ('required') 401'd them before the handler body ran, so the only way
          // to play was for the client to skip the submission entirely and show
          // nothing. See the guard immediately below, and
          // `docs/_handoff/discord-requests.md` §2.
          auth: 'optional',
          body: ScoreSubmissionZ,
          // Per user *and* per IP: the old bucket was per-IP only, which meant
          // a shared connection (a library, a household, a campus) had five
          // score submissions a minute between everyone on it.
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'slice-score', scope: 'user' },
        },
        async ({ userId, body }) => {
          const modifiers = applyExclusions(body.modifiers);

          if (!userId) {
            // ── Guest: computed, shown, and discarded ──────────────────────
            //
            // No `SliceRun`, no `SongLeaderboard` row, no `Player` row, no
            // `User` row. The alternative — a shadow account per guest — creates
            // accounts nobody asked for, holds a third party's display name and
            // avatar URL indefinitely, and turns "I tried a game in a voice
            // call" into a data-retention question. Not storing it is both the
            // simpler code and the correct privacy answer.
            //
            // Nothing below this point is reachable without a session, which is
            // the property that matters: the guard is a return, not a flag some
            // later branch has to remember to check.
            return Response.json({
              success: true,
              ranked: false,
              stored: false,
              isNewBest: false,
              previousBest: null,
              score: Math.round(body.score),
              accuracy: Math.max(0, Math.min(1, body.accuracy)),
              grade: gradeFor(Math.max(0, Math.min(1, body.accuracy))),
            });
          }

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

          // ── The board this run belongs on (R1) ────────────────────────────
          //
          // Three coordinates, and the server derives all three. `difficulty`
          // and `modPool` come from the modifier set it already re-parsed and
          // clamped; `chartId` is checked against the song rather than trusted,
          // so a submission cannot attribute itself to a chart it did not play
          // — or to somebody else's song entirely.
          const difficulty: Difficulty = modifiers.difficulty;
          const modPool = poolOf(modifiers);
          const chart = await resolveChart(body.chartId, song.id);

          // ── R6: the run, appended before anything is overwritten ──────────
          //
          // Every attempt used to be destroyed by the personal-best upsert, and
          // with it the timing distribution the engine computes and the
          // integrity verdict the server just computed. This row is the history;
          // the leaderboard row below is a pointer into it.
          //
          // Best-effort on purpose: a failed history write must not cost the
          // player the personal best they just set. It is logged, not raised.
          await prisma.sliceRun
            .create({
              data: {
                userId,
                songId: song.id,
                chartId: chart?.id ?? null,
                chartHash: chart?.chartHash ?? null,
                score,
                accuracy,
                maxCombo,
                notesResolved: body.notesResolved ?? null,
                difficulty,
                modPool,
                modifiers: modifiers as unknown as Prisma.InputJsonValue,
                multiplayer: body.multiplayer,
                // Client-declared (H7/R9). Stored for the badge and the clear
                // rate; never read by anything that decides a rank or a reward.
                cleared: body.cleared,
                isFullCombo: body.isFullCombo,
                isPerfect: body.isPerfect,
                timingCount: body.timing?.samples ?? null,
                timingMeanMs: body.timing?.meanMs ?? null,
                timingSdMs: body.timing?.stdDevMs ?? null,
                // R7: recorded, never acted on. See `suspicionScore`.
                suspicion: suspicionScore(verdict.suspicions),
                suspicions: verdict.suspicions,
              },
              // Never select the row back. `id` is a `BigInt`, which
              // `JSON.stringify` throws on — and there is nothing here the
              // caller needs.
              select: { id: true },
            })
            .catch((error: unknown) => {
              console.warn('[slice-it] run history write failed', {
                userId,
                songId: song.id,
                error: error instanceof Error ? error.message : String(error),
              });
            });

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

          // ── The personal best, per board (R1) ─────────────────────────────
          //
          // The key was `(songId, userId)`: one row per player per song, so a
          // personal best on `normal` overwrote an `expert` record and an `easy`
          // run with six modifiers sat on the same board as an `expert` full
          // combo. It is `(songId, difficulty, modPool, userId)` now — four
          // coordinates, all of them the server's, and a run can only ever
          // replace a run of the same shape.
          const boardKey = {
            songId_difficulty_modPool_userId: { songId: song.id, difficulty, modPool, userId },
          };

          const previous = await prisma.songLeaderboard.findUnique({
            where: boardKey,
            select: { score: true },
          });
          const isNewBest = !previous || score > previous.score;

          if (isNewBest) {
            const best = {
              score,
              maxCombo,
              accuracy,
              speedMod: modifiers.speed,
              modifiers: modifiers as unknown as Prisma.InputJsonValue,
              chartId: chart?.id ?? null,
              chartHash: chart?.chartHash ?? null,
              // Denormalised from the run so `H8`'s lamp survives into the board
              // without a join back to a `SliceRun` row. Decorative — see
              // `ScoreSubmissionZ`.
              cleared: body.cleared,
              isFullCombo: body.isFullCombo,
              isPerfect: body.isPerfect,
            };
            await prisma.songLeaderboard.upsert({
              where: boardKey,
              create: { songId: song.id, userId, difficulty, modPool, ...best },
              update: { ...best, createdAt: new Date() },
              // Explicit `select`, because the default returns the whole row —
              // including the `modifiers` blob — into a variable nobody reads.
              select: { id: true },
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
            ranked: true,
            stored: true,
            isNewBest,
            score,
            accuracy,
            grade: gradeFor(accuracy),
            difficulty,
            modPool,
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
 * Resolve a submitted `chartId` to a chart that belongs to this song.
 *
 * Returns null for a submission that named no chart (every run today: the engine
 * plays `Song.analysisData`, which has no identity) **and** for one that named a
 * chart belonging to a different song. The second case is the reason this is a
 * query rather than a pass-through: `chartId` reaches the leaderboard row and
 * the run history, and an unchecked one would let a submission file itself under
 * somebody else's chart — which is a claim about which notes were played, on a
 * board where that is the whole point.
 *
 * `chartHash` comes back with it so the run records *which version* of the chart
 * it was, and a later edit reads as an edit rather than as everyone's scores
 * silently becoming incomparable (C12).
 */
async function resolveChart(
  chartId: string | undefined,
  songId: string,
): Promise<{ id: string; chartHash: string } | null> {
  if (!chartId) return null;
  const chart = await prisma.chart.findFirst({
    where: { id: chartId, songId },
    select: { id: true, chartHash: true },
  });
  return chart ?? null;
}

/**
 * A 0–1 score from the integrity codes, for `SliceRun.suspicion`.
 *
 * The scale is deliberately coarse and deliberately written down: **one code is
 * 0.5, two independent codes are 1.0.** R7's escalation threshold is `> 0.8`,
 * so under this scale that means "two different checks fired on the same run",
 * which is the "a pattern, not one run" framing that separates a review queue
 * from an accusation machine.
 *
 * Nothing acts on the number here — not the response, not the ranking, not the
 * reward. `integrity.ts` is explicit that its statistical layer flags rather
 * than rejects because a false positive on a legitimate record run costs a real
 * person their record; storing the verdict is what gives that flag somewhere to
 * go, and a human is still the thing on the other end.
 */
function suspicionScore(codes: SuspicionCode[]): number {
  return Math.min(1, codes.length * 0.5);
}

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
