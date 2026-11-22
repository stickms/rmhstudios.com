/**
 * A deck's study pace, pure. `newPerDay = null` is "no daily limit": the deck's new cards share the session's
 * `NEW_PER_SESSION` exactly as before the pace existed. A pace counts the deck's new cards per local day, from the
 * review log (never a counter): the day, the allowance, the suggestion for a test date and the seven-day forecast.
 */
import { dayOf, isValidTimeZone, parseDay, wallToUtcMs } from '@/lib/calendar/tz';

export const MAX_NEW_PER_DAY = 200;
/** What "Learn more" adds for the rest of the day. */
export const LEARN_MORE_STEP = 10;
export const PACE_FORECAST_DAYS = 7;
export const PACE_DEFAULT_TIME_ZONE = 'UTC';

/** The zone a request named, or UTC when it named none or an unknown one. */
export function zoneOrUtc(tz: string | null | undefined): string {
  return tz && isValidTimeZone(tz) ? tz : PACE_DEFAULT_TIME_ZONE;
}

/** The deck columns the pace reads. */
export interface DeckPace {
  newPerDay: number | null;
  extraNewDay: string | null;
  extraNew: number;
}

/** Today's key in the zone. */
export function todayKey(now: Date, tz: string): string {
  return dayOf(now.getTime(), tz);
}

/** The instant today began in the zone (the lower bound of "first graded today"). */
export function dayStartUtc(day: string, tz: string): Date {
  const p = parseDay(day);
  if (!p) throw new Error(`bad day: ${day}`);
  return new Date(wallToUtcMs({ ...p, h: 0, mi: 0 }, tz));
}

/** True for a paced deck. */
export function isPaced(deck: Pick<DeckPace, 'newPerDay'>): boolean {
  return typeof deck.newPerDay === 'number';
}

/** The day's extra cards: "Learn more" counts only on the day it was pressed. */
export function extraToday(deck: Pick<DeckPace, 'extraNewDay' | 'extraNew'>, today: string): number {
  return deck.extraNewDay === today ? Math.max(0, deck.extraNew) : 0;
}

/** New cards a paced deck may still add today; null for an unpaced deck (no daily limit). */
export function newAllowance(deck: DeckPace, today: string, introducedToday: number): number | null {
  if (typeof deck.newPerDay !== 'number') return null;
  return Math.max(0, deck.newPerDay + extraToday(deck, today) - Math.max(0, introducedToday));
}

/**
 * Trim the never-reviewed cards a session would add (oldest deck first, already in order) to each paced deck's
 * remaining allowance. Unpaced decks pass through. Returns the kept cards and the paced decks that used up their
 * allowance on this pass (a card was held back, or the last of the allowance was just taken).
 */
export function applyAllowances<T extends { deckId: string }>(
  cards: readonly T[],
  allowance: ReadonlyMap<string, number | null>,
): { kept: T[]; saturated: Set<string>; held: Set<string> } {
  const left = new Map<string, number>();
  const kept: T[] = [];
  const saturated = new Set<string>();
  const held = new Set<string>();
  for (const card of cards) {
    const a = allowance.get(card.deckId);
    if (a === null || a === undefined) {
      kept.push(card);
      continue;
    }
    const remaining = left.get(card.deckId) ?? a;
    if (remaining <= 0) {
      saturated.add(card.deckId);
      held.add(card.deckId);
      continue;
    }
    kept.push(card);
    left.set(card.deckId, remaining - 1);
    if (remaining - 1 <= 0) saturated.add(card.deckId);
  }
  return { kept, saturated, held };
}

/** Whole calendar days from `today` up to the test day, the test day itself excluded (DST cannot move it). */
export function daysLeft(testDate: string, today: string): number {
  const a = parseDay(today);
  const b = parseDay(testDate);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / 86_400_000);
}

export type TestDateState =
  { kind: 'upcoming'; daysLeft: number; suggested: number } | { kind: 'today' } | { kind: 'passed' };

/** `ceil(newRemaining / daysLeft)`: the pace that shows every new card before the test. */
export function suggestedPace(newRemaining: number, days: number): number {
  if (days < 1) return 0;
  return Math.min(MAX_NEW_PER_DAY, Math.ceil(Math.max(0, newRemaining) / days));
}

/** What the deck page says about the test date, days counted in the member's zone. */
export function testDateState(testDate: string, today: string, newRemaining: number): TestDateState {
  const days = daysLeft(testDate, today);
  if (days < 0) return { kind: 'passed' };
  if (days === 0) return { kind: 'today' };
  return { kind: 'upcoming', daysLeft: days, suggested: suggestedPace(newRemaining, days) };
}

/** True when `testDate` is a real calendar day that is `today` or later. */
export function isValidTestDate(testDate: string, today: string): boolean {
  return parseDay(testDate) !== null && testDate >= today;
}

/**
 * The new cards a paced deck will add on each of the next `days` days: today what is left of today's allowance,
 * then the full pace, never more than the cards still new. An unpaced deck adds none (its new cards are the
 * session's, not the deck's).
 */
export function newCardForecast(
  deck: DeckPace,
  newRemaining: number,
  introducedToday: number,
  today: string,
  days: number = PACE_FORECAST_DAYS,
): number[] {
  const out: number[] = [];
  if (typeof deck.newPerDay !== 'number') return Array.from({ length: days }, () => 0);
  let left = Math.max(0, newRemaining);
  for (let i = 0; i < days; i++) {
    const room = i === 0 ? (newAllowance(deck, today, introducedToday) ?? 0) : deck.newPerDay;
    const n = Math.min(left, room);
    out.push(n);
    left -= n;
  }
  return out;
}
