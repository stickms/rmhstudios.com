import { createFileRoute } from '@tanstack/react-router';

import { apiOptions, withDeveloperApi } from '@/lib/api/with-developer-api.server';
import { prisma } from '@/lib/prisma.server';
import { DIFFICULTIES } from '@/lib/slice-it/constants';
import { MOD_POOLS } from '@/lib/slice-it/pools';

/**
 * GET /api/v1/slice-it/leaderboard — one chart's board (`X13`).
 *
 * Takes the same three board dimensions the game does — song, difficulty and
 * modifier pool (`R1`) — because a "leaderboard" that mixes an easy run with
 * six modifiers against an expert full combo is the bug R1 exists to fix, and
 * exporting that shape through a public API would bake it into every community
 * tool built on top.
 *
 * Handles, never user ids. A public API that emits internal ids hands out a
 * join key for every other endpoint, and a handle is what a stat site displays
 * anyway.
 */
export const Route = createFileRoute('/api/v1/slice-it/leaderboard')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ json, error }) => {
            const url = new URL(request.url);
            const songId = url.searchParams.get('songId');
            if (!songId) {
              return error('invalid_request', 'songId is required.', 400);
            }

            const difficulty = url.searchParams.get('difficulty') || 'normal';
            if (!(DIFFICULTIES as readonly string[]).includes(difficulty)) {
              return error(
                'invalid_request',
                `Unknown difficulty. Supported: ${DIFFICULTIES.join(', ')}.`,
                400,
              );
            }
            const modPool = url.searchParams.get('modPool') || 'none';
            if (!(MOD_POOLS as readonly string[]).includes(modPool)) {
              return error(
                'invalid_request',
                `Unknown modPool. Supported: ${MOD_POOLS.join(', ')}.`,
                400,
              );
            }

            const rawLimit = parseInt(url.searchParams.get('limit') || '25', 10);
            const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 25, 100);

            // Public songs only, and checked on the SONG: a private upload's
            // board is not public just because a score on it is.
            const song = await prisma.song.findFirst({
              where: { id: songId, isPublic: true, takenDownAt: null },
              select: { id: true, title: true, artist: true },
            });
            if (!song) return error('not_found', 'No such public song.', 404);

            const rows = await prisma.songLeaderboard.findMany({
              where: { songId, difficulty, modPool },
              orderBy: { score: 'desc' },
              take: limit,
              select: {
                score: true,
                maxCombo: true,
                accuracy: true,
                cleared: true,
                createdAt: true,
                user: { select: { handle: true, username: true } },
              },
            });

            return json({
              song: { id: song.id, title: song.title, artist: song.artist },
              difficulty,
              modPool,
              data: rows.map((row, index) => ({
                rank: index + 1,
                // A handle, or the username, or nothing — never the id.
                player: row.user.handle ?? row.user.username ?? null,
                score: row.score,
                maxCombo: row.maxCombo,
                accuracy: row.accuracy,
                cleared: row.cleared,
                achievedAt: row.createdAt.toISOString(),
              })),
            });
          },
          { scope: 'read:slice-it' },
        ),
    },
  },
});
