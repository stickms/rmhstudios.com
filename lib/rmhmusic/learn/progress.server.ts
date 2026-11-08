import { prisma } from '@/lib/prisma.server';
import { checkIn } from '@/lib/streak.server';
import { awardXp } from '@/lib/xp/engine.server';
import { isKnownLesson } from './content/path';
import {
  INPUTS,
  INSTRUMENTS,
  type Instrument,
  type LearnInput,
  type LessonCompleteInput,
  type ProfileInput,
} from './schemas';
import { mergeLessonResult } from './xp';

export interface Profile {
  instrument: Instrument;
  input: LearnInput;
  latencyMs: number;
  dailyGoal: number;
}

export interface LessonProgressRow {
  lessonId: string;
  stars: number;
  bestScore: number;
  completedAt: string | null;
}

export const DEFAULT_PROFILE: Profile = {
  instrument: 'piano',
  input: 'screen',
  latencyMs: 0,
  dailyGoal: 1,
};

/** Thrown by `completeLesson` for an id that is not in the catalogue. */
export class UnknownLessonError extends Error {
  constructor(lessonId: string) {
    super(`Unknown lesson: ${lessonId}`);
    this.name = 'UnknownLessonError';
  }
}

function toProfile(row: {
  instrument: string;
  input: string;
  latencyMs: number;
  dailyGoal: number;
}): Profile {
  // Columns are plain strings; narrow them so a stale value never reaches the UI.
  return {
    instrument: (INSTRUMENTS as readonly string[]).includes(row.instrument)
      ? (row.instrument as Instrument)
      : DEFAULT_PROFILE.instrument,
    input: (INPUTS as readonly string[]).includes(row.input)
      ? (row.input as LearnInput)
      : DEFAULT_PROFILE.input,
    latencyMs: row.latencyMs,
    dailyGoal: row.dailyGoal,
  };
}

/** The learner's profile, or the defaults when they have not saved one. Never writes. */
export async function getProfile(userId: string): Promise<Profile> {
  const row = await prisma.musicLearnProfile.findUnique({ where: { userId } });
  return row ? toProfile(row) : { ...DEFAULT_PROFILE };
}

export async function saveProfile(userId: string, input: ProfileInput): Promise<Profile> {
  const data = {
    instrument: input.instrument,
    input: input.input,
    latencyMs: input.latencyMs,
    dailyGoal: input.dailyGoal,
  };
  const row = await prisma.musicLearnProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return toProfile(row);
}

export async function listProgress(userId: string): Promise<LessonProgressRow[]> {
  const rows = await prisma.musicLearnLessonProgress.findMany({
    where: { userId },
    orderBy: { lessonId: 'asc' },
    select: { lessonId: true, stars: true, bestScore: true, completedAt: true },
  });
  return rows.map((r) => ({
    lessonId: r.lessonId,
    stars: r.stars,
    bestScore: r.bestScore,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));
}

/**
 * Record a lesson result. Stars and best score only ever rise, and XP is paid on
 * the stars gained (`mergeLessonResult`), so replaying a lesson cannot farm XP.
 *
 * The read-merge-write runs in one transaction that first makes sure the row
 * exists, then takes a row lock (`SELECT ... FOR UPDATE`). A concurrent
 * identical request waits on that lock, re-reads the committed row, sees the
 * stars already banked, and is paid 0 — two requests can never both be paid for
 * the same new star.
 */
export async function completeLesson(
  userId: string,
  input: LessonCompleteInput,
): Promise<{ stars: number; xpAwarded: number; progress: LessonProgressRow[] }> {
  if (!isKnownLesson(input.lessonId)) throw new UnknownLessonError(input.lessonId);
  const { lessonId } = input;

  const { stars, xpAwarded } = await prisma.$transaction(async (tx) => {
    await tx.musicLearnLessonProgress.createMany({
      data: [{ userId, lessonId }],
      skipDuplicates: true,
    });
    await tx.$queryRaw`SELECT "id" FROM "music_learn_lesson_progress" WHERE "userId" = ${userId} AND "lessonId" = ${lessonId} FOR UPDATE`;
    const prev = await tx.musicLearnLessonProgress.findUniqueOrThrow({
      where: { userId_lessonId: { userId, lessonId } },
    });
    const merged = mergeLessonResult(prev, input);
    await tx.musicLearnLessonProgress.update({
      where: { userId_lessonId: { userId, lessonId } },
      data: {
        stars: merged.stars,
        bestScore: merged.bestScore,
        // Set when stars first reach 1; never cleared.
        completedAt: prev.completedAt ?? (merged.stars >= 1 ? new Date() : null),
      },
    });
    return merged;
  });

  // Best-effort side effects, outside the transaction.
  if (xpAwarded > 0) await awardXp(userId, xpAwarded);
  try {
    await checkIn(userId);
  } catch {
    // A streak failure must never fail the lesson save.
  }

  return { stars, xpAwarded, progress: await listProgress(userId) };
}
