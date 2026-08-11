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
import { formatDayLong } from './dates';
import type { WatchDayDTO } from './types';

/**
 * A day's headline figures, without the date.
 *
 * Split from `describeDay` because the OG card already draws the date as its
 * title: prefixing it again gave cards that read "Sunday, August 9 / Sunday,
 * August 9: 8h 4m in voice…".
 */
export function dayFigures(day: WatchDayDTO): string {
  if (day.voiceSec === 0 && day.messages === 0 && day.gamingSec === 0) {
    return 'Nothing recorded. No voice, no messages, no games.';
  }
  return (
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
