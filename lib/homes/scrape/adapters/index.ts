/**
 * RMHHomes scraper — adapter registry.
 */

import { rssAdapter } from './rss';
import type { HomeProvider, HomeSourceAdapter } from '../types';

const ADAPTERS: Record<HomeProvider, HomeSourceAdapter> = {
  RSS: rssAdapter,
};

export function getAdapter(provider: string): HomeSourceAdapter | null {
  return (ADAPTERS as Record<string, HomeSourceAdapter>)[provider] ?? null;
}

export { rssAdapter };
export { politeFetch, checkRobots } from '../http';
