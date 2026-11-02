/**
 * The election card for the home feed: a virtual announcement (like the game
 * and app cards) whose numbers are live. Pure and client-safe; the server
 * wrapper in `feed.server.ts` supplies the snapshot.
 */

import type { FeedItem } from '@/lib/feed-types';
import { countdownTo, phaseOf, type Cycle } from './calendar';
import { headline } from './summary';
import { OFFICE_NAME, type ChamberControl, type ElectionSnapshot, type Office } from './types';

/** How long before Election Day the card starts appearing. */
export const FEED_LEAD_DAYS = 45;

const ORDER: Office[] = ['president', 'senate', 'house', 'governor'];

export function isFeedWindow(cycle: Cycle, now: Date): boolean {
  const phase = phaseOf(cycle.date, now);
  if (phase === 'archive') return false;
  if (phase !== 'upcoming') return true;
  return countdownTo(cycle.date, now).days <= FEED_LEAD_DAYS;
}

function chamberRow(c: ChamberControl, live: boolean) {
  const before = c.before.DEM + c.before.GOP;
  // Before votes: today's control (or nothing). After: the running score. A tally derived from
  // called races only is a partial score, so it is shown too — the card says "called".
  if (!live && before === 0) return null;
  const src = live ? c.seats : c.before;
  return {
    office: c.office,
    name: OFFICE_NAME[c.office],
    dem: src.DEM,
    gop: src.GOP,
    toWin: c.toWin,
    basis: (live ? 'results' : 'current') as 'results' | 'current',
    controlledBy: live ? c.controlledBy : null,
  };
}

/** Build the card. `snapshot` may be null (upstream slow or down): the card then carries the date only. */
export function buildElectionFeedItem(
  cycle: Cycle,
  snapshot: ElectionSnapshot | null,
  now: Date = new Date(),
): FeedItem | null {
  if (!isFeedWindow(cycle, now)) return null;
  const phase = phaseOf(cycle.date, now);
  const live = snapshot?.live ?? false;
  const racesCalled = snapshot ? snapshot.races.filter((r) => r.status === 'called').length : 0;
  const hasRaces = !!snapshot && snapshot.races.length > 0;

  // Prose rounds UP to calendar days (41 hours out is "2 days away"); the hero's ticking countdown shows the exact split.
  const days = Math.max(1, Math.ceil(countdownTo(cycle.date, now).totalMs / 86_400_000));
  const description = hasRaces
    ? headline(snapshot as ElectionSnapshot)
    : phase === 'upcoming'
      ? `Election Day is ${cycle.date} — ${days} ${days === 1 ? 'day' : 'days'} away.`
      : 'Live results the moment polls report.';

  const chambers = hasRaces
    ? ORDER.flatMap((o) => {
        const c = snapshot?.chambers[o];
        const row = c ? chamberRow(c, live) : null;
        return row ? [row] : [];
      })
    : [];

  return {
    id: `election:${cycle.date}`,
    type: 'election_announcement',
    // Newest announcement wins the interleave: this card is about right now.
    createdAt: now.toISOString(),
    title: live ? `LIVE · ${cycle.title}` : cycle.title,
    description,
    href: '/elections',
    tags: live ? ['Elections', 'Live results'] : ['Elections'],
    category: 'Elections',
    iconName: 'Vote',
    election: {
      date: cycle.date,
      phase,
      live,
      called: racesCalled,
      total: snapshot?.races.length ?? 0,
      chambers,
    },
  };
}
