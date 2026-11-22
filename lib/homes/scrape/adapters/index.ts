/**
 * RMHHomes scraper — adapter registry.
 */

import { craigslistAdapter } from './craigslist';
import { rssAdapter } from './rss';
import type { HomeProvider, HomeSourceAdapter } from '../types';

const ADAPTERS: Record<HomeProvider, HomeSourceAdapter> = {
  CRAIGSLIST: craigslistAdapter,
  RSS: rssAdapter,
};

export function getAdapter(provider: string): HomeSourceAdapter | null {
  return (ADAPTERS as Record<string, HomeSourceAdapter>)[provider] ?? null;
}

export { craigslistAdapter, rssAdapter };
export { politeFetch, checkRobots } from '../http';
