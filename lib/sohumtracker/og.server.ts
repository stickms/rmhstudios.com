/**
 * What `/sohumtracker`'s Open Graph cards and meta descriptions say.
 *
 * Both the card and the `og:description` answer the same question — *what did he
 * do that day* — so both are derived here rather than written twice and drifting.
 *
 * The card is the shared `renderPageCard` (eyebrow / title / subtitle / stats),
 * not a bespoke renderer. The site has one card design; a second engine for one
 * page is exactly what `lib/og/` was consolidated to stop.
 *
 * These cards are public, and that is the point: a day link is meant to be
 * pasted into a chat and be legible without opening it. An OG crawler arrives
 * with no cookies, so a card behind a session check unfurls as a blank box.
 */

import type { PageCardData } from '@/lib/og/page-card.server';
import { getDaySnapshot, getWatchState } from './activity.server';
import { formatCount, formatDuration, SUBJECT_FALLBACK_NAME } from './config';
import { formatDayLong } from './dates';
// `dayFigures` lives in a client-safe module because route `head()` functions
// run in the browser too — see the note at the top of `describe.ts`.
import { dayFigures } from './describe';
import type { WatchDayDTO } from './types';

/**
 * The figures worth putting on a card, in the order they earn their space.
 *
 * Three, not four: `renderPageCard` lays the chips in one row beside the footer
 * path, and a fourth ran under it at 1200px wide.
 */
function dayStats(day: WatchDayDTO): PageCardData['stats'] {
  return [
    { label: 'In voice', value: formatDuration(day.voiceSec) },
    { label: 'Messages', value: formatCount(day.messages) },
    { label: 'In games', value: formatDuration(day.gamingSec) },
  ];
}

/** The card for one day's permalink. */
export async function buildDayCard(dateKey: string): Promise<PageCardData | null> {
  const snapshot = await getDaySnapshot(dateKey);
  if (!snapshot) return null;
  const { day } = snapshot;

  return {
    // Keyed by the day's own `updatedAt` so the bytes are only re-rendered when
    // the figures actually move — today's card refreshes as the day fills in, a
    // finished day's is drawn once.
    cacheKey: `sohumtracker:day:${dateKey}:${snapshot.updatedAt ?? 'empty'}`,
    eyebrow: 'Activity Report',
    lead: SUBJECT_FALLBACK_NAME,
    title: day.summary?.headline || formatDayLong(day.dateKey),
    subtitle: day.summary?.verdict || dayFigures(day),
    stats: dayStats(day),
    path: `/sohumtracker/${dateKey}`,
  };
}

/** The card for the dossier's front page. */
export async function buildOverviewCard(): Promise<PageCardData> {
  // 30 days rather than the page's own window: the card is a summary, and the
  // smaller query keeps a crawler's request cheap.
  const state = await getWatchState({ days: 30 });
  const { totals, live } = state;

  const subtitle = live.voice
    ? `In voice right now — ${formatDuration(live.voice.durationSec)} and counting.`
    : `${formatDuration(totals.voiceSec)} in voice over the last ${totals.days} days. ` +
      `${formatCount(totals.messages)} messages. Nothing applied for.`;

  return {
    // `generatedAt` is minute-truncated: the card should follow him into a call
    // without re-rendering the same PNG for every crawler in a burst.
    cacheKey: `sohumtracker:overview:${state.generatedAt.slice(0, 16)}:${live.voice ? 'live' : 'idle'}`,
    eyebrow: 'Standing Review',
    lead: SUBJECT_FALLBACK_NAME,
    title: 'What Is Sohum Doing Right Now?',
    subtitle,
    stats: [
      { label: 'In voice, 30d', value: formatDuration(totals.voiceSec) },
      { label: 'Messages', value: formatCount(totals.messages) },
      { label: 'In games', value: formatDuration(totals.gamingSec) },
    ],
    path: '/sohumtracker',
  };
}
