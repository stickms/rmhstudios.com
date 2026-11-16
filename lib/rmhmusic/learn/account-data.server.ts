/**
 * RMH Music in the account's data export and in account deletion (owner decision Q4, Phase 6):
 * every RMH Music table, the learning profile, lesson progress, remembered cards, sight reading
 * bests and Daily runs, song bests and the social consent, goes both ways.
 *
 * Deletion anonymises the user row in place (`lib/account/deletion.server.ts`), so the
 * `onDelete: Cascade` relations from `User` never fire: each table gets its own `deleteMany`
 * here, and `anonymizeAccount` runs them in its transaction. A learner's Daily runs leave every
 * board the moment the account is erased (the board also filters tombstones).
 *
 * `account-data.server.test.ts` reads the model list from the schema and fails for a music table
 * that is missing from either function, so a new table cannot be forgotten.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';

/** Bound per collection, as the export route bounds every other one. */
const CAP = 10_000;

/** The account's RMH Music data, for `GET /api/account/export`. */
export async function exportMusicData(
  userId: string,
) {
  const [
    profile,
    lessons,
    cards,
    sprintBests,
    sprintDaily,
    songBests,
  ] =
    await Promise.all(
      [
        prisma.musicLearnProfile.findUnique(
          {
            where:
              {
                userId,
              },
          },
        ),
        prisma.musicLearnLessonProgress.findMany(
          {
            where:
              {
                userId,
              },
            take: CAP,
          },
        ),
        prisma.musicLearnCard.findMany(
          {
            where:
              {
                userId,
              },
            take: CAP,
          },
        ),
        prisma.musicSprintBest.findMany(
          {
            where:
              {
                userId,
              },
            take: CAP,
          },
        ),
        prisma.musicSprintDaily.findMany(
          {
            where:
              {
                userId,
              },
            take: CAP,
            orderBy:
              {
                date: 'desc',
              },
          },
        ),
        prisma.musicSongBest.findMany(
          {
            where:
              {
                userId,
              },
            take: CAP,
          },
        ),
      ],
    );
  return {
    profile,
    lessons,
    cards,
    sprintBests,
    sprintDaily,
    songBests,
  };
}

/** One `deleteMany` per RMH Music table, for `anonymizeAccount`'s transaction. */
export function musicErasureOps(
  userId: string,
): Prisma.PrismaPromise<unknown>[] {
  return [
    prisma.musicLearnProfile.deleteMany(
      {
        where:
          {
            userId,
          },
      },
    ),
    prisma.musicLearnLessonProgress.deleteMany(
      {
        where:
          {
            userId,
          },
      },
    ),
    prisma.musicLearnCard.deleteMany(
      {
        where:
          {
            userId,
          },
      },
    ),
    prisma.musicSprintBest.deleteMany(
      {
        where:
          {
            userId,
          },
      },
    ),
    prisma.musicSprintDaily.deleteMany(
      {
        where:
          {
            userId,
          },
      },
    ),
    prisma.musicSongBest.deleteMany(
      {
        where:
          {
            userId,
          },
      },
    ),
  ];
}
