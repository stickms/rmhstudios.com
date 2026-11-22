/**
 * A deck's study pace: the daily new-card count from the review log, the owner's pace and test date, "Learn more"
 * and the seven-day forecast. Opt-in: a deck whose `newPerDay` is null is never counted here.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { REVIEWABLE_WHERE } from '@/lib/study/card-query.server';
import { forecast as bucketForecast } from '@/lib/study/stats';
import {
  LEARN_MORE_STEP,
  PACE_FORECAST_DAYS,
  dayStartUtc,
  extraToday,
  isValidTestDate,
  newCardForecast,
  testDateState,
  todayKey,
  zoneOrUtc,
} from '@/lib/study/pace';
import type { DeckPaceView } from '@/lib/study/pace.contract';
import { addDays } from '@/lib/calendar/tz';

const EXPORT_CAP = 5_000;

/**
 * New cards first graded since `dayStart` in each of `deckIds`, from `flashcard_review_log`: a card counts once, on
 * the day its first log row falls. One grouped query; the caller passes paced decks only and an empty list costs
 * nothing.
 */
export async function newIntroducedToday(
  userId: string,
  deckIds: readonly string[],
  dayStart: Date,
): Promise<Map<string, number>> {
  if (deckIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ deckId: string; n: number }[]>`
    SELECT l."deckId" AS "deckId", count(DISTINCT l."cardId")::int AS "n"
    FROM flashcard_review_log l
    WHERE l."userId" = ${userId}
      AND l."deckId" IN (${Prisma.join([...deckIds])})
      AND l."reviewedAt" >= ${dayStart}
      AND NOT EXISTS (
        SELECT 1 FROM flashcard_review_log p
        WHERE p."userId" = l."userId" AND p."cardId" = l."cardId" AND p."reviewedAt" < ${dayStart}
      )
    GROUP BY l."deckId"`;
  return new Map((Array.isArray(rows) ? rows : []).map((r) => [r.deckId, r.n]));
}

export type PaceResult<T = object> = ({ ok: true } & T) | { ok: false; status: 400 | 404; error: string };

const paceSelect = { newPerDay: true, testDate: true, extraNewDay: true, extraNew: true } as const;

/** The owner's pace page: their settings, what today has used, the suggestion and the forecast. Null for a foreign deck. */
export async function getDeckPace(
  userId: string,
  deckId: string,
  tzRaw: string | undefined,
  now: Date = new Date(),
): Promise<DeckPaceView | null> {
  const deck = await prisma.flashcardDeck.findFirst({ where: { id: deckId, userId }, select: paceSelect });
  if (!deck) return null;
  const tz = zoneOrUtc(tzRaw);
  const today = todayKey(now, tz);
  const end = dayStartUtc(addDays(today, PACE_FORECAST_DAYS), tz);

  const [newRemaining, dueRows, introduced] = await Promise.all([
    prisma.flashcard.count({ where: { deckId, ...REVIEWABLE_WHERE, reviews: { none: { userId } } } }),
    // Scheduled cards per local day; a suspended card is in none of them.
    prisma.$queryRaw<{ day: string; n: number }[]>`
      SELECT to_char(((r."dueAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}::text)::date, 'YYYY-MM-DD') AS day,
             count(*)::int AS n
      FROM flashcard_review r
      JOIN flashcard c ON c.id = r."cardId"
      WHERE r."userId" = ${userId} AND r."suspendedAt" IS NULL AND c."deckId" = ${deckId} AND r."dueAt" < ${end}
      GROUP BY 1`,
    typeof deck.newPerDay === 'number'
      ? newIntroducedToday(userId, [deckId], dayStartUtc(today, tz))
      : Promise.resolve(new Map<string, number>()),
  ]);
  const introducedToday = introduced.get(deckId) ?? 0;
  const scheduled = bucketForecast(
    (Array.isArray(dueRows) ? dueRows : []).map((r) => ({ date: r.day, count: r.n })),
    today,
    PACE_FORECAST_DAYS,
  );
  const fresh = newCardForecast(deck, newRemaining, introducedToday, today);
  return {
    newPerDay: deck.newPerDay,
    testDate: deck.testDate,
    today,
    newRemaining,
    introducedToday,
    extraToday: extraToday(deck, today),
    testState: deck.testDate ? testDateState(deck.testDate, today, newRemaining) : null,
    forecast: scheduled.map((s, i) => ({ date: s.date, scheduled: s.count, fresh: fresh[i] ?? 0 })),
  };
}

/** Set the pace and/or the test date (null clears). The deck must be the member's own. */
export async function setDeckPace(
  userId: string,
  deckId: string,
  input: { newPerDay?: number | null | undefined; testDate?: string | null | undefined; tz?: string | undefined },
  now: Date = new Date(),
): Promise<PaceResult<{ newPerDay: number | null; testDate: string | null; extraToday: number }>> {
  const tz = zoneOrUtc(input.tz);
  const today = todayKey(now, tz);
  if (typeof input.testDate === 'string' && !isValidTestDate(input.testDate, today))
    return { ok: false, status: 400, error: 'Invalid test date' };
  const data: Prisma.FlashcardDeckUpdateManyMutationInput = {};
  if (input.newPerDay !== undefined) data.newPerDay = input.newPerDay;
  if (input.testDate !== undefined) data.testDate = input.testDate;
  const res = await prisma.flashcardDeck.updateMany({ where: { id: deckId, userId }, data });
  if (res.count === 0) return { ok: false, status: 404, error: 'Not found' };
  const deck = await prisma.flashcardDeck.findFirst({ where: { id: deckId, userId }, select: paceSelect });
  return {
    ok: true,
    newPerDay: deck?.newPerDay ?? null,
    testDate: deck?.testDate ?? null,
    extraToday: deck ? extraToday(deck, today) : 0,
  };
}

/**
 * "Learn more": add `LEARN_MORE_STEP` new cards for the rest of the local day. Only a paced deck has a daily
 * allowance to extend. Two compare-and-set updates (same day: increment; another day: start over at ten), so two
 * presses never lose one.
 */
export async function learnMore(
  userId: string,
  deckId: string,
  tzRaw: string | undefined,
  now: Date = new Date(),
): Promise<PaceResult<{ newPerDay: number | null; testDate: string | null; extraToday: number }>> {
  const today = todayKey(now, zoneOrUtc(tzRaw));
  const base = { id: deckId, userId, newPerDay: { not: null } } as const;
  const same = await prisma.flashcardDeck.updateMany({
    where: { ...base, extraNewDay: today },
    data: { extraNew: { increment: LEARN_MORE_STEP } },
  });
  if (same.count === 0) {
    const fresh = await prisma.flashcardDeck.updateMany({
      where: { ...base, OR: [{ extraNewDay: null }, { extraNewDay: { not: today } }] },
      data: { extraNewDay: today, extraNew: LEARN_MORE_STEP },
    });
    if (fresh.count === 0) return { ok: false, status: 404, error: 'Not found' };
  }
  const deck = await prisma.flashcardDeck.findFirst({ where: { id: deckId, userId }, select: paceSelect });
  return {
    ok: true,
    newPerDay: deck?.newPerDay ?? null,
    testDate: deck?.testDate ?? null,
    extraToday: deck ? extraToday(deck, today) : 0,
  };
}

/** The account export's `deckPace` section: each deck of the member's with a pace or a test date. */
export async function exportDeckPace(userId: string) {
  const rows = await prisma.flashcardDeck.findMany({
    where: { userId, OR: [{ newPerDay: { not: null } }, { testDate: { not: null } }] },
    orderBy: { createdAt: 'asc' },
    take: EXPORT_CAP,
    select: { id: true, newPerDay: true, testDate: true },
  });
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    deckId: r.id,
    newPerDay: r.newPerDay,
    testDate: r.testDate,
  }));
}
