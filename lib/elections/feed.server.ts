/** Server side of the feed card: fetch the snapshot without ever slowing the feed. Server-only. */

import type { FeedItem } from '@/lib/feed-types';
import { currentCycle } from './calendar';
import { buildElectionFeedItem, isFeedWindow } from './feed';
import { getElectionSnapshot } from './source.server';

/** The feed is the hot path: past this, the card is built from the calendar alone. */
const BUDGET_MS = 800;

export async function getElectionFeedItem(now: Date = new Date()): Promise<FeedItem | null> {
  try {
    const cycle = currentCycle(now);
    // Outside the window there is no card, so do not fetch results for one: this runs on
    // every uncached feed build.
    if (!isFeedWindow(cycle, now)) return null;
    const snapshot = await Promise.race([
      getElectionSnapshot(cycle, now),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), BUDGET_MS)),
    ]);
    return buildElectionFeedItem(cycle, snapshot, now);
  } catch {
    return null; // an election card must never break the feed
  }
}
