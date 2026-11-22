import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import type { DeckStatsRow, StudyStats } from '@/lib/study/stats.contract';
import {
  FORECAST_DAYS,
  HEATMAP_DAYS,
  PASS_GRADE,
  addDays,
  dayKeyInZone,
  forecast,
  retention,
  streaks,
} from '@/lib/study/stats';

/** Bound on the rows an account export carries, as the other exports bound theirs. */
const EXPORT_CAP = 50_000;

interface DayRow {
  day: string;
  n: number;
}
interface RetentionRow {
  kind: 'young' | 'mature';
  total: number;
  passed: number;
}
interface DeckRow {
  id: string;
  title: string;
  cards: number;
  new_cards: number;
  learning: number;
  young: number;
  mature: number;
  due_today: number;
}

/**
 * One member's statistics. Every query is scoped to `userId` and uses bound parameters only
 * (the time zone and deck id are values, never SQL text). `timeZone` must already be
 * validated. Days are grouped in that zone: the log and due times are stored as UTC
 * timestamps, so they are tagged UTC first and then shifted.
 */
export async function getStudyStats(
  userId: string,
  options: { deckId?: string | undefined; timeZone: string },
): Promise<StudyStats> {
  const { timeZone } = options;
  const now = new Date();
  const today = dayKeyInZone(now, timeZone);
  const windowStart = addDays(today, -(HEATMAP_DAYS - 1));
  // Generous in UTC terms; rows before `windowStart` in the viewer's zone are dropped below.
  const since = new Date(now.getTime() - (HEATMAP_DAYS + 1) * 86_400_000);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const forecastEnd = new Date(now.getTime() + (FORECAST_DAYS + 1) * 86_400_000);
  const logDeck = options.deckId ? Prisma.sql`AND "deckId" = ${options.deckId}` : Prisma.empty;
  const cardDeck = options.deckId ? Prisma.sql`AND c."deckId" = ${options.deckId}` : Prisma.empty;

  const [dayRows, first, retentionRows, dueRows, deckRows, lastRows] = await Promise.all([
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char((("reviewedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text)::date, 'YYYY-MM-DD') AS day,
             count(*)::int AS n
      FROM flashcard_review_log
      WHERE "userId" = ${userId} AND "reviewedAt" >= ${since} ${logDeck}
      GROUP BY 1`,
    prisma.flashcardReviewLog.findFirst({
      where: { userId, ...(options.deckId ? { deckId: options.deckId } : {}) },
      orderBy: { reviewedAt: 'asc' },
      select: { reviewedAt: true },
    }),
    // Retention of cards that were already young or mature BEFORE the review: the previous
    // log row's resulting interval. A card's first review has no previous row and is skipped.
    prisma.$queryRaw<RetentionRow[]>`
      SELECT CASE WHEN prev >= 21 THEN 'mature' ELSE 'young' END AS kind,
             count(*)::int AS total,
             (count(*) FILTER (WHERE grade >= ${PASS_GRADE}))::int AS passed
      FROM (
        SELECT grade, "reviewedAt",
               lag("intervalDays") OVER (PARTITION BY "cardId" ORDER BY "reviewedAt", id) AS prev
        FROM flashcard_review_log
        WHERE "userId" = ${userId} ${logDeck}
      ) x
      WHERE "reviewedAt" >= ${since30} AND prev >= 1
      GROUP BY 1`,
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(((r."dueAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timeZone}::text)::date, 'YYYY-MM-DD') AS day,
             count(*)::int AS n
      FROM flashcard_review r
      JOIN flashcard c ON c.id = r."cardId"
      WHERE r."userId" = ${userId} AND r."suspendedAt" IS NULL AND r."dueAt" < ${forecastEnd} ${cardDeck}
      GROUP BY 1`,
    // Decks the member owns or has studied (and may still see), with each card's state.
    prisma.$queryRaw<DeckRow[]>`
      SELECT d.id, d.title,
             count(c.id)::int AS cards,
             (count(*) FILTER (WHERE r.id IS NULL))::int AS new_cards,
             (count(*) FILTER (WHERE r.id IS NOT NULL AND r."intervalDays" < 1))::int AS learning,
             (count(*) FILTER (WHERE r.id IS NOT NULL AND r."intervalDays" BETWEEN 1 AND 20))::int AS young,
             (count(*) FILTER (WHERE r.id IS NOT NULL AND r."intervalDays" >= 21))::int AS mature,
             (count(*) FILTER (WHERE r.id IS NULL OR (r."suspendedAt" IS NULL AND r."dueAt" <= now())))::int AS due_today
      FROM flashcard_deck d
      JOIN flashcard c ON c."deckId" = d.id AND NOT (c.kind = 'cloze' AND c."sourceId" IS NULL)
      LEFT JOIN flashcard_review r ON r."cardId" = c.id AND r."userId" = ${userId}
      WHERE (d."isPublic" OR d."userId" = ${userId})
        AND (d."userId" = ${userId}
             OR EXISTS (SELECT 1 FROM flashcard_review x
                        JOIN flashcard xc ON xc.id = x."cardId"
                        WHERE x."userId" = ${userId} AND xc."deckId" = d.id))
      GROUP BY d.id, d.title
      ORDER BY d.title`,
    prisma.$queryRaw<{ deckId: string; last: Date }[]>`
      SELECT "deckId", max("reviewedAt") AS last
      FROM flashcard_review_log
      WHERE "userId" = ${userId}
      GROUP BY 1`,
  ]);

  const days = dayRows
    .filter((r) => r.day >= windowStart && r.day <= today)
    .map((r) => ({ date: r.day, count: r.n }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const counts = (kind: 'young' | 'mature') => {
    const row = retentionRows.find((r) => r.kind === kind);
    return retention({ total: row?.total ?? 0, passed: row?.passed ?? 0 });
  };

  const last = new Map(lastRows.map((r) => [r.deckId, r.last]));
  const decks: DeckStatsRow[] = deckRows.map((d) => ({
    id: d.id,
    title: d.title,
    cards: d.cards,
    newCards: d.new_cards,
    learning: d.learning,
    young: d.young,
    mature: d.mature,
    dueToday: d.due_today,
    lastStudied: last.get(d.id)?.toISOString() ?? null,
  }));

  return {
    today,
    since: first ? dayKeyInZone(first.reviewedAt, timeZone) : null,
    days,
    streak: streaks(
      days.map((d) => d.date),
      today,
    ),
    forecast: forecast(
      dueRows.map((r) => ({ date: r.day, count: r.n })),
      today,
      FORECAST_DAYS,
    ),
    retention: { young: counts('young'), mature: counts('mature') },
    decks,
  };
}

/** The member's review history, for `GET /api/account/export`. */
export async function exportStudyStatsData(userId: string) {
  const rows = await prisma.flashcardReviewLog.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
    take: EXPORT_CAP,
    select: {
      id: true,
      cardId: true,
      deckId: true,
      grade: true,
      intervalDays: true,
      easeFactor: true,
      reviewedAt: true,
    },
  });
  return { reviewLog: rows.map((r) => ({ ...r, id: Number(r.id) })) };
}
