/**
 * `/games/{gameId}/updates/rss.xml` — a game's newest patch notes, as RSS 2.0.
 *
 * The notes come from `latestPatchNotes`, the same table, filter and newest-first order as `listPatchNotes`, the query the updates page runs, so the feed lists what the page lists (guides
 * are not patch notes and are not here). A game id that is not a catalogue game played on this site is null and the
 * route a 404.
 */
import { SITE_URL } from '@/lib/seo';
import type { RssItem } from '@/lib/rss';
import { latestPatchNotes, updatesGame } from '@/lib/arcade/updates.server';

/** Items in a game's updates feed. */
export const UPDATES_FEED_LIMIT = 30;

/** Catalogue ids are lower-case words and dashes. */
export const GAME_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export interface UpdatesFeed {
  title: string;
  link: string;
  description: string;
  items: RssItem[];
}

export async function updatesFeed(gameId: string): Promise<UpdatesFeed | null> {
  const game = updatesGame(gameId);
  if (!game) return null;
  const notes = await latestPatchNotes(gameId, UPDATES_FEED_LIMIT);
  const link = `${SITE_URL}/games/${gameId}/updates`;
  return {
    title: `${game.title} updates — RMH Studios`,
    link,
    description: `Patch notes for ${game.title} on RMH Studios.`,
    items: notes.slice(0, UPDATES_FEED_LIMIT).map((n) => ({
      title: `${n.version}: ${n.title}`,
      link,
      guid: `${link}#${n.id}`,
      description: n.body,
      pubDate: new Date(n.createdAt),
    })),
  };
}
