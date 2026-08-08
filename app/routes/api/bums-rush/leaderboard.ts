import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';

/**
 * GET /api/bums-rush/leaderboard — per level, per player count, per assist
 * state (§9.8, §11.5): "a 4-player time and a solo time are not the same
 * record", and the clean/assisted split is a separate board rather than a
 * flag on a shared one, so `assisted` is a required filter, not optional —
 * it is the third column of the `BumsRushLevelClear` index
 * (`[levelId, playerCount, assisted, bestMs]`) this query rides on.
 *
 * Cursor-paginated (a plain offset, like `api/slice-it/leaderboard.ts`) and
 * cached 60s via `apiCache`, per §10.3.
 */
const queryZ = z.object({
  levelId: z.string().min(1).max(64),
  playerCount: z.coerce.number().int().min(1).max(4),
  assisted: z.enum(['true', 'false']).transform((v) => v === 'true'),
  cursor: z.coerce.number().int().min(0).optional().default(0),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});

const CLEAR_SELECT = {
  userId: true,
  bestMs: true,
  objectives: true,
  assisted: true,
  clears: true,
  updatedAt: true,
  profile: { select: { user: { select: userDisplaySelect } } },
} as const satisfies Prisma.BumsRushLevelClearSelect;

type ClearRow = Prisma.BumsRushLevelClearGetPayload<{ select: typeof CLEAR_SELECT }>;

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  handle: string | null;
  image: string | null;
  bestMs: number;
  objectives: number;
  clears: number;
  achievedAt: string;
  isSelf: boolean;
}

function toEntry(row: ClearRow, rank: number, viewerId: string | null): LeaderboardEntry {
  const display = resolveUser(row.profile.user);
  return {
    rank,
    userId: row.userId,
    username: display.name || display.username || 'Anonymous Biro',
    handle: display.handle,
    image: display.image ?? null,
    bestMs: row.bestMs,
    objectives: row.objectives,
    clears: row.clears,
    achievedAt: row.updatedAt.toISOString(),
    isSelf: row.userId === viewerId,
  };
}

export const Route = createFileRoute('/api/bums-rush/leaderboard')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'optional', query: queryZ, rateLimit: 'read' },
        async ({ query, userId }) => {
          const { levelId, playerCount, assisted, cursor, limit } = query;
          const cacheKey = `bums-rush:leaderboard:${levelId}:${playerCount}:${assisted}:${cursor}:${limit}`;
          type Page = { entries: LeaderboardEntry[]; total: number; nextCursor: number | null };
          const where: Prisma.BumsRushLevelClearWhereInput = { levelId, playerCount, assisted };

          let page = apiCache.get<Page>(cacheKey);
          if (!page) {
            const [rows, total] = await Promise.all([
              prisma.bumsRushLevelClear.findMany({
                where,
                orderBy: { bestMs: 'asc' },
                skip: cursor,
                take: limit,
                select: CLEAR_SELECT,
              }),
              prisma.bumsRushLevelClear.count({ where }),
            ]);
            // `isSelf` is always `false` in the stored form — the cache key has
            // no viewer dimension, so one viewer's page is served to the next,
            // and a viewer-specific flag baked in here would leak: viewer A's
            // row would still read `isSelf: true` when viewer B loads the same
            // cached page. It is stamped in per-request below instead.
            page = {
              entries: rows.map((row, i) => toEntry(row, cursor + i + 1, null)),
              total,
              nextCursor: cursor + rows.length < total ? cursor + rows.length : null,
            };
            apiCache.set(cacheKey, page, 60_000);
          }
          const entries = page.entries.map((entry) => ({
            ...entry,
            isSelf: entry.userId === userId,
          }));

          const self = userId ? await selfRow(where, userId) : null;

          return Response.json({ entries, total: page.total, nextCursor: page.nextCursor, self });
        },
      ),
    },
  },
});

/**
 * The caller's own row and rank on this exact board, even when it falls
 * outside the current page — a leaderboard is most useful to the person not
 * currently winning.
 */
async function selfRow(
  where: Prisma.BumsRushLevelClearWhereInput,
  userId: string,
): Promise<LeaderboardEntry | null> {
  const row = await prisma.bumsRushLevelClear.findFirst({
    where: { ...where, userId },
    select: CLEAR_SELECT,
  });
  if (!row) return null;
  const better = await prisma.bumsRushLevelClear.count({
    where: { ...where, bestMs: { lt: row.bestMs } },
  });
  return toEntry(row, better + 1, userId);
}
