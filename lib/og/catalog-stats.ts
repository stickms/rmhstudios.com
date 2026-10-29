/**
 * Section-card figures that need no I/O: counts straight off the catalog and the locale list.
 *
 * Split from `live-stats.server.ts` so the card generator script (and the test that keeps the committed literals in
 * `static-cards.ts` honest) can read them without importing a database client.
 */
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { LOCALES } from '@/lib/i18n/config';
import type { Stat } from '@/lib/og/chrome.server';

export function catalogStatsFor(file: string): Stat[] | undefined {
  switch (file) {
    case 'default':
      return [
        { value: String(games.length), label: 'games', lead: true },
        { value: String(apps.length), label: 'apps' },
        { value: String(LOCALES.length), label: 'languages' },
      ];
    case 'games':
      return [{ value: String(games.length), label: 'to play', lead: true }];
    case 'apps':
      return [{ value: String(apps.length), label: 'apps', lead: true }];
    default:
      return undefined;
  }
}
