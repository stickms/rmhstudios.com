/**
 * Server side of the RMHType course: per-member progress, bests only.
 *
 * Stars are recomputed here from speed and accuracy and are never taken from a
 * client. A run only ever raises a best: a bad day cannot take a star away.
 */
import { prisma } from '@/lib/prisma.server';
import { lessonById, recommendedNext, starsFor, type LessonProgressRow, type RecordedRun } from '@/lib/rmhtype/lessons';

interface StoredRow {
  lessonId: string;
  bestWpm: number;
  bestAccuracy: number;
  stars: number;
  attempts: number;
  completedAt: Date | null;
}

function toRow(row: StoredRow): LessonProgressRow {
  return {
    lessonId: row.lessonId,
    bestWpm: row.bestWpm,
    bestAccuracy: row.bestAccuracy,
    stars: row.stars,
    attempts: row.attempts,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export async function getLessonProgress(userId: string): Promise<LessonProgressRow[]> {
  const rows = await prisma.rmhTypeLessonProgress.findMany({
    where: {
      userId,
    },
    orderBy: {
      lessonId: 'asc',
    },
  });
  return rows.map(toRow);
}

/**
 * Fold one finished run into the member's row. Returns `null` for a lesson id the
 * curriculum does not have (the caller answers 400).
 */
export async function recordLessonRun(
  userId: string,
  run: {
    lessonId: string;
    wpm: number;
    accuracy: number;
  },
): Promise<RecordedRun | null> {
  const lesson = lessonById(run.lessonId);
  if (!lesson) return null;
  const runStars = starsFor(run.wpm, run.accuracy, lesson);

  return prisma.$transaction(async (tx) => {
    const where = {
      userId_lessonId: {
        userId,
        lessonId: lesson.id,
      },
    };
    const existing = await tx.rmhTypeLessonProgress.findUnique({
      where,
    });
    const stars = Math.max(existing?.stars ?? 0, runStars);
    const data = {
      bestWpm: Math.max(existing?.bestWpm ?? 0, run.wpm),
      bestAccuracy: Math.max(existing?.bestAccuracy ?? 0, run.accuracy),
      stars,
      attempts: (existing?.attempts ?? 0) + 1,
      // First completion date: the first run that earned a star, never moved after.
      completedAt: existing?.completedAt ?? (runStars >= 1 ? new Date() : null),
    };
    const saved = await tx.rmhTypeLessonProgress.upsert({
      where,
      create: {
        userId,
        lessonId: lesson.id,
        ...data,
      },
      update: data,
    });
    const all = await tx.rmhTypeLessonProgress.findMany({
      where: {
        userId,
      },
      select: {
        lessonId: true,
        stars: true,
      },
    });
    const next = recommendedNext(new Map(all.map((row) => [row.lessonId, row])));
    return {
      progress: toRow(saved),
      runStars,
      nextLessonId: next,
    };
  });
}

/** The member's course progress, for the account data export. */
export async function exportLessonProgress(userId: string): Promise<LessonProgressRow[]> {
  return getLessonProgress(userId);
}
