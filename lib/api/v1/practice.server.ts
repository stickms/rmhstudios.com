/**
 * `/api/v1/me/typing*`, `/api/v1/me/music/practice` and `/api/v1/me/focus-sessions` (s09-09): the key owner's practice
 * history, read-only. Every query is `where: { userId }` with the key owner's id from the wrapper; there is no id
 * parameter naming another member's row, and every list rides a `userId`-leading index:
 *   RmhTypeProfile         unique (userId, difficulty)
 *   RmhTypeLessonProgress  primary key (userId, lessonId)
 *   RmhTypeDailyEntry      unique (userId, day)
 *   RmhTypeKeyStat         primary key (userId, key, layout)
 *   MusicPracticeEntry     index (userId, createdAt desc)
 *   RmhStudySession        index (userId, startedAt desc)
 * Not returned: multiplayer match rows (other players' data), ghosts (a replay payload), a focus session's room id.
 */
import { prisma } from '@/lib/prisma.server';
import { MIN_ATTEMPTS_FOR_READING, keyMetrics } from '@/lib/rmhtype/keystats';
import {
  FOCUS_ID_PATTERN,
  MUSIC_ID_PATTERN,
  decodePracticeCursor,
  encodePracticeCursor,
  type PagedQuery,
} from '@/lib/api/v1/practice-schema';

/** The curriculum is a few dozen lessons; the cap only bounds a runaway table. */
const LESSON_CAP = 500;
/** Four layouts of at most 128 distinct keys each. */
const KEY_CAP = 600;

export async function typingSummary(userId: string) {
  const [profiles, lessons] = await Promise.all([
    prisma.rmhTypeProfile.findMany({
      where: { userId },
      orderBy: { difficulty: 'asc' },
      take: 20,
      select: {
        difficulty: true,
        totalGamesPlayed: true,
        totalWins: true,
        bestWpm: true,
        bestWpmAccuracy: true,
        avgWpm: true,
        bestAccuracy: true,
        avgAccuracy: true,
        totalCharsTyped: true,
        totalTimeMs: true,
        currentStreak: true,
        bestStreak: true,
        updatedAt: true,
      },
    }),
    prisma.rmhTypeLessonProgress.findMany({
      where: { userId },
      orderBy: { lessonId: 'asc' },
      take: LESSON_CAP,
      select: { lessonId: true, bestWpm: true, bestAccuracy: true, stars: true, attempts: true, completedAt: true },
    }),
  ]);
  return {
    profiles: profiles.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })),
    lessons: lessons.map((l) => ({ ...l, completedAt: l.completedAt ? l.completedAt.toISOString() : null })),
  };
}

export async function typingDaily(userId: string, from: string, to: string) {
  const rows = await prisma.rmhTypeDailyEntry.findMany({
    where: { userId, day: { gte: from, lte: to } },
    orderBy: { day: 'asc' },
    take: 400,
    select: { day: true, passageId: true, wpm: true, accuracy: true, timeMs: true, finishedAt: true },
  });
  return {
    from,
    to,
    data: rows.map((r) => ({ ...r, finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null })),
  };
}

export async function typingKeys(userId: string, layout: string | undefined) {
  const rows = await prisma.rmhTypeKeyStat.findMany({
    where: { userId, ...(layout ? { layout } : {}), attempts: { gte: MIN_ATTEMPTS_FOR_READING } },
    take: KEY_CAP,
    select: { key: true, layout: true, attempts: true, errors: true, totalMs: true },
  });
  const data = rows
    .map((r) => ({
      layout: r.layout,
      ...keyMetrics({ key: r.key, attempts: r.attempts, errors: r.errors, totalMs: r.totalMs }),
    }))
    .sort((a, b) => b.weakness - a.weakness || a.key.localeCompare(b.key))
    .map((m) => ({
      key: m.key,
      layout: m.layout,
      attempts: m.attempts,
      errors: m.errors,
      totalMs: m.totalMs,
      msPerKey: m.msPerKey,
      errorRate: m.errorRate,
      weakness: m.weakness,
    }));
  return { minAttempts: MIN_ATTEMPTS_FOR_READING, data };
}

export async function musicPractice(userId: string, q: PagedQuery) {
  const cursor = q.cursor ? decodePracticeCursor(q.cursor, MUSIC_ID_PATTERN) : null;
  if (q.cursor && !cursor) return 'invalid_cursor' as const;
  const since = q.since ? new Date(q.since) : null;
  const rows = await prisma.musicPracticeEntry.findMany({
    where: {
      userId,
      ...(since ? { createdAt: { gte: since } } : {}),
      ...(cursor
        ? { OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: BigInt(cursor.id) } }] }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    select: { id: true, kind: true, refId: true, mode: true, score: true, durationMs: true, createdAt: true },
  });
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    data: page.map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      refId: r.refId,
      mode: r.mode,
      score: r.score,
      durationMs: r.durationMs,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor:
      rows.length > q.limit && last ? encodePracticeCursor({ at: last.createdAt, id: String(last.id) }) : null,
  };
}

export async function focusSessions(userId: string, q: PagedQuery) {
  const cursor = q.cursor ? decodePracticeCursor(q.cursor, FOCUS_ID_PATTERN) : null;
  if (q.cursor && !cursor) return 'invalid_cursor' as const;
  const since = q.since ? new Date(q.since) : null;
  const [rows, profile] = await Promise.all([
    prisma.rmhStudySession.findMany({
      where: {
        userId,
        ...(since ? { startedAt: { gte: since } } : {}),
        ...(cursor ? { OR: [{ startedAt: { lt: cursor.at } }, { startedAt: cursor.at, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      select: { id: true, focusTimeMs: true, breakTimeMs: true, sessionsInRun: true, startedAt: true, endedAt: true },
    }),
    // The summary rides the first page only.
    cursor
      ? Promise.resolve(null)
      : prisma.rmhStudyProfile.findUnique({ where: { userId }, select: { weeklyGoalMinutes: true, timeZone: true } }),
  ]);
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    ...(cursor
      ? {}
      : { summary: { weeklyGoalMinutes: profile?.weeklyGoalMinutes ?? null, timeZone: profile?.timeZone ?? null } }),
    data: page.map((r) => ({
      id: r.id,
      focusTimeMs: r.focusTimeMs,
      breakTimeMs: r.breakTimeMs,
      sessionsInRun: r.sessionsInRun,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    })),
    nextCursor: rows.length > q.limit && last ? encodePracticeCursor({ at: last.startedAt, id: last.id }) : null,
  };
}
