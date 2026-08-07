/**
 * Slice It replays — upload one, and find which leaderboard rows have one
 * (`R3`/`R4`).
 *
 * ## Why the replay is not part of the score submission
 *
 * `/api/slice-it/score` takes a fixed-size body: four numbers, a modifier set,
 * and the three-number timing summary `integrity.ts` deliberately sends instead
 * of per-note samples. A replay is one object per resolved note — tens of
 * kilobytes on an Expert chart — and only a fraction of runs are worth keeping
 * one for. Bolting it onto the score body would make every submission pay for
 * the few that need it, and would put a 20 000-element `safeParse` on the path
 * that decides whether a player's run counted.
 *
 * So the client submits the score, the server says whether it was a new personal
 * best, and only then does the client offer the log here. The cost of the split
 * is a second request on the runs that set a record; the benefit is that
 * everything about the score path stays the size it was.
 *
 * ## What is checked before a replay is stored
 *
 * A replay is a claim about a run that already happened, so the run has to be
 * findable: the caller must hold a `SongLeaderboard` best on exactly the board
 * the replay describes (`songId`, `difficulty`, `modPool`). That single check
 * does most of the work — it means a replay can only ever be attached to a score
 * the score endpoint already accepted and bounded, an anonymous caller cannot
 * store anything, and nobody can fill the table with replays of runs they never
 * made.
 *
 * `saveReplay` then does the rest (`lib/replays.server.ts`): zod-validates the
 * payload against the shared schema, enforces the 256 KB cap, and re-simulates
 * the log's internal consistency. The deeper check — re-judging every input
 * against the real notes — runs afterwards and off the request path (`R8`, see
 * `lib/slice-it/verify.server.ts`).
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { sliceItReplaySchema } from '@/lib/game/replay';
import { ReplayError, saveReplay } from '@/lib/replays.server';
import { poolOf } from '@/lib/slice-it/pools';
import { modsFromReplay } from '@/lib/slice-it/replay';
import { scheduleVerification } from '@/lib/slice-it/verify.server';

const ReplayUploadZ = z.object({ replay: sliceItReplaySchema });

/**
 * The lookup the leaderboard panel makes.
 *
 * Ids come in as one comma-separated parameter rather than as a POST body
 * because this is a read, and are capped at the page size the board renders —
 * a lookup for a thousand accounts is not a leaderboard row asking whether it
 * has a replay, it is someone enumerating the table.
 */
const ReplayLookupZ = z.object({
  songId: z.string().min(1).max(64),
  userIds: z.string().max(2_048),
});

export const Route = createFileRoute('/api/slice-it/replay')({
  server: {
    handlers: {
      /**
       * Which of these players have a stored replay on this song.
       *
       * Returns `{ [userId]: replayId }` — the shape a row-level "watch" button
       * needs and nothing more. One query for a whole page of rows, rather than
       * a request per row, because the alternative is fifty requests every time
       * somebody opens a leaderboard.
       */
      GET: defineHandler(
        { auth: 'optional', rateLimit: 'read', query: ReplayLookupZ },
        async ({ query }) => {
          const userIds = query.userIds
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
            .slice(0, 50);
          if (userIds.length === 0) return Response.json({ replays: {} });

          const rows = await prisma.gameReplay.findMany({
            where: {
              game: 'slice-it',
              visibility: 'public',
              userId: { in: userIds },
              // The song a replay belongs to lives in its payload, because
              // `GameReplay` is cross-game and has no column for it. Postgres
              // indexes this as a JSON path lookup; the row set is already
              // narrowed to at most fifty users by the clause above.
              data: { path: ['track'], equals: query.songId },
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, userId: true },
            take: 100,
          });

          const replays: Record<string, string> = {};
          // Newest first, so the first row seen for a player is the one kept.
          for (const row of rows) if (!replays[row.userId]) replays[row.userId] = row.id;
          return Response.json({ replays });
        },
      ),

      POST: defineHandler(
        {
          body: ReplayUploadZ,
          // Tighter than the score endpoint's twenty a minute: this is the
          // large-payload path, and a player cannot legitimately set six
          // personal bests a minute on charts long enough to be worth watching.
          rateLimit: { limit: 6, windowMs: 60_000, prefix: 'slice-replay', scope: 'user' },
        },
        async ({ userId, body }) => {
          const replay = body.replay;
          const modifiers = modsFromReplay(replay.mods);

          const song = await prisma.song.findUnique({
            where: { id: replay.track },
            select: { id: true, duration: true, isPublic: true, uploadedBy: true },
          });
          if (!song || (!song.isPublic && song.uploadedBy !== userId)) {
            return Response.json({ error: 'Song not found' }, { status: 404 });
          }

          // The run this replay claims to be must already exist as a stored
          // personal best on this exact board. Without this, the endpoint is an
          // open writable store of 256 KB blobs.
          const best = await prisma.songLeaderboard.findUnique({
            where: {
              songId_difficulty_modPool_userId: {
                songId: song.id,
                difficulty: modifiers.difficulty,
                modPool: poolOf(modifiers),
                userId,
              },
            },
            select: { id: true, score: true },
          });
          if (!best) {
            return Response.json({ error: 'No stored best for this replay.' }, { status: 422 });
          }

          let saved: { id: string };
          try {
            saved = await saveReplay({
              userId,
              game: 'slice-it',
              data: replay,
              // Read from the song row, never from the payload: a client does
              // not get to declare how long the thing it played was.
              durationMs: Math.round(song.duration * 1000),
            });
          } catch (error) {
            if (error instanceof ReplayError) {
              // 413 for the size cap, 422 for a payload that does not describe a
              // coherent run. Both are the client's to fix; neither is a 500.
              return Response.json(
                { error: 'Replay rejected.', reason: error.code },
                { status: error.code === 'TOO_LARGE' ? 413 : 422 },
              );
            }
            throw error;
          }

          // One replay per player per chart tier. A record is replaced when it
          // is beaten, and keeping every superseded attempt would grow this
          // table with attempts rather than with records — the same reasoning
          // that makes `SongLeaderboard` an upsert. Scoped by difficulty as well
          // as by track, because an `easy` best is not a reason to throw away
          // the `expert` run somebody might actually want to watch.
          await prisma.gameReplay
            .deleteMany({
              where: {
                game: 'slice-it',
                userId,
                id: { not: saved.id },
                AND: [
                  { data: { path: ['track'], equals: song.id } },
                  { data: { path: ['mods', 'difficulty'], equals: modifiers.difficulty } },
                ],
              },
            })
            .catch(() => {
              // A stale replay left behind is clutter, not a failure: the row
              // that matters is already written and the lookup takes the newest.
            });

          // R8, off the request path by construction — nothing below awaits it.
          scheduleVerification(saved.id);

          return Response.json({ id: saved.id, inputs: replay.inputs.length });
        },
      ),
    },
  },
});
