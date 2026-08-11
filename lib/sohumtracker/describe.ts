/**
 * The one-line descriptions of a day, shared by everything that has to say what
 * a day amounted to in a sentence.
 *
 * Client-safe on purpose, and that is the whole reason this is not in
 * `og.server.ts`: a route's `head()` runs on the CLIENT as well as the server
 * (it re-derives meta on every client-side navigation), so a `head()` that calls
 * into a `.server` module is calling into a function the Vite plugin has stubbed
 * out of the browser bundle. The OG card imports it from here too, so the card
 * and the description stay the same sentence.
 */

import { formatCount, formatDuration } from './config';
import { formatDayLong, formatMonthLong, formatWeekRange } from './dates';
import type { WatchDayDTO, WatchSummaryDTO, WatchTotalsDTO } from './types';

/**
 * A day's headline figures, without the date.
 *
 * Split from `describeDay` because the OG card already draws the date as its
 * title: prefixing it again gave cards that read "Sunday, August 9 / Sunday,
 * August 9: 8h 4m in voice…".
 */
export function dayFigures(day: WatchDayDTO): string {
  const signedIn = day.onlineSec + day.idleSec + day.dndSec;
  if (signedIn === 0 && day.voiceSec === 0 && day.messages === 0 && day.gamingSec === 0) {
    return 'Nothing recorded. Not online, no voice, no messages, no games.';
  }
  // Time signed in leads: it is the figure the rest are a fraction of, and the
  // one that answers "how much of his day was this" on its own.
  return (
    `${formatDuration(signedIn)} signed in, ` +
    `${formatDuration(day.voiceSec)} in voice, ` +
    `${formatCount(day.messages)} messages, ` +
    `${formatDuration(day.gamingSec)} in games.`
  );
}

/**
 * What one day was, in a sentence — the meta description, where the date has to
 * be part of the sentence because nothing else on the unfurl carries it.
 *
 * Prefers the model's headline when there is one, since that sentence was
 * written to be read on its own, and falls back to the figures, which are
 * always there.
 */
export function describeDay(day: WatchDayDTO): string {
  const label = formatDayLong(day.dateKey);
  const figures = dayFigures(day);
  return day.summary?.headline
    ? `${label}: ${day.summary.headline} — ${figures}`
    : `${label}: ${figures}`;
}

/** `Week of Aug 10 – Aug 16` / `August 2026`, from a period and its key. */
export function periodLabel(period: 'week' | 'month', periodKey: string): string {
  return period === 'week'
    ? `Week of ${formatWeekRange(periodKey)}`
    : formatMonthLong(periodKey);
}

/**
 * A week's or a month's headline figures, without the label.
 *
 * The same three measurements a day leads with, in the same order, because the
 * point of a period page is that it is comparable to the days inside it. Active
 * days replaces the games figure: over a month, "he was on Discord at all on 27
 * of 31 days" says more than a games total.
 */
export function periodFigures(totals: WatchTotalsDTO): string {
  if (totals.presenceSec === 0 && totals.voiceSec === 0 && totals.messages === 0) {
    return 'Nothing recorded across the whole period.';
  }
  return (
    `${formatDuration(totals.presenceSec)} signed in, ` +
    `${formatDuration(totals.voiceSec)} in voice, ` +
    `${formatCount(totals.messages)} messages, ` +
    `on ${totals.activeDays} of ${totals.days} days.`
  );
}

/** What a week or a month was, in a sentence — the meta description. */
export function describePeriod(
  period: 'week' | 'month',
  periodKey: string,
  totals: WatchTotalsDTO,
  summary: WatchSummaryDTO | null,
): string {
  const label = periodLabel(period, periodKey);
  const figures = periodFigures(totals);
  return summary?.headline ? `${label}: ${summary.headline} — ${figures}` : `${label}: ${figures}`;
}
